// Entrada (microfone a 16 kHz) e saída (voz da FRIDAY a 24 kHz) de áudio.

export function pcm16Base64(f: Float32Array): string {
  const bytes = new Uint8Array(f.length * 2)
  const v = new DataView(bytes.buffer)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]))
    v.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export class Microfone {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  aoBloco: (amostras: Float32Array, rms: number) => void = () => {}
  aoPerder: () => void = () => {}

  async iniciar(): Promise<void> {
    this.parar()
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    this.ctx = new AudioContext({ sampleRate: 16000 })
    await this.ctx.audioWorklet.addModule('./pcm-capture.worklet.js')
    const fonte = this.ctx.createMediaStreamSource(this.stream)
    const no = new AudioWorkletNode(this.ctx, 'pcm-capture')
    no.port.onmessage = (e: MessageEvent<{ amostras: Float32Array; rms: number }>) => this.aoBloco(e.data.amostras, e.data.rms)
    // Ligado a um ganho zero só para o navegador continuar processando o nó
    const mudo = this.ctx.createGain()
    mudo.gain.value = 0
    fonte.connect(no).connect(mudo).connect(this.ctx.destination)
    for (const t of this.stream.getAudioTracks()) t.onended = () => this.aoPerder()
  }

  parar(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close().catch(() => {})
    this.stream = null
    this.ctx = null
  }
}

export class Alto {
  private ctx = new AudioContext({ sampleRate: 24000 })
  private analisador = this.ctx.createAnalyser()
  private fontes = new Set<AudioBufferSourceNode>()
  private fim = 0
  private dados = new Float32Array(1024)

  constructor() {
    this.analisador.fftSize = 1024
    this.analisador.connect(this.ctx.destination)
  }

  /** Recebe um pedaço de áudio PCM 16 bits a 24 kHz em base64 e toca na sequência. */
  enfileirar(b64: string): void {
    if (this.ctx.state === 'suspended') this.ctx.resume()
    const bin = atob(b64)
    const n = bin.length >> 1
    const buffer = this.ctx.createBuffer(1, n, 24000)
    const canal = buffer.getChannelData(0)
    for (let i = 0; i < n; i++) {
      let s = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)
      if (s >= 0x8000) s -= 0x10000
      canal[i] = s / 0x8000
    }
    const fonte = this.ctx.createBufferSource()
    fonte.buffer = buffer
    fonte.connect(this.analisador)
    const inicio = Math.max(this.ctx.currentTime + 0.02, this.fim)
    fonte.start(inicio)
    this.fim = inicio + buffer.duration
    this.fontes.add(fonte)
    fonte.onended = () => this.fontes.delete(fonte)
  }

  /** Para tudo na hora (quando você interrompe a FRIDAY). */
  limpar(): void {
    for (const f of this.fontes) { try { f.stop() } catch { /* já parou */ } }
    this.fontes.clear()
    this.fim = 0
  }

  get tocando(): boolean {
    return this.ctx.currentTime < this.fim - 0.01
  }

  nivel(): number {
    this.analisador.getFloatTimeDomainData(this.dados)
    let soma = 0
    for (const v of this.dados) soma += v * v
    return Math.sqrt(soma / this.dados.length)
  }
}
