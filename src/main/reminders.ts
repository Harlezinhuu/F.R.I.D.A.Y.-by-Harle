// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Lembretes e timers salvos em disco: continuam valendo se o PC reiniciar.
// Os que venceram com o PC desligado são avisados como atrasados ao ligar.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Lembrete } from '../shared/types'
import { proximaOcorrencia, primeiraOcorrencia, type Repeticao } from './logica/recorrencia'

const ATRASO_TOLERADO_MS = 2 * 60_000

const arquivo = (): string => join(app.getPath('userData'), 'lembretes.json')
const timers = new Map<string, NodeJS.Timeout>()
let aoDisparar: (l: Lembrete, atrasado: boolean) => void = () => {}

function ler(): Lembrete[] {
  try {
    const lista = existsSync(arquivo()) ? (JSON.parse(readFileSync(arquivo(), 'utf8')) as Lembrete[]) : []
    return Array.isArray(lista) ? lista.filter((l) => l && typeof l.id === 'string' && !Number.isNaN(new Date(l.quandoIso).getTime())) : []
  } catch {
    return []
  }
}

function salvar(lista: Lembrete[]): void {
  // Grava num arquivo temporário e troca: um desligamento no meio não corrompe a lista
  const tmp = `${arquivo()}.tmp`
  writeFileSync(tmp, JSON.stringify(lista, null, 2), 'utf8')
  renameSync(tmp, arquivo())
}

function disparar(l: Lembrete): void {
  timers.delete(l.id)
  const atrasado = Date.now() - new Date(l.quandoIso).getTime() > ATRASO_TOLERADO_MS
  const lista = ler().filter((x) => x.id !== l.id)
  const proxima = proximaOcorrencia(new Date(l.quandoIso), (l.repetir ?? 'nunca') as Repeticao, new Date())
  if (proxima) {
    const seguinte = { ...l, quandoIso: proxima.toISOString() }
    lista.push(seguinte)
    agendar(seguinte)
  }
  salvar(lista)
  aoDisparar(l, atrasado)
}

function agendar(l: Lembrete): void {
  clearTimeout(timers.get(l.id))
  const falta = new Date(l.quandoIso).getTime() - Date.now()
  // setTimeout aceita no máximo ~24 dias; lembretes mais distantes são reagendados em etapas
  const espera = Math.min(Math.max(falta, 0), 2 ** 31 - 1)
  timers.set(l.id, setTimeout(() => {
    if (new Date(l.quandoIso).getTime() > Date.now() + 1000) return agendar(l)
    disparar(l)
  }, espera))
}

export function iniciarLembretes(cb: (l: Lembrete, atrasado: boolean) => void): void {
  aoDisparar = cb
  // Espera o HUD carregar para os atrasados aparecerem na tela
  setTimeout(() => { for (const l of ler()) agendar(l) }, 4000)
}

export function criarLembrete(texto: string, quandoIso: string, repetir: Repeticao = 'nunca', timer = false): Lembrete {
  const pedido = new Date(quandoIso)
  if (Number.isNaN(pedido.getTime())) throw new Error('Não entendi o horário do lembrete.')
  let quando = primeiraOcorrencia(pedido, repetir)
  if (quando.getTime() < Date.now() - 60_000) {
    // "todo dia às 8" pedido às 10 começa amanhã; um lembrete único no passado é recusado
    const proxima = proximaOcorrencia(quando, repetir, new Date())
    if (!proxima) throw new Error('Esse horário já passou.')
    quando = proxima
  }
  const l: Lembrete = { id: randomUUID(), texto: texto.trim().slice(0, 200), quandoIso: quando.toISOString(), repetir, timer }
  salvar([...ler(), l])
  agendar(l)
  return l
}

export const listarLembretes = (): Lembrete[] => ler().sort((a, b) => a.quandoIso.localeCompare(b.quandoIso))

const normalizar = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Cancela pelo texto ("o do dentista") ou todos os timers. Devolve os cancelados. */
export function cancelarLembretes(trecho: string, soTimers = false): Lembrete[] {
  const alvo = normalizar(trecho)
  const lista = ler()
  const cancelados = lista.filter((l) => (soTimers ? l.timer : true) && (!alvo || normalizar(l.texto).includes(alvo)))
  if (!cancelados.length) return []
  // Sem texto e sem ser timer: não cancela tudo de uma vez por engano
  if (!alvo && !soTimers && cancelados.length > 1) return []
  for (const l of cancelados) { clearTimeout(timers.get(l.id)); timers.delete(l.id) }
  salvar(lista.filter((l) => !cancelados.includes(l)))
  return cancelados
}

/** Lembretes de hoje que ainda vão tocar, para a saudação. */
export function lembretesDeHoje(): Lembrete[] {
  const fim = new Date()
  fim.setHours(23, 59, 59, 999)
  const agora = Date.now()
  return listarLembretes().filter((l) => { const t = new Date(l.quandoIso).getTime(); return t >= agora && t <= fim.getTime() })
}
