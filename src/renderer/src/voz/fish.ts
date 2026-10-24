// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Fala pelo Fish Audio: o texto que o Gemini vai gerando é cortado em pedaços,
// e cada pedaço vira áudio assim que fica pronto.
//
// Para começar a falar rápido sem engasgar:
// - o primeiro pedaço sai na primeira vírgula e começa a tocar com uma pequena reserva de áudio;
// - os pedaços seguintes só tocam quando chegaram inteiros, então a fala não congela no meio;
// - até 3 pedaços são gerados ao mesmo tempo, e o áudio sai sempre na ordem certa.

import { cortarFrases, cortarPrimeiro, numerosParaFala } from './frases'

const SIMULTANEOS = 3
/** Reserva de áudio antes de o primeiro pedaço começar a tocar */
const RESERVA_MS = 450

interface Pedaco {
  id: number
  texto: string
  pedaços: { b64: string; taxa: number }[]
  pedido: boolean
  terminou: boolean
  primeiro: boolean
  /** Milissegundos de áudio já recebidos */
  ms: number
  tocando: boolean
  pedidoEm: number
  primeiroAudioEm: number
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
      if (!p.primeiroAudioEm) p.primeiroAudioEm = performance.now()
      p.pedaços.push({ b64, taxa })
      p.ms += ((b64.length * 3) / 4 / 2 / taxa) * 1000
      this.escoar()
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
    // Números por extenso em português: o Fish não usa regras de outro idioma para lê-los
    texto = numerosParaFala(texto)
    this.fila.push({ id: ++this.seq, texto, pedaços: [], pedido: false, terminou: false, primeiro, ms: 0, tocando: false, pedidoEm: 0, primeiroAudioEm: 0 })
    this.pedirProximos()
  }

  private pedirProximos(): void {
    const minha = this.geracao
    const emAndamento = this.fila.filter((p) => p.pedido && !p.terminou).length
    const livres = this.fila.filter((p) => !p.pedido).slice(0, Math.max(0, SIMULTANEOS - emAndamento))
    for (const p of livres) {
      p.pedido = true
      p.pedidoEm = performance.now()
      if (p.primeiro) this.aoPrimeiroPedido()
      window.friday.fishFalar(p.id, p.texto).then((r) => {
        if (minha !== this.geracao) return
        p.terminou = true
        const agora = performance.now()
        console.log(`[fish] pedaço de ${p.texto.length} letras: primeiro áudio em ${p.primeiroAudioEm ? Math.round(p.primeiroAudioEm - p.pedidoEm) : '—'} ms, ${Math.round(p.ms)} ms de fala gerados em ${Math.round(agora - p.pedidoEm)} ms`)
        if (!r.ok) { this.aoErro(r.erro ?? 'Erro no Fish Audio.'); this.cancelar(); return }
        this.escoar()
        this.pedirProximos()
      })
    }
  }

  /**
   * Manda para o alto-falante o que pode tocar, sempre na ordem.
   * O pedaço da frente começa quando chegou inteiro (ou, se for o primeiro da resposta,
   * quando já tem uma pequena reserva); depois disso, o que chegar dele toca na hora.
   */
  private escoar(): void {
    for (;;) {
      const p = this.fila[0]
      if (!p) return
      if (!p.tocando && (p.terminou || (p.primeiro && p.ms >= RESERVA_MS))) p.tocando = true
      if (!p.tocando) return
      for (const a of p.pedaços.splice(0)) this.aoAudio(a.b64, a.taxa)
      if (!p.terminou) return
      this.fila.shift()
    }
  }
}
