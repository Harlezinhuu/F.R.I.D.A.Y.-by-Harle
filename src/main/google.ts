// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Agenda e e-mail do Google, pelo PC. O login é feito uma vez no navegador ("conecta minha agenda")
// e a chave de acesso fica guardada trancada pelo Windows (safeStorage), só neste PC.
// - Agenda: ver, criar compromisso (sem convidados) e aviso 15 minutos antes, também no celular.
// - E-mail: só leitura (nunca manda, apaga nem marca nada); os importantes de manhã.
// Precisa no .env: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (o passo a passo está no README).

import { app, safeStorage, shell } from 'electron'
import { createServer } from 'node:http'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { variavel } from './config'
import { agendaEmTexto, emailsEmTexto, eventoNovo, lerCompromissos, lerEmail, novoPkce, paraAvisar, urlDeLogin, type Compromisso, type Email } from './logica/google'

let avisar: (texto: string, serio: boolean) => void = () => {}
let log: (t: string) => void = () => {}

const arquivo = (): string => join(app.getPath('userData'), 'google.json')
interface Guardado { chave: string; conta: string; avisados: string[]; manha: string }

function ler(): Guardado | null {
  try { return { avisados: [], manha: '', conta: '', ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch { return null }
}
const salvar = (g: Guardado): void => writeFileSync(arquivo(), JSON.stringify({ ...g, avisados: g.avisados.slice(-200) }, null, 2))

const trancar = (s: string): string => (safeStorage.isEncryptionAvailable() ? `s:${safeStorage.encryptString(s).toString('base64')}` : `b:${Buffer.from(s).toString('base64')}`)
const destrancar = (s: string): string => (s.startsWith('s:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : Buffer.from(s.slice(2), 'base64').toString())

export const googleConfigurado = (): boolean => !!variavel('GOOGLE_CLIENT_ID') && !!variavel('GOOGLE_CLIENT_SECRET')
export const googleConectado = (): boolean => !!ler()?.chave

// ---------- Login ----------

async function trocarCodigo(params: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(20_000) })
  const j = (await r.json()) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string }
  if (!r.ok || !j.access_token) throw new Error(j.error === 'invalid_grant' ? 'invalid_grant' : `o Google recusou (${j.error_description || j.error || r.status})`)
  return { access_token: j.access_token, expires_in: j.expires_in ?? 3600, refresh_token: j.refresh_token }
}

/** Abre o navegador para ele autorizar; espera a volta (até 5 minutos). */
export function conectarGoogle(): Promise<string> {
  if (!googleConfigurado()) return Promise.reject(new Error('Falta configurar o Google no .env (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET). O passo a passo está no README, em "Agenda e e-mail".'))
  const { verificador, desafio, estado } = novoPkce()
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (u.pathname !== '/') { res.writeHead(404).end(); return }
      const pagina = (msg: string) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><body style="font:18px system-ui;background:#0b0f18;color:#e8eef7;display:grid;place-items:center;height:100vh;margin:0"><p>${msg}</p></body>`) }
      const fim = () => { clearTimeout(tempo); servidor.close() }
      if (u.searchParams.get('state') !== estado) { pagina('Algo não bateu. Volte e peça de novo para a FRIDAY.'); return }
      const codigo = u.searchParams.get('code')
      if (!codigo) { pagina('Você não autorizou. Tudo bem, nada foi ligado.'); fim(); rejeitar(new Error('Ele não autorizou.')); return }
      const porta = (servidor.address() as { port: number }).port
      trocarCodigo({ client_id: variavel('GOOGLE_CLIENT_ID'), client_secret: variavel('GOOGLE_CLIENT_SECRET'), code: codigo, code_verifier: verificador, grant_type: 'authorization_code', redirect_uri: `http://127.0.0.1:${porta}` })
        .then(async (t) => {
          if (!t.refresh_token) throw new Error('o Google não mandou a chave de acesso duradoura; tente de novo')
          token = { valor: t.access_token, ate: Date.now() + (t.expires_in - 60) * 1000 }
          let conta = ''
          try { conta = ((await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { emailAddress?: string }).emailAddress ?? '' } catch { /* sem e-mail */ }
          salvar({ chave: trancar(t.refresh_token), conta, avisados: [], manha: '' })
          pagina('Pronto! A FRIDAY já vê a sua agenda e os seus e-mails. Pode fechar esta aba.')
          fim()
          resolver(conta)
        })
        .catch((e) => { pagina('Não deu certo. Volte para a FRIDAY.'); fim(); rejeitar(e) })
    })
    const tempo = setTimeout(() => { servidor.close(); rejeitar(new Error('Passaram 5 minutos sem autorização.')) }, 5 * 60_000)
    servidor.listen(0, '127.0.0.1', () => {
      const porta = (servidor.address() as { port: number }).port
      void shell.openExternal(urlDeLogin(variavel('GOOGLE_CLIENT_ID'), `http://127.0.0.1:${porta}`, desafio, estado))
    })
  })
}

export function desconectarGoogle(): void {
  const g = ler()
  if (g?.chave) {
    // Avisa o Google para invalidar a chave também
    try { void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(destrancar(g.chave))}`, { method: 'POST' }).catch(() => {}) } catch { /* segue */ }
  }
  try { unlinkSync(arquivo()) } catch { /* já não tinha */ }
  token = null
}

let token: { valor: string; ate: number } | null = null
async function acesso(): Promise<string> {
  if (token && token.ate > Date.now()) return token.valor
  const g = ler()
  if (!g?.chave) throw new Error('A agenda e o e-mail ainda não estão ligados. Diga "conecta minha agenda do Google".')
  try {
    const t = await trocarCodigo({ client_id: variavel('GOOGLE_CLIENT_ID'), client_secret: variavel('GOOGLE_CLIENT_SECRET'), refresh_token: destrancar(g.chave), grant_type: 'refresh_token' })
    token = { valor: t.access_token, ate: Date.now() + (t.expires_in - 60) * 1000 }
    return token.valor
  } catch (e) {
    if ((e as Error).message === 'invalid_grant') {
      try { unlinkSync(arquivo()) } catch { /* já foi */ }
      throw new Error('O Google desligou o acesso (a autorização venceu ou foi tirada). Diga "conecta minha agenda do Google" de novo. Se isso acontecer toda semana, o app no Google Cloud ainda está em "Testing": passe para "In production".')
    }
    throw e
  }
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await acesso()}` }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`o Google respondeu ${r.status}${r.status === 403 ? ' (a API da agenda ou do Gmail está ligada no projeto?)' : ''}`)
  return (await r.json()) as T
}

// ---------- Agenda ----------

export async function compromissos(de: Date, ate: Date): Promise<Compromisso[]> {
  const q = new URLSearchParams({ timeMin: de.toISOString(), timeMax: ate.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' })
  return lerCompromissos(await api(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`))
}

export async function criarCompromisso(o: Parameters<typeof eventoNovo>[0]): Promise<Compromisso> {
  const corpo = eventoNovo(o)
  const e = await api<Record<string, unknown>>('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  return lerCompromissos({ items: [e as never] })[0]
}

export { agendaEmTexto }

// ---------- E-mail ----------

export async function emailsNovos(consulta = 'is:unread category:primary newer_than:2d', max = 10): Promise<Email[]> {
  const q = new URLSearchParams({ q: consulta, maxResults: String(Math.min(25, max)) })
  const lista = await api<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${q}`)
  const out: Email[] = []
  for (const m of lista.messages ?? []) {
    try {
      out.push(lerEmail(await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)))
    } catch { /* pula esse */ }
  }
  return out
}

export { emailsEmTexto }

// ---------- Avisos ----------

const inicioDoDia = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

async function vigiar(): Promise<void> {
  const g = ler()
  if (!g?.chave || !googleConfigurado()) return
  const agora = new Date()
  const cs = await compromissos(agora, new Date(agora.getTime() + 20 * 60_000))
  for (const c of paraAvisar(cs, agora, g.avisados)) {
    g.avisados.push(`${c.id}@${c.inicio.toISOString()}`)
    const min = Math.max(1, Math.round((c.inicio.getTime() - agora.getTime()) / 60_000))
    avisar(`Daqui a ${min} minutos: ${c.titulo}${c.local ? `, em ${c.local}` : ''}${c.link ? ' (tem link de vídeo)' : ''}.`, false)
  }
  // Resumo da manhã: uma vez por dia, a partir das 7h
  const hoje = agora.toISOString().slice(0, 10)
  if (agora.getHours() >= 7 && g.manha !== hoje) {
    g.manha = hoje
    const dia = await compromissos(agora, new Date(inicioDoDia(agora).getTime() + 86_400_000))
    let emails: Email[] = []
    try { emails = await emailsNovos('is:unread category:primary newer_than:1d', 10) } catch { /* sem e-mail */ }
    avisar(`Bom dia! ${dia.length ? `Hoje: ${agendaEmTexto(dia, agora).replace(/^Hoje: /, '')}` : 'Nada na agenda hoje.'} ${emailsEmTexto(emails)}`, false)
  }
  salvar(g)
}

export function iniciarGoogle(o: { avisar(texto: string, serio: boolean): void; log(t: string): void }): void {
  avisar = o.avisar
  log = o.log
  const vai = () => void vigiar().catch((e) => log(`google: ${(e as Error).message}`))
  setTimeout(vai, 90_000)
  setInterval(vai, 5 * 60_000)
}
