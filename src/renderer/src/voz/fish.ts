// Fala pelo Fish Audio: o texto que o Gemini vai gerando é cortado em pedaços,
// e cada pedaço vira áudio assim que fica pronto.
//
// Para começar a falar rápido:
// - o primeiro pedaço sai na primeira vírgula, sem esperar a frase inteira;
// - até 2 pedaços são gerados ao mesmo tempo, e o áudio sai sempre na ordem certa.

import { cortarFrases, cortarPrimeiro } from './frases'

const SIMULTANEOS = 2

interface Pedaco {
  id: number
  texto: string
  pedaços: { b64: string; taxa: number }[]
  pedido: boolean
  terminou: boolean
  primeiro: boolean
}

export class FalaFish {
  private buffer = ''
  private primeiroDoTurno = true
  private fila: Pedaco[] = []
  private geracao = 0
  private seq = 0

  aoAudio: (b64: string, taxa: number) => void = () => {}
  aoErro: (msg: string) => void = () => {}
  /** Para medir a demora: chamado quando o primeiro pedaço do turno é enviado ao Fish. */
  aoPrimeiroPedido: () => void = () => {}

  constructor() {
    window.friday.aoFishAudio((id, b64, taxa) => {
      const p = this.fila.find((x) => x.id === id)
      if (!p) return
      if (p === this.fila[0]) this.aoAudio(b64, taxa)
      else p.pedaços.push({ b64, taxa })
    })
  }

  /** Há pedaços sendo gerados, esperando ou texto ainda incompleto. */
  get ocupado(): boolean {
    return this.fila.length > 0 || this.buffer.trim().length > 0
  }

  /** Pedaço novo do texto da resposta. */
  adicionar(texto: string): void {
    this.buffer += texto
    if (this.primeiroDoTurno) {
      const { pedaco, resto } = cortarPrimeiro(this.buffer)
      if (!pedaco) return
      this.primeiroDoTurno = false
      this.buffer = resto
      this.enfileirar(pedaco, true)
    }
    const { frases, resto } = cortarFrases(this.buffer)
    this.buffer = resto
    for (const f of frases) this.enfileirar(f)
  }

  /** A resposta terminou: fala o que sobrou e prepara o próximo turno. */
  finalizar(): void {
    const resto = this.buffer.trim()
    this.buffer = ''
    const eraPrimeiro = this.primeiroDoTurno
    this.primeiroDoTurno = true
    if (resto) this.enfileirar(resto, eraPrimeiro)
  }

  /** Você interrompeu: descarta tudo. */
  cancelar(): void {
    this.geracao++
    this.buffer = ''
    this.primeiroDoTurno = true
    this.fila = []
    window.friday.fishCancelar()
  }

  private enfileirar(texto: string, primeiro = false): void {
    this.fila.push({ id: ++this.seq, texto, pedaços: [], pedido: false, terminou: false, primeiro })
    this.pedirProximos()
  }

  private pedirProximos(): void {
    const minha = this.geracao
    const emAndamento = this.fila.filter((p) => p.pedido && !p.terminou).length
    const livres = this.fila.filter((p) => !p.pedido).slice(0, Math.max(0, SIMULTANEOS - emAndamento))
    for (const p of livres) {
      p.pedido = true
      if (p.primeiro) this.aoPrimeiroPedido()
      window.friday.fishFalar(p.id, p.texto).then((r) => {
        if (minha !== this.geracao) return
        p.terminou = true
        if (!r.ok) { this.aoErro(r.erro ?? 'Erro no Fish Audio.'); this.cancelar(); return }
        this.avancar()
        this.pedirProximos()
      })
    }
  }

  /** Quando o pedaço da frente termina, solta o áudio já recebido dos seguintes, em ordem. */
  private avancar(): void {
    while (this.fila[0]?.terminou) {
      this.fila.shift()
      const prox = this.fila[0]
      if (!prox) break
      for (const a of prox.pedaços.splice(0)) this.aoAudio(a.b64, a.taxa)
    }
  }
}
