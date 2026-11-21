// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Agenda e e-mail do Google: o login (OAuth com PKCE, como os apps de PC fazem), a leitura dos
// compromissos e dos e-mails e o que ela fala sobre eles. O e-mail é só leitura: ela nunca manda,
// apaga nem marca nada. Só regras (sem rede, sem disco), para testar.

import { createHash, randomBytes } from 'node:crypto'

export const ESCOPOS = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.readonly']

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function novoPkce(): { verificador: string; desafio: string; estado: string } {
  const verificador = b64url(randomBytes(48))
  return { verificador, desafio: b64url(createHash('sha256').update(verificador).digest()), estado: b64url(randomBytes(16)) }
}

export function urlDeLogin(clientId: string, redirect: string, desafio: string, estado: string): string {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: ESCOPOS.join(' '),
    code_challenge: desafio, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', state: estado
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

// ---------- Agenda ----------

export interface Compromisso { id: string; titulo: string; inicio: Date; fim: Date; diaInteiro: boolean; local: string; link: string }

interface EventoGoogle { id?: string; status?: string; summary?: string; location?: string; hangoutLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }

/** Data "AAAA-MM-DD" do Google (dia inteiro) no fuso local. */
const diaLocal = (s: string): Date => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))

export function lerCompromissos(dados: { items?: EventoGoogle[] }): Compromisso[] {
  return (dados.items ?? []).filter((e) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date)).map((e) => {
    const diaInteiro = !e.start?.dateTime
    const inicio = diaInteiro ? diaLocal(e.start!.date!) : new Date(e.start!.dateTime!)
    const fim = e.end?.dateTime ? new Date(e.end.dateTime) : e.end?.date ? diaLocal(e.end.date) : new Date(inicio.getTime() + 3600_000)
    return { id: e.id ?? '', titulo: (e.summary ?? '(sem título)').trim(), inicio, fim, diaInteiro, local: e.location ?? '', link: e.hangoutLink ?? '' }
  }).sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
}

const hora = (d: Date): string => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dia = (d: Date, hoje: Date): string => {
  const a = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const n = Math.round((b - a) / 86_400_000)
  return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })
}

/** "Amanhã: 9h Dentista (Rua X); 14h30 Reunião com a padaria." */
export function agendaEmTexto(cs: Compromisso[], hoje = new Date()): string {
  if (!cs.length) return 'Nada na agenda nesse período.'
  const porDia = new Map<string, Compromisso[]>()
  for (const c of cs) {
    const k = dia(c.inicio, hoje)
    porDia.set(k, [...(porDia.get(k) ?? []), c])
  }
  return [...porDia].map(([d, lista]) => `${d[0].toUpperCase()}${d.slice(1)}: ${lista.map((c) => `${c.diaInteiro ? 'o dia todo' : hora(c.inicio)} ${c.titulo}${c.local ? ` (${c.local})` : ''}`).join('; ')}`).join('. ') + '.'
}

/** Compromissos que começam daqui a no máximo `minutos` e ainda não foram avisados. */
export const paraAvisar = (cs: Compromisso[], agora: Date, avisados: string[], minutos = 15): Compromisso[] =>
  cs.filter((c) => !c.diaInteiro && c.inicio.getTime() > agora.getTime() && c.inicio.getTime() - agora.getTime() <= minutos * 60_000 && !avisados.includes(`${c.id}@${c.inicio.toISOString()}`))

/**
 * Evento novo para a agenda (sem convidados: ela nunca manda convite em seu nome).
 * `inicio` vem da IA como "2026-11-23T14:30" (hora local) ou "2026-11-23" (dia inteiro).
 */
export function eventoNovo(o: { titulo: string; inicio: string; fim?: string; duracaoMin?: number; local?: string; descricao?: string }, fuso = 'America/Sao_Paulo'): Record<string, unknown> {
  const titulo = o.titulo.trim()
  if (!titulo) throw new Error('Faltou o nome do compromisso.')
  if (/^\d{4}-\d{2}-\d{2}$/.test(o.inicio)) {
    const d = diaLocal(o.inicio), seguinte = new Date(d.getTime() + 86_400_000)
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    return { summary: titulo, location: o.local || undefined, description: o.descricao || undefined, start: { date: o.inicio }, end: { date: o.fim && /^\d{4}-\d{2}-\d{2}$/.test(o.fim) ? o.fim : iso(seguinte) } }
  }
  const m = o.inicio.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (!m) throw new Error('Não entendi a data e a hora (use AAAA-MM-DDTHH:MM).')
  const ini = new Date(`${m[1]}T${m[2]}:${m[3]}:00`)
  const fimTxt = o.fim?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  const fim = fimTxt ? new Date(`${fimTxt[1]}T${fimTxt[2]}:${fimTxt[3]}:00`) : new Date(ini.getTime() + (o.duracaoMin ?? 60) * 60_000)
  if (fim <= ini) throw new Error('O fim ficou antes do começo.')
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
  return { summary: titulo, location: o.local || undefined, description: o.descricao || undefined, start: { dateTime: local(ini), timeZone: fuso }, end: { dateTime: local(fim), timeZone: fuso } }
}

// ---------- E-mail (só leitura) ----------

export interface Email { id: string; de: string; assunto: string; quando: Date; trecho: string }

interface MensagemGoogle { id?: string; snippet?: string; internalDate?: string; payload?: { headers?: { name?: string; value?: string }[] } }

/** "Fulano de Tal <fulano@x.com>" → "Fulano de Tal". */
export const nomeDoRemetente = (de: string): string => (de.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? de.replace(/[<>]/g, '')).trim()

export function lerEmail(m: MensagemGoogle): Email {
  const h = (n: string) => m.payload?.headers?.find((x) => x.name?.toLowerCase() === n)?.value ?? ''
  const trecho = (m.snippet ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
  return { id: m.id ?? '', de: nomeDoRemetente(h('from')), assunto: h('subject').trim() || '(sem assunto)', quando: new Date(Number(m.internalDate) || Date.parse(h('date')) || Date.now()), trecho: trecho.slice(0, 160) }
}

/** Propaganda e avisos automáticos que não precisam da atenção dele. */
export const ehAutomatico = (e: Email): boolean =>
  /no-?reply|nao-?responda|newsletter|notifica(c|ç)(a|ã)o|marketing|promo/i.test(e.de) || /\b(oferta|promoção|desconto|% off|cupom|black friday|newsletter)\b/i.test(e.assunto)

export function emailsEmTexto(es: Email[]): string {
  const importantes = es.filter((e) => !ehAutomatico(e))
  if (!es.length) return 'Nenhum e-mail novo.'
  if (!importantes.length) return `${es.length === 1 ? 'Um e-mail novo, mas parece automático ou propaganda' : `${es.length} e-mails novos, mas parecem automáticos ou propaganda`}.`
  const resto = es.length - importantes.length
  return `${importantes.length} ${importantes.length === 1 ? 'e-mail que importa' : 'e-mails que importam'}: ${importantes.slice(0, 6).map((e) => `${e.de}: "${e.assunto}"`).join('; ')}${resto ? `. E mais ${resto} ${resto === 1 ? 'automático' : 'automáticos'}` : ''}.`
}
