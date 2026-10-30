// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// As versões que você salva na oficina de hologramas ficam no próprio celular (IndexedDB do app).

const BANCO = 'friday-designs', LOJA = 'designs'

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA, { keyPath: 'nome' }) }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => erro(r.error ?? new Error('Não consegui abrir o armazenamento dos designs.'))
  })
}

async function pedido<T>(modo: IDBTransactionMode, f: (l: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir()
  return new Promise<T>((ok, erro) => {
    const r = f(db.transaction(LOJA, modo).objectStore(LOJA))
    r.onsuccess = () => { ok(r.result as T); db.close() }
    r.onerror = () => { erro(r.error); db.close() }
  })
}

interface Guardado { nome: string; glb: ArrayBuffer; criadoEm: string }

export const salvarDesign = (nome: string, glb: Uint8Array): Promise<void> =>
  pedido('readwrite', (l) => l.put({ nome, glb: glb.slice().buffer, criadoEm: new Date().toISOString() } satisfies Guardado))

export async function lerSalvo(nome: string): Promise<ArrayBuffer | null> {
  const g = await pedido<Guardado | undefined>('readonly', (l) => l.get(nome))
  return g?.glb ?? null
}

export async function listarSalvos(): Promise<{ nome: string; criadoEm: string }[]> {
  const todos = await pedido<Guardado[]>('readonly', (l) => l.getAll())
  return todos.map(({ nome, criadoEm }) => ({ nome, criadoEm })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export const apagarSalvo = (nome: string): Promise<void> => pedido('readwrite', (l) => l.delete(nome))
