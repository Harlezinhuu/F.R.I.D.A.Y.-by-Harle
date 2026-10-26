// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Busca modelos 3D para a projeção. Tudo gratuito e sem chave (fora a IA, que usa a mesma chave do Gemini):
// - seus arquivos (.glb, .gltf, .stl, .obj) na pasta Documentos/FRIDAY Modelos
// - 257 modelos da NASA (NASA 3D Resources, domínio público)
// - STLs da Wikimedia Commons (cada um com a sua licença, mostrada na projeção)
// - moléculas do PubChem e proteínas do RCSB PDB
// - a IA monta qualquer outra coisa com peças simples
// O download acontece aqui, no processo principal: o HUD só recebe o arquivo pronto.

import { app } from 'electron'
import { GoogleGenAI } from '@google/genai'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { DadosModelo3D } from '../shared/types'
import { carregarConfig } from './config'
import { NASA_MODELOS } from './dados/nasa'
import { acharNasa, acharArquivo, nomeNasa, semHtml, validarPrimitivas } from './logica/modelos'

const UA = 'FRIDAY-by-Harle/0.4 (assistente pessoal; github.com/Harlezinhuu/F.R.I.D.A.Y.-by-Harle)'
const MAX_BYTES = 80 * 1024 * 1024
const EXTENSOES = ['.glb', '.gltf', '.stl', '.obj']

export type Fonte = 'auto' | 'arquivo' | 'biblioteca' | 'nasa' | 'wikimedia' | 'molecula' | 'proteina' | 'ia'
export interface Pedido { termo: string; termoIngles: string; fonte: Fonte }

export const pastaModelos = (): string => join(app.getPath('documents'), 'FRIDAY Modelos')

async function baixar(url: string, limiteMs = 30_000): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(limiteMs), headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`O servidor respondeu ${r.status}.`)
  const tamanho = Number(r.headers.get('content-length') ?? 0)
  if (tamanho > MAX_BYTES) throw new Error('O modelo é grande demais (mais de 80 MB).')
  const b = Buffer.from(await r.arrayBuffer())
  if (b.length > MAX_BYTES) throw new Error('O modelo é grande demais (mais de 80 MB).')
  return b
}

async function json<T>(url: string, init: RequestInit = {}, limiteMs = 10_000): Promise<T> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(limiteMs), headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers ?? {}) } })
  if (!r.ok) throw new Error(`O servidor respondeu ${r.status}.`)
  return (await r.json()) as T
}

// ---------- Seus arquivos ----------

export function listarArquivos(): string[] {
  const pasta = pastaModelos()
  if (!existsSync(pasta)) mkdirSync(pasta, { recursive: true })
  return readdirSync(pasta).filter((n) => EXTENSOES.includes(extname(n).toLowerCase())).sort()
}

function deArquivo(p: Pedido): DadosModelo3D | null {
  const nome = acharArquivo([p.termo, p.termoIngles], listarArquivos())
  if (!nome) return null
  const caminho = join(pastaModelos(), nome)
  if (statSync(caminho).size > MAX_BYTES) throw new Error(`O arquivo ${nome} é grande demais (mais de 80 MB).`)
  const ext = extname(nome).toLowerCase().slice(1) as 'glb' | 'gltf' | 'stl' | 'obj'
  const dados = readFileSync(caminho)
  return {
    formato: ext,
    nome: nome.replace(/\.[a-z0-9]+$/i, ''),
    fonte: 'SEU ARQUIVO',
    detalhes: [`Documentos/FRIDAY Modelos/${nome}`],
    ...(ext === 'glb' || ext === 'stl' ? { base64: dados.toString('base64') } : { texto: dados.toString('utf8') }),
    zParaCima: ext === 'stl'
  }
}

// ---------- NASA ----------

async function daNasa(p: Pedido): Promise<DadosModelo3D | null> {
  const item = acharNasa([p.termoIngles, p.termo], NASA_MODELOS)
  if (!item) return null
  const url = `https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/${['3D Models', ...item.split('/')].map(encodeURIComponent).join('/')}`
  const dados = await baixar(url, 45_000)
  return {
    formato: 'glb',
    nome: nomeNasa(item),
    fonte: 'NASA',
    detalhes: ['NASA 3D Resources', `${(dados.length / 1024 / 1024).toFixed(1).replace('.', ',')} MB`],
    credito: 'NASA 3D Resources · domínio público',
    base64: dados.toString('base64')
  }
}

// ---------- Wikimedia Commons (STL) ----------

interface PaginaCommons { title: string; imageinfo?: { url: string; size: number; mime: string; extmetadata?: Record<string, { value?: string }> }[] }

async function daWikimedia(p: Pedido): Promise<DadosModelo3D | null> {
  for (const termo of [p.termoIngles, p.termo].filter(Boolean)) {
    const q = new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '10',
      gsrsearch: `filetype:3d ${termo}`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName'
    })
    const d = await json<{ query?: { pages?: Record<string, PaginaCommons & { index?: number }> } }>(`https://commons.wikimedia.org/w/api.php?${q}`)
    const paginas = Object.values(d.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const achada = paginas.find((pg) => { const ii = pg.imageinfo?.[0]; return ii && /\.stl$/i.test(ii.url) && ii.size <= 40 * 1024 * 1024 })
    const ii = achada?.imageinfo?.[0]
    if (!achada || !ii) continue
    const dados = await baixar(ii.url, 45_000)
    const meta = ii.extmetadata ?? {}
    const autor = semHtml(meta.Artist?.value ?? '').slice(0, 80)
    const licenca = semHtml(meta.LicenseShortName?.value ?? '')
    const nome = semHtml(meta.ObjectName?.value ?? '') || achada.title.replace(/^File:/, '').replace(/\.stl$/i, '')
    return {
      formato: 'stl',
      nome: nome.slice(0, 60),
      fonte: 'WIKIMEDIA',
      detalhes: ['Wikimedia Commons', `${(dados.length / 1024 / 1024).toFixed(1).replace('.', ',')} MB`],
      credito: [autor, licenca, 'Wikimedia Commons'].filter(Boolean).join(' · '),
      base64: dados.toString('base64'),
      zParaCima: true
    }
  }
  return null
}

// ---------- PubChem e RCSB ----------

async function doPubchem(p: Pedido): Promise<DadosModelo3D | null> {
  for (const termo of [p.termoIngles, p.termo].filter(Boolean)) {
    for (const tipo of ['3d', '2d']) {
      const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(termo)}/SDF?record_type=${tipo}`, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': UA } })
      if (!r.ok) continue
      const texto = await r.text()
      return {
        formato: 'sdf',
        nome: p.termo || termo,
        fonte: 'PUBCHEM',
        detalhes: [],
        credito: `PubChem (NIH)${tipo === '2d' ? ' · estrutura plana (sem 3D)' : ''}`,
        texto
      }
    }
  }
  return null
}

async function doRcsb(p: Pedido): Promise<DadosModelo3D | null> {
  const termo = p.termoIngles || p.termo
  const id = /^[0-9][a-z0-9]{3}$/i.test(termo.trim())
    ? termo.trim().toUpperCase()
    : (await json<{ result_set?: { identifier: string }[] }>('https://search.rcsb.org/rcsbsearch/v2/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { type: 'terminal', service: 'full_text', parameters: { value: termo } }, return_type: 'entry', request_options: { paginate: { start: 0, rows: 1 } } })
    }).catch(() => ({ result_set: [] as { identifier: string }[] }))).result_set?.[0]?.identifier
  if (!id) return null
  const r = await fetch(`https://files.rcsb.org/download/${encodeURIComponent(id)}.pdb`, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`A proteína ${id} não tem arquivo PDB (é grande demais para esse formato).`)
  return { formato: 'pdb', nome: p.termo || id, fonte: 'RCSB PDB', detalhes: [], credito: `RCSB PDB · entrada ${id}`, texto: await r.text() }
}

// ---------- IA ----------

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    nome: { type: 'STRING' },
    pecas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          peca: { type: 'STRING', description: 'Nome da peça em português (ex.: roda dianteira, asa esquerda).' },
          forma: { type: 'STRING', enum: ['caixa', 'esfera', 'cilindro', 'cone', 'toro', 'capsula'] },
          posicao: { type: 'ARRAY', items: { type: 'NUMBER' } },
          tamanho: { type: 'ARRAY', items: { type: 'NUMBER' } },
          rotacao: { type: 'ARRAY', items: { type: 'NUMBER' } }
        },
        required: ['peca', 'forma', 'posicao', 'tamanho', 'rotacao']
      }
    }
  },
  required: ['nome', 'pecas']
}

async function daIa(p: Pedido): Promise<DadosModelo3D> {
  const cfg = carregarConfig()
  if (!cfg.apiKey) throw new Error('Falta a GEMINI_API_KEY para a IA montar o modelo.')
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey })
  const pedido = [
    `Monte um modelo 3D simplificado de: "${p.termo}"${p.termoIngles && p.termoIngles !== p.termo ? ` (${p.termoIngles})` : ''}.`,
    'Use de 8 a 60 peças simples: caixa, esfera, cilindro, cone, toro ou capsula.',
    'Cada peça tem: peca (nome da parte em português; várias formas podem ter o mesmo nome se forem a mesma parte), forma,',
    'posicao [x, y, z] do centro, tamanho [x, y, z] (caixa: lados; esfera, cilindro, cone e capsula: diâmetro em x e z, altura em y; toro: diâmetro externo em x e y, espessura em z) e rotacao [x, y, z] em graus.',
    'Eixo Y para cima, o objeto apoiado em y = 0, proporções reais, unidades em metros.',
    'Capriche na silhueta e nas peças que tornam o objeto reconhecível. Não crie personagens ou marcas registradas: só objetos genéricos.'
  ].join('\n')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await (ai.models as any).generateContent({
    model: 'gemini-2.5-flash',
    contents: pedido,
    config: { responseMimeType: 'application/json', responseSchema: ESQUEMA, thinkingConfig: { thinkingBudget: 0 }, temperature: 0.4 }
  })
  const texto: string = typeof r.text === 'function' ? r.text() : r.text ?? ''
  let dados: { nome?: string; pecas?: unknown }
  try { dados = JSON.parse(texto) } catch { throw new Error('A IA não devolveu um modelo válido.') }
  const primitivas = validarPrimitivas(dados.pecas)
  if (primitivas.length < 2) throw new Error('A IA não conseguiu montar esse modelo.')
  const pecas = new Set(primitivas.map((x) => x.peca)).size
  return {
    formato: 'primitivas',
    nome: (dados.nome || p.termo).slice(0, 60),
    fonte: 'IA',
    detalhes: ['Montado pela IA com peças simples', `${primitivas.length} formas · ${pecas} peças`],
    primitivas
  }
}

// ---------- Pedido ----------

/** Busca na ordem certa para a fonte pedida; "auto" tenta seus arquivos, NASA, Wikimedia e por fim a IA. */
export async function buscarModelo(p: Pedido): Promise<DadosModelo3D> {
  const ordem: Record<Fonte, ((p: Pedido) => Promise<DadosModelo3D | null> | DadosModelo3D | null)[]> = {
    auto: [deArquivo, daNasa, daWikimedia, daIa],
    arquivo: [deArquivo],
    biblioteca: [daNasa, daWikimedia],
    nasa: [daNasa],
    wikimedia: [daWikimedia],
    molecula: [doPubchem],
    proteina: [doRcsb],
    ia: [daIa]
  }
  const erros: string[] = []
  for (const f of ordem[p.fonte] ?? ordem.auto) {
    try {
      const d = await f(p)
      if (d) return d
    } catch (e) {
      erros.push((e as Error).message)
    }
  }
  const onde: Record<Fonte, string> = {
    auto: 'em lugar nenhum', arquivo: 'nos seus arquivos (Documentos/FRIDAY Modelos)', biblioteca: 'na NASA nem na Wikimedia',
    nasa: 'nos modelos da NASA', wikimedia: 'na Wikimedia', molecula: 'no PubChem', proteina: 'no RCSB PDB', ia: 'com a IA'
  }
  throw new Error(`Não achei "${p.termo}" ${onde[p.fonte] ?? onde.auto}.${erros.length ? ` (${erros[erros.length - 1]})` : ''}`)
}

/** Salva a imagem da projeção em Imagens/FRIDAY. */
export function salvarImagem(dataUrl: string, nome: string): string {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw new Error('Imagem inválida.')
  const pasta = join(app.getPath('pictures'), 'FRIDAY')
  mkdirSync(pasta, { recursive: true })
  const agora = new Date()
  const dois = (n: number) => String(n).padStart(2, '0')
  const limpo = nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() || 'modelo'
  const arquivo = `projecao-${limpo}-${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}${dois(agora.getSeconds())}.png`
  writeFileSync(join(pasta, arquivo), Buffer.from(m[1], 'base64'))
  return `Imagens/FRIDAY/${arquivo}`
}
