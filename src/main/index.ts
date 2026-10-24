// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Processo principal: janela do HUD sobreposta à área de trabalho, ícone na bandeja,
// atalho de emergência e a ponte entre a IA e o Windows.

import { app, BrowserWindow, Menu, Notification, Tray, globalShortcut, ipcMain, nativeImage, net, protocol, screen, session, shell } from 'electron'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { carregarConfig, carregarFish, diagnosticoChave, resourcesDir } from './config'
import * as fish from './fish'
import { executarFerramenta, configurarFerramentas } from './tools'
import { iniciarLembretes } from './reminders'
import { iniciarTarefas, caminhoProjetos, type Tarefa } from './tarefas'
import { arquivoApps, carregarApps } from './apps'
import * as winctl from './winctl'

protocol.registerSchemesAsPrivileged([
  { scheme: 'friday-assets', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

let win: BrowserWindow | null = null
let tray: Tray | null = null
let silenciada = false

if (!app.requestSingleInstanceLock()) app.quit()
// Nome certo nas notificações do Windows (em vez de "electron.app.Electron")
app.setAppUserModelId('dev.harle.friday')

function ajustarAoMonitor(): void {
  if (!win) return
  const { bounds } = screen.getPrimaryDisplay()
  win.setBounds(bounds)
}

function criarJanela(): void {
  const { bounds } = screen.getPrimaryDisplay()
  win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  // O HUD não tem botões: todos os cliques passam direto para o que está atrás dele
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)
  win.once('ready-to-show', () => win?.showInactive())

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  if (process.env.FRIDAY_DEBUG) win.webContents.openDevTools({ mode: 'detach' })
}

function alternarSilencio(): void {
  silenciada = !silenciada
  win?.webContents.send('silenciar', silenciada)
  atualizarBandeja()
}

function atualizarBandeja(): void {
  if (!tray) return
  tray.setToolTip(silenciada ? 'F.R.I.D.A.Y · silenciada' : 'F.R.I.D.A.Y · diga "Friday"')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'F.R.I.D.A.Y', enabled: false },
      { type: 'separator' },
      { label: silenciada ? 'Voltar a ouvir (Ctrl+Alt+Espaço)' : 'Silenciar (Ctrl+Alt+Espaço)', click: alternarSilencio },
      { label: 'Editar programas permitidos', click: () => { carregarApps(); shell.openPath(arquivoApps()) } },
      { label: 'Editar projetos de programação', click: () => shell.openPath(caminhoProjetos()) },
      { label: 'Abrir pasta de configuração', click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() }
    ])
  )
}

function criarBandeja(): void {
  const icone = join(resourcesDir(), 'icon.png')
  const imagem = existsSync(icone) ? nativeImage.createFromPath(icone).resize({ width: 16, height: 16 }) : nativeImage.createEmpty()
  tray = new Tray(imagem)
  atualizarBandeja()
}

function registrarProtocolo(): void {
  // Serve o modelo de palavra de ativação para o HUD, só de dentro da pasta resources
  protocol.handle('friday-assets', (req) => {
    const url = new URL(req.url)
    const base = resourcesDir()
    const arquivo = normalize(join(base, url.hostname, decodeURIComponent(url.pathname)))
    if (!arquivo.startsWith(base + sep)) return new Response('Proibido', { status: 403 })
    return net.fetch(pathToFileURL(arquivo).toString())
  })
}

/** Registro de diagnóstico: friday.log na pasta do projeto (ou na pasta de dados, no app instalado). */
const arquivoLog = (): string => join(app.isPackaged ? app.getPath('userData') : app.getAppPath(), 'friday.log')
function log(nivel: string, texto: string): void {
  // Chaves nunca vão para o log, nem dentro de mensagens de erro
  const limpo = texto
    .replace(/(key|token|authorization)=([^&\s"']+)/gi, '$1=***')
    .replace(/AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_.-]{20,}|sk-[0-9A-Za-z_-]{20,}|Bearer\s+\S+/g, '***')
  try { appendFileSync(arquivoLog(), `${new Date().toISOString()} [${nivel}] ${limpo}\n`) } catch { /* sem disco, sem log */ }
}

function registrarIpc(): void {
  ipcMain.on('log', (_e, nivel: string, texto: string) => log(nivel, String(texto).slice(0, 2000)))
  ipcMain.handle('config', () => {
    const c = carregarConfig()
    if (!c.apiKey) {
      new Notification({ title: 'F.R.I.D.A.Y · falta a chave do Gemini', body: diagnosticoChave() }).show()
    }
    return c
  })
  ipcMain.handle('ferramenta', (_e, nome: string, args: Record<string, unknown>) => executarFerramenta(nome, args))
  ipcMain.on('silencio-local', (_e, valor: boolean) => { silenciada = valor; atualizarBandeja() })

  // Voz pelo Fish Audio: o áudio volta em pedaços para o HUD tocar enquanto ainda está sendo gerado
  ipcMain.handle('fish-falar', async (e, id: number, texto: string) => {
    const cfg = carregarFish()
    if (!cfg.apiKey) return { ok: false, erro: 'Falta a FISH_API_KEY no .env.' }
    try {
      await fish.falar(cfg, id, texto, (b64) => { if (!e.sender.isDestroyed()) e.sender.send('fish-audio', id, b64, fish.FISH_SAMPLE_RATE) })
      return { ok: true }
    } catch (erro) {
      return { ok: false, erro: (erro as Error).message }
    }
  })
  ipcMain.on('fish-cancelar', () => fish.cancelarTudo())
}

app.whenReady().then(() => {
  try { writeFileSync(arquivoLog(), '') } catch { /* ignora */ }
  log('main', `FRIDAY iniciando · Electron ${process.versions.electron} · ${process.platform}`)
  session.defaultSession.setPermissionRequestHandler((_wc, permissao, responder) => responder(permissao === 'media'))
  session.defaultSession.setPermissionCheckHandler((_wc, permissao) => permissao === 'media')

  registrarProtocolo()
  registrarIpc()
  criarJanela()
  criarBandeja()
  winctl.aquecer()

  if (!globalShortcut.register('Control+Alt+Space', alternarSilencio)) {
    new Notification({ title: 'F.R.I.D.A.Y', body: 'O atalho Ctrl+Alt+Espaço já está em uso por outro programa.' }).show()
  }

  configurarFerramentas({ janela: () => win })
  iniciarTarefas((t: Tarefa) => {
    win?.webContents.send('tarefa', t)
    if (t.terminadaEm && ['pronta', 'sem mudanças', 'falhou'].includes(t.estado)) {
      const titulo = t.estado === 'pronta' ? `Tarefa ${t.id} pronta` : t.estado === 'falhou' ? `Tarefa ${t.id} falhou` : `Tarefa ${t.id} terminou sem mudanças`
      new Notification({ title: `F.R.I.D.A.Y · ${titulo}`, body: t.branch ? `${t.projeto}: branch ${t.branch}` : t.resumo.slice(0, 180) }).show()
    }
  })
  iniciarLembretes((l, atrasado) => {
    new Notification({ title: atrasado ? 'Lembrete atrasado da F.R.I.D.A.Y' : 'Lembrete da F.R.I.D.A.Y', body: l.texto }).show()
    win?.webContents.send('lembrete', l, atrasado)
  })

  screen.on('display-metrics-changed', ajustarAoMonitor)
  screen.on('display-added', ajustarAoMonitor)
  screen.on('display-removed', ajustarAoMonitor)
})

app.on('second-instance', () => win?.webContents.send('silenciar', silenciada))
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  winctl.encerrar()
})
app.on('window-all-closed', () => app.quit())
