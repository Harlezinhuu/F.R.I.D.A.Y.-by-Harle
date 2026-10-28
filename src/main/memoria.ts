// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Memória do dono: o que a FRIDAY aprende nas conversas. Fica só no seu PC (memoria.json).

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { checarFato, ehRepetido, encontrarPorTrecho, mesclarMemoria, paraPrompt, MAX_FATOS, CATEGORIAS, type Categoria, type Fato } from './logica/memoria'

/** `esquecidos`: textos apagados, para não voltarem quando a memória do celular for juntada. */
interface Arquivo { ativa: boolean; fatos: Fato[]; esquecidos?: string[] }

const caminho = (): string => join(app.getPath('userData'), 'memoria.json')

function ler(): Arquivo {
  try {
    if (!existsSync(caminho())) return { ativa: true, fatos: [] }
    const d = JSON.parse(readFileSync(caminho(), 'utf8')) as Partial<Arquivo>
    const fatos = Array.isArray(d.fatos) ? d.fatos.filter((f) => f && typeof f.texto === 'string' && typeof f.id === 'string') : []
    return { ativa: d.ativa !== false, fatos, esquecidos: Array.isArray(d.esquecidos) ? d.esquecidos.map(String).slice(-500) : [] }
  } catch {
    return { ativa: true, fatos: [] }
  }
}

function salvar(d: Arquivo): void {
  const tmp = `${caminho()}.tmp`
  writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8')
  renameSync(tmp, caminho())
}

export const memoriaAtiva = (): boolean => ler().ativa
export const listarFatos = (): Fato[] => ler().fatos

export function definirAprendizado(ativa: boolean): void {
  const d = ler()
  salvar({ ...d, ativa })
}

export type Resultado = { ok: true; fato: Fato; novo: boolean } | { ok: false; motivo: string }

export function memorizar(texto: unknown, categoria: unknown): Resultado {
  const d = ler()
  if (!d.ativa) return { ok: false, motivo: 'O aprendizado está desligado. Para ligar, peça "volta a aprender".' }
  const c = checarFato(texto)
  if (!c.ok) return c
  const cat: Categoria = CATEGORIAS.includes(categoria as Categoria) ? (categoria as Categoria) : 'outro'
  const repetido = ehRepetido(c.texto, d.fatos)
  if (repetido) return { ok: true, fato: repetido, novo: false }
  const fato: Fato = { id: randomUUID(), texto: c.texto, categoria: cat, criadoEm: new Date().toISOString() }
  // Sem crescer para sempre: os mais antigos saem primeiro
  const fatos = [...d.fatos, fato].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).slice(-MAX_FATOS)
  salvar({ ...d, fatos })
  return { ok: true, fato, novo: true }
}

/** Esquece os fatos que batem com o trecho. Devolve os esquecidos. */
export function esquecer(trecho: string): Fato[] {
  const d = ler()
  const alvo = encontrarPorTrecho(trecho, d.fatos)
  if (!alvo.length) return []
  salvar({ ...d, fatos: d.fatos.filter((f) => !alvo.includes(f)), esquecidos: [...(d.esquecidos ?? []), ...alvo.map((f) => f.texto)].slice(-500) })
  return alvo
}

export function esquecerTudo(): number {
  const d = ler()
  salvar({ ...d, fatos: [], esquecidos: [...(d.esquecidos ?? []), ...d.fatos.map((f) => f.texto)].slice(-500) })
  return d.fatos.length
}

export const memoriaParaPrompt = (): string => (ler().ativa ? paraPrompt(ler().fatos) : '')

/** Junta a memória do celular com a do PC (pelo elo) e devolve a memória inteira, para os dois ficarem iguais. */
export function sincronizar(fatos: unknown[], esquecidos: string[]): { fatos: Fato[]; esquecidos: string[] } {
  const d = ler()
  const todosEsquecidos = [...new Set([...(d.esquecidos ?? []), ...esquecidos])].slice(-500)
  const validos = fatos.filter((f): f is Fato => !!f && typeof (f as Fato).texto === 'string' && typeof (f as Fato).id === 'string' && typeof (f as Fato).criadoEm === 'string')
    .map((f) => ({ id: f.id, texto: f.texto.slice(0, 200), categoria: (CATEGORIAS as string[]).includes(f.categoria) ? f.categoria : 'outro', criadoEm: f.criadoEm }) as Fato)
    .filter((f) => checarFato(f.texto).ok)
  const juntos = d.ativa ? mesclarMemoria(d.fatos, validos, todosEsquecidos) : d.fatos
  salvar({ ...d, fatos: juntos, esquecidos: todosEsquecidos })
  return { fatos: juntos, esquecidos: todosEsquecidos }
}
