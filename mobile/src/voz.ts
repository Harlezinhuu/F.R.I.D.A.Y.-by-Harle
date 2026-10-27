// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Modo de voz, como o do ChatGPT: toca e conversa. Usa o mesmo núcleo de Möbius, o mesmo áudio
// e a mesma ligação com o Gemini Live da FRIDAY do PC. A conversa vira texto no histórico.

import { Nucleo, type Estado } from '../../src/renderer/src/hud/nucleo'
import { SessaoLive, type ChamadaFerramenta } from '../../src/renderer/src/voz/live'
import { Microfone, Alto, pcm16Base64 } from '../../src/renderer/src/voz/audio'
import { FORMAS, acharForma, funcao, listaFormas } from '../../src/renderer/src/projetor/formas'
import type { AcaoProjecao } from '../../src/renderer/src/hud/projecao'
import { FERRAMENTAS_CELULAR, executar, instrucoes, memoriaParaPrompt, type Contexto, type Resultado } from './ferramentas'
import { novaConversa, salvarConversa, tituloDe, type Ajustes, type Conversa } from './armazem'

const MODELO_VOZ = 'gemini-2.5-flash-native-audio-preview-12-2025'
const SILENCIO_MS = 25_000

export class ModoVoz {
  readonly nucleo: Nucleo
  private mic = new Microfone()
  private alto: Alto | null = null
  private live: SessaoLive | null = null
  private conversa: Conversa | null = null
  private textoUsuario = ''
  private textoFriday = ''
  private ultimaAtividade = 0
  private encerrarDepois = false
  private relogio = 0
  ativo = false
  aoEstado: (e: Estado, rotulo: string) => void = () => {}
  aoLegenda: (quem: 'VOCÊ' | 'FRIDAY' | 'SISTEMA', texto: string) => void = () => {}
  aoFim: () => void = () => {}
  aoProjecao: (ativa: boolean) => void = () => {}

  constructor(el: HTMLElement, private ajustes: () => Ajustes) {
    this.nucleo = new Nucleo(el)
    this.nucleo.setCompacto(false)
    this.ligarToque(el)
  }

  private atual: Estado = 'repouso'
  private estado(e: Estado, rotulo: string): void { this.atual = e; this.nucleo.setEstado(e); this.aoEstado(e, rotulo) }

  // ---------- Conversa ----------

  async iniciar(): Promise<void> {
    if (this.ativo) return
    const aj = this.ajustes()
    if (!aj.chave) throw new Error('Coloque a sua chave do Gemini nos Ajustes.')
    this.ativo = true
    this.alto ??= new Alto(aj.efeitoVoz)
    this.alto.limpar()
    this.conversa = novaConversa()
    this.encerrarDepois = false
    this.estado('pensando', 'CONECTANDO')
    try {
      await this.mic.iniciar()
    } catch {
      this.ativo = false
      this.estado('semMic', 'SEM MICROFONE')
      throw new Error('Preciso do microfone. Libere a permissão nas configurações do Android.')
    }
    const memoria = await memoriaParaPrompt()
    this.live = new SessaoLive(
      { apiKey: aj.chave, modelo: MODELO_VOZ, voz: aj.voz, nome: aj.nome, silencioFimFalaMs: 550 },
      {
        aoAudio: (b64) => { this.alto?.enfileirar(b64); this.estado('falando', 'FALANDO'); this.atividade() },
        aoTextoUsuario: (t) => { this.textoUsuario += t; this.aoLegenda('VOCÊ', this.textoUsuario.trim()); this.atividade() },
        aoTextoFriday: (t) => { this.textoFriday += t; this.aoLegenda('FRIDAY', this.textoFriday.trim()) },
        aoInterrompido: () => { this.alto?.limpar(); this.fecharTurno() },
        aoFimDoTurno: () => this.fecharTurno(),
        aoFerramentas: (c) => void this.ferramentas(c),
        aoAtividade: () => this.atividade(),
        aoAvisoDeFim: () => {},
        aoFechar: (inesperado, motivo) => { if (this.ativo && inesperado) { this.aoLegenda('SISTEMA', `A conexão caiu (${motivo}).`); void this.parar() } }
      },
      { ferramentas: FERRAMENTAS_CELULAR, instrucoes: (m) => instrucoes(aj.nome, m, 'Aqui é o modo de voz: respostas curtas, de uma ou duas frases.') }
    )
    try {
      await this.live.conectar(memoria)
    } catch (e) {
      this.mic.parar()
      this.ativo = false
      this.estado('offline', 'SEM CONEXÃO')
      throw new Error(`Não consegui conectar ao Gemini: ${(e as Error).message}`)
    }
    this.mic.aoBloco = (amostras) => { if (this.live?.aberta) this.live.enviarAudio(pcm16Base64(amostras)) }
    this.estado('ouvindo', 'OUVINDO')
    this.atividade()
    clearInterval(this.relogio)
    this.relogio = window.setInterval(() => this.vigiar(), 150)
  }

  async parar(): Promise<void> {
    if (!this.ativo) return
    this.ativo = false
    clearInterval(this.relogio)
    this.fecharTurno()
    this.live?.fechar()
    this.live = null
    this.mic.parar()
    this.alto?.limpar()
    this.estado('repouso', 'TOQUE PARA FALAR')
    if (this.conversa?.mensagens.length) await salvarConversa(this.conversa)
    this.conversa = null
    this.aoFim()
  }

  private atividade(): void { this.ultimaAtividade = performance.now() }

  private vigiar(): void {
    const alto = this.alto
    this.nucleo.setNivel(alto?.tocando ? alto.nivel() : 0)
    if (!this.ativo) return
    if (!alto?.tocando && this.atual === 'falando') this.estado('ouvindo', 'OUVINDO')
    const parado = performance.now() - this.ultimaAtividade
    if (this.encerrarDepois && !alto?.tocando && parado > 1200) void this.parar()
    else if (!alto?.tocando && parado > SILENCIO_MS) void this.parar()
  }

  /** Guarda o que cada um falou no histórico, como mensagens. */
  private fecharTurno(): void {
    const c = this.conversa
    if (!c) return
    const hora = new Date().toISOString()
    if (this.textoUsuario.trim()) c.mensagens.push({ papel: 'user', texto: this.textoUsuario.trim(), hora, voz: true })
    if (this.textoFriday.trim()) c.mensagens.push({ papel: 'model', texto: this.textoFriday.trim(), hora, voz: true })
    if (c.mensagens.length && c.titulo === 'Nova conversa') c.titulo = `🎙 ${tituloDe(c.mensagens.find((m) => m.papel === 'user')?.texto ?? 'Conversa por voz')}`
    c.atualizadaEm = hora
    this.textoUsuario = ''
    this.textoFriday = ''
  }

  private async ferramentas(chamadas: ChamadaFerramenta[]): Promise<void> {
    this.estado('pensando', 'PENSANDO')
    const respostas = []
    for (const c of chamadas) {
      const r = await executar(c.name ?? '', c.args ?? {}, this.contexto)
      respostas.push({ id: c.id, name: c.name, response: { ok: r.ok, resultado: r.mensagem } })
    }
    this.live?.responderFerramentas(respostas)
    this.atividade()
  }

  // ---------- Projeção (formas e funções) ----------

  readonly contexto: Contexto = {
    projetar: async (a) => this.projetar(a),
    controlarProjecao: async (a) => this.controlar(String(a.acao ?? '')),
    encerrar: () => { this.encerrarDepois = true }
  }

  projetar(a: Record<string, unknown>): Resultado {
    const oQue = String(a.o_que ?? '').trim(), formula = String(a.formula ?? '').trim(), fonte = String(a.fonte ?? 'auto')
    try {
      const m = fonte === 'funcao' || formula ? funcao(formula || oQue) : (() => {
        const id = acharForma(oQue) ?? acharForma(String(a.termo_ingles ?? ''))
        if (!id) throw new Error(`No celular eu projeto formas da ciência e funções. Tenho: ${listaFormas().join(', ')}.`)
        return FORMAS[id].criar()
      })()
      this.nucleo.projecao.mostrar(m, () => this.aoProjecao(false))
      for (const acao of m.acoesIniciais ?? []) this.nucleo.projecao.comando(acao as AcaoProjecao)
      this.aoProjecao(true)
      return { ok: true, mensagem: `Projetando ${m.nome}. ${m.detalhes.join('; ')}.` }
    } catch (e) {
      return { ok: false, mensagem: (e as Error).message }
    }
  }

  controlar(acao: string): Resultado {
    if (!this.nucleo.projecao.ativa) return { ok: false, mensagem: 'Não tem projeção na tela.' }
    if (acao === 'salvar') return { ok: false, mensagem: 'Salvar imagem ainda não funciona no celular.' }
    return { ok: true, mensagem: this.nucleo.projecao.comando(acao as AcaoProjecao) }
  }

  /** Arrastar com um dedo gira o holograma; pinçar com dois aproxima ou afasta. */
  private ligarToque(el: HTMLElement): void {
    const toques = new Map<number, { x: number; y: number }>()
    let distAnt = 0
    el.addEventListener('pointerdown', (e) => { toques.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture(e.pointerId) })
    el.addEventListener('pointermove', (e) => {
      const ant = toques.get(e.pointerId)
      if (!ant || !this.nucleo.projecao.ativa) return
      if (toques.size === 1) {
        this.nucleo.projecao.girarPor((e.clientX - ant.x) / el.clientWidth * 5, (e.clientY - ant.y) / el.clientHeight * 3)
      } else if (toques.size === 2) {
        const [a, b] = [...toques.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (distAnt) this.nucleo.projecao.escalarPor(d / distAnt)
        distAnt = d
      }
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY })
    })
    const soltar = (e: PointerEvent) => { toques.delete(e.pointerId); distAnt = 0 }
    el.addEventListener('pointerup', soltar)
    el.addEventListener('pointercancel', soltar)
  }
}
