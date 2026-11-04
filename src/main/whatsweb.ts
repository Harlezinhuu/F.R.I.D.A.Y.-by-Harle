// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// As "mãos" do agente de consultas no PC: o WhatsApp Web numa janela da própria FRIDAY (escondida).
// Na primeira vez ela mostra o QR para você ler no celular (WhatsApp > Aparelhos conectados); depois
// a sessão fica guardada só neste PC (pasta de dados da FRIDAY) e a janela trabalha escondida.
// Dá para ver o que ela está fazendo a qualquer momento pelo ícone da bandeja ("Ver WhatsApp da FRIDAY").

import { BrowserWindow, session, shell } from 'electron'
import type { Leitura, Lugar, Maos } from '../shared/consulta'
import * as P from './logica/whatsweb-pagina'

const PARTICAO = 'persist:whatsapp'
const URL_WA = 'https://web.whatsapp.com/'

let jan: BrowserWindow | null = null
let saindo = false
let soltarEm: ReturnType<typeof setTimeout> | undefined

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

function janela(): BrowserWindow {
  clearTimeout(soltarEm)
  if (jan && !jan.isDestroyed()) return jan
  const s = session.fromPartition(PARTICAO)
  // O WhatsApp Web só abre em navegadores que ele conhece
  s.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`)
  s.setPermissionRequestHandler((_wc, _p, responder) => responder(false))
  jan = new BrowserWindow({
    width: 1000,
    height: 760,
    show: false,
    title: 'WhatsApp · F.R.I.D.A.Y',
    autoHideMenuBar: true,
    webPreferences: { partition: PARTICAO, backgroundThrottling: false, sandbox: true, contextIsolation: true }
  })
  jan.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Fechar a janela só esconde: a conversa continua
  jan.on('close', (e) => { if (!saindo) { e.preventDefault(); jan?.hide() } })
  jan.on('closed', () => { jan = null })
  return jan
}

const js = <T>(codigo: string): Promise<T> => janela().webContents.executeJavaScript(codigo, true) as Promise<T>

async function esperarAte<T>(f: () => Promise<T | null | undefined | false>, ms: number, passo = 700): Promise<T | null> {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    try {
      const v = await f()
      if (v) return v
    } catch { /* página trocando */ }
    await esperar(passo)
  }
  return null
}

/** Mostra a janela (para você ver o que ela está fazendo, ou ler o QR). */
export function mostrarWhats(): void {
  const w = janela()
  if (!w.webContents.getURL()) void w.loadURL(URL_WA)
  w.show()
  w.focus()
}

/** Garante o WhatsApp Web aberto e conectado; na primeira vez, mostra o QR e espera você ler. */
export async function conectar(aoPrecisarQr: () => void, limiteQrMs = 5 * 60_000): Promise<void> {
  const w = janela()
  if (!w.webContents.getURL().startsWith(URL_WA)) await w.loadURL(URL_WA)
  const s = await esperarAte(async () => { const x = await js<string>(P.SITUACAO); return x === 'carregando' ? null : x }, 60_000)
  if (s === 'logado') return
  if (s !== 'qr') throw new Error('o WhatsApp Web não carregou (confira a internet)')
  w.show()
  w.focus()
  aoPrecisarQr()
  const ok = await esperarAte(async () => (await js<string>(P.SITUACAO)) === 'logado', limiteQrMs, 1500)
  if (!ok) throw new Error('o WhatsApp não foi conectado: o QR não foi lido a tempo')
  await esperar(2500)
  w.hide()
}

async function abrirConversa(numero: string): Promise<void> {
  const w = janela()
  await w.loadURL(`${URL_WA}send?phone=${encodeURIComponent(numero)}`)
  const r = await esperarAte(async () => { const x = await js<string>(P.CONVERSA_ABERTA); return x === 'nao' ? null : x }, 60_000)
  if (r === 'invalido') throw new Error('esse número não tem WhatsApp')
  if (r === 'leitura') throw new Error('não dá para escrever nessa conversa')
  if (r !== 'sim') throw new Error('a conversa não abriu no WhatsApp Web')
}

async function enviarTexto(t: string): Promise<void> {
  const w = janela()
  let r = await js<string>(`(${P.ENVIAR})(${JSON.stringify(t)})`)
  if (r === 'sem-caixa') throw new Error('a caixa de mensagem sumiu')
  if (r === 'nao-escreveu') {
    // Plano B: digita como teclado
    await js<boolean>(P.FOCAR)
    w.webContents.focus()
    w.webContents.insertText(t)
    await esperar(400)
    r = await js<string>(P.CLICAR_ENVIAR)
    if (r === 'nao-escreveu') throw new Error('não consegui escrever na caixa de mensagem')
  }
  if (r === 'sem-botao') {
    w.webContents.focus()
    for (const type of ['keyDown', 'char', 'keyUp'] as const) w.webContents.sendInputEvent({ type, keyCode: type === 'char' ? '\r' : 'Enter' })
  }
  const saiu = await esperarAte(() => js<boolean>(`(${P.SAIU})(${JSON.stringify(t)})`), 10_000, 500)
  if (!saiu) throw new Error('a mensagem não saiu no WhatsApp Web')
}

async function tocar(rotulo: string): Promise<void> {
  const ok = await js<boolean>(`(${P.TOCAR})(${JSON.stringify(rotulo)})`)
  if (!ok) throw new Error('esse botão não está na tela')
  await esperar(900)
}

/** Depois de terminar, a janela fica 10 minutos à toa e então fecha (a sessão continua salva). */
function soltar(): void {
  clearTimeout(soltarEm)
  soltarEm = setTimeout(() => { if (jan && !jan.isVisible()) { saindo = true; jan.destroy(); saindo = false; jan = null } }, 10 * 60_000)
}

export function encerrarWhats(): void {
  saindo = true
  clearTimeout(soltarEm)
  if (jan && !jan.isDestroyed()) jan.destroy()
  jan = null
}

/** As mãos do agente no PC. */
export function maosDoPc(aoPrecisarQr: () => void): Maos {
  let numero = ''
  return {
    async abrir(l: Lugar) {
      numero = l.whatsapp
      await conectar(aoPrecisarQr)
      await abrirConversa(numero)
    },
    async ler(): Promise<Leitura> {
      let r = await js<Leitura | null>(P.LER).catch(() => null)
      if (!r) {
        // A página recarregou ou a conversa fechou: abre de novo
        await conectar(aoPrecisarQr)
        await abrirConversa(numero)
        r = await js<Leitura | null>(P.LER)
        if (!r) throw new Error('a conversa fechou no WhatsApp Web')
      }
      return r
    },
    enviar: enviarTexto,
    tocar,
    fechar: soltar,
    limites: 'Você vê os botões das mensagens e as listas que abrem na tela (tocar funciona).'
  }
}
