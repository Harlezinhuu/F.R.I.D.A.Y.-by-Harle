// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Formas da ciência, desenhadas na hora (funcionam offline): Möbius, toro, nó, átomo, DNA,
// tesseract em 4D, sistema solar com as posições reais de hoje, atrator de Lorenz, garrafa de Klein,
// galáxia, buraco negro, sólidos de Platão e funções matemáticas z = f(x, y, t).

import * as THREE from 'three'
import type { Modelo3D, Parte } from './tipos'
import { partesDeObjeto, amostrarSuperficie } from './malha'
import { lerFormula } from './expressao'
import { posicoes, orbita, PLANETAS, comprimir } from './sistemaSolar'

type P3 = [number, number, number]
const TAU = Math.PI * 2
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a

// ---------- Ferramentas de desenho ----------

/** Superfície paramétrica: triângulos, partículas e linhas de grade. */
function superficie(nome: string, f: (u: number, v: number) => P3, o: { u: [number, number]; v: [number, number]; nu?: number; nv?: number; linhasU?: number; linhasV?: number; pontos?: number }): Parte {
  const nu = o.nu ?? 96, nv = o.nv ?? 24
  const grade: P3[][] = []
  for (let i = 0; i <= nu; i++) {
    const linha: P3[] = []
    for (let j = 0; j <= nv; j++) linha.push(f(o.u[0] + ((o.u[1] - o.u[0]) * i) / nu, o.v[0] + ((o.v[1] - o.v[0]) * j) / nv))
    grade.push(linha)
  }
  const tri: number[] = []
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = grade[i][j], b = grade[i + 1][j], c = grade[i + 1][j + 1], d = grade[i][j + 1]
    tri.push(...a, ...b, ...c, ...a, ...c, ...d)
  }
  const ar: number[] = []
  const lu = o.linhasU ?? 24, lv = o.linhasV ?? 6
  for (let k = 0; lu > 0 && k <= lu; k++) { const i = Math.round((k / lu) * nu); for (let j = 0; j < nv; j++) ar.push(...grade[i][j], ...grade[i][j + 1]) }
  for (let k = 0; lv > 0 && k <= lv; k++) { const j = Math.round((k / lv) * nv); for (let i = 0; i < nu; i++) ar.push(...grade[i][j], ...grade[i + 1][j]) }
  const triangulos = new Float32Array(tri)
  return { nome, pontos: amostrarSuperficie(triangulos, o.pontos ?? 9000), arestas: new Float32Array(ar), triangulos }
}

/** Nuvem de partículas em volta de uma curva (fios, órbitas, trajetórias). */
function curva(nome: string, f: (s: number) => P3, o: { pontos?: number; espessura?: number; segmentos?: number; fechada?: boolean } = {}): Parte {
  const n = o.pontos ?? 2000, seg = o.segmentos ?? 240, esp = o.espessura ?? 0.015
  const pts = new Float32Array(n * 3)
  for (let k = 0; k < n; k++) { const p = f(Math.random()); pts.set([p[0] + rnd(esp), p[1] + rnd(esp), p[2] + rnd(esp)], k * 3) }
  const ar: number[] = []
  for (let k = 0; k < seg; k++) ar.push(...f(k / seg), ...f((k + 1) / seg))
  return { nome, pontos: pts, arestas: new Float32Array(ar) }
}

/** Esfera de partículas (átomos, planetas, partículas do núcleo). */
function bola(nome: string, c: P3, r: number, n: number, cor?: [number, number, number]): Parte {
  const pts = new Float32Array(n * 3)
  for (let k = 0; k < n; k++) {
    const z = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - z * z)
    pts.set([c[0] + r * s * Math.cos(a), c[1] + r * z, c[2] + r * s * Math.sin(a)], k * 3)
  }
  const ar: number[] = []
  for (let k = 0; k < 3; k++) for (let i = 0; i < 32; i++) {
    const a1 = (i / 32) * TAU, a2 = ((i + 1) / 32) * TAU
    const p = (a: number): P3 => (k === 0 ? [c[0] + r * Math.cos(a), c[1], c[2] + r * Math.sin(a)] : k === 1 ? [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]] : [c[0], c[1] + r * Math.cos(a), c[2] + r * Math.sin(a)])
    ar.push(...p(a1), ...p(a2))
  }
  return { nome, pontos: pts, arestas: new Float32Array(ar), cor }
}

/** Tubo em volta de uma curva fechada (nó de trevo), com grade de linhas. */
function tubo(nome: string, c: (s: number) => P3, raio: number, pontos = 9000): Parte {
  class Curva extends THREE.Curve<THREE.Vector3> {
    constructor() { super() }
    getPoint(t: number, alvo = new THREE.Vector3()): THREE.Vector3 { const p = c(t); return alvo.set(p[0], p[1], p[2]) }
  }
  const geo = new THREE.TubeGeometry(new Curva(), 260, raio, 18, true)
  const parte = partesDeObjeto(new THREE.Mesh(geo), { particulas: pontos })[0]
  // Grade: anéis ao longo do tubo e quatro fios no comprimento
  const fr = new Curva().computeFrenetFrames(260, true)
  const ar: number[] = []
  const ponto = (i: number, a: number): P3 => {
    const p = c(i / 260), n = fr.normals[i % 261] ?? fr.normals[0], b = fr.binormals[i % 261] ?? fr.binormals[0]
    return [p[0] + raio * (Math.cos(a) * n.x + Math.sin(a) * b.x), p[1] + raio * (Math.cos(a) * n.y + Math.sin(a) * b.y), p[2] + raio * (Math.cos(a) * n.z + Math.sin(a) * b.z)]
  }
  for (let i = 0; i < 260; i += 6) for (let k = 0; k < 18; k++) ar.push(...ponto(i, (k / 18) * TAU), ...ponto(i, ((k + 1) / 18) * TAU))
  for (let k = 0; k < 4; k++) for (let i = 0; i < 260; i++) ar.push(...ponto(i, (k / 4) * TAU), ...ponto(i + 1, (k / 4) * TAU))
  geo.dispose()
  return { ...parte, nome, arestas: new Float32Array(ar) }
}

const modelo = (nome: string, detalhes: string[], partes: Parte[], extra: Partial<Modelo3D> = {}): Modelo3D => ({ nome, fonte: 'FORMA', detalhes, partes, ...extra })

// ---------- As formas ----------

function mobius(): Modelo3D {
  const f = (u: number, v: number): P3 => { const w = 0.5 * v; return [(1 + w * Math.cos(u / 2)) * Math.cos(u), w * Math.sin(u / 2), (1 + w * Math.cos(u / 2)) * Math.sin(u)] }
  return modelo('Fita de Möbius', ['Superfície de um lado só', 'Uma volta inteira troca o lado'], [superficie('fita', f, { u: [0, TAU], v: [-1, 1], nu: 160, nv: 16, linhasU: 48, linhasV: 2, pontos: 11000 })])
}

function toro(): Modelo3D {
  const f = (u: number, v: number): P3 => [(1 + 0.42 * Math.cos(v)) * Math.cos(u), 0.42 * Math.sin(v), (1 + 0.42 * Math.cos(v)) * Math.sin(u)]
  return modelo('Toro', ['R = 1 · r = 0,42'], [superficie('toro', f, { u: [0, TAU], v: [0, TAU], nu: 120, nv: 36, linhasU: 36, linhasV: 12, pontos: 11000 })])
}

function no(): Modelo3D {
  const c = (s: number): P3 => { const t = s * TAU; return [Math.sin(t) + 2 * Math.sin(2 * t), -Math.sin(3 * t), Math.cos(t) - 2 * Math.cos(2 * t)] }
  return modelo('Nó de trevo', ['O nó não trivial mais simples', 'Tem 3 cruzamentos'], [tubo('nó', c, 0.42, 11000)])
}

function esfera(): Modelo3D {
  const f = (u: number, v: number): P3 => [Math.cos(u) * Math.sin(v), Math.cos(v), Math.sin(u) * Math.sin(v)]
  return modelo('Esfera', ['Grade de latitude e longitude'], [superficie('esfera', f, { u: [0, TAU], v: [0.0001, Math.PI - 0.0001], nu: 96, nv: 48, linhasU: 24, linhasV: 12, pontos: 10000 })])
}

function saturno(): Modelo3D {
  const f = (u: number, v: number): P3 => [Math.cos(u) * Math.sin(v), Math.cos(v) * 0.9, Math.sin(u) * Math.sin(v)]
  const planeta = superficie('Saturno', f, { u: [0, TAU], v: [0.0001, Math.PI - 0.0001], nu: 80, nv: 40, linhasU: 18, linhasV: 9, pontos: 7000 })
  const anel = (u: number, v: number): P3 => [Math.cos(u) * v, 0, Math.sin(u) * v]
  const aneis = superficie('anéis', anel, { u: [0, TAU], v: [1.35, 2.3], nu: 160, nv: 8, linhasU: 0, linhasV: 8, pontos: 7000 })
  const rot = new THREE.Matrix4().makeRotationZ(0.47)
  for (const p of [planeta, aneis]) for (const a of [p.pontos, p.arestas, p.triangulos!]) for (let i = 0; i < a.length; i += 3) { const v = new THREE.Vector3(a[i], a[i + 1], a[i + 2]).applyMatrix4(rot); a[i] = v.x; a[i + 1] = v.y; a[i + 2] = v.z }
  return modelo('Saturno', ['Inclinação do eixo: 26,7°', 'Anéis de gelo e rocha'], [planeta, aneis])
}

function klein(): Modelo3D {
  // Imersão em "8" da garrafa de Klein
  const f = (u: number, v: number): P3 => {
    const r = 2, c = Math.cos(u / 2), s = Math.sin(u / 2)
    const w = r + c * Math.sin(v) - s * Math.sin(2 * v)
    return [w * Math.cos(u), s * Math.sin(v) + c * Math.sin(2 * v), w * Math.sin(u)]
  }
  return modelo('Garrafa de Klein', ['Superfície sem dentro nem fora', 'Imersão em forma de 8'], [superficie('garrafa', f, { u: [0, TAU], v: [0, TAU], nu: 120, nv: 40, linhasU: 30, linhasV: 10, pontos: 12000 })])
}

function dna(): Modelo3D {
  const voltas = 2.2, raio = 0.55, altura = 2.4, pares = 22
  const fita = (fase: number) => (s: number): P3 => { const a = s * voltas * TAU + fase; return [raio * Math.cos(a), (s - 0.5) * altura, raio * Math.sin(a)] }
  const A = curva("fita 5'→3'", fita(0), { pontos: 3200, espessura: 0.05, segmentos: 300 })
  const B = curva("fita 3'→5'", fita(Math.PI * 0.8), { pontos: 3200, espessura: 0.05, segmentos: 300 })
  const pts: number[] = [], ar: number[] = [], pts2: number[] = [], ar2: number[] = []
  for (let k = 0; k < pares; k++) {
    const s = (k + 0.5) / pares, a = fita(0)(s), b = fita(Math.PI * 0.8)(s)
    const alvo = k % 2 ? pts : pts2, linhas = k % 2 ? ar : ar2
    linhas.push(...a, ...b)
    for (let i = 0; i < 70; i++) { const t = Math.random(); alvo.push(a[0] + (b[0] - a[0]) * t + rnd(0.02), a[1] + (b[1] - a[1]) * t + rnd(0.02), a[2] + (b[2] - a[2]) * t + rnd(0.02)) }
  }
  return modelo('DNA', ['Dupla hélice', `${pares} pares de bases · ${voltas} voltas`], [
    A, B,
    { nome: 'pares A–T', pontos: new Float32Array(pts), arestas: new Float32Array(ar), cor: [1, 0.55, 0.45] },
    { nome: 'pares G–C', pontos: new Float32Array(pts2), arestas: new Float32Array(ar2), cor: [0.45, 1, 0.7] }
  ])
}

function atomo(): Modelo3D {
  const nucleo: Parte[] = []
  const bolinhas: P3[] = [[0, 0, 0], [0.13, 0.05, 0], [-0.1, 0.09, 0.07], [0.02, -0.12, 0.08], [0.05, 0.08, -0.12], [-0.08, -0.06, -0.1]]
  const pts: number[] = []
  bolinhas.forEach((c) => { const b = bola('', [c[0] * 1.6, c[1] * 1.6, c[2] * 1.6], 0.16, 320); pts.push(...b.pontos) })
  nucleo.push({ nome: 'núcleo', pontos: new Float32Array(pts), arestas: new Float32Array(0), cor: [1, 0.75, 0.5] })
  const planos = [new THREE.Euler(0, 0, 0), new THREE.Euler(1.05, 0, 0.3), new THREE.Euler(-1.05, 0, -0.3)]
  const orbitaEm = (k: number, a: number): P3 => { const v = new THREE.Vector3(Math.cos(a) * 1.2, 0, Math.sin(a) * 0.5).applyEuler(planos[k]); return [v.x, v.y, v.z] }
  const orbitas = curva('órbitas', (s) => orbitaEm(Math.floor(s * 3) % 3, (s * 3 % 1) * TAU), { pontos: 1800, espessura: 0.006, segmentos: 0 })
  const ar: number[] = []
  for (let k = 0; k < 3; k++) for (let i = 0; i < 96; i++) ar.push(...orbitaEm(k, (i / 96) * TAU), ...orbitaEm(k, ((i + 1) / 96) * TAU))
  orbitas.arestas = new Float32Array(ar)
  const POR = 260
  const eletrons: Parte = { nome: 'elétrons', pontos: new Float32Array(3 * POR * 3), arestas: new Float32Array(0), cor: [0.55, 0.9, 1] }
  const nuvem = Array.from({ length: 3 * POR }, () => { const z = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - z * z), r = 0.1 * Math.cbrt(Math.random()); return [r * s * Math.cos(a), r * z, r * s * Math.sin(a)] })
  const animar = (t: number, partes: Parte[]) => {
    const e = partes[2].pontos
    for (let k = 0; k < 3; k++) {
      const c = orbitaEm(k, t * (1.6 + k * 0.35) + k * 2.1)
      for (let i = 0; i < POR; i++) { const j = k * POR + i, d = nuvem[j]; e.set([c[0] + d[0], c[1] + d[1], c[2] + d[2]], j * 3) }
    }
  }
  const partes = [nucleo[0], orbitas, eletrons]
  animar(0, partes)
  return modelo('Átomo', ['Modelo de Bohr', '3 elétrons em órbita'], partes, { animar, normalizado: true })
}

function tesseract(): Modelo3D {
  // 16 vértices do hipercubo e as 32 arestas (vértices que diferem em uma coordenada)
  const V: number[][] = []
  for (let i = 0; i < 16; i++) V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1])
  const E: [number, number][] = []
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (i < j) E.push([i, j]) }
  const POR = 90
  const pts = new Float32Array(E.length * POR * 3)
  const ar = new Float32Array(E.length * 6)
  const ts = Float32Array.from({ length: E.length * POR }, () => Math.random())
  const proj: number[][] = V.map(() => [0, 0, 0])
  const animar = (t: number, partes: Parte[]) => {
    const a = t * 0.45, b = t * 0.3
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b)
    V.forEach((v, i) => {
      // Gira nos planos XW e YZ e projeta de 4D para 3D com perspectiva
      const x = v[0] * ca - v[3] * sa, w = v[0] * sa + v[3] * ca
      const y = v[1] * cb - v[2] * sb, z = v[1] * sb + v[2] * cb
      const k = 0.62 / (2.6 - w)
      proj[i] = [x * k * 1.55, y * k * 1.55, z * k * 1.55]
    })
    const p = partes[0].pontos, l = partes[0].arestas
    E.forEach(([i, j], e) => {
      const A = proj[i], B = proj[j]
      l.set([...A, ...B], e * 6)
      for (let q = 0; q < POR; q++) { const s = ts[e * POR + q]; p.set([A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s], (e * POR + q) * 3) }
    })
  }
  const partes: Parte[] = [{ nome: 'hipercubo', pontos: pts, arestas: ar }]
  animar(0, partes)
  return modelo('Tesseract', ['Hipercubo de 4 dimensões', '16 vértices · 32 arestas · girando no 4D'], partes, { animar, normalizado: true })
}

function sistemaSolar(): Modelo3D {
  const hoje = new Date()
  // Eclíptica na horizontal: (x, y, z) do céu → (x, z, -y) da cena
  const cena = (p: { x: number; y: number; z: number }): P3 => {
    const r = Math.hypot(p.x, p.y, p.z) || 1, k = comprimir(r) / r
    return [p.x * k, p.z * k, -p.y * k]
  }
  const partes: Parte[] = [bola('Sol', [0, 0, 0], 0.11, 900, [1, 0.8, 0.45])]
  const orb: number[] = [], orbPts: number[] = []
  posicoes(hoje).forEach((p, i) => {
    partes.push(bola(p.nome, cena(p), PLANETAS[i].raio, 260 + Math.round(PLANETAS[i].raio * 2400), i === 2 ? [0.45, 0.75, 1] : i === 3 ? [1, 0.5, 0.35] : undefined))
    const o = orbita(i, hoje).map(cena)
    for (let k = 0; k < o.length - 1; k++) orb.push(...o[k], ...o[k + 1])
    for (let k = 0; k < 140; k++) { const q = o[Math.floor(Math.random() * (o.length - 1))]; orbPts.push(q[0], q[1], q[2]) }
  })
  partes.push({ nome: '', pontos: new Float32Array(orbPts), arestas: new Float32Array(orb) })
  const data = hoje.toLocaleDateString('pt-BR')
  return modelo('Sistema Solar', [`Posições reais de ${data}`, 'Distâncias em escala logarítmica, planetas fora de escala'], partes, { normalizado: true, rotulosSempre: true })
}

function lorenz(): Modelo3D {
  const sigma = 10, rho = 28, beta = 8 / 3, dt = 0.005
  let x = 0.1, y = 0, z = 0
  const traj: P3[] = []
  for (let i = 0; i < 16000; i++) {
    const dx = sigma * (y - x), dy = x * (rho - z) - y, dz = x * y - beta * z
    x += dx * dt; y += dy * dt; z += dz * dt
    if (i > 300) traj.push([x / 22, (z - 25) / 22, y / 22])
  }
  const N = 9000
  const pts = new Float32Array(N * 3)
  const passo = traj.length / N
  const ar: number[] = []
  for (let i = 0; i < traj.length - 4; i += 4) ar.push(...traj[i], ...traj[i + 4])
  const animar = (t: number, partes: Parte[]) => {
    // As partículas correm pela trajetória, mostrando o fluxo do caos
    const desloc = Math.floor(t * 160)
    const p = partes[0].pontos
    for (let k = 0; k < N; k++) { const q = traj[(Math.floor(k * passo) + desloc) % traj.length]; p.set(q, k * 3) }
  }
  const partes: Parte[] = [{ nome: 'trajetória', pontos: pts, arestas: new Float32Array(ar) }]
  animar(0, partes)
  return modelo('Atrator de Lorenz', ['σ = 10 · ρ = 28 · β = 8/3', 'Efeito borboleta: o caos tem forma'], partes, { animar, normalizado: true })
}

function galaxia(): Modelo3D {
  const nucleo: number[] = [], b1: number[] = [], b2: number[] = []
  for (let i = 0; i < 2600; i++) { const r = Math.abs(rnd(0.22)) * Math.random(), a = Math.random() * TAU, h = rnd(0.07) * (1 - r * 3); nucleo.push(Math.cos(a) * r, h, Math.sin(a) * r) }
  for (const [lista, fase] of [[b1, 0], [b2, Math.PI]] as [number[], number][]) {
    for (let i = 0; i < 5200; i++) {
      const s = Math.random(), a = s * 3.2 * Math.PI + fase, r = 0.18 + s * 1.05, esp = 0.05 + s * 0.12
      lista.push(Math.cos(a) * r + rnd(esp), rnd(0.03), Math.sin(a) * r + rnd(esp))
    }
  }
  const ar: number[] = []
  for (const fase of [0, Math.PI]) for (let k = 0; k < 120; k++) {
    const p = (s: number): P3 => { const a = s * 3.2 * Math.PI + fase, r = 0.18 + s * 1.05; return [Math.cos(a) * r, 0, Math.sin(a) * r] }
    ar.push(...p(k / 120), ...p((k + 1) / 120))
  }
  return modelo('Galáxia espiral', ['Dois braços espirais', 'Núcleo brilhante no centro'], [
    { nome: 'núcleo', pontos: new Float32Array(nucleo), arestas: new Float32Array(0), cor: [1, 0.85, 0.6] },
    { nome: 'braço 1', pontos: new Float32Array(b1), arestas: new Float32Array(ar.slice(0, ar.length / 2)) },
    { nome: 'braço 2', pontos: new Float32Array(b2), arestas: new Float32Array(ar.slice(ar.length / 2)) }
  ], { normalizado: true })
}

function buracoNegro(): Modelo3D {
  const N = 8000
  const raios = Float32Array.from({ length: N }, () => 0.5 + Math.pow(Math.random(), 1.6) * 0.8)
  const ang0 = Float32Array.from({ length: N }, () => Math.random() * TAU)
  const alt = Float32Array.from({ length: N }, () => rnd(0.02))
  const J = 1600
  const jatoS = Float32Array.from({ length: J }, () => Math.random())
  const jatoA = Float32Array.from({ length: J }, () => Math.random() * TAU)
  const anel: number[] = [], arAnel: number[] = []
  for (let i = 0; i < 900; i++) { const a = Math.random() * TAU; anel.push(Math.cos(a) * 0.4, rnd(0.008), Math.sin(a) * 0.4) }
  for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU, b = ((i + 1) / 96) * TAU; arAnel.push(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, Math.cos(b) * 0.4, 0, Math.sin(b) * 0.4) }
  const arDisco: number[] = []
  for (const r of [0.6, 0.85, 1.1]) for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU, b = ((i + 1) / 96) * TAU; arDisco.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r) }
  const animar = (t: number, partes: Parte[]) => {
    const d = partes[0].pontos
    // Mais perto do centro, mais rápido (como a órbita de Kepler)
    for (let i = 0; i < N; i++) { const a = ang0[i] + t * 0.9 / Math.pow(raios[i], 1.5); d.set([Math.cos(a) * raios[i], alt[i], Math.sin(a) * raios[i]], i * 3) }
    const j = partes[2].pontos
    for (let i = 0; i < J; i++) {
      const s = (jatoS[i] + t * 0.25) % 1, lado = i % 2 ? 1 : -1, r = 0.03 + s * 0.12
      j.set([Math.cos(jatoA[i]) * r, lado * (0.12 + s * 1.1), Math.sin(jatoA[i]) * r], i * 3)
    }
  }
  const partes: Parte[] = [
    { nome: 'disco de acreção', pontos: new Float32Array(N * 3), arestas: new Float32Array(arDisco), cor: [1, 0.7, 0.4] },
    { nome: 'anel de fótons', pontos: new Float32Array(anel), arestas: new Float32Array(arAnel), cor: [1, 0.95, 0.85] },
    { nome: 'jatos', pontos: new Float32Array(J * 3), arestas: new Float32Array(0) }
  ]
  animar(0, partes)
  return modelo('Buraco negro', ['Disco de acreção girando', 'Jatos relativísticos nos polos'], partes, { animar, normalizado: true })
}

function solido(nome: string, geo: THREE.BufferGeometry, faces: string): Modelo3D {
  const partes = partesDeObjeto(new THREE.Mesh(geo), { particulas: 9000 })
  partes[0].nome = nome.toLowerCase()
  geo.dispose()
  return modelo(nome, [faces], partes)
}

// ---------- Funções z = f(x, y, t) ----------

/** Superfície de uma fórmula. Com t, ela se mexe sozinha. */
export function funcao(formula: string, alcance = Math.PI): Modelo3D {
  const { f, usaTempo } = lerFormula(formula)
  const G = 80, LINHAS = 16, N = 9000
  // Faixa de z (amostrada em alguns instantes quando a fórmula usa t) para caber na altura
  let zMin = Infinity, zMax = -Infinity
  for (const t of usaTempo ? [0, 1.3, 2.6, 3.9, 5.2] : [0]) for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
    const z = f(-alcance + (2 * alcance * i) / 40, -alcance + (2 * alcance * j) / 40, t)
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z)
  }
  if (!Number.isFinite(zMin) || zMax - zMin < 1e-9) { zMin = -1; zMax = 1 }
  const kxy = 1.25 / alcance, kz = 1.3 / (zMax - zMin), zMeio = (zMax + zMin) / 2
  const em = (x: number, y: number, t: number): P3 => [x * kxy, (f(x, y, t) - zMeio) * kz, y * kxy]
  const px = Float32Array.from({ length: N }, () => rnd(alcance)), py = Float32Array.from({ length: N }, () => rnd(alcance))
  const seg: [number, number, number, number][] = []
  for (let k = 0; k <= LINHAS; k++) {
    const c = -alcance + (2 * alcance * k) / LINHAS
    for (let i = 0; i < G; i++) {
      const a = -alcance + (2 * alcance * i) / G, b = -alcance + (2 * alcance * (i + 1)) / G
      seg.push([a, c, b, c], [c, a, c, b])
    }
  }
  const partes: Parte[] = [{ nome: 'superfície', pontos: new Float32Array(N * 3), arestas: new Float32Array(seg.length * 6) }]
  const animar = (t: number, ps: Parte[]) => {
    const p = ps[0].pontos, l = ps[0].arestas
    for (let i = 0; i < N; i++) p.set(em(px[i], py[i], t), i * 3)
    seg.forEach(([x1, y1, x2, y2], k) => { l.set([...em(x1, y1, t), ...em(x2, y2, t)], k * 6) })
  }
  animar(0, partes)
  if (!usaTempo) {
    // Fórmula parada: ganha superfície para o "renderiza"
    const tri: number[] = []
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const x0 = -alcance + (2 * alcance * i) / G, x1 = -alcance + (2 * alcance * (i + 1)) / G
      const y0 = -alcance + (2 * alcance * j) / G, y1 = -alcance + (2 * alcance * (j + 1)) / G
      const a = em(x0, y0, 0), b = em(x1, y0, 0), c = em(x1, y1, 0), d = em(x0, y1, 0)
      tri.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
    partes[0].triangulos = new Float32Array(tri)
  }
  const texto = formula.trim().replace(/^z\s*=\s*/i, '')
  return {
    nome: `z = ${texto}`,
    fonte: 'FUNÇÃO',
    detalhes: [`x e y de −${alcance === Math.PI ? 'π' : fmt(alcance)} a ${alcance === Math.PI ? 'π' : fmt(alcance)}`, `z de ${fmt(zMin)} a ${fmt(zMax)}`, ...(usaTempo ? ['Animada no tempo (t)'] : [])],
    partes,
    normalizado: true,
    ...(usaTempo ? { animar } : {})
  }
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('pt-BR')

// ---------- Catálogo ----------

interface Forma { nome: string; apelidos: string[]; criar: () => Modelo3D }

export const FORMAS: Record<string, Forma> = {
  mobius: { nome: 'Fita de Möbius', apelidos: ['mobius', 'moebius', 'fita de mobius', 'faixa de mobius'], criar: mobius },
  mobius_invertida: { nome: 'Möbius invertida', apelidos: ['mobius invertida', 'mobius invertido', 'fita invertida'], criar: () => ({ ...mobius(), nome: 'Fita de Möbius · invertida', acoesIniciais: ['inverter'] }) },
  toro: { nome: 'Toro', apelidos: ['toro', 'rosquinha', 'donut', 'torus'], criar: toro },
  no: { nome: 'Nó de trevo', apelidos: ['no', 'no de trevo', 'trevo', 'nó', 'trefoil'], criar: no },
  esfera: { nome: 'Esfera', apelidos: ['esfera', 'bola', 'globo'], criar: esfera },
  saturno: { nome: 'Saturno', apelidos: ['saturno', 'planeta com aneis'], criar: saturno },
  klein: { nome: 'Garrafa de Klein', apelidos: ['klein', 'garrafa de klein'], criar: klein },
  dna: { nome: 'DNA', apelidos: ['dna', 'adn', 'dupla helice', 'helice'], criar: dna },
  atomo: { nome: 'Átomo', apelidos: ['atomo', 'modelo atomico', 'bohr'], criar: atomo },
  tesseract: { nome: 'Tesseract', apelidos: ['tesseract', 'tesseracto', 'hipercubo', 'cubo 4d', 'quarta dimensao'], criar: tesseract },
  sistema_solar: { nome: 'Sistema Solar', apelidos: ['sistema solar', 'planetas', 'sistema planetario'], criar: sistemaSolar },
  lorenz: { nome: 'Atrator de Lorenz', apelidos: ['lorenz', 'atrator de lorenz', 'caos', 'efeito borboleta', 'atrator'], criar: lorenz },
  galaxia: { nome: 'Galáxia', apelidos: ['galaxia', 'via lactea', 'galaxia espiral'], criar: galaxia },
  buraco_negro: { nome: 'Buraco negro', apelidos: ['buraco negro', 'black hole', 'gargantua'], criar: buracoNegro },
  cubo: { nome: 'Cubo', apelidos: ['cubo', 'hexaedro'], criar: () => solido('Cubo', new THREE.BoxGeometry(1, 1, 1), '6 faces · 12 arestas · 8 vértices') },
  tetraedro: { nome: 'Tetraedro', apelidos: ['tetraedro', 'piramide'], criar: () => solido('Tetraedro', new THREE.TetrahedronGeometry(1), '4 faces · 6 arestas · 4 vértices') },
  octaedro: { nome: 'Octaedro', apelidos: ['octaedro'], criar: () => solido('Octaedro', new THREE.OctahedronGeometry(1), '8 faces · 12 arestas · 6 vértices') },
  dodecaedro: { nome: 'Dodecaedro', apelidos: ['dodecaedro'], criar: () => solido('Dodecaedro', new THREE.DodecahedronGeometry(1), '12 faces · 30 arestas · 20 vértices') },
  icosaedro: { nome: 'Icosaedro', apelidos: ['icosaedro'], criar: () => solido('Icosaedro', new THREE.IcosahedronGeometry(1), '20 faces · 30 arestas · 12 vértices') },
  onda: { nome: 'Onda', apelidos: ['onda', 'ondas', 'ondulacao', 'gota na agua'], criar: () => ({ ...funcao('sin(sqrt(x^2 + y^2)*2.5 - t*3)/(1 + sqrt(x^2+y^2)*0.4)'), nome: 'Onda', fonte: 'FORMA' }) },
  sela: { nome: 'Sela', apelidos: ['sela', 'paraboloide hiperbolico', 'pringles'], criar: () => ({ ...funcao('x^2 - y^2', 1.6), nome: 'Paraboloide hiperbólico (sela)', fonte: 'FORMA' }) }
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Acha a forma pelo que foi falado ("fita de möbius invertida", "um tesseract"). */
export function acharForma(texto: string): string | null {
  const t = normalizar(texto).replace(/^(um|uma|o|a)\s+/, '')
  if (!t) return null
  if (FORMAS[t.replace(/ /g, '_')]) return t.replace(/ /g, '_')
  // Mais específico primeiro: "mobius invertida" antes de "mobius"
  const candidatos = Object.entries(FORMAS).flatMap(([id, f]) => f.apelidos.map((a) => ({ id, a: normalizar(a) }))).sort((x, y) => y.a.length - x.a.length)
  return candidatos.find((c) => ` ${t} `.includes(` ${c.a} `))?.id ?? null
}

export const listaFormas = (): string[] => Object.values(FORMAS).map((f) => f.nome)
