// Lembretes salvos em disco: continuam valendo se o PC reiniciar.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Lembrete } from '../shared/types'

const arquivo = (): string => join(app.getPath('userData'), 'lembretes.json')
const timers = new Map<string, NodeJS.Timeout>()
let aoDisparar: (l: Lembrete) => void = () => {}

function ler(): Lembrete[] {
  try { return existsSync(arquivo()) ? (JSON.parse(readFileSync(arquivo(), 'utf8')) as Lembrete[]) : [] } catch { return [] }
}
function salvar(lista: Lembrete[]): void { writeFileSync(arquivo(), JSON.stringify(lista, null, 2), 'utf8') }

function agendar(l: Lembrete): void {
  const falta = new Date(l.quandoIso).getTime() - Date.now()
  // setTimeout aceita no máximo ~24 dias; lembretes mais distantes são reagendados em etapas
  const espera = Math.min(Math.max(falta, 0), 2 ** 31 - 1)
  timers.set(l.id, setTimeout(() => {
    if (new Date(l.quandoIso).getTime() > Date.now() + 1000) return agendar(l)
    timers.delete(l.id)
    salvar(ler().filter((x) => x.id !== l.id))
    aoDisparar(l)
  }, espera))
}

export function iniciarLembretes(cb: (l: Lembrete) => void): void {
  aoDisparar = cb
  for (const l of ler()) agendar(l)
}

export function criarLembrete(texto: string, quandoIso: string): Lembrete {
  const quando = new Date(quandoIso)
  if (Number.isNaN(quando.getTime())) throw new Error('Não entendi o horário do lembrete.')
  if (quando.getTime() < Date.now() - 60_000) throw new Error('Esse horário já passou.')
  const l: Lembrete = { id: randomUUID(), texto: texto.trim(), quandoIso: quando.toISOString() }
  salvar([...ler(), l])
  agendar(l)
  return l
}

export const listarLembretes = (): Lembrete[] => ler().sort((a, b) => a.quandoIso.localeCompare(b.quandoIso))
