// Fala pelo Fish Audio: o texto que o Gemini vai gerando é cortado em frases,
// e cada frase vira áudio assim que fica completa. A primeira frase começa a tocar
// enquanto o resto da resposta ainda está chegando.

const FIM_DE_FRASE = /([.!?…]+["')\]]?\s+|\n+)/

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
    this.buffer += texto
    for (;;) {
      const m = this.buffer.match(FIM_DE_FRASE)
      if (!m || m.index === undefined) break
      const corte = m.index + m[0].length
      const frase = this.buffer.slice(0, corte).trim()
      this.buffer = this.buffer.slice(corte)
      // Frases muito curtas ("Ok.") esperam a próxima para soar mais natural
      if (frase.length < 12 && this.buffer.length < 200) { this.buffer = `${frase} ${this.buffer}`; break }
      if (frase) this.fila.push(frase)
    }
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
