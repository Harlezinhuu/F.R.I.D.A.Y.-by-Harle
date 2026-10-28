// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Gerador de QR Code (modelo 2, modo byte, correção M, versões 1 a 15), sem bibliotecas.
// Usado para parear o celular com o PC: o HUD mostra o código e o celular lê com a câmera.

/** [correção por bloco, blocos do grupo 1, dados por bloco no grupo 1, blocos do grupo 2, dados no grupo 2] */
const BLOCOS_M: number[][] = [
  [], [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42]
]
const ALINHAMENTO: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]
]

// ---------- Campo de Galois GF(256) e Reed-Solomon ----------

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}
const mult = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function gerador(grau: number): number[] {
  let g = [1]
  for (let i = 0; i < grau; i++) {
    const n = new Array<number>(g.length + 1).fill(0)
    for (let j = 0; j < g.length; j++) {
      n[j] ^= g[j]
      n[j + 1] ^= mult(g[j], EXP[i])
    }
    g = n
  }
  return g
}

function correcao(dados: number[], grau: number): number[] {
  const g = gerador(grau)
  const resto = new Array<number>(grau).fill(0)
  for (const b of dados) {
    const fator = b ^ (resto.shift() as number)
    resto.push(0)
    for (let k = 0; k < grau; k++) resto[k] ^= mult(g[k + 1], fator)
  }
  return resto
}

// ---------- Codificação ----------

const capacidade = (v: number): number => { const b = BLOCOS_M[v]; return b[1] * b[2] + b[3] * b[4] }

function palavras(bytes: Uint8Array, v: number): number[] {
  const bits: number[] = []
  const por = (valor: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1) }
  por(0b0100, 4)
  por(bytes.length, v < 10 ? 8 : 16)
  for (const b of bytes) por(b, 8)
  const total = capacidade(v) * 8
  por(0, Math.min(4, total - bits.length))
  while (bits.length % 8) bits.push(0)
  const dados: number[] = []
  for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  for (let p = 0; dados.length < capacidade(v); p++) dados.push(p % 2 ? 0x11 : 0xec)

  // Divide em blocos, calcula a correção e intercala
  const [ec, g1, d1, g2, d2] = BLOCOS_M[v]
  const blocos: number[][] = []
  let pos = 0
  for (let i = 0; i < g1 + g2; i++) {
    const n = i < g1 ? d1 : d2
    blocos.push(dados.slice(pos, pos + n))
    pos += n
  }
  const corr = blocos.map((b) => correcao(b, ec))
  const saida: number[] = []
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocos) if (i < b.length) saida.push(b[i])
  for (let i = 0; i < ec; i++) for (const c of corr) saida.push(c[i])
  return saida
}

// ---------- Matriz ----------

type Matriz = boolean[][]

function mascara(m: number, x: number, y: number): boolean {
  switch (m) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

function montar(v: number, dados: number[], m: number): Matriz {
  const n = 17 + 4 * v
  const mod: Matriz = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const fixo: Matriz = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const por = (x: number, y: number, escuro: boolean) => { mod[y][x] = escuro; fixo[y][x] = true }

  for (let i = 0; i < n; i++) { por(6, i, i % 2 === 0); por(i, 6, i % 2 === 0) }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= n || y >= n) continue
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      por(x, y, d !== 2 && d !== 4)
    }
  }
  const al = ALINHAMENTO[v]
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) por(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  // Formato (correção M = 00) e versão
  const fmt = 0 << 3 | m
  let r = fmt
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
  const bitsFmt = ((fmt << 10) | r) ^ 0x5412
  const bit = (b: number, i: number) => ((b >>> i) & 1) !== 0
  for (let i = 0; i <= 5; i++) por(8, i, bit(bitsFmt, i))
  por(8, 7, bit(bitsFmt, 6))
  por(8, 8, bit(bitsFmt, 7))
  por(7, 8, bit(bitsFmt, 8))
  for (let i = 9; i < 15; i++) por(14 - i, 8, bit(bitsFmt, i))
  for (let i = 0; i < 8; i++) por(n - 1 - i, 8, bit(bitsFmt, i))
  for (let i = 8; i < 15; i++) por(8, n - 15 + i, bit(bitsFmt, i))
  por(8, n - 8, true)
  if (v >= 7) {
    let rv = v
    for (let i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1f25)
    const bitsV = (v << 12) | rv
    for (let i = 0; i < 18; i++) {
      const a = n - 11 + (i % 3), b = Math.floor(i / 3)
      por(a, b, bit(bitsV, i))
      por(b, a, bit(bitsV, i))
    }
  }
  // Dados em zigue-zague, de baixo para cima, pulando a coluna do relógio
  let i = 0
  for (let dir = n - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = dir - j
        const subindo = ((dir + 1) & 2) === 0
        const y = subindo ? n - 1 - vert : vert
        if (!fixo[y][x] && i < dados.length * 8) {
          mod[y][x] = ((dados[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0
          i++
        }
      }
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixo[y][x] && mascara(m, x, y)) mod[y][x] = !mod[y][x]
  return mod
}

/** Penalidade simplificada da norma: corridas, blocos 2x2, padrões parecidos com o localizador e equilíbrio. */
function penalidade(mod: Matriz): number {
  const n = mod.length
  let p = 0
  for (let eixo = 0; eixo < 2; eixo++) {
    for (let a = 0; a < n; a++) {
      let corrida = 1
      let linha = ''
      for (let b = 0; b < n; b++) {
        const c = eixo ? mod[b][a] : mod[a][b]
        linha += c ? '1' : '0'
        if (b > 0 && c === (eixo ? mod[b - 1][a] : mod[a][b - 1])) {
          corrida++
          if (corrida === 5) p += 3
          else if (corrida > 5) p++
        } else corrida = 1
      }
      for (const padrao of ['10111010000', '00001011101']) {
        let k = linha.indexOf(padrao)
        while (k >= 0) { p += 40; k = linha.indexOf(padrao, k + 1) }
      }
    }
  }
  let escuros = 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (mod[y][x]) escuros++
    if (y < n - 1 && x < n - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3
  }
  p += Math.floor(Math.abs(escuros * 20 - n * n * 10) / (n * n)) * 10
  return p
}

/** Matriz do QR Code (true = módulo escuro). */
export function gerarQR(texto: string): Matriz {
  const bytes = new TextEncoder().encode(texto)
  let v = 1
  while (v <= 15 && capacidade(v) < bytes.length + (v < 10 ? 2 : 3)) v++
  if (v > 15) throw new Error('Texto grande demais para o QR.')
  const dados = palavras(bytes, v)
  let melhor: Matriz | null = null
  let menor = Infinity
  for (let m = 0; m < 8; m++) {
    const mat = montar(v, dados, m)
    const p = penalidade(mat)
    if (p < menor) { menor = p; melhor = mat }
  }
  return melhor as Matriz
}

/** QR como SVG (com a margem branca que os leitores precisam). */
export function qrSvg(texto: string, cor = '#000', fundo = '#fff'): string {
  const mat = gerarQR(texto)
  const n = mat.length, borda = 4, total = n + borda * 2
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (mat[y][x]) d += `M${x + borda} ${y + borda}h1v1h-1z`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${fundo}"/><path d="${d}" fill="${cor}"/></svg>`
}
