// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Gestos do editor de hologramas, com uma mão só (a outra segura o celular):
//
// Apontar com o indicador ......... cursor: parar em cima de uma peça seleciona
// Pinça (polegar + indicador) ...... pega a peça (ou o modelo) e arrasta; abrir os dedos solta
// Duas pinças rápidas .............. toque duplo (seleciona ou solta a seleção)
// Mão fechada movendo .............. gira a peça selecionada (ou o modelo)
// Tapa rápido com a mão aberta ..... joga a peça selecionada fora
//
// Recebe os 21 pontos de cada mão (0 a 1, na imagem da câmera) e devolve eventos.

import { centro, pose, tamanhoMao, type Ponto, type Pose } from './gestos.ts'

export type EventoOficina =
  | { tipo: 'cursor'; x: number; y: number }
  | { tipo: 'pegar'; x: number; y: number }
  | { tipo: 'arrastar'; x: number; y: number; dx: number; dy: number }
  | { tipo: 'soltar' }
  | { tipo: 'girar'; dx: number; dy: number }
  | { tipo: 'jogar_fora'; direcao: number }
  | { tipo: 'toque_duplo'; x: number; y: number }
  | { tipo: 'sem_mao' }

const GIRO_POR_TELA = 6

export class GestosOficina {
  private segurando = false
  private quadrosPinca = 0
  private quadrosSemPinca = 0
  private ultimaPinca: Ponto | null = null
  private ultimoPunho: Ponto | null = null
  private rastro: { t: number; x: number }[] = []
  private esperaTapa = 0
  private pincas: { t: number; x: number; y: number }[] = []
  private esperaToque = 0
  private viuMao = true
  ultimaPose: Pose | 'nenhuma' = 'nenhuma'

  atualizar(maos: Ponto[][], t: number): EventoOficina[] {
    // A mão maior na imagem é a que está mais perto da câmera
    const m = maos.filter((x) => x.length >= 21).sort((a, b) => tamanhoMao(b) - tamanhoMao(a))[0]
    const out: EventoOficina[] = []
    if (!m) {
      if (this.segurando) out.push({ tipo: 'soltar' })
      if (this.viuMao) out.push({ tipo: 'sem_mao' })
      this.segurando = false
      this.quadrosPinca = 0
      this.ultimaPinca = this.ultimoPunho = null
      this.rastro = []
      this.viuMao = false
      this.ultimaPose = 'nenhuma'
      return out
    }
    this.viuMao = true
    const p = pose(m)
    this.ultimaPose = p
    const pinca = { x: (m[4].x + m[8].x) / 2, y: (m[4].y + m[8].y) / 2 }

    // Pinça com folga: 2 quadros para pegar, 3 sem pinça para soltar (a detecção pisca)
    if (p === 'pinca') { this.quadrosPinca++; this.quadrosSemPinca = 0 } else { this.quadrosSemPinca++; if (this.quadrosSemPinca >= 3) this.quadrosPinca = 0 }
    if (!this.segurando && this.quadrosPinca === 2) {
      this.segurando = true
      this.ultimaPinca = pinca
      out.push({ tipo: 'pegar', x: pinca.x, y: pinca.y })
      // Toque duplo: duas pinças seguidas quase no mesmo lugar
      this.pincas = [...this.pincas.filter((x) => t - x.t <= 750), { t, x: pinca.x, y: pinca.y }]
      const [a, b] = this.pincas.slice(-2)
      if (a && b && a !== b && t >= this.esperaToque && Math.hypot(b.x - a.x, b.y - a.y) < 0.07) {
        out.push({ tipo: 'toque_duplo', x: b.x, y: b.y })
        this.pincas = []
        this.esperaToque = t + 900
      }
    } else if (this.segurando && p === 'pinca' && this.ultimaPinca) {
      const dx = pinca.x - this.ultimaPinca.x, dy = pinca.y - this.ultimaPinca.y
      if (Math.abs(dx) > 0.0015 || Math.abs(dy) > 0.0015) {
        // Suaviza o tremido
        const s = { x: this.ultimaPinca.x + dx * 0.6, y: this.ultimaPinca.y + dy * 0.6 }
        out.push({ tipo: 'arrastar', x: s.x, y: s.y, dx: s.x - this.ultimaPinca.x, dy: s.y - this.ultimaPinca.y })
        this.ultimaPinca = s
      }
    } else if (this.segurando && this.quadrosPinca === 0) {
      this.segurando = false
      this.ultimaPinca = null
      out.push({ tipo: 'soltar' })
    }

    if (p === 'aponta') out.push({ tipo: 'cursor', x: m[8].x, y: m[8].y })

    // Mão fechada: gira
    const c = centro(m)
    if (p === 'fechada') {
      if (this.ultimoPunho) {
        const dx = c.x - this.ultimoPunho.x, dy = c.y - this.ultimoPunho.y
        if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) out.push({ tipo: 'girar', dx: dx * GIRO_POR_TELA, dy: dy * GIRO_POR_TELA * 0.6 })
      }
      this.ultimoPunho = c
    } else this.ultimoPunho = null

    // Tapa: mão aberta atravessando rápido para o lado
    if (p === 'aberta') {
      this.rastro = [...this.rastro.filter((r) => t - r.t <= 220), { t, x: c.x }]
      const r0 = this.rastro[0]
      if (r0 && t - r0.t > 70 && t >= this.esperaTapa) {
        const vx = (c.x - r0.x) / ((t - r0.t) / 1000)
        if (Math.abs(vx) > 2.2) { out.push({ tipo: 'jogar_fora', direcao: Math.sign(vx) }); this.esperaTapa = t + 1200; this.rastro = [] }
      }
    } else this.rastro = []
    return out
  }
}
