// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Elo com a FRIDAY do PC, do lado do app: pareamento (QR ou código), pedidos ao PC, memória e
// contexto compartilhados, e a escuta do que o PC manda (holograma, link, texto).
// A rede e o lacre ficam no Java (Elo.java), que também funciona com o app fechado.

import { Preferences } from '@capacitor/preferences'
import { Celular, nativo } from './celular'
import { lerPareamento, type EventoParaCelular, type Pareamento, type PedidoElo } from '../../src/shared/elo'
import { lerLista, salvarLista } from './armazem'

export interface EloSalvo extends Pareamento { pareadoEm: string }

export async function lerElo(): Promise<EloSalvo | null> {
  const { value } = await Preferences.get({ key: 'elo' })
  try {
    const e = value ? (JSON.parse(value) as EloSalvo) : null
    return e && e.segredo && Array.isArray(e.ips) && e.ips.length ? e : null
  } catch {
    return null
  }
}

export const pareado = async (): Promise<boolean> => !!(await lerElo())

/** Pede algo ao PC. Erros viram frases ("O PC não respondeu..."). */
export async function pedirPC<T = Record<string, unknown>>(dados: PedidoElo, limiteMs = 8000): Promise<T> {
  if (!nativo()) throw new Error('O elo com o PC só funciona no app do celular.')
  const r = await Celular.eloPedir({ dados: dados as unknown as Record<string, unknown>, limite: limiteMs })
  return r.resposta as T
}

async function aparelho(): Promise<string> {
  try { return (await Celular.nomeDoAparelho()).nome } catch { return 'Celular' }
}

/** Guarda o pareamento lido do QR (ou recebido pelo código) e se apresenta ao PC. */
export async function parearCom(texto: string): Promise<string> {
  const p = lerPareamento(texto)
  if (!p) throw new Error('Esse QR não é de uma FRIDAY. Abra "Parear celular" no PC e tente de novo.')
  await Preferences.set({ key: 'elo', value: JSON.stringify({ ...p, pareadoEm: new Date().toISOString() } satisfies EloSalvo) })
  try {
    await pedirPC({ acao: 'ola', aparelho: await aparelho() }, 6000)
  } catch (e) {
    await Preferences.remove({ key: 'elo' })
    throw new Error(`Li o QR, mas o PC não respondeu. Confira se os dois estão na mesma rede e se o Windows liberou a FRIDAY no firewall. (${(e as Error).message})`)
  }
  void sincronizarMemoria()
  void sincronizarCasa()
  return p.nome
}

export async function parearPorCodigo(ip: string, codigo: string): Promise<string> {
  const limpo = ip.trim().replace(/^https?:\/\//, '')
  const [host, porta] = limpo.split(':')
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new Error('O endereço do PC é algo como 192.168.0.10 (aparece embaixo do QR).')
  if (codigo.replace(/\D/g, '').length !== 8) throw new Error('O código tem 8 dígitos, como 4829-1735.')
  const r = await Celular.eloParearCodigo({ ip: host, porta: Number(porta) || 47923, codigo })
  return parearCom(r.pareamento)
}

export async function desparear(): Promise<void> {
  await Preferences.remove({ key: 'elo' })
}

// ---------- Casa (ligar o PC de fora) ----------

export interface Casa { endereco: string; porta: number; macs: string[]; atualizadaEm: string }

export async function lerCasa(): Promise<Casa | null> {
  const { value } = await Preferences.get({ key: 'casa' })
  try { return value ? (JSON.parse(value) as Casa) : null } catch { return null }
}

/** Pega com o PC o endereço de casa (feito em "prepara para ligar o PC de fora"). O IP pode mudar, então pega sempre. */
export async function sincronizarCasa(): Promise<void> {
  if (!(await pareado())) return
  try {
    const r = await pedirPC<{ casa: Casa | null }>({ acao: 'casa' }, 5000)
    if (r.casa?.endereco) await Preferences.set({ key: 'casa', value: JSON.stringify(r.casa) })
  } catch { /* PC desligado ou longe: fica o último endereço */ }
}

// ---------- Memória e contexto ----------

/** Junta a memória do celular com a do PC (os dois ficam iguais). */
export async function sincronizarMemoria(): Promise<number | null> {
  if (!(await pareado())) return null
  try {
    const r = await pedirPC<{ fatos: unknown[]; esquecidos: string[] }>({ acao: 'memoria', fatos: await lerLista('memoria'), esquecidos: await lerLista<string>('memoria_esquecida') }, 8000)
    if (Array.isArray(r.fatos)) await salvarLista('memoria', r.fatos)
    if (Array.isArray(r.esquecidos)) await salvarLista('memoria_esquecida', r.esquecidos.slice(-500))
    return r.fatos?.length ?? 0
  } catch {
    return null
  }
}

/** Uma troca da conversa no celular vai para o PC (se você sentar no PC, ela continua dali). */
export function enviarContexto(texto: string): void {
  void pareado().then((ok) => { if (ok) void pedirPC({ acao: 'contexto', texto }, 4000).catch(() => {}) })
}

/** O que você conversou com ela no PC nos últimos 15 minutos. */
export async function contextoDoPc(): Promise<string> {
  if (!(await pareado())) return ''
  try { return (await pedirPC<{ texto: string }>({ acao: 'contexto_pc' }, 2500)).texto ?? '' } catch { return '' }
}

// ---------- Escuta: o que o PC manda ----------

let escutando = false
let geracao = 0

/** Fica perguntando ao PC se ele mandou algo, enquanto o app estiver aberto. */
export function escutarPC(aoEvento: (e: EventoParaCelular) => void): void {
  if (escutando) return
  escutando = true
  const minha = ++geracao
  void (async () => {
    let espera = 2000
    while (escutando && minha === geracao) {
      if (!(await pareado())) { await new Promise((r) => setTimeout(r, 10_000)); continue }
      try {
        const r = await pedirPC<{ eventos?: EventoParaCelular[] }>({ acao: 'escutar' }, 32_000)
        for (const e of r.eventos ?? []) aoEvento(e)
        espera = 2000
      } catch {
        // PC desligado ou longe: tenta de novo com calma
        await new Promise((r) => setTimeout(r, espera))
        espera = Math.min(60_000, espera * 2)
      }
    }
  })()
}

export function pararEscuta(): void {
  escutando = false
  geracao++
}
