// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Processo principal: janela do HUD sobreposta à área de trabalho, ícone na bandeja,
// atalho de emergência e a ponte entre a IA e o Windows.

import { app, BrowserWindow, Menu, Notification, Tray, globalShortcut, ipcMain, nativeImage, net, powerMonitor, protocol, screen, session, shell } from 'electron'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { carregarConfig, carregarFish, diagnosticoChave, resourcesDir } from './config'
import * as fish from './fish'
import { executarFerramenta, configurarFerramentas } from './tools'
import { iniciarLembretes } from './reminders'
import { iniciarTarefas, caminhoProjetos, type Tarefa } from './tarefas'
import { arquivoApps, carregarApps } from './apps'
import * as winctl from './winctl'
import * as visao from './visao'
import { listarArquivos, pastaModelos } from './modelos3d'
import { aparelhosPareados, iniciarElo, encerrarElo, enviarParaCelular, registrarContextoPc } from './elo'
import { configurarConsultas, retomarConsulta, type EventoConsulta } from './consultas'
import { encerrarWhats, mostrarWhats } from './whatsweb'
import { criarLembrete } from './reminders'
import { manterCasa } from './ligar-de-fora'
import type { EstadoConsulta } from '../shared/consulta'
import { sincronizar } from './memoria'
import { TOOLS_DO_HUD, TOOLS_REMOTAS } from '../shared/tools'

type RespostaRemota = { ok: boolean; mensagem: string; precisaConfirmacao?: boolean }
const pendentesHud = new Map<number, (r: RespostaRemota) => void>()
let proximoPedido = 1

/** Ferramenta do HUD pedida pelo celular: o HUD executa e devolve o resultado. */
function ferramentaNoHud(nome: string, args: Record<string, unknown>): Promise<RespostaRemota> {
  if (!win) return Promise.resolve({ ok: false, mensagem: 'A FRIDAY do PC não está aberta.' })
  const id = proximoPedido++
  return new Promise((ok) => {
    pendentesHud.set(id, ok)
    win?.webContents.send('elo-ferramenta', id, nome, args)
    setTimeout(() => { if (pendentesHud.delete(id)) ok({ ok: false, mensagem: 'O PC demorou demais para responder.' }) }, 20_000)
  })
}

// ---------- Iniciar com o Windows ----------

const arquivoInicio = (): string => join(app.getPath('userData'), 'inicio.json')
/** Fora do instalador, quem abre é o electron.exe do projeto apontando para a pasta da FRIDAY. */
const opcaoInicio = (): { path?: string; args?: string[] } => (app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] })
const versaoMontada = (): boolean => app.isPackaged || existsSync(join(app.getAppPath(), 'out', 'renderer', 'index.html'))

function iniciaComWindows(): boolean {
  try { return app.getLoginItemSettings(opcaoInicio()).openAtLogin } catch { return false }
}

function definirInicio(ligar: boolean, avisar = true): void {
  if (ligar && !versaoMontada()) {
    new Notification({ title: 'F.R.I.D.A.Y', body: 'Para abrir com o Windows, monte a FRIDAY uma vez: rode "npm run build" (ou o instalar.bat).' }).show()
    atualizarBandeja()
    return
  }
  app.setLoginItemSettings({ openAtLogin: ligar, ...opcaoInicio() })
  try { writeFileSync(arquivoInicio(), JSON.stringify({ escolhido: true, ligar })) } catch { /* sem disco */ }
  log('main', `iniciar com o Windows: ${ligar ? 'ligado' : 'desligado'}`)
  if (avisar) new Notification({ title: 'F.R.I.D.A.Y', body: ligar ? 'Ela abre sozinha quando o Windows ligar.' : 'Ela não abre mais sozinha com o Windows.' }).show()
  atualizarBandeja()
}

/** Primeira vez rodando a versão montada (não o "npm run dev"): já liga o início com o Windows. */
function inicioNaPrimeiraVez(): void {
  if (process.env.ELECTRON_RENDERER_URL || existsSync(arquivoInicio())) return
  definirInicio(true, false)
  new Notification({ title: 'F.R.I.D.A.Y', body: 'Pronto: ela vai abrir sozinha quando o Windows ligar. Dá para desligar no ícone da bandeja.' }).show()
}

/** Puxa a versão nova do GitHub, monta e abre de novo (atualizar.bat, numa janela à parte). */
function atualizarFriday(): void {
  const bat = join(app.getAppPath(), 'atualizar.bat')
  if (!existsSync(bat)) return
  void shell.openPath(bat)
  setTimeout(() => app.quit(), 800)
}

// ---------- Consultas pelo WhatsApp ----------

/** O agente de consultas precisa de você: fala no PC se você estiver nele; senão, notificação e celular. */
function avisoDaConsulta(e: EventoConsulta): void {
  log('consulta', `${e.tipo}: ${e.texto}`)
  const noPc = !!win && !silenciada && powerMonitor.getSystemIdleState(120) === 'active'
  if (e.tipo === 'qr') {
    win?.webContents.send('consulta', e)
    new Notification({ title: 'F.R.I.D.A.Y · conectar o WhatsApp', body: e.texto }).show()
    return
  }
  if (noPc) { win?.webContents.send('consulta', e); return }
  new Notification({ title: e.tipo === 'pergunta' ? 'F.R.I.D.A.Y · consulta: sua vez' : 'F.R.I.D.A.Y · consulta', body: e.texto }).show()
  if (aparelhosPareados().length) {
    enviarParaCelular({ tipo: 'aviso', consulta: e.tipo === 'pergunta' ? 'pergunta' : 'fim', texto: e.tipo === 'pergunta' ? `Sobre a consulta que estou marcando no PC: ${e.texto} Pode me responder por aqui.` : e.texto })
  }
}

/** Consulta marcada: lembrete no PC 2 horas antes e o evento na agenda do celular pareado. */
function consultaMarcada(e: EstadoConsulta): void {
  const ev = e.evento
  if (!ev) return
  const inicio = new Date(ev.inicioIso)
  if (Number.isNaN(inicio.getTime())) return
  const hora = inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const antes = new Date(inicio.getTime() - 2 * 3600_000)
  if (antes.getTime() > Date.now()) {
    try { criarLembrete(`${ev.titulo} às ${hora}${ev.local ? `, ${ev.local}` : ''}`, antes.toISOString()) } catch (erro) { log('consulta', `lembrete: ${(erro as Error).message}`) }
  }
  if (aparelhosPareados().length) {
    const fim = ev.fimIso || new Date(inicio.getTime() + 3600_000).toISOString()
    enviarParaCelular({ tipo: 'evento', titulo: ev.titulo, inicioIso: ev.inicioIso, fimIso: fim, local: ev.local, descricao: e.resumo })
  }
}

async function mostrarPareamento(): Promise<void> {
  const r = await executarFerramenta('parear_celular', {})
  if (r.card) win?.webContents.send('cartao', r.card, 300_000)
  else new Notification({ title: 'F.R.I.D.A.Y', body: r.mensagem }).show()
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'friday-assets', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

// ---------- Central do quarto ----------

/** Enquanto a central (o celular em casa) estiver no ar, o PC não ouve "Friday": fica só nas mãos. */
let centralAte = 0
let centralNome = ''
let centralAvisada = false
const centralNoAr = (): boolean => Date.now() < centralAte

function mudouCentral(): void {
  const ativa = centralNoAr()
  if (ativa === centralAvisada) return
  centralAvisada = ativa
  log('central', ativa ? `${centralNome} é a central: o PC parou de ouvir "Friday"` : 'a central saiu do ar: o PC volta a ouvir "Friday"')
  win?.webContents.send('central', ativa, centralNome)
  atualizarBandeja()
}

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
      ...(centralNoAr() ? [{ label: `Ouvindo pelo ${centralNome || 'celular'} (central do quarto)`, enabled: false }] : []),
      { type: 'separator' },
      { label: silenciada ? 'Voltar a ouvir (Ctrl+Alt+Espaço)' : 'Silenciar (Ctrl+Alt+Espaço)', click: alternarSilencio },
      { label: 'Editar programas permitidos', click: () => { carregarApps(); shell.openPath(arquivoApps()) } },
      { label: 'Editar projetos de programação', click: () => shell.openPath(caminhoProjetos()) },
      { label: 'Parear celular', click: () => void mostrarPareamento() },
      { label: 'Ver o WhatsApp da FRIDAY (consultas)', click: () => mostrarWhats() },
      { label: 'Iniciar com o Windows', type: 'checkbox', checked: iniciaComWindows(), click: (item) => definirInicio(item.checked) },
      ...(!app.isPackaged && existsSync(join(app.getAppPath(), 'atualizar.bat')) ? [{ label: 'Atualizar a FRIDAY', click: atualizarFriday }] : []),
      { label: 'Abrir pasta de modelos 3D', click: () => { listarArquivos(); shell.openPath(pastaModelos()) } },
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
    // Tipo certo para o WebAssembly e os scripts do reconhecimento de mãos
    const tipos: Record<string, string> = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.task': 'application/octet-stream' }
    const tipo = tipos[extname(arquivo).toLowerCase()]
    if (!tipo) return net.fetch(pathToFileURL(arquivo).toString())
    if (!existsSync(arquivo)) return new Response('Não encontrado', { status: 404 })
    return new Response(readFileSync(arquivo), { headers: { 'Content-Type': tipo } })
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
  ipcMain.on('elo-resposta', (_e, id: number, r: RespostaRemota) => {
    const f = pendentesHud.get(id)
    if (f) { pendentesHud.delete(id); f(r) }
  })
  ipcMain.on('contexto', (_e, texto: string) => registrarContextoPc(String(texto)))

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
  inicioNaPrimeiraVez()
  winctl.aquecer()

  if (!globalShortcut.register('Control+Alt+Space', alternarSilencio)) {
    new Notification({ title: 'F.R.I.D.A.Y', body: 'O atalho Ctrl+Alt+Espaço já está em uso por outro programa.' }).show()
  }

  // Avisos que chegam depois que a ferramenta já respondeu (ex.: a Visão de Deus terminou de instalar)
  const avisarEmSegundoPlano = (texto: string, ok: boolean): void => {
    log('aviso', texto)
    win?.webContents.send('aviso', texto, ok)
    if (!ok) new Notification({ title: 'F.R.I.D.A.Y', body: texto }).show()
  }
  configurarFerramentas({ janela: () => win, avisar: avisarEmSegundoPlano })

  // Elo com o celular: avisos, ações pedidas pelo celular, memória e contexto compartilhados
  void iniciarElo({
    log: (t) => log('elo', t),
    async aviso(texto, ligacao) {
      // Só fala aqui se você estiver usando o PC agora; senão o celular fala
      if (!win || silenciada || powerMonitor.getSystemIdleState(90) !== 'active') return false
      win.webContents.send('elo-aviso', texto, ligacao)
      return true
    },
    async ferramenta(nome, args) {
      if (!(TOOLS_REMOTAS as readonly string[]).includes(nome)) return { ok: false, mensagem: `O celular não pode pedir "${nome}" ao PC.` }
      log('elo', `o celular pediu: ${nome}`)
      if ((TOOLS_DO_HUD as readonly string[]).includes(nome)) return ferramentaNoHud(nome, args)
      const r = await executarFerramenta(nome, args)
      if (r.card) win?.webContents.send('cartao', r.card, 8000)
      return { ok: r.ok, mensagem: r.mensagem, ...(r.precisaConfirmacao ? { precisaConfirmacao: true } : {}) }
    },
    memoria: (fatos, esquecidos) => sincronizar(fatos, esquecidos),
    pareou: (aparelho) => avisarEmSegundoPlano(`${aparelho} pareado. Agora a FRIDAY do PC e a do celular são uma só.`, true),
    central(ativa, aparelho) {
      // A central avisa a cada 30 s; sem notícia por 75 s, o PC volta a ouvir
      centralAte = ativa ? Date.now() + 75_000 : 0
      centralNome = aparelho
      mudouCentral()
    }
  })
  setInterval(mudouCentral, 10_000)
  // O HUD recarregou: diz de novo quem está ouvindo
  win?.webContents.on('did-finish-load', () => { if (centralNoAr()) win?.webContents.send('central', true, centralNome) })
  // Porta do roteador e endereço de casa sempre em dia (para o celular ligar o PC de fora)
  manterCasa((t) => log('casa', t))
  configurarConsultas({ avisar: avisoDaConsulta, marcou: consultaMarcada, log: (t) => log('consulta', t) })
  // Uma consulta pela metade (a FRIDAY fechou no meio) continua de onde parou
  setTimeout(() => { if (retomarConsulta()) log('consulta', 'retomando a consulta em andamento') }, 15_000)
  visao.configurarVisao({ log: (t) => log('main', t), avisar: avisarEmSegundoPlano })
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
  visao.encerrar()
  encerrarElo()
  encerrarWhats()
})
app.on('window-all-closed', () => app.quit())
