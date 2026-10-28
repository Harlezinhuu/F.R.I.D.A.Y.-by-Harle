// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Controle da interface: estados, modo compacto/expandido, legenda, painéis e cartões.

import { Nucleo, ESTADOS, type Estado } from './nucleo'
import { Cartoes } from './cartoes'
import { Explicacao } from '../explicacao/explicacao'
import type { Card } from '../../../shared/types'
import type { Modelo3D } from '../projetor/tipos'
import type { AcaoProjecao } from './projecao'

const $ = (id: string) => document.getElementById(id)!

const STATUS: Partial<Record<Estado, [cor: string, texto: string, piscar: boolean]>> = {
  silenciada: ['#5E6A86', 'SILENCIADA · CTRL + ALT + ESPAÇO PARA VOLTAR', false],
  offline: ['#E5566B', 'SEM CONEXÃO', true],
  semMic: ['#F2C14E', 'MICROFONE DESCONECTADO', true]
}

export class Hud {
  readonly nucleo: Nucleo
  readonly cartoes: Cartoes
  readonly explicacao: Explicacao
  private estado: Estado = 'repouso'
  private timerLegenda = 0
  private latencias: number[] = []
  private acoes: { texto: string; hora: string }[] = []
  private pollSistema = 0

  constructor() {
    this.nucleo = new Nucleo($('core'))
    this.cartoes = new Cartoes($('cards'))
    // O rio de partículas da explicação nasce da fita
    this.explicacao = new Explicacao($('palco') as HTMLCanvasElement, () => {
      const r = $('core').getBoundingClientRect()
      return r.width ? { x: r.left + r.width / 2, y: r.top + r.height * 0.52 } : null
    })
    const relogio = () => { $('relogio').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
    relogio()
    setInterval(relogio, 10_000)
    setInterval(() => this.atualizarLeituras(), 100)
  }

  get estadoAtual(): Estado { return this.estado }

  // ---------- Cena holográfica ----------
  private cenaSeguir = 0
  private cenaDigitar = 0

  /** Projeção holográfica com o HUD aberto; sem imagem ou no canto, vira um cartão comum. */
  cena(c: Card): void {
    if (c.tipo !== 'cena') return this.cartao(c)
    if (!c.imagem || !document.body.classList.contains('expandido')) return this.cartao(c, 12000)
    this.cartoes.esconder()
    const leg = $('cenaLegenda')
    leg.hidden = false
    leg.classList.remove('visivel', 'digitado')
    $('cenaTitulo').textContent = ''
    $('cenaDescricao').textContent = c.descricao
    clearInterval(this.cenaSeguir)
    clearInterval(this.cenaDigitar)
    this.nucleo.mostrarCena(c.imagem, 12000, () => this.fecharLegenda())
    // A legenda acompanha o canto da imagem na tela
    this.cenaSeguir = window.setInterval(() => {
      const a = this.nucleo.ancoraCena()
      if (!a) return
      leg.style.transform = ''
      leg.style.left = `${Math.round(a.x)}px`
      leg.style.top = `${Math.round(a.y + 14)}px`
      if (a.visivel && !leg.classList.contains('visivel')) {
        leg.classList.add('visivel')
        // Título digitado letra por letra
        let i = 0
        this.cenaDigitar = window.setInterval(() => {
          $('cenaTitulo').textContent = c.titulo.slice(0, ++i)
          if (i >= c.titulo.length) { clearInterval(this.cenaDigitar); leg.classList.add('digitado') }
        }, 38)
      } else if (!a.visivel && leg.classList.contains('visivel')) {
        leg.classList.remove('visivel')
      }
    }, 50)
  }

  private fecharLegenda(): void {
    clearInterval(this.cenaSeguir)
    clearInterval(this.cenaDigitar)
    const leg = $('cenaLegenda')
    leg.classList.remove('visivel', 'digitado')
    leg.hidden = true
  }

  // ---------- Modo foco ----------
  private focoFim = 0
  private focoTimer = 0

  get emFoco(): boolean { return this.focoFim > 0 }

  /** Mostra o timer no núcleo; chama `aoFim` quando o tempo acaba. */
  iniciarFoco(minutos: number, aoFim: () => void): void {
    this.encerrarFoco()
    this.focoFim = Date.now() + minutos * 60_000
    $('foco').hidden = false
    const tick = () => {
      const resta = Math.max(0, this.focoFim - Date.now())
      const m = Math.floor(resta / 60_000), s = Math.floor((resta % 60_000) / 1000)
      $('focoTempo').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      if (resta <= 0) { this.encerrarFoco(); aoFim() }
    }
    tick()
    this.focoTimer = window.setInterval(tick, 1000)
  }

  encerrarFoco(): void {
    clearInterval(this.focoTimer)
    this.focoFim = 0
    $('foco').hidden = true
  }

  minutosRestantesFoco(): number {
    return this.focoFim ? Math.ceil((this.focoFim - Date.now()) / 60_000) : 0
  }

  setEstado(e: Estado): void {
    if (e === this.estado) return
    this.estado = e
    this.nucleo.setEstado(e)
    const v = ESTADOS[e]
    document.documentElement.style.setProperty('--state', e === 'repouso' ? '#6FB8FF' : v.a)
    $('stateTag').textContent = v.rotulo
    $('coreLabel').textContent = v.rotulo
    $('core').classList.toggle('pensando', e === 'pensando')
    const [cor, texto, piscar] = STATUS[e] ?? ['#5BE3A8', 'ONLINE · GEMINI LIVE', false]
    const dot = $('dot')
    dot.style.background = cor
    dot.style.boxShadow = `0 0 10px ${cor}`
    dot.classList.toggle('blink', piscar)
    $('statusTxt').textContent = texto
  }

  expandir(): void {
    document.body.classList.replace('compacto', 'expandido')
    this.nucleo.setCompacto(false)
  }

  compactar(): void {
    // Minimizar encerra a projeção (as partículas voltam para a fita)
    this.nucleo.projecao.esconder()
    this.explicacao.fechar()
    document.body.classList.replace('expandido', 'compacto')
    this.nucleo.setCompacto(true)
    this.nucleo.esconderCena(true)
    this.painel('fechar')
    this.confirmacao(null)
    this.esconderLegenda()
  }

  // ---------- Projeção 3D ----------
  private rafProjecao = 0

  get projecaoAtiva(): boolean { return this.nucleo.projecao.ativa }

  /** Abre o HUD e projeta o modelo: as partículas saem da fita e montam o objeto. */
  projetar(m: Modelo3D): void {
    this.explicacao.fechar()
    this.expandir()
    this.nucleo.esconderCena(true)
    this.nucleo.projecao.mostrar(m, () => this.fimProjecao())
    for (const a of m.acoesIniciais ?? []) this.nucleo.projecao.comando(a as AcaoProjecao)
    $('projTitulo').textContent = m.nome
    $('projFonte').textContent = `PROJEÇÃO · ${m.fonte}`
    $('projCredito').textContent = m.credito ?? ''
    $('projLegenda').hidden = false
    document.body.classList.add('projetando')
    cancelAnimationFrame(this.rafProjecao)
    const seguir = () => {
      this.rafProjecao = requestAnimationFrame(seguir)
      this.atualizarProjecao()
    }
    seguir()
  }

  comandoProjecao(acao: AcaoProjecao): string {
    return this.nucleo.projecao.comando(acao)
  }

  private ultimaFicha = ''
  private atualizarProjecao(): void {
    const info = this.nucleo.projecao.info()
    const leg = $('projLegenda')
    if (!info) return
    leg.classList.toggle('visivel', info.visivel)
    const linhas = [...info.detalhes, ...(info.medidas ? [info.medidas] : [])]
    const ficha = linhas.join('|')
    if (ficha !== this.ultimaFicha) {
      this.ultimaFicha = ficha
      $('projDetalhes').replaceChildren(...linhas.map((t, i) => {
        const li = document.createElement('li')
        li.textContent = t
        if (info.medidas && i === linhas.length - 1) li.className = 'medida'
        return li
      }))
    }
    // Etiquetas das peças: linha da peça até o nome, como nos esquemas da armadura
    const rot = this.nucleo.projecao.rotulos()
    const svg = $('rotulos')
    const ns = 'http://www.w3.org/2000/svg'
    svg.replaceChildren(...rot.flatMap((r) => {
      const linha = document.createElementNS(ns, 'line')
      linha.setAttribute('x1', String(r.x)); linha.setAttribute('y1', String(r.y)); linha.setAttribute('x2', String(r.ax)); linha.setAttribute('y2', String(r.ay))
      const ponto = document.createElementNS(ns, 'circle')
      ponto.setAttribute('cx', String(r.x)); ponto.setAttribute('cy', String(r.y)); ponto.setAttribute('r', '2.2')
      const texto = document.createElementNS(ns, 'text')
      texto.setAttribute('x', String(r.ax + (r.ax >= r.x ? 4 : -4))); texto.setAttribute('y', String(r.ay + 3))
      texto.setAttribute('text-anchor', r.ax >= r.x ? 'start' : 'end')
      texto.textContent = r.nome
      return [linha, ponto, texto]
    }))
  }

  /** Mira da mão sobre o núcleo (x, y de 0 a 1 na câmera). Devolve a posição em px, ou null se escondida. */
  mira(x: number | null, y = 0): { x: number; y: number } | null {
    const el = $('mira'), core = $('core')
    if (x === null) { el.hidden = true; return null }
    // Um pouco ampliada: não precisa esticar o braço até a borda da câmera
    const px = Math.min(1, Math.max(0, 0.5 + (x - 0.5) * 1.4)) * core.clientWidth
    const py = Math.min(1, Math.max(0, 0.5 + (y - 0.5) * 1.4)) * core.clientHeight
    el.hidden = false
    el.style.left = `${px}px`
    el.style.top = `${py}px`
    return { x: px, y: py }
  }

  marcarMira(): void {
    const el = $('mira')
    el.classList.remove('travando')
    void el.offsetWidth
    el.classList.add('travando')
  }

  private fimProjecao(): void {
    cancelAnimationFrame(this.rafProjecao)
    document.body.classList.remove('projetando')
    $('projLegenda').classList.remove('visivel')
    $('projLegenda').hidden = true
    $('rotulos').replaceChildren()
    this.ultimaFicha = ''
  }

  /** Legenda inteligente: aparece enquanto alguém fala e some 4 s depois. */
  legenda(quem: string, texto: string): void {
    $('who').textContent = quem
    $('line').textContent = texto
    $('legenda').classList.add('visivel')
    clearTimeout(this.timerLegenda)
    this.timerLegenda = window.setTimeout(() => this.esconderLegenda(), 4000)
  }

  esconderLegenda(): void { $('legenda').classList.remove('visivel') }

  confirmacao(texto: string | null): void {
    const el = $('confirm')
    el.hidden = texto === null
    if (texto) $('confirmTxt').textContent = texto
  }

  cartao(c: Card, duracaoMs?: number): void {
    // Cartão e painel da direita ocupam o mesmo lugar
    $('pMods').classList.remove('open')
    this.cartoes.mostrar(c, duracaoMs ?? (c.tipo === 'pareamento' ? 300_000 : undefined))
  }

  painel(qual: 'sistema' | 'modulos' | 'tudo' | 'fechar'): void {
    const sis = $('pSys'), mods = $('pMods')
    if (qual === 'fechar') {
      sis.classList.remove('open'); mods.classList.remove('open')
      clearInterval(this.pollSistema)
      return
    }
    this.cartoes.esconder()
    if (qual === 'sistema' || qual === 'tudo') { sis.classList.add('open'); this.iniciarPollSistema() }
    if (qual === 'modulos' || qual === 'tudo') { mods.classList.add('open'); this.atualizarModulos() }
  }

  private iniciarPollSistema(): void {
    clearInterval(this.pollSistema)
    const atualizar = async () => {
      if (!$('pSys').classList.contains('open')) return clearInterval(this.pollSistema)
      const r = await window.friday.ferramenta('status_sistema', {})
      const s = r.dados as { cpu: number; ram: number; gpu: number | null } | undefined
      if (!s) return
      const itens: [string, number][] = [['CPU', s.cpu], ['RAM', s.ram], ...(s.gpu !== null ? [['GPU', s.gpu] as [string, number]] : [])]
      $('gauges').innerHTML = itens.map(([n, v]) => `<div class="gauge"><svg viewBox="0 0 72 72" role="img" aria-label="${n} ${v} por cento"><circle class="track" cx="36" cy="36" r="28" fill="none" stroke-width="5"/><circle class="val" cx="36" cy="36" r="28" fill="none" stroke-width="5" pathLength="100" stroke-dasharray="${v} 100" transform="rotate(-90 36 36)"/><text x="36" y="41" text-anchor="middle">${v}</text></svg><span>${n}</span></div>`).join('')
    }
    atualizar()
    this.pollSistema = window.setInterval(atualizar, 3000)
  }

  private async atualizarModulos(): Promise<void> {
    const r = await window.friday.ferramenta('listar_apps', {})
    const nomes = (r.dados as string[] | undefined) ?? []
    const el = $('mods')
    el.replaceChildren(...nomes.map((n) => { const s = document.createElement('span'); s.textContent = n; return s }))
  }

  registrarAcao(texto: string): void {
    this.acoes.unshift({ texto, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })
    this.acoes.length = Math.min(this.acoes.length, 5)
    $('acts').replaceChildren(...this.acoes.map((a) => {
      const li = document.createElement('li')
      li.textContent = a.texto
      const t = document.createElement('time')
      t.textContent = a.hora
      li.append(t)
      return li
    }))
  }

  /** Média das últimas latências de resposta, em ms (0 se ainda não houve resposta). */
  latenciaMedia(): number {
    return this.latencias.length ? Math.round(this.latencias.reduce((a, b) => a + b, 0) / this.latencias.length) : 0
  }

  latencia(ms: number): void {
    this.latencias.push(ms)
    if (this.latencias.length > 20) this.latencias.shift()
    $('latVal').textContent = String(Math.round(ms))
    const max = Math.max(1500, ...this.latencias)
    $('latLine').setAttribute('points', this.latencias.map((v, i) => `${(i / Math.max(1, this.latencias.length - 1)) * 120},${38 - (v / max) * 34}`).join(' '))
  }

  private atualizarLeituras(): void {
    if (!document.body.classList.contains('expandido')) return
    const l = this.nucleo.leituras()
    $('ro1').textContent = l.fase.toFixed(4)
    const s = l.tempo % 3600
    $('ro2').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`
    $('ro3').textContent = l.lambda.toFixed(3)
  }
}
