// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Gera os arquivos de impressão (STL) e as versões para a FRIDAY ver (GLB, montadas).
// Uso: npm run hardware   (ou: node --experimental-strip-types hardware/gerar.ts [nucleo|capacete])

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compactar, conferir, simplificar, soltos, stl, tetraedros, yParaZ } from './sdf.mjs'
import { escreverGlb, type PecaGlb } from '../src/shared/glb.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DESIGNS = join(AQUI, '..', 'resources', 'designs')

interface Peca {
  arquivo: string; nome: string; f: (x: number, y: number, z: number) => number
  caixa: [[number, number, number], [number, number, number]]; passo: number
  cor: [number, number, number]; brilho?: boolean; material: string; deCabecaParaBaixo?: boolean
  /** Para que lado a peça fica "em pé" na impressora: 'y' (padrão), 'x+' ou 'x-' */
  orientacao?: 'y' | 'x+' | 'x-'
}

function gerarPeca(p: Peca, pasta: string): { tri: Float32Array; relatorio: string } {
  const t0 = Date.now()
  const m = simplificar(tetraedros(p.f, p.caixa, p.passo), 0.05)
  const tri = soltos(m) as Float32Array
  const c = conferir(tri)
  if (c.abertas || c.demais) throw new Error(`${p.arquivo}: malha não fechou (${c.abertas} arestas abertas, ${c.demais} repetidas)`)
  // Para imprimir: Z para cima, apoiada na mesa (z = 0), centrada
  let imprimir = p.orientacao === 'x+' || p.orientacao === 'x-' ? xParaZ(tri, p.orientacao === 'x+') : yParaZ(p.deCabecaParaBaixo ? virarY(tri) : tri)
  imprimir = apoiar(imprimir)
  writeFileSync(join(pasta, `${p.arquivo}.stl`), stl(imprimir, `FRIDAY by Harle - ${p.nome}`))
  const relatorio = `${p.arquivo}.stl: ${c.triangulos} triângulos, ${c.tamanho.join(' × ')} mm, ${(c.volume / 1000).toFixed(1)} cm³ (${Date.now() - t0} ms)`
  console.log(relatorio)
  // Versão leve só para ver na FRIDAY (o arquivo de impressão fica com o detalhe todo)
  const previa = soltos(simplificar(compactar(m), 0.25)) as Float32Array
  return { tri: previa, relatorio }
}

function virarY(tri: Float32Array): Float32Array {
  // Vira de cabeça para baixo girando 180° em volta de X (mantém a malha do lado certo)
  const out = new Float32Array(tri.length)
  for (let i = 0; i < tri.length; i += 3) { out[i] = tri[i]; out[i + 1] = -tri[i + 1]; out[i + 2] = -tri[i + 2] }
  return out
}

/** Põe o eixo X (+ ou -) para cima, girando (sem espelhar, para a malha continuar do lado certo). */
function xParaZ(tri: Float32Array, positivo: boolean): Float32Array {
  const out = new Float32Array(tri.length)
  for (let i = 0; i < tri.length; i += 3) {
    const x = tri[i], y = tri[i + 1], z = tri[i + 2]
    if (positivo) { out[i] = y; out[i + 1] = z; out[i + 2] = x } else { out[i] = y; out[i + 1] = -z; out[i + 2] = -x }
  }
  return out
}

function apoiar(tri: Float32Array): Float32Array {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < tri.length; i++) { const k = i % 3; min[k] = Math.min(min[k], tri[i]); max[k] = Math.max(max[k], tri[i]) }
  const d = [-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]]
  const out = new Float32Array(tri.length)
  for (let i = 0; i < tri.length; i++) out[i] = tri[i] + d[i % 3]
  return out
}

const mover = (tri: Float32Array, [x, y, z]: number[], virar = false): Float32Array => {
  const base = virar ? virarY(tri) : tri
  const out = new Float32Array(base.length)
  for (let i = 0; i < base.length; i += 3) { out[i] = base[i] + x; out[i + 1] = base[i + 1] + y; out[i + 2] = base[i + 2] + z }
  return out
}

/** Escala para metros (a projeção normaliza o tamanho, mas fica coerente com os outros designs). */
const emMetros = (tri: Float32Array): Float32Array => tri.map((v) => v / 1000)

/** Coloca (ou atualiza) o design na lista que a FRIDAY importa sozinha, sem mexer nos outros. */
function registrar(arquivo: string, nome: string, apelidos: string[]): void {
  const caminho = join(DESIGNS, 'designs.json')
  let lista: { arquivo: string; nome: string; apelidos: string[] }[] = []
  try { lista = JSON.parse(readFileSync(caminho, 'utf8')) } catch { /* primeira vez */ }
  lista = lista.filter((d) => d.arquivo !== arquivo).concat({ arquivo, nome, apelidos })
  writeFileSync(caminho, JSON.stringify(lista, null, 2) + '\n')
}

const qual = process.argv[2] ?? 'tudo'
mkdirSync(DESIGNS, { recursive: true })

if (qual === 'tudo' || qual === 'nucleo') {
  const pasta = join(AQUI, 'nucleo')
  mkdirSync(pasta, { recursive: true })
  const { PECAS_NUCLEO, MEDIDAS } = await import('./nucleo.mjs')
  const feitas = Object.fromEntries(PECAS_NUCLEO.map((p) => [p.arquivo, gerarPeca(p as Peca, pasta).tri]))
  // Versão montada para a FRIDAY: carcaça, difusor (gravação para dentro) e aro por cima
  const altura = 32
  const montado: PecaGlb[] = [
    { nome: 'Carcaça', triangulos: emMetros(feitas['nucleo-mesa-carcaca']), cor: [0.17, 0.2, 0.28] },
    { nome: 'Difusor com a fita', triangulos: emMetros(mover(feitas['nucleo-difusor'], [0, altura, 0], true)), cor: [0.55, 0.92, 1], brilho: true },
    { nome: 'Aro', triangulos: emMetros(mover(feitas['nucleo-aro'], [0, altura, 0])), cor: [0.78, 0.82, 0.9] }
  ]
  writeFileSync(join(DESIGNS, 'nucleo-fisico.glb'), escreverGlb('núcleo físico', montado))
  console.log(`nucleo-fisico.glb (difusor de ${MEDIDAS.difusor.raio * 2} mm)`)
  registrar('nucleo-fisico.glb', 'núcleo de mesa (para imprimir)', ['núcleo físico', 'núcleo de verdade', 'núcleo impresso', 'luminária da friday'])
}

if (qual === 'tudo' || qual === 'capacete') {
  const pasta = join(AQUI, 'capacete')
  mkdirSync(pasta, { recursive: true })
  const { PECAS_CAPACETE, MONTAGEM_CAPACETE } = await import('./capacete.mjs')
  const feitas = Object.fromEntries(PECAS_CAPACETE.map((p) => [p.arquivo, gerarPeca(p as Peca, pasta).tri]))
  const montado: PecaGlb[] = MONTAGEM_CAPACETE.map((m) => ({ nome: m.nome, triangulos: emMetros(feitas[m.arquivo]), cor: m.cor, brilho: m.brilho }))
  writeFileSync(join(DESIGNS, 'capacete.glb'), escreverGlb('capacete', montado))
  console.log('capacete.glb')
  registrar('capacete.glb', 'capacete da FRIDAY', ['capacete', 'elmo', 'viseira', 'capacete de verdade'])
}
