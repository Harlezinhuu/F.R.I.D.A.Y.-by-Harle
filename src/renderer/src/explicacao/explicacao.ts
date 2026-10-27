// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Modo explicação: a FRIDAY fala e a tela acompanha. Cada palavra-chave aparece montada em
// partículas no instante em que é dita (o texto chega antes do áudio, então esperamos o áudio
// alcançar), fotos e fatos entram ao lado e, no fim, um carimbo de veredito quando faz sentido.

import { Palco } from './palco'
import { Sincronia, ehAlerta, exibir, normalizar, termoFalado, type Destaque } from './palavras'

export interface DadosExplicacao {
  tema: string
  palavras: string[]
  alertas: string[]
  imagens: string[]
  fatos: string[]
  veredito: string
}

export interface ImagemExplicacao { termo: string; titulo: string; descricao: string; imagem: string }

type Cartao = ({ tipo: 'imagem' } & ImagemExplicacao) | { tipo: 'fato'; texto: string }

const $ = (id: string) => document.getElementById(id)!
/** Tempo mínimo de cada palavra na tela, para não piscar. */
const SEGURAR_MS = 850
const VEREDITOS_BONS = /^(verdade|verdadeiro|real|confirmado|fato|certo|correto|comprovado)/

export class Explicacao {
  readonly palco: Palco
  private sinc: Sincronia | null = null
  private dados: DadosExplicacao | null = null
  private texto = ''
  private timers = new Set<number>()
  private horaLivre = 0
  private mostradas = 0
  private fila: Cartao[] = []
  private esperandoImagens = 0
  private cartoesMostrados = 0
  private palavrasDesdeCartao = 0
  private ultimoCartao = 0
  private vereditoAgendado = false
  private turnoAcabou = false
  private fechamento = 0
  private relogio = 0
  ativa = false

  constructor(canvas: HTMLCanvasElement, fonteNaTela: () => { x: number; y: number } | null) {
    this.palco = new Palco(canvas, fonteNaTela)
  }

  iniciar(d: DadosExplicacao): void {
    this.limparTimers()
    clearTimeout(this.fechamento)
    this.dados = d
    this.sinc = new Sincronia(d.palavras, d.alertas)
    this.texto = ''
    this.horaLivre = 0
    this.mostradas = 0
    this.fila = d.fatos.slice(0, 3).map((texto) => ({ tipo: 'fato', texto }))
    this.esperandoImagens = Math.min(4, d.imagens.length)
    this.cartoesMostrados = 0
    this.palavrasDesdeCartao = 0
    this.ultimoCartao = performance.now()
    this.vereditoAgendado = !d.veredito
    this.turnoAcabou = false
    this.ativa = true

    const el = $('explic')
    el.hidden = false
    $('explicTema').textContent = d.tema
    $('explicTrilha').replaceChildren()
    $('explicCartoes').replaceChildren()
    $('explicCarimbo').hidden = true
    this.contador()
    document.body.classList.add('explicando')
    requestAnimationFrame(() => el.classList.add('visivel'))
    this.palco.ligar()
    this.palco.soltarPalavra()

    // Cartões também entram com o tempo, mesmo se a fala tiver poucas palavras-chave
    clearInterval(this.relogio)
    this.relogio = window.setInterval(() => this.talvezCartao(false), 1000)
  }

  /** Foto encontrada para um dos termos (chega depois, em segundo plano). */
  imagemChegou(img: ImagemExplicacao | null): void {
    if (!this.ativa) return
    this.esperandoImagens = Math.max(0, this.esperandoImagens - 1)
    if (!img) return
    // Fotos vão na frente dos fatos, intercaladas
    const fotos = this.fila.filter((c) => c.tipo === 'imagem').length
    const pos = Math.min(this.fila.length, fotos * 2)
    this.fila.splice(pos, 0, { tipo: 'imagem', ...img })
    // Se o termo já foi dito, mostra logo
    if (termoFalado(img.termo, this.texto)) this.talvezCartao(true, img.termo)
  }

  /** Pedaço novo da transcrição da fala dela. `atrasoS`: quanto áudio ainda falta tocar. */
  falou(pedaco: string, atrasoS: number): void {
    if (!this.ativa || !this.sinc) return
    clearTimeout(this.fechamento)
    this.turnoAcabou = false
    this.texto += pedaco
    const atrasoMs = Math.max(0, atrasoS * 1000 - 120)
    for (const d of this.sinc.consumir(this.texto)) this.agendarPalavra(d, atrasoMs)

    // Termos de foto falados agora puxam o cartão para a frente
    const recente = this.texto.slice(-pedaco.length - 40)
    const foto = this.fila.find((c) => c.tipo === 'imagem' && termoFalado(c.termo, recente))
    if (foto && foto.tipo === 'imagem') this.depois(atrasoMs, () => this.talvezCartao(true, foto.termo))

    // Veredito dito em voz alta: o carimbo cai junto com a palavra
    const v = this.dados?.veredito
    if (v && !this.vereditoAgendado && this.mostradas >= 2 && normalizar(recente).includes(normalizar(v))) {
      this.vereditoAgendado = true
      this.depois(atrasoMs + 150, () => this.carimbar())
    }
  }

  /** A fala dela terminou (o áudio ainda pode estar tocando). */
  fimDoTurno(atrasoS: number): void {
    if (!this.ativa) return
    this.texto += ' '
    if (this.sinc) for (const d of this.sinc.consumir(this.texto)) this.agendarPalavra(d, atrasoS * 1000)
    this.turnoAcabou = true
    const falta = atrasoS * 1000
    if (!this.vereditoAgendado && this.dados?.veredito) {
      this.vereditoAgendado = true
      this.depois(Math.max(0, falta - 900), () => this.carimbar())
    }
    // Mostra o que ainda estava na fila e fecha um tempo depois do fim da fala
    this.depois(Math.max(0, falta - 2500), () => this.talvezCartao(true))
    clearTimeout(this.fechamento)
    this.fechamento = window.setTimeout(() => this.fechar(), falta + 9000)
  }

  /** Você interrompeu: o que ainda ia aparecer não aparece mais. */
  interrompido(): void {
    if (!this.ativa) return
    this.limparTimers()
    this.horaLivre = 0
  }

  /** Você voltou a falar depois que ela terminou: a explicação sai de cena. */
  usuarioFalou(): void {
    if (!this.ativa || !this.turnoAcabou) return
    clearTimeout(this.fechamento)
    this.fechamento = window.setTimeout(() => this.fechar(), 900)
  }

  fechar(): void {
    if (!this.ativa) return
    this.ativa = false
    this.limparTimers()
    clearTimeout(this.fechamento)
    clearInterval(this.relogio)
    this.palco.desligar()
    const el = $('explic')
    el.classList.remove('visivel')
    document.body.classList.remove('explicando')
    window.setTimeout(() => { if (!this.ativa) { el.hidden = true; $('explicCartoes').replaceChildren(); $('explicTrilha').replaceChildren() } }, 900)
  }

  // ---------- Palavras ----------

  private agendarPalavra(d: Destaque, atrasoMs: number): void {
    const agora = performance.now()
    const ideal = agora + atrasoMs
    // Palavras automáticas atrasadas demais ficam de fora, para não descolar da voz
    if (d.indice < 0 && this.horaLivre - ideal > 1800) return
    const quando = Math.max(ideal, this.horaLivre)
    this.horaLivre = quando + SEGURAR_MS
    this.depois(quando - agora, () => this.mostrarPalavra(d))
  }

  private mostrarPalavra(d: Destaque): void {
    if (!this.ativa) return
    this.palco.palavra(d.palavra, d.alerta)
    this.mostradas++
    this.palavrasDesdeCartao++
    const li = document.createElement('li')
    li.className = d.alerta ? 'alerta' : ''
    const n = document.createElement('span')
    n.textContent = String(this.mostradas).padStart(2, '0')
    li.append(n, document.createTextNode(d.palavra))
    const trilha = $('explicTrilha')
    trilha.prepend(li)
    while (trilha.children.length > 7) trilha.lastElementChild?.remove()
    this.contador()
    if (this.palavrasDesdeCartao >= 2 || this.mostradas === 1) this.talvezCartao(false)
  }

  private contador(): void {
    const total = Math.max(this.sinc?.total ?? 0, this.mostradas)
    $('explicContador').textContent = total ? `${String(this.mostradas).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : String(this.mostradas).padStart(2, '0')
    ;($('explicBarra') as HTMLElement).style.width = total ? `${Math.min(100, (this.mostradas / total) * 100)}%` : '0%'
  }

  // ---------- Cartões ----------

  /** Mostra o próximo cartão se já deu tempo (ou na hora, com `agora`). */
  private talvezCartao(agora: boolean, termo?: string): void {
    if (!this.ativa || !this.fila.length) return
    const passou = performance.now() - this.ultimoCartao
    if (!agora && passou < 5200 && !(this.palavrasDesdeCartao >= 2 && passou > 2600)) return
    if (agora && passou < 1200) return
    let i = 0
    if (termo) i = Math.max(0, this.fila.findIndex((c) => c.tipo === 'imagem' && c.termo === termo))
    // Espera um pouco pelas fotos antes de abrir com um fato
    else if (this.cartoesMostrados === 0 && this.esperandoImagens && this.fila[0].tipo === 'fato' && passou < 3000) return
    const [c] = this.fila.splice(i, 1)
    this.mostrarCartao(c)
  }

  private mostrarCartao(c: Cartao): void {
    this.cartoesMostrados++
    this.palavrasDesdeCartao = 0
    this.ultimoCartao = performance.now()
    const art = document.createElement('article')
    const topo = document.createElement('header')
    const rot = document.createElement('span')
    const fonte = document.createElement('span')
    rot.textContent = `${c.tipo === 'imagem' ? 'REGISTRO' : 'DADO'} ${String(this.cartoesMostrados).padStart(2, '0')}`
    fonte.textContent = c.tipo === 'imagem' ? 'WIKIPÉDIA' : 'FRIDAY'
    topo.append(rot, fonte)
    art.append(topo)
    if (c.tipo === 'imagem') {
      art.className = 'ecard foto'
      const quadro = document.createElement('div')
      quadro.className = 'ecard-foto'
      const img = document.createElement('img')
      img.src = c.imagem
      img.alt = c.titulo
      quadro.append(img)
      const h = document.createElement('h3')
      h.textContent = c.titulo
      const p = document.createElement('p')
      p.textContent = c.descricao
      art.append(quadro, h, p)
    } else {
      art.className = `ecard fato${ehAlerta(c.texto) ? ' alerta' : ''}`
      const p = document.createElement('p')
      p.textContent = c.texto
      art.append(p)
    }
    const lista = $('explicCartoes')
    lista.prepend(art)
    requestAnimationFrame(() => requestAnimationFrame(() => art.classList.add('dentro')))
    // No máximo três na tela; o mais antigo sai
    const cartoes = [...lista.children]
    for (const velho of cartoes.slice(3)) {
      velho.classList.add('saindo')
      window.setTimeout(() => velho.remove(), 700)
    }
    this.palco.pulso(0.8)
  }

  private carimbar(): void {
    const v = this.dados?.veredito
    if (!this.ativa || !v) return
    const el = $('explicCarimbo')
    el.textContent = exibir(v)
    el.className = `explic-carimbo ${VEREDITOS_BONS.test(normalizar(v)) ? 'bom' : ''}`
    el.hidden = false
    void el.offsetWidth
    el.classList.add('bater')
    this.palco.pulso(1.6)
  }

  // ---------- Tempo ----------

  private depois(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => { this.timers.delete(id); fn() }, Math.max(0, ms))
    this.timers.add(id)
  }

  private limparTimers(): void {
    for (const id of this.timers) clearTimeout(id)
    this.timers.clear()
  }
}
