// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Palavra de ativação "Friday", reconhecida 100% no seu PC (Vosk), sem mandar áudio para a internet.
// Só depois de ouvir "Friday" a conversa com o Gemini começa.

import { createModel } from 'vosk-browser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reconhecedor = any

export class PalavraAtivacao {
  private reconhecedor: Reconhecedor = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private modelo: any = null
  private ultimoDisparo = 0
  /** Até quando ignorar o que o reconhecedor ainda tinha na memória (ver reiniciar) */
  private ignorarAte = 0
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
    this.modelo = modelo
    this.criarReconhecedor()
    this.pronto = true
  }

  private criarReconhecedor(): void {
    // Gramática restrita: o reconhecedor só tenta achar "friday", o resto vira [unk]
    const r = new this.modelo.KaldiRecognizer(16000, JSON.stringify(['friday', '[unk]']))
    const checar = (texto: string | undefined) => {
      if (r !== this.reconhecedor || !texto || !/\bfriday\b/i.test(texto)) return
      const agora = performance.now()
      if (agora < this.ignorarAte || agora - this.ultimoDisparo < 2500) return
      this.ultimoDisparo = agora
      this.aoDetectar()
    }
    r.on('partialresult', (m: { result: { partial?: string } }) => checar(m.result.partial))
    r.on('result', (m: { result: { text?: string } }) => { if (m.result.text) this.aoOuvir(m.result.text); checar(m.result.text) })
    this.reconhecedor = r
  }

  /**
   * Zera o reconhecedor. Quando ele ouve "Friday", a conversa começa e ele para de receber áudio
   * no meio da frase; sem zerar, ao voltar ele ainda tinha o "friday" antigo guardado e acordava
   * a FRIDAY de novo logo depois de minimizar ou encerrar.
   */
  reiniciar(): void {
    if (!this.modelo) return
    try { this.reconhecedor?.remove() } catch { /* já removido */ }
    this.criarReconhecedor()
    this.ignorarAte = performance.now() + 600
  }

  alimentar(amostras: Float32Array): void {
    if (!this.reconhecedor) return
    const buffer = new AudioBuffer({ length: amostras.length, sampleRate: 16000, numberOfChannels: 1 })
    buffer.getChannelData(0).set(amostras)
    this.reconhecedor.acceptWaveform(buffer)
  }
}
