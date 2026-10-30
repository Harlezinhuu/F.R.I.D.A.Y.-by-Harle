// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Segundo cérebro: a FRIDAY lê os seus documentos, anotações e projetos, guarda um índice NO SEU PC e
// acha as coisas pelo assunto ("onde está aquele PDF de redes que fala de sub-rede?").
//
// - Pastas: Documentos, Área de Trabalho, Downloads e os projetos de programação (projetos.json).
//   Dá para trocar com FRIDAY_CEREBRO_PASTAS no .env (pastas separadas por ;) ou desligar com FRIDAY_CEREBRO=0.
// - Lê: textos, anotações (.md), código, PDF, Word, PowerPoint, Excel e OpenDocument.
// - Nunca lê: .env, chaves, cofres de senha, node_modules, .git; chaves no meio do texto viram [oculto].
// - Trabalha devagar e com calma em segundo plano, e só refaz o que mudou.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, type Dirent } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path, { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { Indice, arquivoSecreto, fatiar, lerZip, ocultarSegredos, partesDoOffice, textoDeXml, type Achado } from './logica/cerebro'
import { variavel } from './config'
import { lerProjetos } from './tarefas'

const VERSAO = 1
const TEXTO = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.rtf', '.html', '.htm', '.json', '.yml', '.yaml', '.xml', '.tex', '.org', '.srt'])
const CODIGO = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.kt', '.cs', '.cpp', '.cc', '.c', '.h', '.hpp', '.go', '.rs', '.php', '.rb', '.lua', '.sql', '.css', '.scss', '.vue', '.svelte', '.sh', '.dart', '.swift'])
const OFFICE = new Set(['.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods'])
const PULAR = new Set(['node_modules', '.git', '.svn', 'dist', 'build', 'out', '.next', '.nuxt', '.cache', '.venv', 'venv', 'env', '__pycache__', 'target', 'bin', 'obj', '.idea', '.vscode', '.gradle', 'android', 'ios', 'vendor', 'coverage', '.turbo', 'Steam', 'steamapps', 'AppData', 'resources'])
const MAX_ARQUIVOS = 20_000
const MAX_PEDACOS_POR_ARQUIVO = 400

interface Registro { tamanho: number; mtime: number; nome: string; pedacos: string[] }
interface Guardado { versao: number; arquivos: Record<string, Registro>; atualizadoEm: number }

let guardado: Guardado = { versao: VERSAO, arquivos: {}, atualizadoEm: 0 }
let indice = new Indice()
let indexando = false
let progresso = { lidos: 0, novos: 0, total: 0 }
let log: (t: string) => void = () => {}

const pasta = (): string => join(app.getPath('userData'), 'cerebro')
const arquivoIndice = (): string => join(pasta(), 'indice.json')

export const ligado = (): boolean => variavel('FRIDAY_CEREBRO') !== '0'

/** As pastas que ela lê. */
export function pastasDoCerebro(): string[] {
  const proprias = variavel('FRIDAY_CEREBRO_PASTAS').split(';').map((p) => p.trim()).filter(Boolean)
  const base = proprias.length ? proprias : [app.getPath('documents'), app.getPath('desktop'), app.getPath('downloads')]
  const projetos = lerProjetos().projetos.map((p) => p.pasta)
  const todas = [...base, ...projetos].map((p) => path.resolve(p)).filter((p) => existsSync(p))
  // Sem repetir pasta que já está dentro de outra
  return [...new Set(todas)].filter((p, _, l) => !l.some((o) => o !== p && p.startsWith(o + path.sep)))
}

function carregar(): void {
  try {
    if (existsSync(arquivoIndice())) {
      const g = JSON.parse(readFileSync(arquivoIndice(), 'utf8')) as Guardado
      if (g.versao === VERSAO && g.arquivos) guardado = g
    }
  } catch { /* índice estragado: refaz */ }
  reconstruir()
}

function reconstruir(): void {
  const novo = new Indice()
  for (const [caminho, r] of Object.entries(guardado.arquivos)) novo.adicionar(caminho, r.nome, r.pedacos)
  indice = novo
}

function salvar(): void {
  mkdirSync(pasta(), { recursive: true })
  const tmp = `${arquivoIndice()}.tmp`
  writeFileSync(tmp, JSON.stringify(guardado))
  renameSync(tmp, arquivoIndice())
}

const tipoLido = (ext: string): boolean => TEXTO.has(ext) || CODIGO.has(ext) || OFFICE.has(ext) || ext === '.pdf'

/** Lista os arquivos que interessam (sem pastas de sistema, de dependências ou ocultas). */
function percorrer(raiz: string, saida: string[], profundidade = 0): void {
  if (saida.length >= MAX_ARQUIVOS || profundidade > 8) return
  let itens: Dirent[]
  try { itens = readdirSync(raiz, { withFileTypes: true }) } catch { return }
  for (const d of itens) {
    if (saida.length >= MAX_ARQUIVOS) return
    if (d.name.startsWith('.') && d.name !== '.github') continue
    const c = join(raiz, d.name)
    // A própria pasta do índice nunca entra (ela mudaria a cada leitura)
    if (d.isDirectory()) { if (!PULAR.has(d.name) && c !== pasta()) percorrer(c, saida, profundidade + 1); continue }
    if (!d.isFile() || arquivoSecreto(d.name)) continue
    if (tipoLido(path.extname(d.name).toLowerCase())) saida.push(c)
  }
}

// ---------- Ler o texto de cada tipo ----------

async function textoDoPdf(dados: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const tarefa = pdfjs.getDocument({ data: dados, useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 })
  const paginas: string[] = []
  try {
    const doc = await tarefa.promise
    for (let p = 1; p <= Math.min(doc.numPages, 300); p++) {
      const pagina = await doc.getPage(p)
      const c = await pagina.getTextContent()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paginas.push(c.items.map((i: any) => `${i.str ?? ''}${i.hasEOL ? '\n' : ''}`).join(''))
      await esperar(2)
    }
  } finally {
    await tarefa.destroy()
  }
  return paginas.join('\n\n')
}

async function textoDoOffice(dados: Uint8Array, ext: string): Promise<string> {
  const quero = (n: string) => /\.xml$/.test(n) && (n.startsWith('word/') || n.startsWith('ppt/slides/') || n === 'xl/sharedStrings.xml' || n === 'content.xml')
  const zip = lerZip(dados, quero, (d) => inflateRawSync(d))
  const decodificar = new TextDecoder()
  return partesDoOffice(ext, Object.keys(zip)).map((n) => textoDeXml(decodificar.decode(zip[n]))).join('\n\n')
}

const rtfParaTexto = (rtf: string): string => rtf.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/g, '').replace(/[{}]/g, '')
const htmlParaTexto = (h: string): string => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h\d|li|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')

async function lerTexto(caminho: string, tamanho: number): Promise<string> {
  const ext = path.extname(caminho).toLowerCase()
  if (ext === '.pdf') return tamanho > 60 * 1024 * 1024 ? '' : textoDoPdf(new Uint8Array(await readFile(caminho)))
  if (OFFICE.has(ext)) return tamanho > 40 * 1024 * 1024 ? '' : textoDoOffice(new Uint8Array(await readFile(caminho)), ext)
  // Texto e código: arquivos gigantes (logs, dados) ficam de fora
  if (tamanho > (ext === '.json' || ext === '.csv' || ext === '.xml' ? 400 * 1024 : 2 * 1024 * 1024)) return ''
  const t = await readFile(caminho, 'utf8')
  if (t.includes('\u0000')) return '' // binário disfarçado
  if (ext === '.rtf') return rtfParaTexto(t)
  if (ext === '.html' || ext === '.htm') return htmlParaTexto(t)
  return t
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- Indexar ----------

/** Passa pelas pastas e lê só o que é novo ou mudou. Devagar, para não pesar o PC. */
export async function indexar(): Promise<{ novos: number; total: number }> {
  if (indexando || !ligado()) return { novos: 0, total: Object.keys(guardado.arquivos).length }
  indexando = true
  const inicio = Date.now()
  try {
    const lista: string[] = []
    for (const p of pastasDoCerebro()) percorrer(p, lista)
    progresso = { lidos: 0, novos: 0, total: lista.length }
    const vistos = new Set(lista)
    let mudou = false
    // Arquivos apagados saem do índice
    for (const c of Object.keys(guardado.arquivos)) if (!vistos.has(c)) { delete guardado.arquivos[c]; mudou = true }
    let desdeSalvar = 0
    for (const c of lista) {
      progresso.lidos++
      let s
      try { s = statSync(c) } catch { continue }
      const antigo = guardado.arquivos[c]
      if (antigo && antigo.mtime === s.mtimeMs && antigo.tamanho === s.size) continue
      try {
        const texto = ocultarSegredos(await lerTexto(c, s.size))
        guardado.arquivos[c] = { tamanho: s.size, mtime: s.mtimeMs, nome: path.basename(c), pedacos: fatiar(texto).slice(0, MAX_PEDACOS_POR_ARQUIVO) }
      } catch (e) {
        // Arquivo com senha, corrompido ou em uso: guarda vazio para não tentar toda hora
        guardado.arquivos[c] = { tamanho: s.size, mtime: s.mtimeMs, nome: path.basename(c), pedacos: [] }
        log(`não li ${path.basename(c)}: ${(e as Error).message?.slice(0, 120)}`)
      }
      progresso.novos++
      mudou = true
      if (++desdeSalvar >= 200) { desdeSalvar = 0; guardado.atualizadoEm = Date.now(); salvar(); reconstruir() }
      await esperar(8)
    }
    if (mudou) { guardado.atualizadoEm = Date.now(); salvar(); reconstruir() }
    log(`índice: ${progresso.novos} novos de ${lista.length} em ${Math.round((Date.now() - inicio) / 1000)} s`)
    return { novos: progresso.novos, total: lista.length }
  } finally {
    indexando = false
  }
}

/** Ao abrir: carrega o índice e passa pelas pastas daqui a pouco e depois a cada hora. */
export function iniciarCerebro(registrar: (t: string) => void): void {
  log = registrar
  if (!ligado()) return
  carregar()
  setTimeout(() => void indexar().catch((e) => log(`erro: ${(e as Error).message}`)), 90_000)
  setInterval(() => void indexar().catch(() => {}), 60 * 60_000)
}

// ---------- Buscar ----------

export interface Resultado { caminho: string; nome: string; pasta: string; modificado: number; trechos: string[] }

function pastaAmigavel(c: string): string {
  const casa = app.getPath('home')
  const d = path.dirname(c)
  return d.startsWith(casa) ? `~${d.slice(casa.length)}` : d
}

export function buscarNoCerebro(pergunta: string, relacionadas: string[] = [], limite = 6): Resultado[] {
  return indice.buscar(pergunta, relacionadas, limite).map((a: Achado) => {
    const r = guardado.arquivos[a.arquivo]
    return { caminho: a.arquivo, nome: r?.nome ?? path.basename(a.arquivo), pasta: pastaAmigavel(a.arquivo), modificado: r?.mtime ?? 0, trechos: a.trechos }
  })
}

export function estadoDoCerebro(): { ligado: boolean; arquivos: number; pedacos: number; indexando: boolean; progresso: typeof progresso; atualizadoEm: number; pastas: string[] } {
  return {
    ligado: ligado(),
    arquivos: Object.values(guardado.arquivos).filter((r) => r.pedacos.length).length,
    pedacos: indice.total,
    indexando,
    progresso,
    atualizadoEm: guardado.atualizadoEm,
    pastas: ligado() ? pastasDoCerebro() : []
  }
}
