// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Cérebro reserva: quando a internet cai (ou o Gemini não responde), ela continua funcionando para o
// básico, tudo no PC. O HUD ouve em português com o Vosk (offline) e fala com a voz do Windows;
// aqui fica o cérebro: uma IA local pelo Ollama (se estiver instalado) ou, sem ela, regras simples.

import { executarFerramenta } from './tools'
import { carregarConfig } from './config'
import { TOOL_DECLARATIONS } from '../shared/tools'
import { entender, ferramentasOllama, instrucoesReserva, FERRAMENTAS_RESERVA } from './logica/reserva'
import type { Card } from '../shared/types'

export interface RespostaReserva { fala: string; encerrar: boolean; cartoes: Card[]; motor: 'ollama' | 'regras' }

type Mensagem = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[] }

let historico: Mensagem[] = []
/** Pedido que esperava o "sim" (fechar programa, desligar) — só no modo regras */
let pendente: { nome: string; args: Record<string, unknown> } | null = null
let ollamaVisto: { quando: number; ok: boolean; modelo: string } = { quando: 0, ok: false, modelo: '' }

const cfgReserva = (): { url: string; modelo: string } => carregarConfig().reserva

/** O Ollama está rodando e tem o modelo? (guarda a resposta por 30 s) */
export async function ollamaPronto(): Promise<{ ok: boolean; modelo: string; motivo: string }> {
  const { url, modelo } = cfgReserva()
  if (Date.now() - ollamaVisto.quando < 30_000) return { ok: ollamaVisto.ok, modelo: ollamaVisto.modelo, motivo: '' }
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) })
    const j = (await r.json()) as { models?: { name: string }[] }
    const nomes = (j.models ?? []).map((m) => m.name)
    const achado = nomes.find((n) => n === modelo || n.startsWith(`${modelo}:`) || n.split(':')[0] === modelo.split(':')[0]) ?? ''
    ollamaVisto = { quando: Date.now(), ok: !!achado, modelo: achado }
    return { ok: !!achado, modelo: achado, motivo: achado ? '' : `o Ollama está aberto, mas sem o modelo ${modelo} (rode: ollama pull ${modelo})` }
  } catch {
    ollamaVisto = { quando: Date.now(), ok: false, modelo: '' }
    return { ok: false, modelo: '', motivo: 'o Ollama não está aberto' }
  }
}

async function executar(nome: string, args: Record<string, unknown>, cartoes: Card[]): Promise<{ ok: boolean; mensagem: string; precisaConfirmacao?: boolean }> {
  if (!FERRAMENTAS_RESERVA.includes(nome)) return { ok: false, mensagem: 'Isso precisa de internet.' }
  const r = await executarFerramenta(nome, args)
  if (r.card) cartoes.push(r.card)
  return { ok: r.ok, mensagem: r.mensagem, ...(r.precisaConfirmacao ? { precisaConfirmacao: true } : {}) }
}

/** Texto da ferramenta virando fala: tira o que é instrução para a IA. */
const paraFala = (m: string): string => m.replace(/\s*(Diga|Fale|Responda|Explique|Pergunte|Leia|Comente|Ofereça)[^.]*\./g, '').replace(/^Precisa de confirmação: /, '').trim()

async function comRegras(texto: string): Promise<RespostaReserva> {
  const cartoes: Card[] = []
  const e = entender(texto)
  if (e.tipo === 'encerrar') return { fala: e.texto, encerrar: true, cartoes, motor: 'regras' }
  if (e.tipo === 'confirmar' || e.tipo === 'negar') {
    const p = pendente
    pendente = null
    if (!p) return { fala: e.tipo === 'confirmar' ? 'Confirmar o quê?' : 'Tudo bem.', encerrar: false, cartoes, motor: 'regras' }
    if (e.tipo === 'negar') return { fala: 'Cancelado.', encerrar: false, cartoes, motor: 'regras' }
    const r = await executar(p.nome, { ...p.args, confirmado: true }, cartoes)
    return { fala: paraFala(r.mensagem), encerrar: false, cartoes, motor: 'regras' }
  }
  if (e.tipo === 'fala') return { fala: e.texto, encerrar: false, cartoes, motor: 'regras' }
  const r = await executar(e.nome, e.args, cartoes)
  if (r.precisaConfirmacao) {
    pendente = { nome: e.nome, args: e.args }
    return { fala: `${paraFala(r.mensagem).replace(/\.$/, '')}. Confirma?`, encerrar: false, cartoes, motor: 'regras' }
  }
  // A busca nos arquivos devolve uma lista longa: fala só o primeiro
  if (e.nome === 'buscar_nos_meus_arquivos' && r.ok) {
    const primeiro = r.mensagem.split('\n').find((l) => /^1\. /.test(l))?.replace(/^1\. /, '').replace(/:.*$/, '') ?? ''
    return { fala: primeiro ? `O mais provável é ${primeiro}. Diga "abre o primeiro" para abrir.` : paraFala(r.mensagem), encerrar: false, cartoes, motor: 'regras' }
  }
  return { fala: paraFala(r.mensagem) || (r.ok ? 'Feito.' : 'Não deu.'), encerrar: false, cartoes, motor: 'regras' }
}

async function comOllama(texto: string, modelo: string): Promise<RespostaReserva> {
  const { url } = cfgReserva()
  const cartoes: Card[] = []
  if (!historico.length) historico.push({ role: 'system', content: instrucoesReserva(carregarConfig().nome, new Date()) })
  historico.push({ role: 'user', content: texto })
  const ferramentas = ferramentasOllama(TOOL_DECLARATIONS)
  for (let rodada = 0; rodada < 4; rodada++) {
    const r = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, messages: historico, tools: ferramentas, stream: false, options: { temperature: 0.3 } }),
      signal: AbortSignal.timeout(60_000)
    })
    if (!r.ok) throw new Error(`o Ollama respondeu ${r.status}`)
    const msg = ((await r.json()) as { message?: Mensagem }).message
    if (!msg) throw new Error('o Ollama não respondeu')
    historico.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) })
    if (!msg.tool_calls?.length) {
      historico = [historico[0], ...historico.slice(-14)]
      const fala = (msg.content ?? '').replace(/[*_#`]/g, '').trim()
      return { fala: fala || 'Feito.', encerrar: /\b(tchau|até mais|até logo)\b/i.test(texto), cartoes, motor: 'ollama' }
    }
    for (const c of msg.tool_calls) {
      const args = typeof c.function.arguments === 'string' ? (JSON.parse(c.function.arguments || '{}') as Record<string, unknown>) : c.function.arguments ?? {}
      const res = await executar(c.function.name, args, cartoes)
      historico.push({ role: 'tool', content: JSON.stringify(res) })
    }
  }
  return { fala: 'Fiz o que deu.', encerrar: false, cartoes, motor: 'ollama' }
}

/** Uma fala sua no modo reserva → o que ela responde (e faz). */
export async function responderReserva(texto: string): Promise<RespostaReserva> {
  const o = await ollamaPronto()
  if (o.ok) {
    try {
      return await comOllama(texto, o.modelo)
    } catch {
      // A IA local travou: segue com as regras nesta fala
      ollamaVisto = { quando: 0, ok: false, modelo: '' }
    }
  }
  return comRegras(texto)
}

/** Fim da conversa no modo reserva: esquece o que foi dito. */
export function encerrarReserva(): void {
  historico = []
  pendente = null
}
