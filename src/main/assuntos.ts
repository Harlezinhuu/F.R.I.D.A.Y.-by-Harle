// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Assuntos vigiados: a cada 3 horas ela busca notícias de cada assunto (Google, pelo Gemini) e
// avisa só o que é novo. No máximo 6 assuntos, para não gastar à toa.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buscarNaInternet } from '../shared/busca'
import { carregarConfig } from './config'
import { lerManchetes, mesmaNoticia, novas, perguntaDoAssunto, type Manchete } from './logica/assuntos'

export interface Assunto { tema: string; criadoEm: number; vistas: string[]; ultimaVez: number }

const MAX = 6
const arquivo = (): string => join(app.getPath('userData'), 'assuntos.json')
let opcoes: { avisar(texto: string): void; log(t: string): void } = { avisar() {}, log() {} }

export function lerAssuntos(): Assunto[] {
  try { if (existsSync(arquivo())) { const l = JSON.parse(readFileSync(arquivo(), 'utf8')); if (Array.isArray(l)) return l } } catch { /* refaz */ }
  return []
}
const salvar = (l: Assunto[]): void => { try { writeFileSync(arquivo(), JSON.stringify(l, null, 2)) } catch { /* sem disco */ } }

async function manchetesDe(tema: string): Promise<Manchete[]> {
  const r = await buscarNaInternet(carregarConfig().apiKey, perguntaDoAssunto(tema))
  return lerManchetes(r.texto)
}

/** Começa a vigiar: já devolve o que saiu até agora (e isso conta como visto). */
export async function vigiarAssunto(tema: string): Promise<{ jaTinha: boolean; manchetes: Manchete[] }> {
  const t = tema.trim().slice(0, 80)
  const lista = lerAssuntos()
  const ja = lista.find((a) => mesmaNoticia(a.tema, t) || a.tema.toLowerCase() === t.toLowerCase())
  if (!ja && lista.length >= MAX) throw new Error(`Já estou vigiando ${MAX} assuntos (${lista.map((a) => a.tema).join(', ')}). Peça para parar um antes.`)
  const ms = await manchetesDe(t)
  const alvo = ja ?? { tema: t, criadoEm: Date.now(), vistas: [], ultimaVez: 0 }
  alvo.vistas = [...alvo.vistas, ...ms.map((m) => m.texto)].slice(-60)
  alvo.ultimaVez = Date.now()
  salvar(ja ? lista : [...lista, alvo])
  return { jaTinha: !!ja, manchetes: ms }
}

export function pararAssunto(tema: string): Assunto | null {
  const lista = lerAssuntos()
  const a = lista.find((x) => x.tema.toLowerCase().includes(tema.toLowerCase()) || mesmaNoticia(x.tema, tema))
  if (!a) return null
  salvar(lista.filter((x) => x !== a))
  return a
}

async function passada(): Promise<void> {
  if (!carregarConfig().apiKey) return
  const lista = lerAssuntos()
  for (const a of lista) {
    if (Date.now() - a.ultimaVez < 2.5 * 3600_000) continue
    try {
      const ms = novas(await manchetesDe(a.tema), a.vistas)
      a.ultimaVez = Date.now()
      if (ms.length) {
        a.vistas = [...a.vistas, ...ms.map((m) => m.texto)].slice(-60)
        opcoes.avisar(`Novidade sobre ${a.tema}: ${ms.slice(0, 2).map((m) => m.texto).join(' Também: ')}`)
      }
    } catch (e) {
      opcoes.log(`assunto ${a.tema}: ${(e as Error).message}`)
    }
  }
  salvar(lista)
}

export function iniciarAssuntos(o: typeof opcoes): void {
  opcoes = o
  setTimeout(() => void passada(), 10 * 60_000)
  setInterval(() => void passada(), 30 * 60_000)
}
