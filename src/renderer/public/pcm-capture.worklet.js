// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Captura do microfone em blocos de 40 ms (640 amostras a 16 kHz), com o nível (RMS) de cada bloco.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(640)
    this.n = 0
  }

  process(inputs) {
    const canal = inputs[0] && inputs[0][0]
    if (!canal) return true
    for (let i = 0; i < canal.length; i++) {
      this.buf[this.n++] = canal[i]
      if (this.n === this.buf.length) {
        let soma = 0
        for (let j = 0; j < this.n; j++) soma += this.buf[j] * this.buf[j]
        const amostras = this.buf.slice(0)
        this.port.postMessage({ amostras, rms: Math.sqrt(soma / this.n) }, [amostras.buffer])
        this.n = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
