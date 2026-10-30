// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// HUD em realidade aumentada, o lado do PC: enquanto o celular estiver olhando, mostra as quatro marcas
// nos cantos da tela (uma janela transparente por cima de tudo, que não pega clique) e responde com os
// dados que flutuam em volta do monitor. Se o celular parar de pedir, as marcas somem sozinhas.

import { BrowserWindow, screen } from 'electron'
import { hostname, uptime } from 'node:os'
import { marcasAr, svgMarca, type DadosAr, type RespostaAr } from '../shared/ar'
import { statusSistema } from './system'
import { lembretesDeHoje } from './reminders'
import { statusTarefas } from './tarefas'
import { pesquisas } from './pesquisa'
import { aparelhosConhecidos, redeLigada } from './rede'
import { nomeDoAparelho } from './logica/rede'
import { consultaAtual } from './consultas'
import { descrever, emAndamento } from '../shared/consulta'
import { janelaAtiva } from './winctl'

let janela: BrowserWindow | null = null
let desligar: NodeJS.Timeout | null = null

function mostrarMarcas(): void {
  const d = screen.getPrimaryDisplay()
  const { width: w, height: h } = d.bounds
  if (janela && !janela.isDestroyed()) return
  const m = marcasAr(w, h)
  const pos = (i: number) => {
    const [cx, cy] = m.centros[i]
    return `left:${Math.round(cx * w - m.lado / 2)}px;top:${Math.round(cy * h - m.lado / 2)}px`
  }
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}div{position:fixed;width:${m.lado}px;height:${m.lado}px;line-height:0}</style>` +
    [0, 1, 2, 3].map((i) => `<div style="${pos(i)}">${svgMarca(m.lado)}</div>`).join('')
  janela = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: w, height: h,
    transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, show: false, alwaysOnTop: true, enableLargerThanScreen: true,
    webPreferences: { sandbox: true, javascript: false }
  })
  janela.setAlwaysOnTop(true, 'screen-saver')
  janela.setIgnoreMouseEvents(true)
  janela.setVisibleOnAllWorkspaces(true)
  janela.once('ready-to-show', () => janela?.showInactive())
  janela.on('closed', () => { janela = null })
  void janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function esconderMarcas(): void {
  if (desligar) { clearTimeout(desligar); desligar = null }
  if (janela && !janela.isDestroyed()) janela.close()
  janela = null
}

const tempo = (s: number): string => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : h ? `${h} h ${m} min` : `${m} min`
}

async function juntarDados(): Promise<DadosAr> {
  const tenta = async <T>(f: () => T | Promise<T>, padrao: T): Promise<T> => { try { return await f() } catch { return padrao } }
  const [sistema, programa] = await Promise.all([
    tenta(() => statusSistema(), null),
    tenta(async () => (await janelaAtiva()).processo, '')
  ])
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const tarefa = await tenta(() => {
    const t = statusTarefas().find((x) => x.estado === 'trabalhando' || x.estado === 'na fila')
    return t ? { projeto: t.projeto, estado: t.estado, andamento: (t.andamento || t.pedido).slice(0, 140) } : null
  }, null)
  const rede = await tenta(() => {
    if (!redeLigada()) return null
    const ligados = aparelhosConhecidos().filter((a) => Date.now() - a.ultimaVez < 15 * 60_000)
    return { ligados: ligados.length, desconhecidos: ligados.filter((a) => !a.apelido && Date.now() - a.primeiraVez < 24 * 3600_000).map(nomeDoAparelho).slice(0, 3) }
  }, null)
  const consulta = await tenta(() => { const c = consultaAtual(); return emAndamento(c) ? descrever(c).slice(0, 160) : null }, null)
  return {
    pc: hostname().replace(/\.local$/, '') || 'PC',
    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    ligadoHa: tempo(uptime()),
    sistema,
    programa: programa.replace(/\.exe$/i, ''),
    lembretes: await tenta(() => lembretesDeHoje().slice(0, 4).map((l) => ({ hora: hora(l.quandoIso), texto: l.texto.slice(0, 80) })), []),
    tarefa,
    pesquisas: await tenta(() => pesquisas().filter((p) => p.estado === 'na fila' || p.estado === 'pesquisando').slice(0, 2).map((p) => ({ titulo: (p.titulo || p.tema).slice(0, 70), etapa: p.etapa.slice(0, 70) })), []),
    rede,
    consulta
  }
}

/** Pedido do celular: liga (ou renova) as marcas e devolve os dados; ligar=false some com elas. */
export async function pedidoAr(ligar: boolean): Promise<RespostaAr | { ok: true }> {
  if (!ligar) { esconderMarcas(); return { ok: true } }
  mostrarMarcas()
  if (desligar) clearTimeout(desligar)
  desligar = setTimeout(esconderMarcas, 12_000)
  const d = screen.getPrimaryDisplay().bounds
  return { aspecto: d.width / d.height, marcas: marcasAr(d.width, d.height).centros, dados: await juntarDados() }
}

export const encerrarAr = esconderMarcas
