// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Modelagem para impressão 3D, sem programa de CAD: cada peça é uma "função de distância" (SDF),
// que diz, para qualquer ponto do espaço, a que distância ele está da superfície (negativo = dentro).
// Juntar, furar, dar espessura e arredondar viram contas simples. No fim, a superfície vira uma malha
// fechada (tetraedros, depois simplificada) e sai como STL, pronto para o fatiador. Unidades: milímetros.

// ---------- Formas ----------

const hypot3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z)

export const esfera = (r) => (x, y, z) => hypot3(x, y, z) - r

/** Caixa centrada, com os cantos arredondados (raio `rc`). */
export const caixa = ([a, b, c], rc = 0) => (x, y, z) => {
  const qx = Math.abs(x) - a / 2 + rc, qy = Math.abs(y) - b / 2 + rc, qz = Math.abs(z) - c / 2 + rc
  return hypot3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rc
}

/** Cilindro em pé (eixo Y), centrado, raio `r`, altura `h`, bordas arredondadas `rc`. */
export const cilindro = (r, h, rc = 0) => (x, y, z) => {
  const dx = Math.hypot(x, z) - r + rc, dy = Math.abs(y) - h / 2 + rc
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rc
}

/** Anel deitado (toro) no plano XZ. */
export const toro = (R, r) => (x, y, z) => Math.hypot(Math.hypot(x, z) - R, y) - r

/** Elipsoide (aproximado, bom o bastante para modelar). */
export const elipsoide = ([a, b, c]) => (x, y, z) => {
  const k0 = hypot3(x / a, y / b, z / c), k1 = hypot3(x / (a * a), y / (b * b), z / (c * c))
  return k1 === 0 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1
}

/** Prisma hexagonal em pé (eixo Y), `r` = distância do centro até o meio de um lado. */
export const hexagono = (r, h) => (x, y, z) => {
  const kx = -0.8660254, ky = 0.5, kz = 0.57735
  let px = Math.abs(x), pz = Math.abs(z)
  const d = 2 * Math.min(kx * px + ky * pz, 0)
  px -= d * kx; pz -= d * ky
  const lx = Math.min(Math.max(px, -kz * r), kz * r)
  const dx = Math.hypot(px - lx, pz - r) * Math.sign(pz - r), dy = Math.abs(y) - h / 2
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
}

/** Semi-espaço: tudo do lado em que a normal aponta para fora fica de fora. */
export const plano = ([nx, ny, nz], d = 0) => { const l = hypot3(nx, ny, nz); return (x, y, z) => (x * nx + y * ny + z * nz) / l - d }

/** Segmento grosso (cápsula) entre dois pontos. */
export const capsula = ([ax, ay, az], [bx, by, bz], r) => (x, y, z) => {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)))
  return hypot3(pax - bax * h, pay - bay * h, paz - baz * h) - r
}

// ---------- Operações ----------

export const uniao = (...fs) => (x, y, z) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, y, z)); return d }
export const intersecao = (...fs) => (x, y, z) => { let d = -Infinity; for (const f of fs) d = Math.max(d, f(x, y, z)); return d }
export const subtrair = (a, ...bs) => (x, y, z) => { let d = a(x, y, z); for (const b of bs) d = Math.max(d, -b(x, y, z)); return d }

/** União com emenda arredondada de raio `k` (as formas "derretem" uma na outra). */
export const uniaoSuave = (k, ...fs) => (x, y, z) => {
  let d = fs[0](x, y, z)
  for (let i = 1; i < fs.length; i++) {
    const e = fs[i](x, y, z), h = Math.min(1, Math.max(0, 0.5 + (0.5 * (e - d)) / k))
    d = e * (1 - h) + d * h - k * h * (1 - h)
  }
  return d
}
export const subtrairSuave = (k, a, b) => (x, y, z) => {
  const d1 = a(x, y, z), d2 = -b(x, y, z), h = Math.min(1, Math.max(0, 0.5 - (0.5 * (d1 - d2)) / k))
  return d1 * (1 - h) + d2 * h + k * h * (1 - h)
}

/** Casca de espessura `t` (a forma vira uma parede oca). */
export const casca = (f, t) => (x, y, z) => Math.abs(f(x, y, z) + t / 2) - t / 2
export const arredondar = (f, r) => (x, y, z) => f(x, y, z) - r
export const mover = (f, [dx, dy, dz]) => (x, y, z) => f(x - dx, y - dy, z - dz)
export const espelharX = (f) => (x, y, z) => f(Math.abs(x), y, z)

/** Gira em volta de um eixo ('x', 'y' ou 'z'), ângulo em graus. */
export const girar = (f, eixo, graus) => {
  const a = (-graus * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  if (eixo === 'x') return (x, y, z) => f(x, y * c - z * s, y * s + z * c)
  if (eixo === 'y') return (x, y, z) => f(x * c + z * s, y, -x * s + z * c)
  return (x, y, z) => f(x * c - y * s, x * s + y * c, z)
}

/** Repete a forma `n` vezes em volta do eixo Y. */
export const emVolta = (f, n) => (x, y, z) => {
  const passo = (2 * Math.PI) / n
  let a = Math.atan2(z, x)
  a = ((a % passo) + passo + passo / 2) % passo - passo / 2
  const r = Math.hypot(x, z)
  return f(r * Math.cos(a), y, r * Math.sin(a))
}

// ---------- Malha (tetraedros + simplificação) ----------

// Cada cubinho da grade vira 6 tetraedros (sempre cortados do mesmo jeito, então os vizinhos casam).
// Dentro de um tetraedro a superfície é um triângulo ou um quadrado: o resultado é sempre uma malha
// fechada e "manifold" (cada aresta em exatamente dois triângulos), que é o que o fatiador precisa.
// Depois, as partes planas são simplificadas (colapso de arestas por erro quadrático) sem sair da
// tolerância, para o arquivo ficar leve.
const TETRAS = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]]

/**
 * Transforma a forma em malha fechada. `caixa`: [min, max] em mm (deixe folga em volta da peça);
 * `passo`: tamanho do voxel (mm); `tolerancia`: quanto a simplificação pode se afastar da forma (mm; 0,05 é menos que uma camada de impressão; 0 = não simplifica).
 * Devolve os triângulos (9 números cada).
 */
export function malha(f, caixa, passo = 1, tolerancia = 0.05) {
  const m = tetraedros(f, caixa, passo)
  if (tolerancia > 0) simplificar(m, tolerancia)
  return soltos(m)
}

/** Malha indexada: { pos: Float64Array (x,y,z), faces: Int32Array (a,b,c) }. */
export function tetraedros(f, [[x0, y0, z0], [x1, y1, z1]], passo = 1) {
  // A grade fica levemente deslocada: assim nenhuma face plana da peça (furos, encaixes) cai exatamente
  // em cima dos pontos da grade, o que deixaria a superfície "tremendo" entre dentro e fora
  x0 += passo * 0.137; y0 += passo * 0.271; z0 += passo * 0.193
  const nx = Math.ceil((x1 - x0) / passo) + 1, ny = Math.ceil((y1 - y0) / passo) + 1, nz = Math.ceil((z1 - z0) / passo) + 1
  const v = new Float32Array(nx * ny * nz)
  const id = (i, j, k) => (k * ny + j) * nx + i
  const perto = passo * 0.05
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    // A borda da caixa é sempre "fora": garante que a malha fecha
    const borda = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1
    let d = f(x0 + i * passo, y0 + j * passo, z0 + k * passo)
    // Pontos quase em cima da superfície criam triângulos-lasca: empurra um tiquinho (até 5% do passo)
    if (Math.abs(d) < perto) d = d < 0 ? -perto : perto
    v[id(i, j, k)] = borda ? Math.max(passo, d) : d
  }
  const off = [0, 1, nx, nx + 1, nx * ny, nx * ny + 1, nx * ny + nx, nx * ny + nx + 1]
  const pos = []
  const vertDaAresta = new Map()
  const faces = []
  const vg = new Float64Array(8)
  // Vértice no ponto em que a aresta (de `a` para `b`, cantos do cubo) cruza o zero; um por aresta da grade
  const ponto = (base, i, j, k, a, b) => {
    const lo = a < b ? a : b, hi = a < b ? b : a // hi contém os bits de lo (caminho monótono)
    const chave = (base + off[lo]) * 8 + (hi ^ lo)
    let n = vertDaAresta.get(chave)
    if (n !== undefined) return n
    let t = vg[a] / (vg[a] - vg[b])
    t = Math.min(0.999, Math.max(0.001, t))
    const ax = i + (a & 1), ay = j + ((a >> 1) & 1), az = k + ((a >> 2) & 1)
    const bx = i + (b & 1), by = j + ((b >> 1) & 1), bz = k + ((b >> 2) & 1)
    n = pos.length / 3
    pos.push(x0 + (ax + t * (bx - ax)) * passo, y0 + (ay + t * (by - ay)) * passo, z0 + (az + t * (bz - az)) * passo)
    vertDaAresta.set(chave, n)
    return n
  }
  const P = (n) => [pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]]
  const centro = (i, j, k, cs) => { let x = 0, y = 0, z = 0; for (const c of cs) { x += c & 1; y += (c >> 1) & 1; z += (c >> 2) & 1 } return [x / cs.length, y / cs.length, z / cs.length] }
  // Põe o polígono com a normal apontando de dentro para fora
  const emitir = (ids, dentro, fora, i, j, k) => {
    const [p0, p1, p2] = [P(ids[0]), P(ids[1]), P(ids[2])]
    let nxx = 0, nyy = 0, nzz = 0
    const somar = (a, b, c) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]
      nxx += uy * wz - uz * wy; nyy += uz * wx - ux * wz; nzz += ux * wy - uy * wx
    }
    somar(p0, p1, p2)
    if (ids.length === 4) somar(p0, p2, P(ids[3]))
    const cd = centro(i, j, k, dentro), cf = centro(i, j, k, fora)
    const inverter = nxx * (cf[0] - cd[0]) + nyy * (cf[1] - cd[1]) + nzz * (cf[2] - cd[2]) < 0
    const tri = (a, b, c) => { if (inverter) faces.push(a, c, b); else faces.push(a, b, c) }
    tri(ids[0], ids[1], ids[2])
    if (ids.length === 4) tri(ids[0], ids[2], ids[3])
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const base = id(i, j, k)
    let dentro = 0
    for (let c = 0; c < 8; c++) { vg[c] = v[base + off[c]]; if (vg[c] < 0) dentro++ }
    if (dentro === 0 || dentro === 8) continue
    for (const t of TETRAS) {
      const den = [], fo = []
      for (const c of t) (vg[c] < 0 ? den : fo).push(c)
      if (den.length === 0 || den.length === 4) continue
      if (den.length === 1 || den.length === 3) {
        const [s, outros] = den.length === 1 ? [den[0], fo] : [fo[0], den]
        emitir(outros.map((o) => ponto(base, i, j, k, s, o)), den, fo, i, j, k)
      } else {
        const [a, b] = den, [c, d] = fo
        emitir([ponto(base, i, j, k, a, c), ponto(base, i, j, k, a, d), ponto(base, i, j, k, b, d), ponto(base, i, j, k, b, c)], den, fo, i, j, k)
      }
    }
  }
  return { pos: Float64Array.from(pos), faces: Int32Array.from(faces) }
}

/** Tira as faces removidas e os vértices sem uso (para simplificar de novo, mais forte). */
export function compactar({ pos, faces }) {
  const novo = new Int32Array(pos.length / 3).fill(-1)
  const p = [], f = []
  for (let i = 0; i < faces.length; i += 3) {
    if (faces[i] < 0) continue
    for (let c = 0; c < 3; c++) {
      const v = faces[i + c]
      if (novo[v] < 0) { novo[v] = p.length / 3; p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) }
      f.push(novo[v])
    }
  }
  return { pos: Float64Array.from(p), faces: Int32Array.from(f) }
}

/** Triângulos soltos (9 números cada) a partir da malha indexada, pulando as faces removidas (-1). */
export function soltos({ pos, faces }) {
  let n = 0
  for (let f = 0; f < faces.length; f += 3) if (faces[f] >= 0) n++
  const out = new Float32Array(n * 9)
  let o = 0
  for (let f = 0; f < faces.length; f += 3) {
    if (faces[f] < 0) continue
    for (let c = 0; c < 3; c++) { const q = faces[f + c] * 3; out[o++] = pos[q]; out[o++] = pos[q + 1]; out[o++] = pos[q + 2] }
  }
  return out
}

/**
 * Simplificação por colapso de arestas (erro quadrático de Garland-Heckbert), mantendo a malha
 * fechada e manifold: só colapsa se os vizinhos comuns forem exatamente os dois esperados, se
 * nenhum triângulo virar do avesso e se o erro ficar dentro da tolerância (mm). Altera `m` no lugar.
 */
export function simplificar(m, tolerancia) {
  const { pos, faces } = m
  const nv = pos.length / 3, nf = faces.length / 3
  const Q = new Float64Array(nv * 10)
  const facesDo = Array.from({ length: nv }, () => [])
  const normal = (a, b, c, px) => {
    const ax = px[a * 3], ay = px[a * 3 + 1], az = px[a * 3 + 2]
    const ux = px[b * 3] - ax, uy = px[b * 3 + 1] - ay, uz = px[b * 3 + 2] - az
    const wx = px[c * 3] - ax, wy = px[c * 3 + 1] - ay, wz = px[c * 3 + 2] - az
    return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx]
  }
  for (let f = 0; f < nf; f++) {
    const a = faces[f * 3], b = faces[f * 3 + 1], c = faces[f * 3 + 2]
    facesDo[a].push(f); facesDo[b].push(f); facesDo[c].push(f)
    const [x, y, z] = normal(a, b, c, pos)
    const l = Math.hypot(x, y, z)
    if (l < 1e-12) continue
    const nx = x / l, ny = y / l, nz = z / l, d = -(nx * pos[a * 3] + ny * pos[a * 3 + 1] + nz * pos[a * 3 + 2])
    const w = l / 2 // peso pela área
    for (const q of [a, b, c]) {
      const o = q * 10
      Q[o] += w * nx * nx; Q[o + 1] += w * nx * ny; Q[o + 2] += w * nx * nz; Q[o + 3] += w * nx * d
      Q[o + 4] += w * ny * ny; Q[o + 5] += w * ny * nz; Q[o + 6] += w * ny * d
      Q[o + 7] += w * nz * nz; Q[o + 8] += w * nz * d; Q[o + 9] += w * d * d
    }
  }
  // Área total em volta de cada vértice, para o erro virar "distância média" em mm²
  const areaDo = new Float64Array(nv)
  for (let f = 0; f < nf; f++) {
    const [x, y, z] = normal(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2], pos)
    const ar = Math.hypot(x, y, z) / 2
    for (let c = 0; c < 3; c++) areaDo[faces[f * 3 + c]] += ar
  }
  const tmp = new Float64Array(10)
  const erroTmp = (x, y, z) => { const q = tmp; return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9] }
  const limite = tolerancia * tolerancia
  // Custo do colapso u-v (erro quadrático médio por área, em mm²) e a melhor posição:
  // a ótima, se a conta for estável e ela ficar perto da aresta; senão a melhor entre as pontas e o meio
  const custo = (u, v) => {
    for (let i = 0; i < 10; i++) tmp[i] = Q[u * 10 + i] + Q[v * 10 + i]
    const ux = pos[u * 3], uy = pos[u * 3 + 1], uz = pos[u * 3 + 2], vx = pos[v * 3], vy = pos[v * 3 + 1], vz = pos[v * 3 + 2]
    const mx = (ux + vx) / 2, my = (uy + vy) / 2, mz = (uz + vz) / 2
    const cands = [[ux, uy, uz], [vx, vy, vz], [mx, my, mz]]
    const a = tmp[0], b = tmp[1], c = tmp[2], e = tmp[4], f = tmp[5], i = tmp[7]
    const det = a * (e * i - f * f) - b * (b * i - f * c) + c * (b * f - e * c)
    const tr = a + e + i
    if (tr > 0 && Math.abs(det) > 1e-9 * tr * tr * tr) {
      const bx = -tmp[3], by = -tmp[6], bz = -tmp[8]
      const x = (bx * (e * i - f * f) - b * (by * i - f * bz) + c * (by * f - e * bz)) / det
      const y = (a * (by * i - f * bz) - bx * (b * i - f * c) + c * (b * bz - by * c)) / det
      const z = (a * (e * bz - by * f) - b * (b * bz - by * c) + bx * (b * f - e * c)) / det
      const L = Math.hypot(ux - vx, uy - vy, uz - vz)
      if (Math.hypot(x - mx, y - my, z - mz) < 0.75 * L) cands.push([x, y, z])
    }
    let best = cands[0], be = Infinity
    for (const p of cands) { const ee = erroTmp(p[0], p[1], p[2]); if (ee < be) { be = ee; best = p } }
    return [Math.max(0, be) / Math.max(1e-12, areaDo[u] + areaDo[v]), best]
  }

  // Heap de candidatos (custo, u, v, versões)
  let cap = 1 << 20, tam = 0
  let hc = new Float64Array(cap), hu = new Int32Array(cap), hv = new Int32Array(cap), hvu = new Int32Array(cap), hvv = new Int32Array(cap)
  const versao = new Int32Array(nv)
  const vivo = new Uint8Array(nv).fill(1)
  const crescer = () => {
    cap *= 2
    const g = (A, T) => { const n = new T(cap); n.set(A); return n }
    hc = g(hc, Float64Array); hu = g(hu, Int32Array); hv = g(hv, Int32Array); hvu = g(hvu, Int32Array); hvv = g(hvv, Int32Array)
  }
  const trocar = (i, j) => {
    let t = hc[i]; hc[i] = hc[j]; hc[j] = t
    t = hu[i]; hu[i] = hu[j]; hu[j] = t; t = hv[i]; hv[i] = hv[j]; hv[j] = t
    t = hvu[i]; hvu[i] = hvu[j]; hvu[j] = t; t = hvv[i]; hvv[i] = hvv[j]; hvv[j] = t
  }
  const empurrar = (c, u, v) => {
    if (tam === cap) crescer()
    let i = tam++
    hc[i] = c; hu[i] = u; hv[i] = v; hvu[i] = versao[u]; hvv[i] = versao[v]
    while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; trocar(i, p); i = p }
  }
  const tirar = () => {
    tam--
    trocar(0, tam)
    let i = 0
    for (;;) {
      const l = i * 2 + 1, r = l + 1
      let s = i
      if (l < tam && hc[l] < hc[s]) s = l
      if (r < tam && hc[r] < hc[s]) s = r
      if (s === i) break
      trocar(i, s); i = s
    }
    return tam
  }
  const vizinhos = (u) => {
    const s = new Set()
    for (const f of facesDo[u]) for (let c = 0; c < 3; c++) { const w = faces[f * 3 + c]; if (w !== u) s.add(w) }
    return s
  }
  for (let f = 0; f < nf; f++) for (let c = 0; c < 3; c++) {
    const u = faces[f * 3 + c], v = faces[f * 3 + ((c + 1) % 3)]
    if (u < v) { const [e] = custo(u, v); if (e <= limite) empurrar(e, u, v) }
  }
  const p = new Float64Array(3)
  let colapsos = 0
  while (tam > 0) {
    const i = tirar()
    const u = hu[i], v = hv[i]
    if (!vivo[u] || !vivo[v] || hvu[i] !== versao[u] || hvv[i] !== versao[v]) continue
    const [e, best] = custo(u, v)
    if (e > limite) continue
    p[0] = best[0]; p[1] = best[1]; p[2] = best[2]
    // Condição do elo: vizinhos comuns = os dois vértices opostos à aresta
    const nu = vizinhos(u), nvz = vizinhos(v)
    if (!nu.has(v)) continue
    let comuns = 0
    for (const w of nu) if (nvz.has(w)) comuns++
    if (comuns !== 2 || nu.size + nvz.size - 2 < 5) continue
    // Nenhum triângulo pode virar ou ficar fino demais. Triângulos que já eram lascas (comuns logo
    // depois dos tetraedros) não têm normal confiável: para eles vale a normal da região toda
    const reg = [0, 0, 0]
    for (const q of [u, v]) for (const f of facesDo[q]) {
      if (faces[f * 3] < 0) continue
      const n = normal(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2], pos)
      reg[0] += n[0]; reg[1] += n[1]; reg[2] += n[2]
    }
    const lreg = Math.hypot(reg[0], reg[1], reg[2])
    const qualidade = (a, b, c, q, pq) => {
      let maior = 0
      for (const [x, y] of [[a, b], [b, c], [c, a]]) {
        const px = x === q ? pq : pos.subarray(x * 3, x * 3 + 3), py = y === q ? pq : pos.subarray(y * 3, y * 3 + 3)
        maior = Math.max(maior, (px[0] - py[0]) ** 2 + (px[1] - py[1]) ** 2 + (px[2] - py[2]) ** 2)
      }
      return maior
    }
    let ok = true
    for (const [q, outro] of [[u, v], [v, u]]) {
      for (const f of facesDo[q]) {
        const a = faces[f * 3], b = faces[f * 3 + 1], c = faces[f * 3 + 2]
        if (a < 0) continue
        if (a === outro || b === outro || c === outro) continue
        const n0 = normal(a, b, c, pos)
        const ox = pos[q * 3], oy = pos[q * 3 + 1], oz = pos[q * 3 + 2]
        pos[q * 3] = p[0]; pos[q * 3 + 1] = p[1]; pos[q * 3 + 2] = p[2]
        const n1 = normal(a, b, c, pos)
        pos[q * 3] = ox; pos[q * 3 + 1] = oy; pos[q * 3 + 2] = oz
        const l0 = Math.hypot(n0[0], n0[1], n0[2]), l1 = Math.hypot(n1[0], n1[1], n1[2])
        if (l1 < 1e-12) { ok = false; break }
        const m0 = qualidade(a, b, c, -1, null), m1 = qualidade(a, b, c, q, p)
        const q0 = l0 / 2 / Math.max(m0, 1e-18), q1 = l1 / 2 / Math.max(m1, 1e-18)
        const lasca = q0 < 0.05
        const ref = lasca ? reg : n0, lr = lasca ? lreg : l0
        if (lr > 1e-12 && (ref[0] * n1[0] + ref[1] * n1[1] + ref[2] * n1[2]) < 0.5 * lr * l1) { ok = false; break }
        // Evita agulhas novas (mas deixa melhorar as que já existiam)
        if (q1 < 0.02 && q1 < q0) { ok = false; break }
      }
      if (!ok) break
    }
    if (!ok) continue
    // Colapsa v em u
    pos[u * 3] = p[0]; pos[u * 3 + 1] = p[1]; pos[u * 3 + 2] = p[2]
    for (let k = 0; k < 10; k++) Q[u * 10 + k] += Q[v * 10 + k]
    areaDo[u] += areaDo[v]
    const novas = []
    for (const f of facesDo[u]) {
      if (faces[f * 3] < 0) continue
      const a = faces[f * 3], b = faces[f * 3 + 1], c = faces[f * 3 + 2]
      if (a === v || b === v || c === v) { faces[f * 3] = faces[f * 3 + 1] = faces[f * 3 + 2] = -1; continue }
      novas.push(f)
    }
    for (const f of facesDo[v]) {
      if (faces[f * 3] < 0) continue
      for (let c = 0; c < 3; c++) if (faces[f * 3 + c] === v) faces[f * 3 + c] = u
      novas.push(f)
    }
    // limpa as faces mortas das listas dos vizinhos
    facesDo[u] = novas
    facesDo[v] = []
    vivo[v] = 0
    versao[u]++
    for (const w of vizinhos(u)) {
      facesDo[w] = facesDo[w].filter((f) => faces[f * 3] >= 0)
      const [e2] = custo(u, w)
      if (e2 <= limite) empurrar(e2, Math.min(u, w), Math.max(u, w))
    }
    colapsos++
  }
  m.colapsos = colapsos
  return m
}

// ---------- Conferência ----------

/** Confere se a malha é fechada (cada aresta em exatamente 2 triângulos) e mede volume e tamanho. */
export function conferir(tri) {
  const chave = (i) => `${tri[i].toFixed(4)},${tri[i + 1].toFixed(4)},${tri[i + 2].toFixed(4)}`
  const ids = new Map()
  const idDe = (i) => { const k = chave(i); let n = ids.get(k); if (n === undefined) { n = ids.size; ids.set(k, n) } return n }
  const contagem = new Map()
  let volume = 0
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  let degenerados = 0
  for (let t = 0; t < tri.length; t += 9) {
    const a = idDe(t), b = idDe(t + 3), c = idDe(t + 6)
    if (a === b || b === c || a === c) { degenerados++; continue }
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = p < q ? `${p}_${q}` : `${q}_${p}`; contagem.set(k, (contagem.get(k) ?? 0) + 1) }
    const [x1, y1, z1, x2, y2, z2, x3, y3, z3] = tri.subarray(t, t + 9)
    volume += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6
    for (let k = 0; k < 9; k++) { min[k % 3] = Math.min(min[k % 3], tri[t + k]); max[k % 3] = Math.max(max[k % 3], tri[t + k]) }
  }
  let abertas = 0, demais = 0
  for (const n of contagem.values()) { if (n === 1) abertas++; else if (n > 2) demais++ }
  return { triangulos: tri.length / 9, abertas, demais, degenerados, volume, tamanho: max.map((m, i) => +(m - min[i]).toFixed(1)), min, max }
}

// ---------- Arquivos ----------

/** STL binário (o formato que todo fatiador abre). */
export function stl(tri, nome = 'FRIDAY by Harle') {
  const n = tri.length / 9
  const b = new DataView(new ArrayBuffer(84 + n * 50))
  const cab = new TextEncoder().encode(nome.slice(0, 79))
  for (let i = 0; i < cab.length; i++) b.setUint8(i, cab[i])
  b.setUint32(80, n, true)
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50, p = t * 9
    const ux = tri[p + 3] - tri[p], uy = tri[p + 4] - tri[p + 1], uz = tri[p + 5] - tri[p + 2]
    const vx = tri[p + 6] - tri[p], vy = tri[p + 7] - tri[p + 1], vz = tri[p + 8] - tri[p + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    b.setFloat32(o, nx / l, true); b.setFloat32(o + 4, ny / l, true); b.setFloat32(o + 8, nz / l, true)
    for (let k = 0; k < 9; k++) b.setFloat32(o + 12 + k * 4, tri[p + k], true)
  }
  return new Uint8Array(b.buffer)
}

/** Converte o que é "y para cima" (como modelamos) em "z para cima" (como os fatiadores esperam). */
export function yParaZ(tri) {
  const out = new Float32Array(tri.length)
  for (let i = 0; i < tri.length; i += 3) { out[i] = tri[i]; out[i + 1] = -tri[i + 2]; out[i + 2] = tri[i + 1] }
  return out
}
