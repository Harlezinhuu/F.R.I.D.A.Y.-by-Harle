// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Editor de hologramas (como o Tony mexendo na maquete): cada peça do modelo tem posição, giro, tamanho,
// cor e se foi tirada. Tudo que muda passa por aqui, com desfazer e refazer. Sem three.js, para ter testes;
// quem desenha aplica o estado de cada peça no objeto 3D dela.

export type Vec3 = [number, number, number]

export interface EstadoPeca {
  /** Índice da peça original (as duplicadas apontam para a mesma geometria) */
  origem: number
  nome: string
  /** Deslocamento a partir do lugar original da peça (centro da peça) */
  pos: Vec3
  /** Giro em radianos (X, Y, Z) em volta do centro da peça */
  giro: Vec3
  escala: number
  /** Cor nova (0 a 1); null = a cor original */
  cor: Vec3 | null
  tirada: boolean
}

export interface EstadoModelo { pecas: EstadoPeca[]; giro: Vec3; escala: number; pos: Vec3 }

const copia = (e: EstadoModelo): EstadoModelo => JSON.parse(JSON.stringify(e)) as EstadoModelo

/** Cores faladas → RGB. */
export const CORES: Record<string, Vec3> = {
  vermelho: [1, 0.32, 0.38], vermelha: [1, 0.32, 0.38], azul: [0.3, 0.55, 1], verde: [0.3, 0.95, 0.55], amarelo: [1, 0.85, 0.3], amarela: [1, 0.85, 0.3],
  laranja: [1, 0.6, 0.25], roxo: [0.62, 0.5, 1], roxa: [0.62, 0.5, 1], violeta: [0.62, 0.5, 1], rosa: [1, 0.45, 0.75], branco: [0.95, 0.97, 1], branca: [0.95, 0.97, 1],
  ciano: [0.37, 0.88, 0.95], dourado: [1, 0.78, 0.35], dourada: [1, 0.78, 0.35], prata: [0.78, 0.82, 0.9], preto: [0.22, 0.24, 0.3], preta: [0.22, 0.24, 0.3], cinza: [0.55, 0.6, 0.68]
}
/** Ordem do botão "trocar cor" */
export const PALETA: Vec3[] = [CORES.ciano, CORES.vermelho, CORES.dourado, CORES.verde, CORES.roxo, CORES.branco, CORES.laranja]

const sem = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export class EditorHolograma {
  estado: EstadoModelo
  selecionada = -1
  private antes: EstadoModelo[] = []
  private depois: EstadoModelo[] = []
  /** Mudança contínua (arrastar, girar com a mão): um desfazer só para o gesto inteiro */
  private emGesto = false

  constructor(nomes: string[]) {
    this.estado = { pecas: nomes.map((nome, origem) => ({ origem, nome, pos: [0, 0, 0], giro: [0, 0, 0], escala: 1, cor: null, tirada: false })), giro: [0, 0, 0], escala: 1, pos: [0, 0, 0] }
  }

  get peca(): EstadoPeca | null { return this.estado.pecas[this.selecionada] ?? null }
  get visiveis(): number { return this.estado.pecas.filter((p) => !p.tirada).length }
  get podeDesfazer(): boolean { return this.antes.length > 0 }
  get podeRefazer(): boolean { return this.depois.length > 0 }
  get mudou(): boolean { return this.antes.length > 0 }

  private guardar(): void {
    this.antes.push(copia(this.estado))
    if (this.antes.length > 80) this.antes.shift()
    this.depois = []
  }

  /** Começo de um gesto contínuo: guarda o estado uma vez só. */
  comecarGesto(): void { if (!this.emGesto) { this.guardar(); this.emGesto = true } }
  terminarGesto(): void { this.emGesto = false }

  /** Acha uma peça pelo nome falado ("a hélice", "braço esquerdo"). */
  acharPeca(nome: string): number {
    const alvo = sem(nome).replace(/^(a|o|as|os) /, '')
    if (!alvo) return -1
    const lista = this.estado.pecas.map((p, i) => ({ p, i })).filter(({ p }) => !p.tirada)
    const n = (s: string) => sem(s)
    const singular = (s: string) => s.replace(/(oes|aes)\b/g, 'ao').replace(/s\b/g, '')
    return (
      lista.find(({ p }) => n(p.nome) === alvo) ??
      lista.find(({ p }) => singular(n(p.nome)) === singular(alvo)) ??
      lista.find(({ p }) => n(p.nome).includes(alvo) || singular(n(p.nome)).includes(singular(alvo))) ??
      lista.find(({ p }) => singular(alvo).split(' ').filter((w) => w.length > 2).every((w) => singular(n(p.nome)).includes(w)))
    )?.i ?? -1
  }

  selecionar(i: number): EstadoPeca | null {
    this.selecionada = i >= 0 && i < this.estado.pecas.length && !this.estado.pecas[i].tirada ? i : -1
    return this.peca
  }

  /** Arrasta a peça selecionada (ou o modelo inteiro, sem seleção). */
  mover(d: Vec3): void {
    const alvo = this.peca ?? this.estado
    if (!this.emGesto) this.guardar()
    alvo.pos = [alvo.pos[0] + d[0], alvo.pos[1] + d[1], alvo.pos[2] + d[2]]
  }

  girar(d: Vec3): void {
    const alvo = this.peca ?? this.estado
    if (!this.emGesto) this.guardar()
    alvo.giro = [alvo.giro[0] + d[0], alvo.giro[1] + d[1], alvo.giro[2] + d[2]]
  }

  escalar(fator: number): void {
    const alvo = this.peca ?? this.estado
    if (!this.emGesto) this.guardar()
    alvo.escala = Math.min(8, Math.max(0.1, alvo.escala * fator))
  }

  /** Tira a peça selecionada (ela sai do holograma; "desfaz" traz de volta). */
  tirar(): EstadoPeca | null {
    const p = this.peca
    if (!p) return null
    this.guardar()
    p.tirada = true
    this.selecionada = -1
    return p
  }

  /** Duplica a peça selecionada, um pouco ao lado; a cópia fica selecionada. */
  duplicar(deslocamento: Vec3 = [0.25, 0, 0]): EstadoPeca | null {
    const p = this.peca
    if (!p) return null
    this.guardar()
    const iguais = this.estado.pecas.filter((x) => x.origem === p.origem).length
    const nova: EstadoPeca = { ...JSON.parse(JSON.stringify(p)), nome: `${p.nome.replace(/ \d+$/, '')} ${iguais + 1}`, pos: [p.pos[0] + deslocamento[0], p.pos[1] + deslocamento[1], p.pos[2] + deslocamento[2]] }
    this.estado.pecas.push(nova)
    this.selecionada = this.estado.pecas.length - 1
    return nova
  }

  pintar(cor: Vec3 | null): void {
    const p = this.peca
    if (!p) return
    this.guardar()
    p.cor = cor
  }

  /** Próxima cor da paleta (botão "cor"). */
  proximaCor(): Vec3 {
    const p = this.peca
    const atual = p?.cor ? PALETA.findIndex((c) => c.every((v, k) => Math.abs(v - p.cor![k]) < 1e-6)) : -1
    const cor = PALETA[(atual + 1) % PALETA.length]
    this.pintar(cor)
    return cor
  }

  /** Volta a peça (ou o modelo) para como era. */
  restaurar(): void {
    this.guardar()
    const p = this.peca
    if (p) Object.assign(p, { pos: [0, 0, 0], giro: [0, 0, 0], escala: 1, cor: null })
    else Object.assign(this.estado, { pos: [0, 0, 0], giro: [0, 0, 0], escala: 1 })
  }

  desfazer(): boolean {
    const e = this.antes.pop()
    if (!e) return false
    this.depois.push(copia(this.estado))
    this.estado = e
    if (this.selecionada >= this.estado.pecas.length || this.peca?.tirada) this.selecionada = -1
    this.emGesto = false
    return true
  }

  refazer(): boolean {
    const e = this.depois.pop()
    if (!e) return false
    this.antes.push(copia(this.estado))
    this.estado = e
    if (this.selecionada >= this.estado.pecas.length || this.peca?.tirada) this.selecionada = -1
    return true
  }

  /** Resumo para a voz: o que mudou desde o original. */
  resumo(): string {
    const ps = this.estado.pecas
    const tiradas = ps.filter((p) => p.tirada).map((p) => p.nome)
    const copias = ps.filter((p, i) => i >= ps.findIndex((x) => x.origem === p.origem) && ps.findIndex((x) => x.origem === p.origem) !== i && !p.tirada).length
    const pintadas = ps.filter((p) => p.cor && !p.tirada).length
    const mexidas = ps.filter((p) => !p.tirada && (p.pos.some((v) => Math.abs(v) > 1e-4) || p.giro.some((v) => Math.abs(v) > 1e-4) || Math.abs(p.escala - 1) > 1e-4)).length
    const partes = [`${this.visiveis} peças na mesa`]
    if (tiradas.length) partes.push(`tiradas: ${tiradas.slice(0, 5).join(', ')}`)
    if (copias) partes.push(`${copias} cópias`)
    if (mexidas) partes.push(`${mexidas} mexidas`)
    if (pintadas) partes.push(`${pintadas} pintadas`)
    return partes.join('; ')
  }
}

// ---------- Matemática para salvar (aplica o estado nos triângulos) ----------

/** Matriz 4 × 4 (coluna por coluna, como no three.js) de giro XYZ + escala + posição em volta de um centro. */
export function matrizDaPeca(centro: Vec3, p: { pos: Vec3; giro: Vec3; escala: number }): number[] {
  const [a, b, c] = p.giro
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c)
  // Rotação na ordem XYZ (a mesma do Euler padrão do three.js)
  const r = [
    cb * cc, ca * sc + sa * sb * cc, sa * sc - ca * sb * cc,
    -cb * sc, ca * cc - sa * sb * sc, sa * cc + ca * sb * sc,
    sb, -sa * cb, ca * cb
  ]
  const s = p.escala
  // x' = R·S·(x − centro) + centro + pos
  const m = [r[0] * s, r[1] * s, r[2] * s, 0, r[3] * s, r[4] * s, r[5] * s, 0, r[6] * s, r[7] * s, r[8] * s, 0, 0, 0, 0, 1]
  const t = [centro[0] + p.pos[0], centro[1] + p.pos[1], centro[2] + p.pos[2]]
  m[12] = t[0] - (m[0] * centro[0] + m[4] * centro[1] + m[8] * centro[2])
  m[13] = t[1] - (m[1] * centro[0] + m[5] * centro[1] + m[9] * centro[2])
  m[14] = t[2] - (m[2] * centro[0] + m[6] * centro[1] + m[10] * centro[2])
  return m
}

export function aplicarMatriz(m: number[], pontos: Float32Array): Float32Array {
  const out = new Float32Array(pontos.length)
  for (let i = 0; i < pontos.length; i += 3) {
    const x = pontos[i], y = pontos[i + 1], z = pontos[i + 2]
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
  return out
}

/** Multiplica duas matrizes 4 × 4 (a · b), coluna por coluna. */
export function multiplicar(a: number[], b: number[]): number[] {
  const r = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k]
  return r
}
