// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ouvido do modo reserva: entende português sem internet (Vosk, no seu PC). Só é carregado quando a
// internet cai; com internet, quem ouve é o Gemini.

import { createModel } from 'vosk-browser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Qualquer = any

export class OuvidoReserva {
  private modelo: Qualquer = null
  private reconhecedor: Qualquer = null
  private carregando: Promise<void> | null = null
  pronto = false
  /** O que ela está ouvindo agora (vai mudando enquanto você fala) */
  aoParcial: (texto: string) => void = () => {}
  /** Você terminou uma frase */
  aoFrase: (texto: string) => void = () => {}

  carregar(url: string): Promise<void> {
    if (this.pronto) return Promise.resolve()
    this.carregando ??= (async () => {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`Não consegui ler o ouvido em português (${resp.status}).`)
      const blob = await resp.blob()
      const modelo = await createModel(`${URL.createObjectURL(blob)}#vosk-model-small-pt-0.3.tar.gz`)
      this.modelo = modelo
      this.criar()
      this.pronto = true
    })().catch((e) => { this.carregando = null; throw e })
    return this.carregando
  }

  private criar(): void {
    const r = new this.modelo.KaldiRecognizer(16000)
    r.on('partialresult', (m: { result: { partial?: string } }) => { if (r === this.reconhecedor && m.result.partial) this.aoParcial(m.result.partial) })
    r.on('result', (m: { result: { text?: string } }) => { const t = (m.result.text ?? '').trim(); if (r === this.reconhecedor && t) this.aoFrase(t) })
    this.reconhecedor = r
  }

  /** Esquece o que estava ouvindo (depois de ela falar, para não ouvir a própria voz). */
  reiniciar(): void {
    if (!this.modelo) return
    try { this.reconhecedor?.remove() } catch { /* já removido */ }
    this.criar()
  }

  alimentar(amostras: Float32Array): void {
    if (!this.reconhecedor) return
    const buffer = new AudioBuffer({ length: amostras.length, sampleRate: 16000, numberOfChannels: 1 })
    buffer.getChannelData(0).set(amostras)
    this.reconhecedor.acceptWaveform(buffer)
  }
}
