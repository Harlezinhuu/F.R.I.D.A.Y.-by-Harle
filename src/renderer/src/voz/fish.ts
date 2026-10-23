// Fala pelo Fish Audio: o texto que o Gemini vai gerando é cortado em frases,
// e cada frase vira áudio assim que fica completa. A primeira frase começa a tocar
// enquanto o resto da resposta ainda está chegando.

import { cortarFrases } from './frases'

export class FalaFish {
  private buffer = ''
  private fila: string[] = []
  private processando = false
  private geracao = 0
  private seq = 0
  private idsValidos = new Set<number>()

  aoAudio: (b64: string, taxa: number) => void = () => {}
  aoErro: (msg: string) => void = () => {}

  constructor() {
    window.friday.aoFishAudio((id, b64, taxa) => {
      if (this.idsValidos.has(id)) this.aoAudio(b64, taxa)
    })
  }

  /** Há frases sendo geradas ou esperando na fila. */
  get ocupado(): boolean {
    return this.processando || this.fila.length > 0 || this.buffer.trim().length > 0
  }

  /** Pedaço novo do texto da resposta. */
  adicionar(texto: string): void {
    const { frases, resto } = cortarFrases(this.buffer + texto)
    this.buffer = resto
    this.fila.push(...frases)
    void this.processar()
  }

  /** A resposta terminou: fala o que sobrou. */
  finalizar(): void {
    const resto = this.buffer.trim()
    this.buffer = ''
    if (resto) this.fila.push(resto)
    void this.processar()
  }

  /** Você interrompeu: descarta tudo. */
  cancelar(): void {
    this.geracao++
    this.buffer = ''
    this.fila = []
    this.idsValidos.clear()
    window.friday.fishCancelar()
  }

  private async processar(): Promise<void> {
    if (this.processando) return
    this.processando = true
    const minha = this.geracao
    try {
      while (this.fila.length && minha === this.geracao) {
        const frase = this.fila.shift()!
        const id = ++this.seq
        this.idsValidos.add(id)
        const r = await window.friday.fishFalar(id, frase)
        this.idsValidos.delete(id)
        if (!r.ok && minha === this.geracao) { this.aoErro(r.erro ?? 'Erro no Fish Audio.'); this.cancelar() }
      }
    } finally {
      this.processando = false
      // Se algo chegou na fila enquanto terminava, continua
      if (this.fila.length && minha === this.geracao) void this.processar()
    }
  }
}
