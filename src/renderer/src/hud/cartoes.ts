// Cartões contextuais: aparecem ao lado do núcleo com só o que importa para o pedido e somem sozinhos.

import type { Card } from '../../../shared/types'

const DURACAO_MS = 8000

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function anel(valor: number, rotulo: string): string {
  return `<svg class="ring" width="92" height="92" viewBox="0 0 72 72" role="img" aria-label="${rotulo} ${valor} por cento">
    <circle class="track" cx="36" cy="36" r="29" fill="none" stroke-width="4"/>
    <circle class="val" cx="36" cy="36" r="29" fill="none" stroke-width="4" pathLength="100" stroke-dasharray="${valor} 100" transform="rotate(-90 36 36)"/>
    <text x="36" y="41" text-anchor="middle">${valor}%</text></svg>`
}

function quando(iso: string): { hora: string; dia: string } {
  const d = new Date(iso)
  const hoje = new Date()
  const amanha = new Date(Date.now() + 864e5)
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const dia = mesmoDia(d, hoje) ? 'HOJE' : mesmoDia(d, amanha) ? 'AMANHÃ' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '').toUpperCase()
  return { hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), dia }
}

function conteudo(c: Card): string {
  switch (c.tipo) {
    case 'sistema':
      return `<h2 class="label">SISTEMA</h2>
        <div class="row">${c.gpu !== null ? anel(c.gpu, 'GPU') : anel(c.cpu, 'CPU')}
          <div class="stack">
            <span class="meta">CPU ${c.cpu}% · RAM ${c.ram}% de ${c.ramTotalGb} GB</span>
            ${c.gpu !== null ? `<span class="meta">GPU ${c.gpu}%</span>` : ''}
            ${c.vramTotalGb !== null ? `<span class="meta">VRAM ${String(c.vramUsadaGb).replace('.', ',')} / ${String(c.vramTotalGb).replace('.', ',')} GB</span>` : ''}
          </div></div>`
    case 'app':
      return `<h2 class="label">${c.acao === 'aberto' ? 'PROGRAMA ABERTO' : 'PROGRAMA FECHADO'}</h2>
        <p class="song">${esc(c.nome)}</p>`
    case 'volume':
      return `<h2 class="label">VOLUME</h2>
        <div class="row"><span class="big">${c.mudo ? 'MUDO' : `${c.nivel}<small>%</small>`}</span></div>
        <div class="bar"><i style="width:${c.mudo ? 0 : c.nivel}%"></i></div>`
    case 'midia':
      return `<h2 class="label">MÍDIA</h2>
        <div class="row"><div class="eq" aria-hidden="true">${[0, 0.3, 0.15, 0.45, 0.1, 0.35, 0.2].map((d) => `<span style="height:100%;animation-delay:${d}s"></span>`).join('')}</div>
        <p class="song">${esc(c.acao)}</p></div>`
    case 'pesquisa':
      return `<h2 class="label">NO NAVEGADOR</h2><p class="what">${esc(c.consulta)}</p>`
    case 'lembrete': {
      const q = quando(c.quandoIso)
      return `<h2 class="label">${c.disparou ? 'LEMBRETE AGORA' : 'LEMBRETE CRIADO'}</h2>
        <div class="row"><span class="big">${q.hora}</span><div class="stack"><span class="when">${q.dia}</span></div></div>
        <p class="what">${esc(c.texto)}</p>`
    }
    case 'aviso':
      return `<h2 class="label">${esc(c.titulo)}</h2><p class="what">${esc(c.texto)}</p>`
  }
}

export class Cartoes {
  private timer = 0
  constructor(private el: HTMLElement) {}

  mostrar(c: Card, duracao = DURACAO_MS): void {
    this.esconder()
    const div = document.createElement('div')
    div.className = 'card enter'
    div.setAttribute('role', 'status')
    div.innerHTML = `<div class="scan"></div>${conteudo(c)}<div class="timer"><i style="animation-duration:${duracao}ms"></i></div>`
    this.el.append(div)
    void div.offsetWidth
    requestAnimationFrame(() => div.classList.remove('enter'))
    this.timer = window.setTimeout(() => this.esconder(), duracao)
  }

  esconder(): void {
    clearTimeout(this.timer)
    for (const c of Array.from(this.el.children)) {
      c.classList.add('enter')
      setTimeout(() => c.remove(), 550)
    }
  }
}
