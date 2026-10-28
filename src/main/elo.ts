// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Elo com o celular: um servidor pequeno na rede de casa (e no Tailscale, se tiver) que só aceita
// mensagens lacradas com o segredo do pareamento. Por ele o celular manda avisos para o PC falar,
// pede ações no PC, troca a memória e o contexto da conversa, e escuta o que o PC manda de volta.

import { createServer, type IncomingMessage, type Server } from 'node:http'
import { networkInterfaces, hostname } from 'node:os'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { lerCasa } from './ligar-de-fora'
import {
  PORTA_ELO, abrir, chaveDoCodigo, chaveElo, lacrar, novoCodigo, novoSegredo, textoDoPareamento,
  type EventoParaCelular, type Pareamento, type PedidoElo
} from '../shared/elo'

export interface OpcoesElo {
  log(texto: string): void
  /** O celular avisou de uma ligação ou mensagem: o PC fala se você estiver nele. Devolve se falou. */
  aviso(texto: string, ligacao: boolean): Promise<boolean>
  /** Executa uma ferramenta do PC pedida pelo celular. */
  ferramenta(nome: string, args: Record<string, unknown>): Promise<{ ok: boolean; mensagem: string; precisaConfirmacao?: boolean }>
  /** Junta a memória do celular com a do PC e devolve a memória inteira. */
  memoria(fatos: unknown[], esquecidos: string[]): { fatos: unknown[]; esquecidos: string[] }
  /** Um celular acabou de parear. */
  pareou(aparelho: string): void
}

interface Arquivo { segredo: string; aparelhos: { nome: string; ultimaVez: string }[] }

const caminho = (): string => join(app.getPath('userData'), 'elo.json')
let dados: Arquivo = { segredo: '', aparelhos: [] }
let chave: CryptoKey | null = null
let servidor: Server | null = null
let opcoes: OpcoesElo | null = null
const vistos = new Map<string, number>()

/** Código de pareamento na tela (vale 5 minutos e 10 tentativas). */
let codigo: { texto: string; chave: CryptoKey; ate: number; tentativas: number } | null = null

// O que o PC manda para o celular fica numa fila até o celular perguntar
const fila: EventoParaCelular[] = []
let esperando: ((e: EventoParaCelular[]) => void) | null = null
let ultimaEscuta = 0

// Contexto das conversas (para continuar de um aparelho no outro)
interface Linha { quando: number; texto: string }
const contextoPc: Linha[] = []
const contextoCelular: Linha[] = []
const QUINZE_MIN = 15 * 60_000

function salvar(): void {
  writeFileSync(caminho(), JSON.stringify(dados, null, 2), 'utf8')
}

function carregar(): void {
  try {
    if (existsSync(caminho())) dados = { aparelhos: [], ...JSON.parse(readFileSync(caminho(), 'utf8')) }
  } catch { /* arquivo estragado: cria outro */ }
  if (!dados.segredo || dados.segredo.length < 20) { dados.segredo = novoSegredo(); salvar() }
}

/** Endereços do PC na rede de casa e no Tailscale, com a placa de rede de cada um. */
export function enderecos(): { ips: string[]; macs: string[] } {
  const ips: string[] = []
  const macs: string[] = []
  const outros: { ip: string; mac: string }[] = []
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue
      const privado = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(i.address)
      if (!privado) { outros.push({ ip: i.address, mac: i.mac }); continue }
      ips.push(i.address)
      if (i.mac && i.mac !== '00:00:00:00:00:00' && !i.address.startsWith('100.') && !macs.includes(i.mac.toUpperCase())) macs.push(i.mac.toUpperCase())
    }
  }
  // Rede com endereços fora do comum: usa o que tiver
  if (!ips.length) for (const o of outros) { ips.push(o.ip); if (o.mac && o.mac !== '00:00:00:00:00:00') macs.push(o.mac.toUpperCase()) }
  // Rede de casa primeiro; Tailscale (100.x) por último
  ips.sort((a, b) => Number(a.startsWith('100.')) - Number(b.startsWith('100.')))
  return { ips, macs }
}

const nomeDoPc = (): string => hostname().replace(/\.local$/, '') || 'PC'

/** Dados para o QR Code e o código de 8 dígitos (abre uma janela de 5 minutos para parear). */
export async function iniciarPareamento(): Promise<{ texto: string; codigo: string; ips: string[]; nome: string; porta: number }> {
  const { ips, macs } = enderecos()
  const p: Pareamento = { nome: nomeDoPc(), porta: PORTA_ELO, segredo: dados.segredo, ips, macs }
  const c = novoCodigo()
  codigo = { texto: c, chave: await chaveDoCodigo(c), ate: Date.now() + 5 * 60_000, tentativas: 0 }
  return { texto: textoDoPareamento(p), codigo: c, ips, nome: p.nome, porta: PORTA_ELO }
}

/** Troca o segredo: o celular pareado antes deixa de funcionar. */
export async function desparear(): Promise<void> {
  dados = { segredo: novoSegredo(), aparelhos: [] }
  salvar()
  chave = await chaveElo(dados.segredo)
}

export const aparelhosPareados = (): string[] => dados.aparelhos.map((a) => a.nome)

/** O app do celular está aberto e escutando o PC agora? */
export const celularEscutando = (): boolean => Date.now() - ultimaEscuta < 40_000

/** Manda algo para o celular (holograma, link, texto). Devolve se ele está escutando agora. */
export function enviarParaCelular(e: EventoParaCelular): boolean {
  fila.push(e)
  if (fila.length > 20) fila.shift()
  if (esperando) { const r = esperando; esperando = null; r(fila.splice(0)) }
  return celularEscutando()
}

/** Guarda uma troca da conversa no PC (para o celular continuar dali). */
export function registrarContextoPc(texto: string): void {
  contextoPc.push({ quando: Date.now(), texto: texto.slice(0, 600) })
  if (contextoPc.length > 12) contextoPc.shift()
}

const recentes = (l: Linha[]): string => l.filter((x) => Date.now() - x.quando < QUINZE_MIN).map((x) => x.texto).join('\n')

/** O que você conversou com ela no celular nos últimos 15 minutos (entra no começo da conversa no PC). */
export const contextoDoCelular = (): string => recentes(contextoCelular)

async function lerCorpo(req: IncomingMessage): Promise<string> {
  let tam = 0
  const partes: Buffer[] = []
  for await (const p of req) {
    tam += (p as Buffer).length
    if (tam > 2 * 1024 * 1024) throw new Error('grande demais')
    partes.push(p as Buffer)
  }
  return Buffer.concat(partes).toString('utf8')
}

function registrarAparelho(nome: string): void {
  const n = String(nome || 'Celular').slice(0, 60)
  const a = dados.aparelhos.find((x) => x.nome === n)
  if (a) a.ultimaVez = new Date().toISOString()
  else dados.aparelhos.push({ nome: n, ultimaVez: new Date().toISOString() })
  dados.aparelhos = dados.aparelhos.slice(-5)
  salvar()
}

async function tratar(p: PedidoElo): Promise<unknown> {
  const o = opcoes as OpcoesElo
  switch (p.acao) {
    case 'ola':
      registrarAparelho(p.aparelho)
      o.pareou(p.aparelho)
      return { nome: nomeDoPc(), ok: true }
    case 'ping':
      return { nome: nomeDoPc(), ok: true }
    case 'aviso':
      return { falou: await o.aviso(String(p.texto ?? '').slice(0, 400), p.ligacao === true) }
    case 'ferramenta':
      return await o.ferramenta(String(p.nome ?? ''), (p.args ?? {}) as Record<string, unknown>)
    case 'memoria':
      return o.memoria(Array.isArray(p.fatos) ? p.fatos : [], Array.isArray(p.esquecidos) ? p.esquecidos.map(String) : [])
    case 'contexto':
      contextoCelular.push({ quando: Date.now(), texto: String(p.texto ?? '').slice(0, 600) })
      if (contextoCelular.length > 12) contextoCelular.shift()
      return { ok: true }
    case 'contexto_pc':
      return { texto: recentes(contextoPc) }
    case 'casa':
      return { casa: lerCasa() }
    case 'escutar': {
      ultimaEscuta = Date.now()
      if (fila.length) return { eventos: fila.splice(0) }
      // Segura a pergunta até chegar algo (ou 25 segundos)
      const eventos = await new Promise<EventoParaCelular[]>((ok) => {
        if (esperando) esperando([])
        esperando = ok
        setTimeout(() => { if (esperando === ok) { esperando = null; ok([]) } }, 25_000)
      })
      ultimaEscuta = Date.now()
      return { eventos }
    }
    default:
      throw new Error('pedido desconhecido')
  }
}

function responder(res: import('node:http').ServerResponse, status: number, corpo: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(corpo)
}

export async function iniciarElo(o: OpcoesElo): Promise<void> {
  opcoes = o
  carregar()
  chave = await chaveElo(dados.segredo)
  servidor = createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST' || (req.url !== '/elo' && req.url !== '/parear')) return responder(res, 404, '')
      let corpo = ''
      try { corpo = await lerCorpo(req) } catch { return responder(res, 413, '') }
      if (req.url === '/parear') {
        // Pareamento pelo código de 8 dígitos: o pedido vem lacrado com o próprio código
        const c = codigo
        if (!c || Date.now() > c.ate || c.tentativas >= 10) return responder(res, 403, '')
        try {
          const p = await abrir<PedidoElo>(c.chave, corpo, vistos)
          if (p.acao !== 'parear') throw new Error('pedido errado')
          const { ips, macs } = enderecos()
          const texto = textoDoPareamento({ nome: nomeDoPc(), porta: PORTA_ELO, segredo: dados.segredo, ips, macs })
          codigo = null
          return responder(res, 200, await lacrar(c.chave, { pareamento: texto }))
        } catch {
          c.tentativas++
          return responder(res, 403, '')
        }
      }
      let pedido: PedidoElo
      try {
        pedido = await abrir<PedidoElo>(chave as CryptoKey, corpo, vistos)
      } catch {
        return responder(res, 403, '')
      }
      try {
        const r = await tratar(pedido)
        responder(res, 200, await lacrar(chave as CryptoKey, r))
      } catch (e) {
        o.log(`elo: ${pedido.acao} falhou: ${(e as Error).message}`)
        responder(res, 200, await lacrar(chave as CryptoKey, { ok: false, mensagem: (e as Error).message }))
      }
    })()
  })
  servidor.on('error', (e) => o.log(`elo: servidor não abriu (${(e as Error).message})`))
  servidor.listen(PORTA_ELO, '0.0.0.0', () => o.log(`elo: ouvindo na porta ${PORTA_ELO} (${enderecos().ips.join(', ') || 'sem rede'})`))
}

export function encerrarElo(): void {
  if (esperando) { esperando([]); esperando = null }
  servidor?.close()
  servidor = null
}
