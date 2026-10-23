// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Rotinas salvas em disco (rotinas.json na pasta de dados).

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { normalizarNome, type Passo } from './logica/rotinas'

export interface Rotina {
  nome: string
  passos: Passo[]
  criadaEm: string
}

const arquivo = (): string => join(app.getPath('userData'), 'rotinas.json')

export function lerRotinas(): Rotina[] {
  try {
    const lista = existsSync(arquivo()) ? (JSON.parse(readFileSync(arquivo(), 'utf8')) as Rotina[]) : []
    return Array.isArray(lista) ? lista.filter((r) => r && typeof r.nome === 'string' && Array.isArray(r.passos)) : []
  } catch {
    return []
  }
}

function salvar(lista: Rotina[]): void {
  const tmp = `${arquivo()}.tmp`
  writeFileSync(tmp, JSON.stringify(lista, null, 2), 'utf8')
  renameSync(tmp, arquivo())
}

export function encontrarRotina(nome: string): Rotina | null {
  const alvo = normalizarNome(nome)
  const lista = lerRotinas()
  return lista.find((r) => normalizarNome(r.nome) === alvo) ?? lista.find((r) => normalizarNome(r.nome).includes(alvo) || alvo.includes(normalizarNome(r.nome))) ?? null
}

export function salvarRotina(nome: string, passos: Passo[]): { substituiu: boolean } {
  const alvo = normalizarNome(nome)
  const lista = lerRotinas()
  const substituiu = lista.some((r) => normalizarNome(r.nome) === alvo)
  salvar([...lista.filter((r) => normalizarNome(r.nome) !== alvo), { nome: nome.trim(), passos, criadaEm: new Date().toISOString() }])
  return { substituiu }
}

export function apagarRotina(nome: string): Rotina | null {
  const r = encontrarRotina(nome)
  if (!r) return null
  salvar(lerRotinas().filter((x) => x.nome !== r.nome))
  return r
}
