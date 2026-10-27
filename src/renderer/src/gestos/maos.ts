// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Controle pelas mãos: a webcam é lida aqui, no seu PC, pelo MediaPipe (Google, licença Apache 2.0).
// Nenhuma imagem sai do computador: só os 21 pontos de cada mão viram comandos da projeção.
// A câmera só liga quando você pede e desliga sozinha depois de um tempo sem ver mãos.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { Gestos, pose, type Comando, type Ponto, type Pose } from './gestos'

/** Ligações entre os pontos da mão, para desenhar o esqueleto na prévia da câmera. */
const OSSOS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
]
const NOME_POSE: Record<Pose, string> = { aberta: 'MÃO ABERTA', fechada: 'SEGURANDO', pinca: 'PINÇA', aponta: 'MIRA', outra: '—' }
/** Sem mãos por este tempo, a câmera desliga sozinha */
const DESLIGA_SEM_MAOS_MS = 90_000

export class Maos {
  private detector: HandLandmarker | null = null
  private stream: MediaStream | null = null
  private raf = 0
  private ultimoQuadro = -1
  private viuMaoEm = 0
  private gestos = new Gestos()
  ligada = false
  aoComandos: (c: Comando[]) => void = () => {}
  aoDesligarSozinha: () => void = () => {}

  constructor(private caixa: HTMLElement, private video: HTMLVideoElement, private tela: HTMLCanvasElement, private status: HTMLElement) {}

  async ligar(wasmUrl: string, modeloUrl: string): Promise<void> {
    if (this.ligada) return
    if (!this.detector) {
      const arquivos = await FilesetResolver.forVisionTasks(wasmUrl)
      const resp = await fetch(modeloUrl)
      if (!resp.ok) throw new Error('Não achei o modelo das mãos. Rode o instalador de novo (npm run modelo).')
      const modelo = new Uint8Array(await resp.arrayBuffer())
      const opcoes = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetBuffer: modelo, delegate },
        runningMode: 'VIDEO' as const,
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5
      })
      try {
        this.detector = await HandLandmarker.createFromOptions(arquivos, opcoes('GPU'))
      } catch (e) {
        console.warn('[maos] sem GPU para as mãos, usando o processador:', (e as Error).message)
        this.detector = await HandLandmarker.createFromOptions(arquivos, opcoes('CPU'))
      }
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false })
    } catch (e) {
      const nome = (e as DOMException).name
      throw new Error(nome === 'NotFoundError' ? 'Não achei nenhuma câmera ligada no PC.' : nome === 'NotAllowedError' ? 'O Windows bloqueou a câmera. Libere em Configurações > Privacidade > Câmera.' : `A câmera não abriu (${nome}).`)
    }
    this.video.srcObject = this.stream
    await this.video.play()
    this.ligada = true
    this.viuMaoEm = performance.now()
    this.gestos = new Gestos()
    this.caixa.hidden = false
    this.raf = requestAnimationFrame(this.quadro)
    console.log('[maos] câmera ligada')
  }

  desligar(): void {
    cancelAnimationFrame(this.raf)
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    this.stream = null
    this.video.srcObject = null
    this.caixa.hidden = true
    if (this.ligada) console.log('[maos] câmera desligada')
    this.ligada = false
  }

  private quadro = (): void => {
    if (!this.ligada) return
    this.raf = requestAnimationFrame(this.quadro)
    const v = this.video
    if (!this.detector || v.readyState < 2 || v.currentTime === this.ultimoQuadro) return
    this.ultimoQuadro = v.currentTime
    const agora = performance.now()
    const r = this.detector.detectForVideo(v, agora)
    // Espelhado, como num espelho: mover a mão para a direita move para a direita na tela
    const maos: Ponto[][] = (r.landmarks ?? []).map((m) => m.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })))
    if (maos.length) this.viuMaoEm = agora
    else if (agora - this.viuMaoEm > DESLIGA_SEM_MAOS_MS) { this.desligar(); this.aoDesligarSozinha(); return }
    this.desenhar(maos)
    const cmds = this.gestos.atualizar(maos, agora)
    if (cmds.length) this.aoComandos(cmds)
  }

  /** Prévia no canto: o esqueleto das mãos por cima da imagem da câmera. */
  private desenhar(maos: Ponto[][]): void {
    const c = this.tela, g = c.getContext('2d')
    if (!g) return
    if (c.width !== c.clientWidth) { c.width = c.clientWidth; c.height = c.clientHeight }
    g.clearRect(0, 0, c.width, c.height)
    const cor = getComputedStyle(this.caixa).getPropertyValue('--state').trim() || '#6FB8FF'
    g.strokeStyle = cor
    g.fillStyle = '#EAF4FF'
    g.lineWidth = 1.5
    for (const m of maos) {
      g.beginPath()
      for (const [a, b] of OSSOS) { g.moveTo(m[a].x * c.width, m[a].y * c.height); g.lineTo(m[b].x * c.width, m[b].y * c.height) }
      g.stroke()
      for (const p of m) { g.beginPath(); g.arc(p.x * c.width, p.y * c.height, 2, 0, Math.PI * 2); g.fill() }
    }
    this.status.textContent = maos.length ? maos.map((m) => NOME_POSE[pose(m)]).join(' · ') : 'PROCURANDO AS MÃOS'
  }
}
