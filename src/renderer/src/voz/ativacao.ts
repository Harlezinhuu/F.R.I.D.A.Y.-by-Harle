// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Palavra de ativação "Friday", reconhecida 100% no seu PC (Vosk), sem mandar áudio para a internet.
// Só depois de ouvir "Friday" a conversa com o Gemini começa.

import { createModel } from 'vosk-browser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reconhecedor = any

export class PalavraAtivacao {
  private reconhecedor: Reconhecedor = null
  private ultimoDisparo = 0
  pronto = false
  aoDetectar: () => void = () => {}
  aoOuvir: (texto: string) => void = () => {}

  async carregar(url: string): Promise<void> {
    // O modelo é baixado aqui na página e entregue ao reconhecedor como blob:
    // o worker interno do Vosk não consegue abrir endereços friday-assets:// sozinho
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Não consegui ler o modelo (${resp.status}).`)
    const blob = await resp.blob()
    console.log(`[friday] modelo de ativação lido: ${(blob.size / 1024 / 1024).toFixed(1)} MB`)
    const blobUrl = `${URL.createObjectURL(blob)}#vosk-model-small-en-us-0.15.tar.gz`
    const modelo = await createModel(blobUrl)
    modelo.on?.('error', (m: { error?: string }) => console.error('[friday] erro no modelo de ativação:', m?.error ?? m))
    // Gramática restrita: o reconhecedor só tenta achar "friday", o resto vira [unk]
    this.reconhecedor = new modelo.KaldiRecognizer(16000, JSON.stringify(['friday', '[unk]']))
    const checar = (texto: string | undefined) => {
      if (!texto || !/\bfriday\b/i.test(texto)) return
      const agora = performance.now()
      if (agora - this.ultimoDisparo < 2500) return
      this.ultimoDisparo = agora
      this.aoDetectar()
    }
    this.reconhecedor.on('partialresult', (m: { result: { partial?: string } }) => checar(m.result.partial))
    this.reconhecedor.on('result', (m: { result: { text?: string } }) => { if (m.result.text) this.aoOuvir(m.result.text); checar(m.result.text) })
    this.pronto = true
  }

  alimentar(amostras: Float32Array): void {
    if (!this.reconhecedor) return
    const buffer = new AudioBuffer({ length: amostras.length, sampleRate: 16000, numberOfChannels: 1 })
    buffer.getChannelData(0).set(amostras)
    this.reconhecedor.acceptWaveform(buffer)
  }
}
