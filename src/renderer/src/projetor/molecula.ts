// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Moléculas (PubChem) e proteínas (RCSB PDB) viram holograma: átomos como esferas de partículas,
// ligações como linhas; nas proteínas, a "espinha" de cada cadeia aparece como um fio.

import * as THREE from 'three'
import type { Modelo3D, Parte } from './tipos'
import { lerSdf, lerPdb, raioAtomo, corAtomo, NOMES_ELEMENTOS, type Atomo } from './quimica'

type P3 = [number, number, number]

function medida(atomos: Atomo[]): Modelo3D['medidaReal'] {
  const caixa = new THREE.Box3()
  for (const a of atomos) caixa.expandByPoint(new THREE.Vector3(a.x, a.y, a.z))
  const t = caixa.getSize(new THREE.Vector3())
  return { largura: t.x, altura: t.y, profundidade: t.z, unidade: 'ångström (Å)' }
}

/** Fórmula molecular no padrão de Hill: C e H primeiro, depois em ordem alfabética. */
function formula(atomos: Atomo[]): string {
  const n = new Map<string, number>()
  for (const a of atomos) n.set(a.el, (n.get(a.el) ?? 0) + 1)
  const ordem = [...n.keys()].sort((a, b) => (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b)))
  const sub = (k: number) => (k === 1 ? '' : String(k).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]))
  return ordem.map((e) => `${e}${sub(n.get(e)!)}`).join('')
}

export function moleculaDeSdf(texto: string, nome: string, credito: string): Modelo3D {
  const m = lerSdf(texto)
  const grupos = new Map<string, number[]>()
  const triPorEl = new Map<string, number[]>()
  const comTri = m.atomos.length <= 400
  const ico = comTri ? new THREE.IcosahedronGeometry(1, 1) : null
  const icoPos = ico?.getAttribute('position')
  // ~9 mil partículas no total, divididas pela área de cada átomo (moléculas pequenas também ficam cheias)
  const somaAreas = m.atomos.reduce((t, a) => t + raioAtomo(a.el) ** 2, 0) || 1
  for (const a of m.atomos) {
    const r = raioAtomo(a.el) * 0.42
    const n = Math.max(40, Math.round((raioAtomo(a.el) ** 2 / somaAreas) * 9000))
    const lista = grupos.get(a.el) ?? []
    for (let k = 0; k < n; k++) {
      const z = Math.random() * 2 - 1, ang = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z)
      lista.push(a.x + r * s * Math.cos(ang), a.y + r * z, a.z + r * s * Math.sin(ang))
    }
    grupos.set(a.el, lista)
    if (icoPos) {
      const t = triPorEl.get(a.el) ?? []
      for (let i = 0; i < icoPos.count; i++) t.push(a.x + icoPos.getX(i) * r, a.y + icoPos.getY(i) * r, a.z + icoPos.getZ(i) * r)
      triPorEl.set(a.el, t)
    }
  }
  ico?.dispose()
  // Ligações: uma linha por ordem (dupla = duas linhas paralelas), com partículas ao longo
  const ar: number[] = [], pts: number[] = []
  for (const l of m.ligacoes) {
    const A = m.atomos[l.a], B = m.atomos[l.b]
    const d = new THREE.Vector3(B.x - A.x, B.y - A.y, B.z - A.z)
    const lado = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 * d.length() ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize().multiplyScalar(0.09)
    for (let k = 0; k < l.ordem; k++) {
      const o = (k - (l.ordem - 1) / 2)
      const a: P3 = [A.x + lado.x * o, A.y + lado.y * o, A.z + lado.z * o], b: P3 = [B.x + lado.x * o, B.y + lado.y * o, B.z + lado.z * o]
      ar.push(...a, ...b)
      const q = Math.round(d.length() * (m.atomos.length < 30 ? 120 : 14))
      for (let i = 0; i < q; i++) { const t = Math.random(); pts.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t) }
    }
  }
  const partes: Parte[] = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length).map(([el, lista]) => ({
    nome: `${NOMES_ELEMENTOS[el] ?? el} (${m.atomos.filter((a) => a.el === el).length})`,
    pontos: new Float32Array(lista),
    arestas: new Float32Array(0),
    triangulos: triPorEl.has(el) ? new Float32Array(triPorEl.get(el)!) : undefined,
    cor: corAtomo(el)
  }))
  partes.push({ nome: 'ligações', pontos: new Float32Array(pts), arestas: new Float32Array(ar) })
  return {
    nome,
    fonte: 'PUBCHEM',
    detalhes: [formula(m.atomos), `${m.atomos.length} átomos · ${m.ligacoes.length} ligações`],
    partes,
    medidaReal: medida(m.atomos),
    credito
  }
}

export function proteinaDePdb(texto: string, nome: string, credito: string): Modelo3D {
  const p = lerPdb(texto)
  const cadeias = new Map<string, Atomo[]>()
  for (const a of p.atomos) cadeias.set(a.cadeia ?? 'A', [...(cadeias.get(a.cadeia ?? 'A') ?? []), a])
  const ids = [...cadeias.keys()].slice(0, 12)
  const total = p.atomos.length
  const partes: Parte[] = ids.map((id) => {
    const atomos = cadeias.get(id)!
    const espinha = atomos.filter((a) => a.ca)
    const pts: number[] = [], ar: number[] = []
    // Fio da espinha (carbonos alfa em sequência) com partículas em volta
    for (let i = 0; i < espinha.length - 1; i++) {
      const A = espinha[i], B = espinha[i + 1]
      if (Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) > 4.5) continue
      ar.push(A.x, A.y, A.z, B.x, B.y, B.z)
      for (let k = 0; k < 10; k++) { const t = Math.random(); pts.push(A.x + (B.x - A.x) * t + (Math.random() - 0.5) * 0.9, A.y + (B.y - A.y) * t + (Math.random() - 0.5) * 0.9, A.z + (B.z - A.z) * t + (Math.random() - 0.5) * 0.9) }
    }
    // Os outros átomos, mais espalhados (no máximo ~10 mil no total)
    const passo = Math.max(1, Math.ceil(total / 10_000))
    for (let i = 0; i < atomos.length; i += passo) { const a = atomos[i]; if (!a.ca) pts.push(a.x, a.y, a.z) }
    return { nome: `cadeia ${id}`, pontos: new Float32Array(pts), arestas: new Float32Array(ar) }
  })
  const residuos = p.atomos.filter((a) => a.ca).length
  return {
    nome,
    fonte: 'RCSB PDB',
    detalhes: [p.titulo.slice(0, 90), `${cadeias.size} ${cadeias.size === 1 ? 'cadeia' : 'cadeias'} · ${residuos} aminoácidos · ${total.toLocaleString('pt-BR')} átomos`].filter(Boolean),
    partes,
    medidaReal: medida(p.atomos),
    credito
  }
}
