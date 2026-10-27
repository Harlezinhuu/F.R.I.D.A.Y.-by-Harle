// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Gestos das mãos → comandos da projeção. Recebe os 21 pontos de cada mão (já espelhados,
// como num espelho) e devolve o que fazer. Sem dependências, para ter testes.
//
// Mão fechada e mover ............ segura e gira o holograma
// Pinça (polegar + indicador) .... sobe e desce: aproxima e afasta
// Duas mãos fechadas ............. afastar/aproximar as mãos muda o tamanho
// Duas mãos abertas se afastando . explode as peças; se juntando, monta de novo
// Indicador apontando ............ mira; parar em cima de uma peça seleciona
// Mão aberta num tapa rápido ..... arremessa o holograma para fora (fecha)

export interface Ponto { x: number; y: number; z?: number }
export type Pose = 'aberta' | 'fechada' | 'pinca' | 'aponta' | 'outra'

export type Comando =
  | { tipo: 'girar'; dx: number; dy: number }
  | { tipo: 'escalar'; fator: number }
  | { tipo: 'explodir' }
  | { tipo: 'juntar' }
  | { tipo: 'arremessar'; direcao: number }
  | { tipo: 'mira'; x: number; y: number }

const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)

/** Tamanho da mão (pulso até a base do dedo médio): deixa tudo independente da distância da câmera. */
export const tamanhoMao = (m: Ponto[]): number => Math.max(dist(m[0], m[9]), 1e-4)

/** Centro da palma (média do pulso e das bases dos dedos). */
export function centro(m: Ponto[]): Ponto {
  const ids = [0, 5, 9, 13, 17]
  return { x: ids.reduce((s, i) => s + m[i].x, 0) / ids.length, y: ids.reduce((s, i) => s + m[i].y, 0) / ids.length }
}

/** Dedo esticado: a ponta está bem mais longe do pulso que a junta do meio. */
function esticado(m: Ponto[], ponta: number, junta: number): boolean {
  return dist(m[0], m[ponta]) > dist(m[0], m[junta]) * 1.12
}

export function pose(m: Ponto[]): Pose {
  if (m.length < 21) return 'outra'
  const t = tamanhoMao(m)
  const indicador = esticado(m, 8, 6), medio = esticado(m, 12, 10), anelar = esticado(m, 16, 14), minimo = esticado(m, 20, 18)
  const n = [indicador, medio, anelar, minimo].filter(Boolean).length
  if (dist(m[4], m[8]) / t < 0.3 && !medio) return 'pinca'
  if (n >= 4) return 'aberta'
  if (n === 0) return 'fechada'
  if (indicador && !medio && !anelar && !minimo) return 'aponta'
  return 'outra'
}

interface Rastro { t: number; x: number; y: number }

/** Motor de gestos: chame `atualizar` a cada quadro da câmera com as mãos vistas. */
export class Gestos {
  private ant: { pose: Pose; c: Ponto; pinca: Ponto }[] = []
  private distAnt = 0
  private historicoDuas: { t: number; d: number }[] = []
  private rastro: Rastro[] = []
  private esperaAte = 0
  private suave: Ponto[] = []

  /** Quanto o holograma gira quando a mão atravessa a câmera inteira (radianos). */
  static readonly GIRO_POR_TELA = 7
  static readonly MOVIMENTO_MINIMO = 0.0025

  atualizar(maos: Ponto[][], t: number): Comando[] {
    // Ordem fixa (da esquerda para a direita) para comparar cada mão com ela mesma no quadro anterior
    const lista = maos.filter((m) => m.length >= 21).sort((a, b) => centro(a).x - centro(b).x).slice(0, 2)
    const atual = lista.map((m, i) => {
      // Suaviza o tremido natural da mão
      const c = centro(m)
      const s = this.suave[i] && this.ant.length === lista.length ? { x: this.suave[i].x * 0.5 + c.x * 0.5, y: this.suave[i].y * 0.5 + c.y * 0.5 } : c
      this.suave[i] = s
      return { pose: pose(m), c: s, pinca: { x: (m[4].x + m[8].x) / 2, y: (m[4].y + m[8].y) / 2 }, ponta: m[8] }
    })
    const out: Comando[] = []
    const mesmaQtd = this.ant.length === atual.length

    if (atual.length === 1) {
      const a = atual[0], p = mesmaQtd ? this.ant[0] : null
      if (a.pose === 'fechada' && p?.pose === 'fechada') {
        const dx = a.c.x - p.c.x, dy = a.c.y - p.c.y
        if (Math.abs(dx) > Gestos.MOVIMENTO_MINIMO || Math.abs(dy) > Gestos.MOVIMENTO_MINIMO) out.push({ tipo: 'girar', dx: dx * Gestos.GIRO_POR_TELA, dy: dy * Gestos.GIRO_POR_TELA * 0.6 })
      }
      if (a.pose === 'pinca' && p?.pose === 'pinca') {
        const dy = a.pinca.y - p.pinca.y
        // Subir a pinça aproxima; descer afasta
        if (Math.abs(dy) > Gestos.MOVIMENTO_MINIMO) out.push({ tipo: 'escalar', fator: Math.exp(-dy * 3) })
      }
      if (a.pose === 'aponta') out.push({ tipo: 'mira', x: a.ponta.x, y: a.ponta.y })
      // Tapa: mão aberta atravessando rápido para o lado
      if (a.pose === 'aberta') {
        this.rastro.push({ t, x: a.c.x, y: a.c.y })
        this.rastro = this.rastro.filter((r) => t - r.t <= 220)
        const r0 = this.rastro[0]
        if (r0 && t - r0.t > 80 && t >= this.esperaAte) {
          const vx = (a.c.x - r0.x) / ((t - r0.t) / 1000)
          if (Math.abs(vx) > 2.4) { out.push({ tipo: 'arremessar', direcao: Math.sign(vx) }); this.esperaAte = t + 1500; this.rastro = [] }
        }
      } else this.rastro = []
    } else this.rastro = []

    if (atual.length === 2) {
      const [a, b] = atual
      const d = Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y)
      if (a.pose === 'fechada' && b.pose === 'fechada' && mesmaQtd && this.ant[0].pose === 'fechada' && this.ant[1].pose === 'fechada' && this.distAnt > 0.02) {
        const fator = d / this.distAnt
        if (Math.abs(fator - 1) > 0.006) out.push({ tipo: 'escalar', fator: Math.min(1.25, Math.max(0.8, fator)) })
      }
      // Abrir os braços com as mãos abertas: explode; fechar: junta
      if (a.pose === 'aberta' && b.pose === 'aberta') {
        this.historicoDuas.push({ t, d })
        this.historicoDuas = this.historicoDuas.filter((h) => t - h.t <= 700)
        const h0 = this.historicoDuas[0]
        if (h0 && t >= this.esperaAte) {
          if (d - h0.d > 0.2 && d > 0.42) { out.push({ tipo: 'explodir' }); this.esperaAte = t + 1200; this.historicoDuas = [] }
          else if (h0.d - d > 0.2 && d < 0.38) { out.push({ tipo: 'juntar' }); this.esperaAte = t + 1200; this.historicoDuas = [] }
        }
      } else this.historicoDuas = []
      this.distAnt = d
    } else { this.historicoDuas = []; this.distAnt = 0 }

    this.ant = atual.map(({ pose: ps, c, pinca }) => ({ pose: ps, c, pinca }))
    return out
  }
}
