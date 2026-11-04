// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Modo sentinela: a conta do movimento. Compara duas imagens pequenas em tons de cinza e diz
// quanto da cena mudou; uma mudança grande em dois quadros seguidos é alguém na frente do PC.
// (Mudança de luz no quarto inteiro, como uma nuvem passando, é descontada pela média.)

/** Converte RGBA em cinza (um byte por pixel). */
export function cinza(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8
  return out
}

/**
 * Fração (0 a 1) dos pixels que mudaram mais que `limiar` entre `a` e `b`,
 * depois de tirar a diferença média de brilho (a luz do quarto mudando inteira).
 */
export function mudanca(a: Uint8Array, b: Uint8Array, limiar = 30): number {
  if (a.length !== b.length || !a.length) return 0
  let soma = 0
  for (let i = 0; i < a.length; i++) soma += b[i] - a[i]
  const media = soma / a.length
  let mudou = 0
  for (let i = 0; i < a.length; i++) if (Math.abs(b[i] - a[i] - media) > limiar) mudou++
  return mudou / a.length
}

/** Decide se dispara: mudança acima de `minimo` em `seguidos` quadros seguidos. */
export class DetectorDeMovimento {
  private anterior: Uint8Array | null = null
  private seguidosAgora = 0
  private readonly minimo: number
  private readonly seguidos: number
  constructor(minimo = 0.05, seguidos = 2) {
    this.minimo = minimo
    this.seguidos = seguidos
  }

  /** Recebe o quadro novo (cinza) e diz se tem alguém se mexendo. */
  quadro(atual: Uint8Array): boolean {
    const a = this.anterior
    this.anterior = atual
    if (!a) return false
    this.seguidosAgora = mudanca(a, atual) >= this.minimo ? this.seguidosAgora + 1 : 0
    return this.seguidosAgora >= this.seguidos
  }

  reiniciar(): void { this.anterior = null; this.seguidosAgora = 0 }
}
