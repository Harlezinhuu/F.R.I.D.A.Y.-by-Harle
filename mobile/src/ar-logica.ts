// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// HUD em realidade aumentada, a matemática (sem câmera nem tela, para dar para testar):
// achar as quatro marcas do PC na imagem da câmera (o desenho dos cantos do QR Code, 1:1:3:1:1),
// montar a homografia tela do PC → tela do celular e transformar cada painel num matrix3d do CSS,
// para os dados aparecerem "presos" ao monitor, em perspectiva.

export interface Ponto { x: number; y: number }
export interface Achado extends Ponto { modulo: number; votos: number }
/** Matriz 3 × 3 em linha: [a, b, c, d, e, f, g, h, i] */
export type Matriz = number[]

/** RGBA (canvas) → tons de cinza. */
export function paraCinza(rgba: ArrayLike<number>, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  return g
}

/**
 * Preto e branco com limiar local (média da vizinhança por imagem integral): aguenta a tela mais clara
 * de um lado, reflexo e a câmera ajustando a exposição. 1 = escuro.
 */
export function binarizar(cinza: Uint8Array, w: number, h: number, raio = Math.max(8, Math.round(Math.min(w, h) / 12)), folga = 0.85): Uint8Array {
  const W = w + 1
  const integral = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let linha = 0
    for (let x = 0; x < w; x++) {
      linha += cinza[y * w + x]
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + linha
    }
  }
  const saida = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - raio), y1 = Math.min(h, y + raio + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - raio), x1 = Math.min(w, x + raio + 1)
      const soma = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0]
      const media = soma / ((x1 - x0) * (y1 - y0))
      saida[y * w + x] = cinza[y * w + x] < media * folga ? 1 : 0
    }
  }
  return saida
}

/** As cinco faixas (preto, branco, preto, branco, preto) batem com 1:1:3:1:1? */
function proporcao(c: number[]): boolean {
  if (c.some((n) => n === 0)) return false
  const total = c[0] + c[1] + c[2] + c[3] + c[4]
  if (total < 7) return false
  const m = total / 7, tol = m * 0.6
  return Math.abs(m - c[0]) < tol && Math.abs(m - c[1]) < tol && Math.abs(3 * m - c[2]) < 3 * tol && Math.abs(m - c[3]) < tol && Math.abs(m - c[4]) < tol
}

const centroDaFaixa = (c: number[], fim: number): number => fim - c[4] - c[3] - c[2] / 2

/** Confere na vertical (coluna x) a partir de y: devolve o centro e o tamanho, ou null. */
function conferirVertical(bin: Uint8Array, w: number, h: number, x: number, y: number, maximo: number): { centro: number; total: number } | null {
  const px = (yy: number) => bin[yy * w + x]
  const c = [0, 0, 0, 0, 0]
  let i = y
  // Para cima: centro preto, branco, preto
  while (i >= 0 && px(i) === 1) { c[2]++; i-- }
  if (i < 0) return null
  while (i >= 0 && px(i) === 0 && c[1] <= maximo) { c[1]++; i-- }
  if (i < 0 || c[1] > maximo) return null
  while (i >= 0 && px(i) === 1 && c[0] <= maximo) { c[0]++; i-- }
  if (c[0] > maximo) return null
  // Para baixo
  i = y + 1
  while (i < h && px(i) === 1) { c[2]++; i++ }
  if (i >= h) return null
  while (i < h && px(i) === 0 && c[3] <= maximo) { c[3]++; i++ }
  if (i >= h || c[3] > maximo) return null
  while (i < h && px(i) === 1 && c[4] <= maximo) { c[4]++; i++ }
  if (c[4] > maximo) return null
  if (!proporcao(c)) return null
  return { centro: centroDaFaixa(c, i), total: c.reduce((a, b) => a + b, 0) }
}

/** Confere na horizontal (linha y) a partir de x. */
function conferirHorizontal(bin: Uint8Array, w: number, y: number, x: number, maximo: number): { centro: number; total: number } | null {
  const px = (xx: number) => bin[y * w + xx]
  const c = [0, 0, 0, 0, 0]
  let i = x
  while (i >= 0 && px(i) === 1) { c[2]++; i-- }
  if (i < 0) return null
  while (i >= 0 && px(i) === 0 && c[1] <= maximo) { c[1]++; i-- }
  if (i < 0 || c[1] > maximo) return null
  while (i >= 0 && px(i) === 1 && c[0] <= maximo) { c[0]++; i-- }
  if (c[0] > maximo) return null
  i = x + 1
  while (i < w && px(i) === 1) { c[2]++; i++ }
  if (i >= w) return null
  while (i < w && px(i) === 0 && c[3] <= maximo) { c[3]++; i++ }
  if (i >= w || c[3] > maximo) return null
  while (i < w && px(i) === 1 && c[4] <= maximo) { c[4]++; i++ }
  if (c[4] > maximo) return null
  if (!proporcao(c)) return null
  return { centro: centroDaFaixa(c, i), total: c.reduce((a, b) => a + b, 0) }
}

/** Procura as marcas na imagem preto e branco. Devolve os candidatos (com quantas linhas votaram em cada um). */
export function acharMarcas(bin: Uint8Array, w: number, h: number): Achado[] {
  const achados: Achado[] = []
  const registrar = (c: number[], y: number, fim: number) => {
    const total = c.reduce((a, b) => a + b, 0)
    const cx = Math.round(centroDaFaixa(c, fim))
    if (cx < 0 || cx >= w) return
    const v = conferirVertical(bin, w, h, cx, y, total)
    if (!v) return
    // Em perspectiva a marca fica mais estreita num sentido, mas não tanto
    if (v.total < total * 0.45 || v.total > total * 2.2) return
    const cy = Math.round(v.centro)
    const hz = conferirHorizontal(bin, w, cy, cx, Math.max(total, v.total))
    if (!hz) return
    const p = { x: hz.centro, y: v.centro, modulo: (hz.total + v.total) / 14 }
    const perto = achados.find((a) => Math.abs(a.x - p.x) < a.modulo * 2.5 && Math.abs(a.y - p.y) < a.modulo * 2.5)
    if (perto) {
      const n = perto.votos
      perto.x = (perto.x * n + p.x) / (n + 1)
      perto.y = (perto.y * n + p.y) / (n + 1)
      perto.modulo = (perto.modulo * n + p.modulo) / (n + 1)
      perto.votos++
    } else {
      achados.push({ ...p, votos: 1 })
    }
  }
  for (let y = 0; y < h; y++) {
    const c = [0, 0, 0, 0, 0]
    let estado = 0
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x] === 1) {
        if (estado & 1) estado++
        c[estado]++
      } else if (!(estado & 1)) {
        if (estado === 4) {
          if (proporcao(c)) registrar(c, y, x)
          c[0] = c[2]; c[1] = c[3]; c[2] = c[4]; c[3] = 1; c[4] = 0
          estado = 3
        } else {
          estado++
          c[estado]++
        }
      } else {
        c[estado]++
      }
    }
    if (estado === 4 && proporcao(c)) registrar(c, y, w)
  }
  return achados.sort((a, b) => b.votos - a.votos)
}

const area = (q: Ponto[]): number => {
  let s = 0
  for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a.x * b.y - b.x * a.y }
  return s / 2
}

function convexo(q: Ponto[]): boolean {
  let sinal = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(z) < 1e-9) return false
    if (sinal === 0) sinal = Math.sign(z)
    else if (Math.sign(z) !== sinal) return false
  }
  return true
}

/** Coloca quatro pontos na ordem ↖ ↗ ↘ ↙ (vale com o celular em pé ou meio inclinado). */
export function ordenar(p: Ponto[]): Ponto[] {
  const cx = p.reduce((s, a) => s + a.x, 0) / p.length, cy = p.reduce((s, a) => s + a.y, 0) / p.length
  return [...p].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
}

/** Com três marcas à vista (a quarta tapada ou fora), completa o retângulo pelo paralelogramo. */
export function completarQuarta(tres: Ponto[]): Ponto[] {
  const d = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)
  // O canto do meio é o oposto ao maior lado (a diagonal)
  let meio = 0, maior = -1
  for (let i = 0; i < 3; i++) {
    const a = tres[(i + 1) % 3], b = tres[(i + 2) % 3]
    if (d(a, b) > maior) { maior = d(a, b); meio = i }
  }
  const m = tres[meio], a = tres[(meio + 1) % 3], b = tres[(meio + 2) % 3]
  return ordenar([...tres, { x: a.x + b.x - m.x, y: a.y + b.y - m.y }])
}

/**
 * Das marcas achadas, escolhe as quatro da tela: as mais votadas que formam um quadrilátero convexo
 * grande, com tamanhos parecidos. Com só três, completa a quarta. Devolve ↖ ↗ ↘ ↙ ou null.
 */
export function escolherCantos(achados: Achado[]): { cantos: Ponto[]; completou: boolean } | null {
  // Uma marca de verdade é confirmada por várias linhas seguidas (umas 3 por módulo no miolo preto);
  // ruído e letras dão no máximo uma ou duas
  const bons = achados.filter((a) => a.modulo >= 1.4 && a.votos >= Math.max(3, a.modulo * 1.8)).slice(0, 7)
  let melhor: Ponto[] | null = null, melhorArea = 0
  const parecidos = (g: Achado[]) => Math.max(...g.map((a) => a.modulo)) / Math.min(...g.map((a) => a.modulo)) < 3
  for (let i = 0; i < bons.length; i++) for (let j = i + 1; j < bons.length; j++) for (let k = j + 1; k < bons.length; k++) for (let l = k + 1; l < bons.length; l++) {
    const g = [bons[i], bons[j], bons[k], bons[l]]
    if (!parecidos(g)) continue
    const q = ordenar(g)
    if (!convexo(q)) continue
    const s = Math.abs(area(q))
    // Cada marca ocupa uns 9 módulos: a tela tem que ser bem maior que elas
    const mod = g.reduce((t, a) => t + a.modulo, 0) / 4
    if (s < (mod * 30) ** 2) continue
    if (s > melhorArea) { melhorArea = s; melhor = q }
  }
  if (melhor) return { cantos: melhor.map(({ x, y }) => ({ x, y })), completou: false }
  if (bons.length >= 3) {
    for (let i = 0; i < bons.length; i++) for (let j = i + 1; j < bons.length; j++) for (let k = j + 1; k < bons.length; k++) {
      const g = [bons[i], bons[j], bons[k]]
      if (!parecidos(g)) continue
      const q = completarQuarta(g)
      const mod = g.reduce((t, a) => t + a.modulo, 0) / 3
      if (!convexo(q) || Math.abs(area(q)) < (mod * 30) ** 2) continue
      return { cantos: q.map(({ x, y }) => ({ x, y })), completou: true }
    }
  }
  return null
}

/** Homografia que leva os pontos `de` (tela do PC) nos pontos `para` (tela do celular). */
export function homografia(de: Ponto[], para: Ponto[]): Matriz | null {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = de[i], { x, y } = para[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x])
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y])
  }
  // Eliminação de Gauss com pivô parcial
  for (let c = 0; c < 8; c++) {
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-12) return null
    ;[A[c], A[p]] = [A[p], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = [...A.map((linha, i) => linha[8] / linha[i]), 1]
  // O sinal da matriz é livre; fixa o que deixa a própria tela do PC "na frente" da câmera (w > 0)
  const cu = de.reduce((s, p) => s + p.x, 0) / 4, cv = de.reduce((s, p) => s + p.y, 0) / 4
  return h[6] * cu + h[7] * cv + h[8] < 0 ? h.map((n) => -n) : h
}

export function aplicar(H: Matriz, u: number, v: number): { x: number; y: number; w: number } {
  const w = H[6] * u + H[7] * v + H[8]
  return { x: (H[0] * u + H[1] * v + H[2]) / w, y: (H[3] * u + H[4] * v + H[5]) / w, w }
}

const multiplicar = (a: Matriz, b: Matriz): Matriz => {
  const r: number[] = []
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j])
  return r
}

/**
 * O transform do CSS que coloca um painel de `largura` × `altura` px no retângulo (x0, y0)–(x1, y1)
 * do plano da tela do PC. null se o painel cairia atrás da câmera (perspectiva extrema).
 */
export function matrix3d(H: Matriz, largura: number, altura: number, x0: number, y0: number, x1: number, y1: number): string | null {
  const A: Matriz = [(x1 - x0) / largura, 0, x0, 0, (y1 - y0) / altura, y0, 0, 0, 1]
  const M = multiplicar(H, A)
  // A homografia vem com a tela do PC em w > 0: canto com w ≤ 0 está atrás da câmera
  const ws = [[0, 0], [largura, 0], [largura, altura], [0, altura]].map(([x, y]) => M[6] * x + M[7] * y + M[8])
  if (ws.some((w) => w <= 1e-6)) return null
  const n = M[8]
  const m = M.map((v) => v / n)
  return `matrix3d(${[m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, m[8]].map((v) => +v.toFixed(8)).join(',')})`
}

/** Suaviza o tremido: segue devagar quando mexe pouco e pula quando mexe muito. */
export function suavizar(antes: Ponto[] | null, agora: Ponto[], alfa = 0.45): Ponto[] {
  if (!antes) return agora
  const diag = Math.hypot(agora[0].x - agora[2].x, agora[0].y - agora[2].y)
  const salto = Math.max(...agora.map((p, i) => Math.hypot(p.x - antes[i].x, p.y - antes[i].y)))
  if (salto > diag * 0.08) return agora
  return agora.map((p, i) => ({ x: antes[i].x + (p.x - antes[i].x) * alfa, y: antes[i].y + (p.y - antes[i].y) * alfa }))
}

/** Ponto da imagem processada (canvas) → ponto na tela do celular (o vídeo cobre a tela, "object-fit: cover"). */
export function paraTela(p: Ponto, escalaCanvas: number, video: { w: number; h: number }, tela: { w: number; h: number }): Ponto {
  const s = Math.max(tela.w / video.w, tela.h / video.h)
  return { x: (p.x / escalaCanvas) * s + (tela.w - video.w * s) / 2, y: (p.y / escalaCanvas) * s + (tela.h - video.h * s) / 2 }
}
