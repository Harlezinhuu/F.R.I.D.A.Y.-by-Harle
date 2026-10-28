// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Olhos do reconhecimento facial: abre a webcam por um instante, acha o rosto e tira a assinatura
// dele com o Human (modelos faceres, antispoof e liveness), tudo no próprio PC. Nenhuma imagem é
// guardada nem sai do computador: só a assinatura numérica, e só quando a pessoa aceita cadastrar.

export interface Analise {
  descritor: number[]
  /** 0 a 1: parece um rosto de verdade (não foto/tela) */
  real: number
  /** 0 a 1: parece vivo (não imagem parada) */
  vivo: number
  confianca: number
  /** largura do rosto em pixels (rosto pequeno = longe demais) */
  largura: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HumanQualquer = any

export class Rostos {
  private human: HumanQualquer = null
  private carregando: Promise<void> | null = null

  constructor(private modelos: string) {}

  get pronto(): boolean { return !!this.human }

  /** Carrega os modelos (uns 10 MB, só na primeira vez que precisa). */
  carregar(): Promise<void> {
    this.carregando ??= (async () => {
      const H = await import('@vladmandic/human')
      const h = new H.Human({
        modelBasePath: this.modelos,
        backend: 'webgl',
        debug: false,
        cacheSensitivity: 0,
        filter: { enabled: true, equalization: true },
        face: {
          enabled: true,
          detector: { rotation: true, maxDetected: 3, minConfidence: 0.5 },
          mesh: { enabled: true },
          iris: { enabled: false },
          description: { enabled: true },
          emotion: { enabled: false },
          antispoof: { enabled: true },
          liveness: { enabled: true },
          attention: { enabled: false }
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false }
      })
      await h.load()
      await h.warmup()
      this.human = h
    })()
    return this.carregando
  }

  /** Analisa uma imagem ou um quadro de vídeo: fica com o maior rosto (o mais perto). */
  async analisar(fonte: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<Analise | null> {
    await this.carregar()
    const r = await this.human.detect(fonte)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rostos = (r.face as any[]).filter((f) => f.embedding?.length && (f.score ?? 0) >= 0.6)
    if (!rostos.length) return null
    const f = rostos.sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])[0]
    return { descritor: Array.from(f.embedding as number[]), real: f.real ?? 0, vivo: f.live ?? 0, confianca: f.score ?? 0, largura: f.size?.[0] ?? 0 }
  }

  /**
   * Abre a webcam, junta até `quantas` análises boas em até `ateMs` e fecha a câmera.
   * `video`: um elemento para mostrar a prévia (no cadastro); sem ele, a câmera fica escondida.
   */
  async olhar(quantas: number, ateMs: number, video?: HTMLVideoElement, aoAnalisar?: (feitas: number) => void): Promise<Analise[]> {
    await this.carregar()
    const camera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
    const v = video ?? document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = camera
    const saida: Analise[] = []
    try {
      await v.play()
      const fim = performance.now() + ateMs
      while (saida.length < quantas && performance.now() < fim) {
        const a = await this.analisar(v)
        if (a && a.largura >= 80) { saida.push(a); aoAnalisar?.(saida.length) }
        await new Promise((ok) => setTimeout(ok, 120))
      }
    } finally {
      camera.getTracks().forEach((t) => t.stop())
      if (!video) v.srcObject = null
    }
    return saida
  }
}
