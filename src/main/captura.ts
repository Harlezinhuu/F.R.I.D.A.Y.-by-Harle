// Captura de tela sem o próprio HUD aparecer no print.

import { app, desktopCapturer, screen, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function capturarTela(win: BrowserWindow | null): Promise<{ caminho: string; nomeAmigavel: string; miniatura: string }> {
  const display = screen.getPrimaryDisplay()
  const largura = Math.round(display.size.width * display.scaleFactor)
  const altura = Math.round(display.size.height * display.scaleFactor)

  win?.setOpacity(0)
  await esperar(180)
  try {
    const fontes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: largura, height: altura } })
    const fonte = fontes.find((f) => f.display_id === String(display.id)) ?? fontes[0]
    if (!fonte || fonte.thumbnail.isEmpty()) throw new Error('O Windows não entregou a imagem da tela.')
    const pasta = path.join(app.getPath('pictures'), 'FRIDAY')
    mkdirSync(pasta, { recursive: true })
    const agora = new Date()
    const dois = (n: number) => String(n).padStart(2, '0')
    const nome = `print-${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}${dois(agora.getSeconds())}.png`
    const caminho = path.join(pasta, nome)
    writeFileSync(caminho, fonte.thumbnail.toPNG())
    const miniatura = fonte.thumbnail.resize({ width: 480 }).toDataURL()
    return { caminho, nomeAmigavel: `Imagens/FRIDAY/${nome}`, miniatura }
  } finally {
    win?.setOpacity(1)
  }
}
