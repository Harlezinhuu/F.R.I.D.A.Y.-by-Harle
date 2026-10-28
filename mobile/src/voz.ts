// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Modo de voz, como o do ChatGPT: toca na fita e conversa. O áudio e a ligação com o Gemini Live
// são os mesmos da FRIDAY do PC; a fita é a do mundo "Órbita" do celular. A conversa vira texto no histórico.

import { Haptics, ImpactStyle } from '@capacitor/haptics'
import type { Mundo, EstadoFita } from './mundo'
import { SessaoLive, type ChamadaFerramenta } from '../../src/renderer/src/voz/live'
import { Microfone, Alto, pcm16Base64 } from '../../src/renderer/src/voz/audio'
import { FORMAS, acharForma, funcao, listaFormas } from '../../src/renderer/src/projetor/formas'
import type { AcaoProjecao } from '../../src/renderer/src/hud/projecao'
import { FERRAMENTAS_CELULAR, executar, instrucoes, memoriaParaPrompt, type Contexto, type Resultado } from './ferramentas'
import { novaConversa, salvarConversa, tituloDe, type Ajustes, type Conversa } from './armazem'
import { Celular, nativo } from './celular'
import { contextoDoPc, enviarContexto } from './elo'
import type { Explicacao, DadosExplicacao } from '../../src/renderer/src/explicacao/explicacao'

const MODELO_VOZ = 'gemini-2.5-flash-native-audio-preview-12-2025'
const SILENCIO_MS = 25_000

type Estado = EstadoFita

export class ModoVoz {
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
  /** Cartão holográfico de uma ação (lembrete criado, clima, busca...) */
  aoAcao: (rotulo: string, titulo: string, detalhe: string) => void = () => {}
  /** Arrastou o holograma para cima: ele vai para o PC */
  aoArremessar: (args: Record<string, unknown>) => void = () => {}
  /** Câmera ligada ou desligada (mostra a prévia) */
  aoOlhos: (video: HTMLVideoElement | null) => void = () => {}
  /** Modo explicação (palavras de partículas), criado pela tela */
  explicacao: Explicacao | null = null
  /** Busca foto da Wikipédia para os cartões da explicação */
  buscarImagem: (termo: string) => Promise<{ titulo: string; descricao: string; imagem: string } | null> = async () => null
  private ultimaProjecao: Record<string, unknown> | null = null

  constructor(private mundo: Mundo, toque: HTMLElement, private ajustes: () => Ajustes) {
    this.ligarToque(toque)
  }

  get nucleo(): Mundo { return this.mundo }

  private vibrar(): void {
    if (this.ajustes().vibrar) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  }

  private atual: Estado = 'repouso'
  private estado(e: Estado, rotulo: string): void { this.atual = e; this.mundo.setEstado(e); this.aoEstado(e, rotulo) }

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
    // O que você conversou no PC há pouco entra junto: ela continua de onde parou
    const [memoria, doPc] = await Promise.all([memoriaParaPrompt(), contextoDoPc()])
    const extraPc = doPc ? `\nConversa recente com você no PC (continue dali se fizer sentido, sem recitar):\n${doPc}` : ''
    this.live = new SessaoLive(
      { apiKey: aj.chave, modelo: MODELO_VOZ, voz: aj.voz, nome: aj.nome, silencioFimFalaMs: 550 },
      {
        aoAudio: (b64) => { this.alto?.enfileirar(b64); this.estado('falando', 'FALANDO'); this.atividade() },
        aoTextoUsuario: (t) => { this.textoUsuario += t; this.aoLegenda('VOCÊ', this.textoUsuario.trim()); this.atividade(); this.explicacao?.usuarioFalou() },
        aoTextoFriday: (t) => { this.textoFriday += t; this.aoLegenda('FRIDAY', this.textoFriday.trim()); this.explicacao?.falou(t, this.alto?.restante ?? 0) },
        aoInterrompido: () => { this.alto?.limpar(); this.explicacao?.interrompido(); this.fecharTurno() },
        aoFimDoTurno: () => { this.explicacao?.fimDoTurno(this.alto?.restante ?? 0); this.fecharTurno() },
        aoFerramentas: (c) => void this.ferramentas(c),
        aoAtividade: () => this.atividade(),
        aoAvisoDeFim: () => {},
        aoFechar: (inesperado, motivo) => { if (this.ativo && inesperado) { this.aoLegenda('SISTEMA', `A conexão caiu (${motivo}).`); void this.parar() } }
      },
      { ferramentas: FERRAMENTAS_CELULAR, instrucoes: (m) => instrucoes(aj.nome, m + extraPc, 'Aqui é o modo de voz: respostas curtas, de uma ou duas frases (explicações podem ser mais longas). Se a câmera estiver ligada, você vê o que ele mostra.') }
    )
    try {
      await this.live.conectar(memoria)
    } catch (e) {
      this.mic.parar()
      this.ativo = false
      this.estado('offline', 'SEM CONEXÃO')
      throw new Error(`Não consegui conectar ao Gemini: ${(e as Error).message}`)
    }
    this.mic.aoBloco = (amostras, rms) => { this.nivelMic = rms; if (this.live?.aberta) this.live.enviarAudio(pcm16Base64(amostras)) }
    // Notificação fixa que mantém o microfone quando ela abre outro app
    if (nativo()) void Celular.servicoVoz({ ligar: true }).catch(() => {})
    this.vibrar()
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
    if (nativo()) void Celular.servicoVoz({ ligar: false }).catch(() => {})
    this.olhos(false)
    this.explicacao?.fechar()
    this.vibrar()
    this.estado('repouso', 'TOQUE NA FITA PARA FALAR')
    if (this.conversa?.mensagens.length) await salvarConversa(this.conversa)
    this.conversa = null
    this.aoFim()
  }

  private nivelMic = 0
  private atividade(): void { this.ultimaAtividade = performance.now() }

  private vigiar(): void {
    const alto = this.alto
    this.mundo.setNivel(alto?.tocando ? alto.nivel() : this.ativo ? this.nivelMic : 0)
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
    // A troca vai para o PC: se você sentar lá, ela continua dali
    if (this.textoFriday.trim()) enviarContexto(`${this.textoUsuario.trim() ? `Você: ${this.textoUsuario.trim()}\n` : ''}FRIDAY: ${this.textoFriday.trim()}`)
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
      if (r.ok) this.cartaoDaAcao(c.name ?? '', c.args ?? {}, r.mensagem)
      else if (r.confirmar) this.aoAcao('CONFIRMAR', r.confirmar, 'Diga "confirma" ou "cancela"')
      respostas.push({ id: c.id, name: c.name, response: { ok: r.ok, resultado: r.mensagem } })
    }
    this.live?.responderFerramentas(respostas)
    this.atividade()
  }

  /** Algumas ações viram um cartão holográfico ao lado da fita. */
  private cartaoDaAcao(nome: string, a: Record<string, unknown>, msg: string): void {
    const primeira = msg.split(/(?<=[.!?])\s/)[0].slice(0, 90)
    if (nome === 'criar_lembrete') this.aoAcao('LEMBRETE', String(a.texto ?? ''), new Date(String(a.quando_iso)).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))
    else if (nome === 'criar_timer') this.aoAcao('TIMER', String(a.texto ?? 'Timer'), primeira)
    else if (nome === 'clima') this.aoAcao('CLIMA', primeira.split(':')[0], (primeira.split(':')[1] ?? '').trim())
    else if (nome === 'buscar_na_internet') this.aoAcao('NA INTERNET', String(a.pergunta ?? '').slice(0, 60), primeira)
    else if (nome === 'ligar') this.aoAcao('LIGAÇÃO', primeira, String(a.contato ?? ''))
    else if (nome === 'enviar_mensagem') this.aoAcao(String(a.app) === 'sms' ? 'SMS' : 'WHATSAPP', primeira, String(a.texto ?? '').slice(0, 80))
    else if (nome === 'alarme') this.aoAcao('ALARME', primeira, String(a.dias ?? '') || 'Uma vez')
    else if (nome === 'criar_evento') this.aoAcao('AGENDA', String(a.titulo ?? ''), primeira.split(': ').pop() ?? '')
    else if (nome === 'abrir_app') this.aoAcao('APP', primeira.split('\n')[0], '')
  }

  // ---------- Projeção (formas e funções) ----------

  readonly contexto: Contexto = {
    projetar: async (a) => this.projetar(a),
    explicar: async (a) => this.explicar(a),
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
      this.mundo.projecao.mostrar(m, () => this.aoProjecao(false))
      this.ultimaProjecao = { ...a }
      for (const acao of m.acoesIniciais ?? []) this.mundo.projecao.comando(acao as AcaoProjecao)
      this.aoProjecao(true)
      return { ok: true, mensagem: `Projetando ${m.nome}. ${m.detalhes.join('; ')}.` }
    } catch (e) {
      return { ok: false, mensagem: (e as Error).message }
    }
  }

  controlar(acao: string): Resultado {
    if (!this.mundo.projecao.ativa) return { ok: false, mensagem: 'Não tem projeção na tela.' }
    if (acao === 'salvar') return { ok: false, mensagem: 'Salvar imagem ainda não funciona no celular.' }
    return { ok: true, mensagem: this.mundo.projecao.comando(acao as AcaoProjecao) }
  }

  // ---------- Modo explicação ----------

  private explicar(a: Record<string, unknown>): Resultado {
    if (!this.ativo || !this.explicacao) return { ok: true, mensagem: 'Explique por escrito, em poucos parágrafos.' }
    if (this.mundo.projecao.ativa) return { ok: false, mensagem: 'Tem uma projeção na tela. Explique só falando.' }
    const lista = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max)
    const d: DadosExplicacao = {
      tema: String(a.tema ?? '').slice(0, 80),
      palavras: lista(a.palavras, 20),
      alertas: lista(a.alertas, 20),
      imagens: lista(a.imagens, 3),
      fatos: lista(a.fatos, 3).map((f) => f.slice(0, 110)),
      veredito: String(a.veredito ?? '').trim().split(/\s+/)[0]?.slice(0, 14) ?? ''
    }
    this.explicacao.iniciar(d)
    for (const termo of d.imagens) {
      void this.buscarImagem(termo).then((r) => this.explicacao?.imagemChegou(r ? { termo, ...r } : null)).catch(() => this.explicacao?.imagemChegou(null))
    }
    return { ok: true, mensagem: 'A explicação está na tela. Agora explique falando, com calma, em 5 a 9 frases, dizendo as palavras-chave na ordem em que as passou. Não comente a tela.' }
  }

  // ---------- Olhos: a câmera no modo de voz ----------

  private camera: MediaStream | null = null
  private relogioCamera = 0
  get olhosLigados(): boolean { return !!this.camera }

  /** Liga a câmera de trás: um quadro por segundo vai para o Gemini, que passa a ver o que você mostra. */
  async olhos(ligar: boolean): Promise<void> {
    clearInterval(this.relogioCamera)
    if (!ligar) {
      this.camera?.getTracks().forEach((t) => t.stop())
      this.camera = null
      this.aoOlhos(null)
      return
    }
    if (this.camera) return
    this.camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false })
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = this.camera
    await video.play()
    this.aoOlhos(video)
    const tela = document.createElement('canvas')
    this.relogioCamera = window.setInterval(() => {
      if (!this.live?.aberta || !video.videoWidth) return
      const escala = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight))
      tela.width = Math.round(video.videoWidth * escala)
      tela.height = Math.round(video.videoHeight * escala)
      tela.getContext('2d')?.drawImage(video, 0, 0, tela.width, tela.height)
      this.live.enviarImagem(tela.toDataURL('image/jpeg', 0.6).split(',')[1])
      this.atividade()
    }, 1000)
  }

  /** O último toque foi um arrasto (girar o holograma), não um toque para falar. */
  arrastou = false

  /** Arrastar com um dedo gira o holograma; pinçar com dois aproxima ou afasta. */
  private ligarToque(el: HTMLElement): void {
    const toques = new Map<number, { x: number; y: number }>()
    let distAnt = 0, andou = 0
    let inicio = { x: 0, y: 0, t: 0 }
    el.addEventListener('pointerdown', (e) => {
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (toques.size === 1) { andou = 0; this.arrastou = false; inicio = { x: e.clientX, y: e.clientY, t: performance.now() } }
    })
    el.addEventListener('pointermove', (e) => {
      const ant = toques.get(e.pointerId)
      if (!ant || !this.mundo.projecao.ativa) return
      andou += Math.hypot(e.clientX - ant.x, e.clientY - ant.y)
      if (andou > 12) this.arrastou = true
      if (toques.size === 1) {
        this.mundo.projecao.girarPor((e.clientX - ant.x) / el.clientWidth * 5, (e.clientY - ant.y) / el.clientHeight * 3)
      } else if (toques.size === 2) {
        const [a, b] = [...toques.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (distAnt) this.mundo.projecao.escalarPor(d / distAnt)
        distAnt = d
      }
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY })
    })
    const soltar = (e: PointerEvent) => {
      // Arrastar rápido para cima com um dedo: o holograma é arremessado para o PC
      const dy = e.clientY - inicio.y, dx = e.clientX - inicio.x, dt = performance.now() - inicio.t
      if (toques.size === 1 && this.mundo.projecao.ativa && this.ultimaProjecao && dy < -140 && Math.abs(dx) < 110 && dt < 450) {
        this.arrastou = true
        this.aoArremessar(this.ultimaProjecao)
      }
      toques.delete(e.pointerId)
      distAnt = 0
    }
    el.addEventListener('pointerup', soltar)
    el.addEventListener('pointercancel', soltar)
  }
}
