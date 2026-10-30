// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Pesquisa profunda em segundo plano: "pesquisa a fundo os melhores cursos de Node e me entrega
// amanhã cedo". Ela planeja, pesquisa cada parte na internet (Google, pelo Gemini), olha o que você
// já tem nos seus arquivos (segundo cérebro), cruza as fontes e escreve um relatório com as fontes
// numeradas. O relatório fica em Documentos/FRIDAY/Pesquisas (Markdown e página para ler).

import { app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GoogleGenAI } from '@google/genai'
import { carregarConfig } from './config'
import { buscarNoCerebro } from './cerebro'
import {
  lerPlano, nomeDoArquivo, numerarFontes, paginaHtml, promptParte, promptPlano, promptRelatorio, relatorioCompleto, resumoFalado,
  type Fonte, type Local, type Parte
} from './logica/pesquisa'
import { markdown } from '../../mobile/src/markdown'

const MODELO = 'gemini-2.5-flash'

export interface Pesquisa {
  id: number
  tema: string
  foco: string
  titulo: string
  estado: 'na fila' | 'pesquisando' | 'pronta' | 'falhou'
  etapa: string
  criadaEm: number
  /** Quando ela deve te contar (0 = assim que ficar pronta) */
  entregarEm: number
  entregue: boolean
  arquivoMd: string
  arquivoHtml: string
  resumo: string
  fontes: number
}

interface Arquivo { proximo: number; itens: Pesquisa[] }

let opcoes: { entregar(p: Pesquisa): void; log(t: string): void } = { entregar() {}, log() {} }
let rodando = false

const arquivo = (): string => join(app.getPath('userData'), 'pesquisas.json')
const pastaRelatorios = (): string => join(app.getPath('documents'), 'FRIDAY', 'Pesquisas')
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const hoje = (): string => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })

function ler(): Arquivo {
  try {
    if (existsSync(arquivo())) {
      const a = JSON.parse(readFileSync(arquivo(), 'utf8')) as Arquivo
      return { proximo: Number(a.proximo) || 1, itens: Array.isArray(a.itens) ? a.itens : [] }
    }
  } catch { /* estragado: começa de novo */ }
  return { proximo: 1, itens: [] }
}

function guardar(p: Pesquisa): void {
  const a = ler()
  a.itens = [...a.itens.filter((x) => x.id !== p.id), p].sort((x, y) => x.id - y.id).slice(-40)
  a.proximo = Math.max(a.proximo, p.id + 1)
  try { writeFileSync(arquivo(), JSON.stringify(a, null, 2)) } catch { /* sem disco */ }
}

export const pesquisas = (): Pesquisa[] => ler().itens

// ---------- Gemini ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gerar(ai: GoogleGenAI, prompt: string, busca: boolean, json = false): Promise<any> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await ai.models.generateContent({
        model: MODELO,
        contents: prompt,
        config: { ...(busca ? { tools: [{ googleSearch: {} }] } : {}), ...(json ? { responseMimeType: 'application/json' } : {}), temperature: 0.3 }
      })
    } catch (e) {
      // Limite por minuto da chave grátis: espera e tenta de novo
      if (tentativa >= 3 || !/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded/i.test(String((e as Error).message))) throw e
      await esperar(20_000 * (tentativa + 1))
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const textoDe = (r: any): string => ((typeof r.text === 'function' ? r.text() : r.text) ?? '').trim()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fontesDe(r: any): Fonte[] {
  const pedacos: { web?: { uri?: string; title?: string } }[] = r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  return pedacos.flatMap((c) => (c.web?.uri ? [{ titulo: c.web.title ?? '', url: c.web.uri }] : []))
}

// ---------- A pesquisa ----------

async function executar(p: Pesquisa): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: carregarConfig().apiKey })
  const etapa = (t: string) => { p.etapa = t; guardar(p); opcoes.log(`pesquisa ${p.id}: ${t}`) }

  p.estado = 'pesquisando'
  etapa('planejando')
  const plano = lerPlano(textoDe(await gerar(ai, promptPlano(p.tema, p.foco, hoje()), false, true)), p.tema)
  p.titulo = plano.titulo

  const partes: Parte[] = []
  const locais: Local[] = []
  const vistosLocais = new Set<string>()
  for (const [i, q] of plano.perguntas.entries()) {
    etapa(`pesquisando ${i + 1} de ${plano.perguntas.length}: ${q.pergunta}`)
    await esperar(i ? 4000 : 0) // devagar: a chave grátis tem limite por minuto
    try {
      const r = await gerar(ai, promptParte(q, p.tema, hoje()), true)
      partes.push({ pergunta: q.pergunta, texto: textoDe(r), fontes: fontesDe(r) })
    } catch (e) {
      partes.push({ pergunta: q.pergunta, texto: `(Não consegui pesquisar esta parte: ${(e as Error).message.slice(0, 120)})`, fontes: [] })
    }
    // O que você já tem guardado sobre isso (segundo cérebro, só no PC)
    for (const a of buscarNoCerebro(`${q.pergunta} ${p.tema}`, q.busca.split(/\s+/), 2)) {
      if (vistosLocais.has(a.caminho) || locais.length >= 6) continue
      vistosLocais.add(a.caminho)
      locais.push({ nome: a.nome, pasta: a.pasta, trecho: a.trechos[0] ?? '' })
    }
  }
  if (!partes.some((x) => x.fontes.length || !x.texto.startsWith('(Não consegui'))) throw new Error('a internet não respondeu nenhuma das partes')

  etapa('escrevendo o relatório')
  await esperar(4000)
  const corpo = textoDe(await gerar(ai, promptRelatorio(p.tema, p.foco, partes, locais, hoje()), false))
  if (!corpo) throw new Error('o relatório veio vazio')
  const { fontes } = numerarFontes(partes)
  const md = relatorioCompleto(p.titulo, corpo, fontes, new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' }))

  mkdirSync(pastaRelatorios(), { recursive: true })
  const base = join(pastaRelatorios(), nomeDoArquivo(p.titulo, new Date(p.criadaEm)))
  writeFileSync(`${base}.md`, md, 'utf8')
  writeFileSync(`${base}.html`, paginaHtml(p.titulo, md, markdown), 'utf8')
  p.arquivoMd = `${base}.md`
  p.arquivoHtml = `${base}.html`
  p.resumo = resumoFalado(corpo)
  p.fontes = fontes.length
  p.estado = 'pronta'
  etapa(`pronta (${fontes.length} fontes${locais.length ? `, ${locais.length} arquivos seus` : ''})`)
}

/** Roda a fila, uma pesquisa de cada vez. */
async function rodarFila(): Promise<void> {
  if (rodando) return
  rodando = true
  try {
    for (;;) {
      const p = ler().itens.find((x) => x.estado === 'na fila' || x.estado === 'pesquisando')
      if (!p) break
      try {
        await executar(p)
      } catch (e) {
        p.estado = 'falhou'
        p.etapa = `falhou: ${(e as Error).message.slice(0, 200)}`
        guardar(p)
        opcoes.log(`pesquisa ${p.id} falhou: ${(e as Error).message}`)
      }
      guardar(p)
      entregarSePuder()
    }
  } finally {
    rodando = false
  }
}

/** Conta as pesquisas prontas (ou que falharam) cuja hora de entregar já chegou. */
function entregarSePuder(): void {
  for (const p of ler().itens) {
    if (p.entregue || (p.estado !== 'pronta' && p.estado !== 'falhou') || p.entregarEm > Date.now()) continue
    p.entregue = true
    guardar(p)
    opcoes.entregar(p)
  }
}

export function pedirPesquisa(tema: string, foco: string, entregarEm: number): Pesquisa {
  const a = ler()
  const p: Pesquisa = {
    id: a.proximo, tema, foco, titulo: tema.slice(0, 90), estado: 'na fila', etapa: 'na fila', criadaEm: Date.now(),
    entregarEm: entregarEm > Date.now() ? entregarEm : 0, entregue: false, arquivoMd: '', arquivoHtml: '', resumo: '', fontes: 0
  }
  guardar(p)
  void rodarFila()
  return p
}

export function abrirPesquisa(p: Pesquisa): Promise<string> {
  return shell.openPath(existsSync(p.arquivoHtml) ? p.arquivoHtml : p.arquivoMd)
}

export const pastaDasPesquisas = (): string => pastaRelatorios()

/** Ao abrir: retoma o que ficou pela metade e confere as entregas a cada minuto. */
export function iniciarPesquisas(o: typeof opcoes): void {
  opcoes = o
  setTimeout(() => { void rodarFila(); entregarSePuder() }, 20_000)
  setInterval(entregarSePuder, 60_000)
}
