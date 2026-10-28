// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Consultas pelo WhatsApp no PC: os lugares salvos (plano, clínicas), a consulta em andamento e a
// ponte entre o agente (src/shared/consulta.ts) e a FRIDAY que fala com você.
// Tudo fica em consultas.json, na pasta de dados da FRIDAY, só neste PC.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AgenteConsulta, descrever, emAndamento, normalizar, novaConsulta, numeroWhats, type EstadoConsulta, type Lugar } from '../shared/consulta'
import { criarDecisor } from '../shared/consulta-gemini'
import { carregarConfig } from './config'
import { maosDoPc } from './whatsweb'

export interface EventoConsulta {
  tipo: 'pergunta' | 'fim' | 'qr'
  texto: string
  ok?: boolean
}

interface Arquivo { lugares: Lugar[]; atual: EstadoConsulta | null }

let opcoes: { avisar(e: EventoConsulta): void; marcou(e: EstadoConsulta): void; log(t: string): void } = { avisar() {}, marcou() {}, log() {} }
let agente: AgenteConsulta | null = null

const arquivo = (): string => join(app.getPath('userData'), 'consultas.json')

function ler(): Arquivo {
  try {
    if (existsSync(arquivo())) {
      const a = JSON.parse(readFileSync(arquivo(), 'utf8')) as Partial<Arquivo>
      return { lugares: Array.isArray(a.lugares) ? a.lugares : [], atual: a.atual ?? null }
    }
  } catch { /* arquivo estragado: começa do zero */ }
  return { lugares: [], atual: null }
}

function salvar(a: Arquivo): void {
  try { writeFileSync(arquivo(), JSON.stringify(a, null, 2)) } catch (e) { opcoes.log(`não salvei consultas.json: ${(e as Error).message}`) }
}

export function configurarConsultas(o: typeof opcoes): void { opcoes = o }

// ---------- Lugares ----------

export const lugares = (): Lugar[] => ler().lugares

/** Acha o lugar pelo nome falado; vazio = o primeiro salvo. */
export function acharLugar(nome: string): Lugar | { varios: string[] } | null {
  const ls = lugares()
  const p = normalizar(nome)
  if (!p) return ls[0] ?? null
  const exato = ls.find((l) => normalizar(l.nome) === p)
  if (exato) return exato
  const parecidos = ls.filter((l) => { const n = normalizar(l.nome); return n.includes(p) || p.includes(n) })
  if (parecidos.length > 1) return { varios: parecidos.map((l) => l.nome) }
  return parecidos[0] ?? null
}

export function salvarLugar(nome: string, whatsapp: string, dados: string): Lugar {
  const n = nome.trim()
  const numero = numeroWhats(whatsapp)
  if (!n) throw new Error('Faltou o nome do lugar.')
  const a = ler()
  const antigo = a.lugares.find((l) => normalizar(l.nome) === normalizar(n))
  if (!antigo && numero.length < 12) throw new Error('Faltou o número do WhatsApp com DDD (ex.: 11 2029-7200).')
  const l: Lugar = { nome: n, whatsapp: numero.length >= 12 ? numero : antigo!.whatsapp, dados: dados.trim() || antigo?.dados || '' }
  a.lugares = [...a.lugares.filter((x) => x !== antigo), l]
  salvar(a)
  return l
}

export function removerLugar(nome: string): string | null {
  const a = ler()
  const l = acharLugar(nome)
  if (!l || 'varios' in l) return null
  a.lugares = a.lugares.filter((x) => normalizar(x.nome) !== normalizar(l.nome))
  salvar(a)
  return l.nome
}

// ---------- A consulta ----------

export const consultaAtual = (): EstadoConsulta | null => agente?.estado ?? ler().atual

/** Para o começo de cada conversa: a pergunta que está esperando você. */
export function perguntaPendente(): string {
  const e = consultaAtual()
  if (!e || e.situacao !== 'esperando_voce' || !e.pergunta) return ''
  return `Consulta pelo WhatsApp esperando a resposta dele (${e.lugar.nome}, ${e.pedido}): ${e.pergunta.texto}${e.pergunta.opcoes.length ? ` Opções: ${e.pergunta.opcoes.join('; ')}.` : ''} Quando ele responder, chame responder_consulta.`
}

function guardarAtual(e: EstadoConsulta): void {
  const a = ler()
  a.atual = e
  salvar(a)
}

function ligar(estado: EstadoConsulta): void {
  const chave = carregarConfig().apiKey
  agente = new AgenteConsulta(estado, maosDoPc(() => opcoes.avisar({
    tipo: 'qr',
    texto: 'Abri o WhatsApp na tela. No celular, vá em WhatsApp, Aparelhos conectados, Conectar um aparelho, e leia o QR. É só desta vez.'
  })), criarDecisor(chave), {
    aoMudar: guardarAtual,
    aoPerguntar(e) {
      opcoes.log(`consulta: perguntando "${e.pergunta?.texto}"`)
      opcoes.avisar({ tipo: 'pergunta', texto: `${e.pergunta?.texto ?? ''}${e.pergunta?.opcoes.length ? ` (${e.pergunta.opcoes.join(' / ')})` : ''}` })
    },
    aoTerminar(e) {
      opcoes.log(`consulta: ${e.situacao} — ${e.resumo}`)
      if (e.situacao === 'pronto') opcoes.marcou(e)
      if (e.situacao !== 'cancelado') opcoes.avisar({ tipo: 'fim', ok: e.situacao === 'pronto', texto: e.situacao === 'pronto' ? descrever(e) : `Não deu para marcar com ${e.lugar.nome}: ${e.resumo}` })
    },
    log: (t) => opcoes.log(`consulta: ${t}`)
  })
  const este = agente
  void este.rodar().finally(() => { if (agente === este && !emAndamento(este.estado)) agente = null })
}

export function iniciarConsulta(p: { pedido: string; preferencias: string; observacoes: string; lugar: Lugar }): EstadoConsulta {
  if (emAndamento(consultaAtual())) throw new Error(`Já estou marcando outra. ${descrever(consultaAtual())}`)
  if (!carregarConfig().apiKey) throw new Error('Falta a chave do Gemini.')
  const e = novaConsulta({ dono: carregarConfig().nome, ...p })
  guardarAtual(e)
  ligar(e)
  return e
}

export function responderConsulta(texto: string): string {
  const e = consultaAtual()
  if (!e || !emAndamento(e)) return 'Não tem consulta sendo marcada agora.'
  if (!agente) return 'A consulta está parada. Diga "retoma a consulta".'
  agente.responder(texto)
  return `Passei para a conversa com ${e.lugar.nome}. Continuo por lá e te aviso.`
}

export function cancelarConsulta(): string {
  const e = consultaAtual()
  if (!e || !emAndamento(e)) return 'Não tem consulta sendo marcada agora.'
  if (agente) agente.cancelar()
  else { e.situacao = 'cancelado'; e.resumo = 'Cancelado por você.'; guardarAtual(e) }
  return `Parei. A conversa com ${e.lugar.nome} fica no WhatsApp do jeito que está, para você continuar.`
}

/** A FRIDAY abriu de novo com uma consulta pela metade (de menos de um dia): continua de onde parou. */
export function retomarConsulta(): boolean {
  if (agente) return true
  const e = ler().atual
  if (!e || !emAndamento(e) || Date.now() - e.atualizadaEm > 24 * 3600_000 || !carregarConfig().apiKey) return false
  ligar(e)
  if (e.situacao === 'esperando_voce' && e.pergunta) setTimeout(() => opcoes.avisar({ tipo: 'pergunta', texto: e.pergunta?.texto ?? '' }), 8000)
  return true
}
