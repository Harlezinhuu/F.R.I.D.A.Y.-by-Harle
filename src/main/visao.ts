// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Visão de Deus: integra o God's Eye View (github.com/bilawalsidhu/gods-eye-view, licença MIT,
// de Bilawal Sidhu). A FRIDAY instala o projeto na pasta extras, sobe o servidor dele só quando
// você pede e abre o globo numa janela própria, já no lugar, nas camadas e no estilo pedidos.
// Ao fechar, o servidor é desligado para não pesar no PC.

import { app, BrowserWindow, shell } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { altitudePorCaixa, montarHash, nodeServe, VISTA_PLANETA, type Vista } from './logica/visao'

const REPOSITORIO = 'https://github.com/bilawalsidhu/gods-eye-view.git'
/** Versão testada; trocar aqui para atualizar */
const VERSAO = 'v0.2.1'
const PORTA = 4173
const BASE = `http://localhost:${PORTA}/`

type Log = (texto: string) => void
type Aviso = (texto: string, ok: boolean) => void
let log: Log = () => {}
let avisar: Aviso = () => {}

export function configurarVisao(opcoes: { log: Log; avisar: Aviso }): void {
  log = opcoes.log
  avisar = opcoes.avisar
}

export const pastaVisao = (): string =>
  join(app.isPackaged ? app.getPath('userData') : app.getAppPath(), 'extras', 'gods-eye-view')
const marcaInstalada = (): string => join(pastaVisao(), '.friday-instalado')
export const instalada = (): boolean => existsSync(marcaInstalada())

// ---------- Comandos ----------

/** Variáveis da FRIDAY (chaves) não vão para o God's Eye View. */
const ambiente = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(FRIDAY_|FISH_|GEMINI_)/.test(k)))

function iniciar(comando: string, args: string[], cwd: string): ChildProcess {
  if (process.platform === 'win32' && comando === 'npm') {
    // npm é um .cmd: só roda pelo cmd.exe. Os argumentos aqui são todos fixos.
    return spawn('cmd.exe', ['/d', '/s', '/c', `"npm ${args.join(' ')}"`], { cwd, env: ambiente(), windowsHide: true, windowsVerbatimArguments: true })
  }
  return spawn(comando, args, { cwd, env: ambiente(), windowsHide: true })
}

function rodar(comando: string, args: string[], cwd: string, limiteMs: number): Promise<{ ok: boolean; saida: string }> {
  return new Promise((resolve) => {
    let saida = ''
    let p: ChildProcess
    try { p = iniciar(comando, args, cwd) } catch (e) { resolve({ ok: false, saida: (e as Error).message }); return }
    const guardar = (d: Buffer) => { saida = (saida + d.toString()).slice(-4000) }
    p.stdout?.on('data', guardar)
    p.stderr?.on('data', guardar)
    const relogio = setTimeout(() => { matarArvore(p); saida += '\n(tempo esgotado)' }, limiteMs)
    p.on('error', (e) => { clearTimeout(relogio); resolve({ ok: false, saida: `${saida}\n${e.message}` }) })
    p.on('close', (codigo) => { clearTimeout(relogio); resolve({ ok: codigo === 0, saida }) })
  })
}

function matarArvore(p: ChildProcess | null): void {
  if (!p?.pid) return
  if (process.platform === 'win32') execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {})
  else p.kill('SIGTERM')
}

const ultimaLinha = (s: string): string => s.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0]?.slice(0, 200) ?? ''

async function versaoNode(): Promise<string | null> {
  const r = await rodar('node', ['-v'], app.getPath('home'), 10_000)
  return r.ok ? r.saida.trim() : null
}

// ---------- Instalação (uma vez, em segundo plano) ----------

let instalando: Promise<boolean> | null = null
let etapa = ''

/** Confere o que falta antes de instalar. Devolve o motivo, ou null se pode instalar. */
export async function requisitos(): Promise<string | null> {
  const node = await versaoNode()
  if (!node) return 'Não achei o Node.js no PC. Instale o Node 24 LTS (winget install OpenJS.NodeJS.LTS) e reinicie a FRIDAY.'
  if (!nodeServe(node)) return `A Visão de Deus precisa do Node 24.14 ou mais novo (fora o 25), ou do Node 26. O seu é ${node}. Atualize com: winget upgrade OpenJS.NodeJS.LTS`
  const git = await rodar('git', ['--version'], app.getPath('home'), 10_000)
  if (!git.ok) return 'Preciso do Git instalado para baixar a Visão de Deus (winget install Git.Git).'
  return null
}

export function emInstalacao(): string | null {
  return instalando ? etapa : null
}

export function instalar(): Promise<boolean> {
  if (instalando) return instalando
  instalando = (async () => {
    const pasta = pastaVisao()
    try {
      if (!existsSync(join(pasta, '.git'))) {
        etapa = 'baixando o projeto'
        log(`[visao] baixando God's Eye View ${VERSAO} em ${pasta}`)
        // Sobra de uma tentativa anterior que não terminou
        if (existsSync(pasta)) rmSync(pasta, { recursive: true, force: true })
        mkdirSync(dirname(pasta), { recursive: true })
        const c = await rodar('git', ['clone', '--depth', '1', '--branch', VERSAO, REPOSITORIO, pasta], dirname(pasta), 15 * 60_000)
        if (!c.ok) throw new Error(`falha ao baixar: ${ultimaLinha(c.saida)}`)
      }
      etapa = 'instalando as dependências'
      log('[visao] npm ci')
      const ci = await rodar('npm', ['ci', '--no-audit', '--no-fund'], pasta, 30 * 60_000)
      if (!ci.ok) throw new Error(`falha no npm ci: ${ultimaLinha(ci.saida)}`)
      etapa = 'conferindo a instalação'
      const doc = await rodar('npm', ['run', 'doctor'], pasta, 2 * 60_000)
      log(`[visao] doctor: ${doc.saida.trim().slice(-1500)}`)
      writeFileSync(marcaInstalada(), `${VERSAO}\n${new Date().toISOString()}\n`)
      log('[visao] instalada')
      return true
    } catch (e) {
      log(`[visao] instalação falhou: ${(e as Error).message}`)
      avisar(`A instalação da Visão de Deus falhou: ${(e as Error).message}. Os detalhes estão no friday.log.`, false)
      return false
    } finally {
      instalando = null
      etapa = ''
    }
  })()
  return instalando
}

// ---------- Servidor ----------

let servidor: ChildProcess | null = null
/** Só desligamos o servidor que nós mesmos ligamos */
let servidorNosso = false
let subindo: Promise<void> | null = null

async function respondendo(): Promise<boolean> {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return false
    return /God's Eye View/i.test(await r.text())
  } catch {
    return false
  }
}

function subirServidor(): Promise<void> {
  if (subindo) return subindo
  subindo = (async () => {
    if (await respondendo()) return
    // Algo que não é a Visão de Deus já usa a porta
    const ocupada = await fetch(BASE, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false)
    if (ocupada) throw new Error(`A porta ${PORTA} já está em uso por outro programa.`)
    log('[visao] ligando o servidor')
    servidor = iniciar('npm', ['run', 'dev', '--', '--port', String(PORTA), '--strictPort'], pastaVisao())
    servidorNosso = true
    let saida = ''
    const guardar = (d: Buffer) => { saida = (saida + d.toString()).slice(-3000) }
    servidor.stdout?.on('data', guardar)
    servidor.stderr?.on('data', guardar)
    const este = servidor
    let saiu = false
    este.on('close', (codigo) => {
      saiu = true
      log(`[visao] servidor parou (código ${codigo}): ${saida.trim().slice(-800)}`)
      if (servidor === este) { servidor = null; servidorNosso = false }
    })
    // Na primeira vez o servidor prepara o Cesium, que demora mais
    const limite = Date.now() + 150_000
    while (Date.now() < limite) {
      if (saiu) throw new Error(`O servidor da Visão de Deus fechou sozinho: ${ultimaLinha(saida)}`)
      if (await respondendo()) { log('[visao] servidor pronto'); return }
      await new Promise((r) => setTimeout(r, 700))
    }
    throw new Error('O servidor da Visão de Deus demorou demais para responder.')
  })().finally(() => { subindo = null })
  return subindo
}

function desligarServidor(): void {
  if (servidor && servidorNosso) {
    log('[visao] desligando o servidor')
    matarArvore(servidor)
  }
  servidor = null
  servidorNosso = false
}

// ---------- Janela ----------

let janela: BrowserWindow | null = null

function mostrar(vista: Vista): void {
  // O parâmetro "r" força recarregar: o app só lê o link quando a página abre
  const url = `${BASE}?r=${Date.now()}#${montarHash(vista)}`
  if (janela && !janela.isDestroyed()) {
    janela.loadURL(url)
    if (janela.isMinimized()) janela.restore()
    janela.show()
    janela.focus()
    return
  }
  janela = new BrowserWindow({
    width: 1400,
    height: 860,
    show: false,
    backgroundColor: '#04070b',
    autoHideMenuBar: true,
    title: 'Visão de Deus · F.R.I.D.A.Y',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  janela.maximize()
  janela.once('ready-to-show', () => janela?.show())
  // Links externos abrem no navegador; a janela nunca sai do globo
  janela.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (/^https:\/\//i.test(destino)) void shell.openExternal(destino)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (e, destino) => { if (!destino.startsWith(BASE)) e.preventDefault() })
  janela.webContents.on('render-process-gone', (_e, d) => log(`[visao] a página caiu: ${d.reason}`))
  janela.on('closed', () => { janela = null; desligarServidor() })
  janela.loadURL(url)
}

export const aberta = (): boolean => !!janela && !janela.isDestroyed()

// ---------- Lugar ----------

export interface Lugar { nome: string; lat: number; lon: number; alt: number }

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'FRIDAY-by-Harle/0.3 (assistente pessoal)', 'Accept-Language': 'pt-BR' } })
  if (!r.ok) throw new Error(`O serviço de mapas respondeu ${r.status}.`)
  return (await r.json()) as T
}

/** Acha o lugar falado (cidade, país, monumento, endereço) pelo OpenStreetMap. */
export async function acharLugar(nome: string): Promise<Lugar> {
  type Resultado = { lat: string; lon: string; name?: string; display_name: string; boundingbox: [string, string, string, string] }
  try {
    const r = await json<Resultado[]>(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nome)}&format=jsonv2&limit=1&accept-language=pt-BR`)
    const x = r[0]
    if (x) {
      const [sul, norte, oeste, leste] = x.boundingbox.map(Number)
      return { nome: x.name || x.display_name.split(',')[0], lat: Number(x.lat), lon: Number(x.lon), alt: altitudePorCaixa(sul, norte, oeste, leste) }
    }
  } catch (e) {
    log(`[visao] OpenStreetMap falhou: ${(e as Error).message}`)
  }
  // Reserva: geocodificação do Open-Meteo (só cidades)
  const d = await json<{ results?: { name: string; latitude: number; longitude: number }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt&format=json`
  )
  const c = d.results?.[0]
  if (!c) throw new Error(`Não achei "${nome}" no mapa.`)
  return { nome: c.name, lat: c.latitude, lon: c.longitude, alt: 40_000 }
}

// ---------- O que as ferramentas chamam ----------

let vistaAtual: Vista = { ...VISTA_PLANETA, estilo: 'normal', camadas: [] }

export function vistaPlaneta(): Omit<Vista, 'estilo' | 'camadas'> {
  return { ...VISTA_PLANETA }
}

/**
 * Abre (ou atualiza) a Visão de Deus. Só o que mudou é trocado: pedir outro lugar mantém
 * as camadas e o estilo. Liga o servidor se precisar; resolve quando a janela foi aberta.
 */
export async function abrir(mudancas: Partial<Vista>): Promise<void> {
  vistaAtual = { ...vistaAtual, ...mudancas }
  await subirServidor()
  mostrar(vistaAtual)
}

export function fechar(): boolean {
  const estava = aberta() || !!servidor
  if (janela && !janela.isDestroyed()) janela.close()
  else desligarServidor()
  return estava
}

/** Ao sair da FRIDAY */
export function encerrar(): void {
  desligarServidor()
}
