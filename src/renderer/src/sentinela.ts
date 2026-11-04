// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Modo sentinela: com você fora, ela vigia pela webcam. A imagem é analisada só aqui, em tamanho
// mínimo (64 × 48); quando alguém aparece, ela tira uma foto e quem decide o que fazer é o HUD
// (reconhecer o dono, ou guardar a foto e avisar no celular). Nada vai para a internet.

import { DetectorDeMovimento, cinza } from '../../shared/sentinela'

export class Sentinela {
  private camera: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private relogio = 0
  private detector = new DetectorDeMovimento()
  private ocupada = false
  private pausaAte = 0
  ligadaEm = 0

  constructor(private aoVerAlguem: (foto: HTMLCanvasElement) => Promise<'continuar' | 'parar'>) {}

  get ativa(): boolean { return !!this.camera }

  async ligar(): Promise<void> {
    if (this.camera) return
    this.camera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = this.camera
    await v.play()
    this.video = v
    this.ligadaEm = Date.now()
    // Dá 20 segundos para você sair da frente da câmera
    this.pausaAte = Date.now() + 20_000
    this.detector.reiniciar()
    const pequeno = document.createElement('canvas')
    pequeno.width = 64
    pequeno.height = 48
    const ctx = pequeno.getContext('2d', { willReadFrequently: true })!
    this.relogio = window.setInterval(() => {
      if (!this.video || this.ocupada || Date.now() < this.pausaAte) return
      ctx.drawImage(this.video, 0, 0, 64, 48)
      if (!this.detector.quadro(cinza(ctx.getImageData(0, 0, 64, 48).data))) return
      void this.disparar()
    }, 500)
  }

  private async disparar(): Promise<void> {
    if (!this.video) return
    this.ocupada = true
    try {
      // Meio segundo a mais: a pessoa já entrou no quadro
      await new Promise((r) => setTimeout(r, 600))
      const foto = document.createElement('canvas')
      foto.width = this.video.videoWidth || 640
      foto.height = this.video.videoHeight || 480
      foto.getContext('2d')!.drawImage(this.video, 0, 0, foto.width, foto.height)
      const r = await this.aoVerAlguem(foto)
      if (r === 'parar') this.desligar()
      // Um alerta por minuto, no máximo
      else this.pausaAte = Date.now() + 60_000
      this.detector.reiniciar()
    } finally {
      this.ocupada = false
    }
  }

  desligar(): void {
    clearInterval(this.relogio)
    this.camera?.getTracks().forEach((t) => t.stop())
    this.camera = null
    this.video = null
    this.ligadaEm = 0
  }
}
