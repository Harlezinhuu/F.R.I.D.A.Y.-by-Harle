// Lista de programas que a FRIDAY pode abrir e fechar.
// Fica num arquivo editável (apps.json na pasta de dados), então você adiciona os seus.
// A IA só escolhe um NOME desta lista; o comando de abrir vem do arquivo, nunca da IA.

import { app } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface AppConfig {
  nome: string
  apelidos: string[]
  /** O que passar para o "start" do Windows: um programa conhecido (chrome) ou um link de app (spotify:) */
  alvo: string
  /** Nome do processo para fechar. null = a FRIDAY nunca fecha este programa. */
  processo: string | null
}

const PADRAO: AppConfig[] = [
  { nome: 'Spotify', apelidos: ['spotify', 'música', 'musica'], alvo: 'spotify:', processo: 'Spotify.exe' },
  { nome: 'Discord', apelidos: ['discord'], alvo: 'discord://', processo: 'Discord.exe' },
  { nome: 'Steam', apelidos: ['steam'], alvo: 'steam://open/main', processo: 'steam.exe' },
  { nome: 'Google Chrome', apelidos: ['chrome', 'google chrome', 'navegador'], alvo: 'chrome', processo: 'chrome.exe' },
  { nome: 'Microsoft Edge', apelidos: ['edge'], alvo: 'msedge', processo: 'msedge.exe' },
  { nome: 'Visual Studio Code', apelidos: ['vs code', 'vscode', 'code', 'visual studio code'], alvo: 'code', processo: 'Code.exe' },
  { nome: 'Bloco de Notas', apelidos: ['bloco de notas', 'notepad', 'notas'], alvo: 'notepad', processo: 'notepad.exe' },
  { nome: 'Calculadora', apelidos: ['calculadora'], alvo: 'calc', processo: 'CalculatorApp.exe' },
  { nome: 'Explorador de Arquivos', apelidos: ['explorador', 'arquivos', 'explorer'], alvo: 'explorer', processo: null },
  { nome: 'Gerenciador de Tarefas', apelidos: ['gerenciador de tarefas', 'task manager'], alvo: 'taskmgr', processo: null }
]

export const arquivoApps = (): string => join(app.getPath('userData'), 'apps.json')

export function carregarApps(): AppConfig[] {
  const arquivo = arquivoApps()
  if (!existsSync(arquivo)) {
    mkdirSync(dirname(arquivo), { recursive: true })
    writeFileSync(arquivo, JSON.stringify(PADRAO, null, 2), 'utf8')
    return PADRAO
  }
  try {
    const lista = JSON.parse(readFileSync(arquivo, 'utf8')) as AppConfig[]
    return Array.isArray(lista) ? lista.filter((a) => a && typeof a.nome === 'string' && typeof a.alvo === 'string') : PADRAO
  } catch {
    return PADRAO
  }
}

const normalizar = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function encontrarApp(nome: string): AppConfig | null {
  const alvo = normalizar(nome)
  if (!alvo) return null
  const apps = carregarApps()
  const nomes = (a: AppConfig) => [a.nome, ...(a.apelidos ?? [])].map(normalizar)
  return (
    apps.find((a) => nomes(a).includes(alvo)) ??
    apps.find((a) => nomes(a).some((n) => n.includes(alvo) || alvo.includes(n))) ??
    null
  )
}

export function abrir(a: AppConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    if (/["&|<>^%]/.test(a.alvo)) return reject(new Error(`O alvo de ${a.nome} no apps.json tem caracteres não permitidos.`))
    // "start" resolve tanto programas registrados no Windows quanto links como spotify:
    const p = spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${a.alvo}"`], {
      windowsHide: true, detached: true, stdio: 'ignore', windowsVerbatimArguments: true
    })
    p.once('error', reject)
    p.once('spawn', () => { p.unref(); resolve() })
  })
}

export function fechar(a: AppConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!a.processo) return reject(new Error(`A FRIDAY não tem permissão para fechar ${a.nome}.`))
    execFile('taskkill', ['/IM', a.processo, '/F'], { windowsHide: true }, (erro, _out, stderr) => {
      if (erro) reject(new Error(stderr.includes('not found') || stderr.includes('não') ? `${a.nome} não está aberto.` : `Não consegui fechar ${a.nome}.`))
      else resolve()
    })
  })
}
