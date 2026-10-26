// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Converte qualquer objeto 3D (modelo baixado, arquivo seu, peças montadas pela IA) em partes
// do holograma: partículas espalhadas pela superfície (proporcional à área), linhas nas quinas
// e os triângulos para a superfície do "renderiza".

import * as THREE from 'three'
import type { Parte } from './tipos'

const PARTICULAS = 14_000
const MAX_PECAS = 16

interface Bruta { nome: string; tri: Float32Array; area: number }

/** Triângulos soltos (já na posição final) de uma geometria. */
function triangulosDe(geo: THREE.BufferGeometry, matriz: THREE.Matrix4): Float32Array {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone())
  g.applyMatrix4(matriz)
  const pos = g.getAttribute('position')
  const out = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) { out[i * 3] = pos.getX(i); out[i * 3 + 1] = pos.getY(i); out[i * 3 + 2] = pos.getZ(i) }
  g.dispose()
  return out
}

function areaTotal(tri: Float32Array, acumulada?: Float32Array): number {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let soma = 0
  for (let i = 0, k = 0; i < tri.length; i += 9, k++) {
    a.fromArray(tri, i); b.fromArray(tri, i + 3); c.fromArray(tri, i + 6)
    soma += b.sub(a).cross(c.sub(a)).length() * 0.5
    if (acumulada) acumulada[k] = soma
  }
  return soma
}

/** Pontos aleatórios na superfície, mais onde a área é maior. */
export function amostrarSuperficie(tri: Float32Array, quantos: number): Float32Array {
  const n = tri.length / 9
  if (!n || quantos <= 0) return new Float32Array(0)
  const acum = new Float32Array(n)
  const total = areaTotal(tri, acum)
  const out = new Float32Array(quantos * 3)
  for (let k = 0; k < quantos; k++) {
    const r = Math.random() * total
    let lo = 0, hi = n - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (acum[m] < r) lo = m + 1; else hi = m }
    const i = lo * 9
    let s = Math.random(), t = Math.random()
    if (s + t > 1) { s = 1 - s; t = 1 - t }
    for (let d = 0; d < 3; d++) out[k * 3 + d] = tri[i + d] + (tri[i + 3 + d] - tri[i + d]) * s + (tri[i + 6 + d] - tri[i + d]) * t
  }
  return out
}

/** Linhas nas quinas; em superfícies lisas (sem quinas), uma parte da malha. */
function arestasDe(tri: Float32Array): Float32Array {
  // Malhas enormes: pular a busca de quinas (seria lenta) e usar só a malha holográfica
  if (tri.length / 9 > 150_000) return malhaRala(tri, tri.length / 9)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(tri, 3))
  // Junta vértices repetidos para o EdgesGeometry achar as quinas
  const unida = mergeVertices(g)
  const quinas = new THREE.EdgesGeometry(unida, 28)
  let arestas = quinas.getAttribute('position').array as Float32Array
  const nTri = tri.length / 9
  // Superfície lisa (quase sem quinas): usa uma malha holográfica
  if (arestas.length / 6 < Math.min(60, nTri * 0.2)) arestas = malhaRala(tri, nTri)
  g.dispose(); unida.dispose(); quinas.dispose()
  return new Float32Array(arestas)
}

/** Uma aresta de parte dos triângulos, espalhada pela superfície. */
function malhaRala(tri: Float32Array, nTri: number): Float32Array {
  const quantos = Math.min(2500, nTri)
  const out = new Float32Array(quantos * 6)
  for (let k = 0; k < quantos; k++) {
    const i = Math.floor((k + Math.random()) * (nTri / quantos)) * 9
    out.set(tri.subarray(i, i + 6), k * 6)
  }
  return out
}

/** Versão mínima do mergeVertices do three (para não depender de BufferGeometryUtils). */
function mergeVertices(g: THREE.BufferGeometry, tolerancia = 1e-4): THREE.BufferGeometry {
  const pos = g.getAttribute('position')
  const mapa = new Map<string, number>()
  const indices: number[] = []
  const unicos: number[] = []
  const f = 1 / tolerancia
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const chave = `${Math.round(x * f)},${Math.round(y * f)},${Math.round(z * f)}`
    let j = mapa.get(chave)
    if (j === undefined) { j = unicos.length / 3; unicos.push(x, y, z); mapa.set(chave, j) }
    indices.push(j)
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(unicos, 3))
  out.setIndex(indices)
  return out
}

/**
 * Objeto 3D → partes. Cada malha vira uma peça (com o nome dela, para as etiquetas da vista
 * explodida). Com peças demais, as menores são juntadas em "outras peças".
 * `agruparPorNome`: malhas com o mesmo nome viram uma peça só (usado nas peças da IA).
 */
export function partesDeObjeto(raiz: THREE.Object3D, opcoes: { agruparPorNome?: boolean; particulas?: number } = {}): Parte[] {
  raiz.updateMatrixWorld(true)
  const brutas: Bruta[] = []
  const porNome = new Map<string, Float32Array[]>()
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry?.getAttribute('position')) return
    const tri = triangulosDe(m.geometry, m.matrixWorld)
    if (!tri.length) return
    const nome = limparNome(m.name ?? '') || limparNome(m.parent?.name ?? '')
    if (opcoes.agruparPorNome) { porNome.set(nome, [...(porNome.get(nome) ?? []), tri]); return }
    brutas.push({ nome, tri, area: areaTotal(tri) })
  })
  for (const [nome, lista] of porNome) {
    const tri = juntar(lista)
    brutas.push({ nome, tri, area: areaTotal(tri) })
  }
  if (!brutas.length) return []
  brutas.sort((a, b) => b.area - a.area)
  let pecas = brutas
  if (brutas.length > MAX_PECAS) {
    const resto = brutas.slice(MAX_PECAS - 1)
    const tri = juntar(resto.map((r) => r.tri))
    pecas = [...brutas.slice(0, MAX_PECAS - 1), { nome: 'outras peças', tri, area: areaTotal(tri) }]
  }
  // Nomes repetidos ou vazios: numera para as etiquetas fazerem sentido
  const vistos = new Map<string, number>()
  const area = pecas.reduce((s, p) => s + p.area, 0) || 1
  const total = opcoes.particulas ?? PARTICULAS
  return pecas.map((p, i) => {
    const base = p.nome || `peça ${i + 1}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return {
      nome: n > 1 ? `${base} ${n}` : base,
      pontos: amostrarSuperficie(p.tri, Math.max(60, Math.round((p.area / area) * total))),
      arestas: arestasDe(p.tri),
      triangulos: p.tri
    }
  })
}

function juntar(listas: Float32Array[]): Float32Array {
  const out = new Float32Array(listas.reduce((s, l) => s + l.length, 0))
  let k = 0
  for (const l of listas) { out.set(l, k); k += l.length }
  return out
}

/** Nomes de malha costumam vir como "Mesh_012" ou "Cylinder.003": fica só o que tem sentido. */
function limparNome(nome: string): string {
  const n = nome.replace(/[_.]\d+$/g, '').replace(/[_]+/g, ' ').trim()
  if (!n || /^(mesh|object|node|group|default|polysurface|primitive|geometry|cube|cylinder|sphere|plane)\s*\d*$/i.test(n) || /^\d+$/.test(n)) return ''
  return n.slice(0, 32)
}
