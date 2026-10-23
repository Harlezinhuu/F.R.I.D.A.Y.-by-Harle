// Cartões contextuais: aparecem ao lado do núcleo com só o que importa para o pedido e somem sozinhos.

import type { Card } from '../../../shared/types'

const DURACAO_MS = 8000

const REPETE: Record<string, string> = { diario: 'todo dia', dias_uteis: 'dias úteis', semanal: 'toda semana', mensal: 'todo mês' }

const traco = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
const ICONES_TEMPO: Record<string, string> = {
  sol: `<svg class="tempo" viewBox="0 0 32 32" aria-hidden="true" ${traco}><circle cx="16" cy="16" r="6"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M25.2 6.8l-2.8 2.8M9.6 22.4l-2.8 2.8"/></svg>`,
  nuvem: `<svg class="tempo" viewBox="0 0 32 32" aria-hidden="true" ${traco}><path d="M9 24h14a5 5 0 0 0 0-10 7 7 0 0 0-13.5 2A4 4 0 0 0 9 24z"/></svg>`,
  chuva: `<svg class="tempo" viewBox="0 0 32 32" aria-hidden="true" ${traco}><path d="M9 20h14a5 5 0 0 0 0-10 7 7 0 0 0-13.5 2A4 4 0 0 0 9 20z"/><path d="M11 24l-1.5 3M16 24l-1.5 3M21 24l-1.5 3"/></svg>`,
  neve: `<svg class="tempo" viewBox="0 0 32 32" aria-hidden="true" ${traco}><path d="M16 4v24M5.6 10l20.8 12M5.6 22l20.8-12"/></svg>`,
  raio: `<svg class="tempo" viewBox="0 0 32 32" aria-hidden="true" ${traco}><path d="M9 18h14a5 5 0 0 0 0-10 7 7 0 0 0-13.5 2A4 4 0 0 0 9 18z"/><path d="M17 20l-3 5h4l-3 5"/></svg>`,
  neblina: `<svg class="tempo" viewBox="0 0 32 32" aria-hidden="true" ${traco}><path d="M5 12h22M8 17h19M5 22h20"/></svg>`
}

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
      const titulo = c.atrasado ? 'LEMBRETE ATRASADO' : c.disparou ? 'LEMBRETE AGORA' : 'LEMBRETE CRIADO'
      const rep = c.repetir && c.repetir !== 'nunca' ? `<span class="meta">${REPETE[c.repetir] ?? ''}</span>` : ''
      return `<h2 class="label">${titulo}</h2>
        <div class="row"><span class="big">${q.hora}</span><div class="stack"><span class="when">${q.dia}</span>${rep}</div></div>
        <p class="what">${esc(c.texto)}</p>`
    }
    case 'aviso':
      return `<h2 class="label">${esc(c.titulo)}</h2><p class="what">${esc(c.texto)}</p>`
    case 'clima':
      return `<h2 class="label">CLIMA <span class="ex">${esc(c.cidade)}</span></h2>
        <div class="row">${ICONES_TEMPO[c.icone] ?? ICONES_TEMPO.nuvem}<span class="big">${c.temperatura}<small>°C</small></span>
          <div class="stack"><span class="meta">${esc(c.descricao)}</span><span class="meta">sensação ${c.sensacao}°</span></div></div>
        <div class="times"><span>mín ${c.minima}° · máx ${c.maxima}°</span><span>chuva ${c.chuva}%</span></div>`
    case 'arquivos':
      return `<h2 class="label">ARQUIVOS <span class="ex">${c.total}</span></h2>
        <p class="meta">${esc(c.titulo)}</p>
        <ul class="lista">${c.itens.map((i) => `<li><span class="tipo">${i.pasta ? '▸' : '·'}</span>${esc(i.nome)}</li>`).join('')}</ul>
        ${c.total > c.itens.length ? `<span class="meta">e mais ${c.total - c.itens.length}</span>` : ''}`
    case 'print':
      return `<h2 class="label">PRINT SALVO</h2><img class="mini" src="${c.miniatura.startsWith('data:image/') ? c.miniatura : ''}" alt="Miniatura do print"><span class="meta">${esc(c.caminho)}</span>`
    case 'rotina':
      return `<h2 class="label">ROTINA</h2><p class="song">${esc(c.nome)}</p><p class="meta">${esc(c.passos)}</p>`
    case 'foco':
      return `<h2 class="label">MODO FOCO</h2><div class="row"><span class="big">${c.minutos}<small>min</small></span><span class="meta">avisos guardados até o fim</span></div>`
    case 'diagnostico':
      return `<h2 class="label">DIAGNÓSTICO <span class="ex">${c.itens.filter((i) => i.ok).length}/${c.itens.length}</span></h2>
        <ul class="lista diag">${c.itens.map((i) => `<li><span class="st ${i.ok ? 'ok' : 'falha'}" aria-label="${i.ok ? 'ok' : 'com problema'}"></span><b>${esc(i.nome)}</b><span class="meta">${esc(i.detalhe)}</span></li>`).join('')}</ul>`
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
