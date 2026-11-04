// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Cotações e conversões (dólar, euro, bitcoin...), pela AwesomeAPI (gratuita, sem chave).
// Usada no PC e no celular.

/** Moedas que ela entende pelo nome falado. */
const MOEDAS: Record<string, { codigo: string; nome: string }> = {
  real: { codigo: 'BRL', nome: 'real' }, reais: { codigo: 'BRL', nome: 'real' }, brl: { codigo: 'BRL', nome: 'real' },
  dolar: { codigo: 'USD', nome: 'dólar' }, dolares: { codigo: 'USD', nome: 'dólar' }, usd: { codigo: 'USD', nome: 'dólar' },
  'dolar canadense': { codigo: 'CAD', nome: 'dólar canadense' }, cad: { codigo: 'CAD', nome: 'dólar canadense' },
  'dolar australiano': { codigo: 'AUD', nome: 'dólar australiano' }, aud: { codigo: 'AUD', nome: 'dólar australiano' },
  euro: { codigo: 'EUR', nome: 'euro' }, euros: { codigo: 'EUR', nome: 'euro' }, eur: { codigo: 'EUR', nome: 'euro' },
  libra: { codigo: 'GBP', nome: 'libra' }, libras: { codigo: 'GBP', nome: 'libra' }, gbp: { codigo: 'GBP', nome: 'libra' },
  iene: { codigo: 'JPY', nome: 'iene' }, ienes: { codigo: 'JPY', nome: 'iene' }, jpy: { codigo: 'JPY', nome: 'iene' },
  yuan: { codigo: 'CNY', nome: 'yuan' }, cny: { codigo: 'CNY', nome: 'yuan' },
  peso: { codigo: 'ARS', nome: 'peso argentino' }, 'peso argentino': { codigo: 'ARS', nome: 'peso argentino' }, ars: { codigo: 'ARS', nome: 'peso argentino' },
  franco: { codigo: 'CHF', nome: 'franco suíço' }, chf: { codigo: 'CHF', nome: 'franco suíço' },
  bitcoin: { codigo: 'BTC', nome: 'bitcoin' }, btc: { codigo: 'BTC', nome: 'bitcoin' },
  ethereum: { codigo: 'ETH', nome: 'ethereum' }, eth: { codigo: 'ETH', nome: 'ethereum' }
}

const sem = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

/** "dólar", "Euros", "BTC" → código. */
export function codigoDaMoeda(nome: string): { codigo: string; nome: string } | null {
  const n = sem(nome)
  if (!n) return null
  return MOEDAS[n] ?? MOEDAS[n.replace(/s$/, '')] ?? Object.values(MOEDAS).find((m) => m.codigo === n.toUpperCase()) ?? null
}

export interface Cotacao { codigo: string; nome: string; brl: number; variacao: number; quando: string }

/** Lê a resposta da AwesomeAPI ({"USDBRL": {bid, pctChange, create_date}, ...}). */
export function lerCotacoes(dados: Record<string, { code?: string; codein?: string; bid?: string; pctChange?: string; create_date?: string }>): Cotacao[] {
  const out: Cotacao[] = []
  for (const v of Object.values(dados ?? {})) {
    if (!v || v.codein !== 'BRL' || !v.code) continue
    const brl = Number(v.bid)
    if (!Number.isFinite(brl) || brl <= 0) continue
    const m = Object.values(MOEDAS).find((x) => x.codigo === v.code)
    out.push({ codigo: v.code, nome: m?.nome ?? v.code, brl, variacao: Number(v.pctChange) || 0, quando: v.create_date ?? '' })
  }
  return out
}

const dinheiro = (v: number, codigo: string): string => {
  const casas = v >= 1000 ? 0 : v >= 1 ? 2 : 4
  const n = v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  return codigo === 'BRL' ? `R$ ${n}` : `${n} ${codigo}`
}

/** Frase da cotação: "O dólar está a R$ 5,43 (subiu 0,4% hoje)." */
export function falarCotacao(c: Cotacao): string {
  const v = Math.abs(c.variacao) < 0.05 ? 'estável hoje' : `${c.variacao > 0 ? 'subiu' : 'caiu'} ${Math.abs(c.variacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% hoje`
  return `${c.nome[0].toUpperCase()}${c.nome.slice(1)}: ${dinheiro(c.brl, 'BRL')} (${v}).`
}

/** Converte usando as cotações em reais: valor em `de` para `para`. */
export function converter(valor: number, de: string, para: string, cot: Cotacao[]): number | null {
  const emReais = (c: string) => (c === 'BRL' ? 1 : cot.find((x) => x.codigo === c)?.brl ?? null)
  const a = emReais(de), b = emReais(para)
  return a === null || b === null ? null : (valor * a) / b
}

export const formatarValor = dinheiro

type Buscar = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Busca as cotações em reais das moedas pedidas (códigos). */
export async function buscarCotacoes(codigos: string[], buscar: Buscar = (u) => fetch(u, { signal: AbortSignal.timeout(9000) })): Promise<Cotacao[]> {
  const pares = [...new Set(codigos.filter((c) => c !== 'BRL'))].map((c) => `${c}-BRL`)
  if (!pares.length) return []
  const r = await buscar(`https://economia.awesomeapi.com.br/json/last/${pares.join(',')}`)
  if (!r.ok) throw new Error(`O serviço de cotações respondeu ${r.status}.`)
  return lerCotacoes((await r.json()) as Record<string, never>)
}

/** Resposta completa da ferramenta: cotações ou conversão. */
export async function responderCotacao(moedas: string[], valor: number | null, para: string, buscar?: Buscar): Promise<string> {
  const lista = (moedas.length ? moedas : ['dólar', 'euro', 'bitcoin']).map(codigoDaMoeda)
  if (lista.some((m) => !m)) throw new Error(`Não conheço a moeda "${moedas[lista.findIndex((m) => !m)]}".`)
  const destino = codigoDaMoeda(para || 'real')
  if (!destino) throw new Error(`Não conheço a moeda "${para}".`)
  const codigos = lista.map((m) => m!.codigo)
  const cot = await buscarCotacoes([...codigos, destino.codigo], buscar)
  if (valor !== null && codigos.length) {
    const de = codigos[0]
    const r = converter(valor, de, destino.codigo, cot)
    if (r === null) throw new Error('Não achei a cotação dessa moeda agora.')
    return `${formatarValor(valor, de)} dá ${formatarValor(r, destino.codigo)}, pela cotação de agora.`
  }
  const falas = cot.filter((c) => codigos.includes(c.codigo)).map(falarCotacao)
  if (!falas.length) throw new Error('Não achei essas cotações agora.')
  return falas.join(' ')
}
