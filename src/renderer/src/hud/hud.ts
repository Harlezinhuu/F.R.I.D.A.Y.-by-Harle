// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Controle da interface: estados, modo compacto/expandido, legenda, painéis e cartões.

import { Nucleo, ESTADOS, type Estado } from './nucleo'
import { Cartoes } from './cartoes'
import type { Card } from '../../../shared/types'

const $ = (id: string) => document.getElementById(id)!

const STATUS: Partial<Record<Estado, [cor: string, texto: string, piscar: boolean]>> = {
  silenciada: ['#5E6A86', 'SILENCIADA · CTRL + ALT + ESPAÇO PARA VOLTAR', false],
  offline: ['#E5566B', 'SEM CONEXÃO', true],
  semMic: ['#F2C14E', 'MICROFONE DESCONECTADO', true]
}

export class Hud {
  readonly nucleo: Nucleo
  readonly cartoes: Cartoes
  private estado: Estado = 'repouso'
  private timerLegenda = 0
  private latencias: number[] = []
  private acoes: { texto: string; hora: string }[] = []
  private pollSistema = 0

  constructor() {
    this.nucleo = new Nucleo($('core'))
    this.cartoes = new Cartoes($('cards'))
    const relogio = () => { $('relogio').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
    relogio()
    setInterval(relogio, 10_000)
    setInterval(() => this.atualizarLeituras(), 100)
  }

  get estadoAtual(): Estado { return this.estado }

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
    document.body.classList.replace('expandido', 'compacto')
    this.nucleo.setCompacto(true)
    this.painel('fechar')
    this.confirmacao(null)
    this.esconderLegenda()
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
    this.cartoes.mostrar(c, duracaoMs)
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
