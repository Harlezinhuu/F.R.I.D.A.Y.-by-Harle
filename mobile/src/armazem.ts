// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Tudo que o app guarda fica só no celular: ajustes e chave (Preferences do Android),
// conversas (IndexedDB), memória e lembretes.

import { Preferences } from '@capacitor/preferences'

// ---------- Ajustes ----------

export interface Ajustes {
  chave: string
  nome: string
  voz: string
  efeitoVoz: boolean
  cidade: string
  /** A fita acompanha a inclinação do celular */
  giroscopio: boolean
  /** Vibração leve ao começar e terminar de falar */
  vibrar: boolean
}

const PADRAO: Ajustes = { chave: '', nome: '', voz: 'Kore', efeitoVoz: true, cidade: '', giroscopio: true, vibrar: true }

export async function lerAjustes(): Promise<Ajustes> {
  const { value } = await Preferences.get({ key: 'ajustes' })
  try { return { ...PADRAO, ...(value ? JSON.parse(value) : {}) } } catch { return { ...PADRAO } }
}

export async function salvarAjustes(a: Ajustes): Promise<void> {
  await Preferences.set({ key: 'ajustes', value: JSON.stringify(a) })
}

/** Lista guardada em Preferences (memória, lembretes). */
export async function lerLista<T>(chave: string): Promise<T[]> {
  const { value } = await Preferences.get({ key: chave })
  try { const v = value ? JSON.parse(value) : []; return Array.isArray(v) ? v : [] } catch { return [] }
}
export async function salvarLista<T>(chave: string, lista: T[]): Promise<void> {
  await Preferences.set({ key: chave, value: JSON.stringify(lista) })
}

// ---------- Conversas (IndexedDB) ----------

export interface Mensagem {
  papel: 'user' | 'model'
  texto: string
  /** Miniatura da foto mandada (data URL), quando tiver */
  imagem?: string
  hora: string
  /** Veio do modo de voz (transcrição) */
  voz?: boolean
}

export interface Conversa {
  id: string
  titulo: string
  criadaEm: string
  atualizadaEm: string
  mensagens: Mensagem[]
}

let banco: Promise<IDBDatabase> | null = null
function abrir(): Promise<IDBDatabase> {
  banco ??= new Promise((ok, erro) => {
    const r = indexedDB.open('friday', 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('conversas', { keyPath: 'id' }) }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => erro(r.error)
  })
  return banco
}

function pedido<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrir().then((db) => new Promise<T>((ok, erro) => {
    const r = f(db.transaction('conversas', modo).objectStore('conversas'))
    r.onsuccess = () => ok(r.result as T)
    r.onerror = () => erro(r.error)
  }))
}

export const listarConversas = async (): Promise<Conversa[]> =>
  (await pedido<Conversa[]>('readonly', (s) => s.getAll())).sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
export const lerConversa = (id: string): Promise<Conversa | undefined> => pedido('readonly', (s) => s.get(id))
export const salvarConversa = (c: Conversa): Promise<unknown> => pedido('readwrite', (s) => s.put(c))
export const apagarConversa = (id: string): Promise<unknown> => pedido('readwrite', (s) => s.delete(id))
export const apagarTodas = (): Promise<unknown> => pedido('readwrite', (s) => s.clear())

export function novaConversa(): Conversa {
  const agora = new Date().toISOString()
  return { id: crypto.randomUUID(), titulo: 'Nova conversa', criadaEm: agora, atualizadaEm: agora, mensagens: [] }
}

/** Título a partir da primeira mensagem, como no ChatGPT. */
export function tituloDe(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > 42 ? `${t.slice(0, 40).trimEnd()}…` : t || 'Nova conversa'
}
