// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Seus designs importados, a parte que não depende do Electron: dar nome ao arquivo, achar pelo que você
// fala (nome ou apelido), escolher o modelo principal de um pacote .zip, não deixar um zip escrever fora
// da pasta e embutir os arquivos de um .gltf (o .bin e as texturas) para ele abrir sozinho na projeção.
// A FRIDAY não vem com design nenhum e não sai procurando: só entra o que você importar.

import { acharArquivo } from './modelos.ts'

export const EXTENSOES_MODELO = ['.glb', '.gltf', '.stl', '.obj']

export interface Design {
  /** Caminho do modelo dentro de Documentos/FRIDAY Modelos (pode estar numa subpasta, quando veio de um pacote) */
  arquivo: string
  nome: string
  apelidos: string[]
  importadoEm: string
}

const ext = (n: string): string => (n.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase()
export const ehModelo = (n: string): boolean => EXTENSOES_MODELO.includes(ext(n))

/** "mk_arc-reactor_FINAL_v3.glb" → "mk arc reactor final v3" */
export function nomeDoArquivo(arquivo: string): string {
  const base = arquivo.split(/[\\/]/).pop() ?? arquivo
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60) || 'design'
}

/** Nome de pasta ou arquivo seguro no Windows. */
export function nomeSeguro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60) || 'design'
}

/**
 * Caminho de dentro de um zip, já limpo; null para o que não pode sair do pacote
 * (subir de pasta com "..", caminho absoluto, lixo do macOS).
 */
export function caminhoDoZip(nome: string): string | null {
  const partes = nome.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.')
  if (!partes.length || nome.endsWith('/')) return null
  if (/^[a-z]:/i.test(partes[0]) || nome.startsWith('/') || partes.some((p) => p === '..')) return null
  if (partes[0] === '__MACOSX' || partes[partes.length - 1].startsWith('._') || partes[partes.length - 1] === '.DS_Store') return null
  return partes.join('/')
}

/** O modelo principal de um pacote: .glb, depois .gltf, .obj e .stl; o mais raso e o maior primeiro. */
export function modeloPrincipal(arquivos: { caminho: string; tamanho: number }[]): string | null {
  const ordem = ['.glb', '.gltf', '.obj', '.stl']
  const modelos = arquivos.filter((a) => ehModelo(a.caminho))
  modelos.sort((a, b) =>
    ordem.indexOf(ext(a.caminho)) - ordem.indexOf(ext(b.caminho)) ||
    a.caminho.split('/').length - b.caminho.split('/').length ||
    b.tamanho - a.tamanho)
  return modelos[0]?.caminho ?? null
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream' }

/**
 * Um .gltf aponta para outros arquivos (o .bin com a geometria, as texturas). A projeção recebe um arquivo
 * só, então cada um vira "data:" dentro do próprio .gltf. `ler` lê pelo caminho relativo ao .gltf.
 */
export function embutirGltf(texto: string, ler: (uri: string) => Uint8Array | null): { texto: string; faltando: string[] } {
  const g = JSON.parse(texto) as { buffers?: { uri?: string }[]; images?: { uri?: string; mimeType?: string }[] }
  const faltando: string[] = []
  const trocar = (item: { uri?: string; mimeType?: string }, imagem: boolean) => {
    if (!item.uri || /^data:/i.test(item.uri)) return
    let uri: string
    try { uri = decodeURIComponent(item.uri) } catch { uri = item.uri }
    const limpo = caminhoDoZip(uri)
    const dados = limpo ? ler(limpo) : null
    if (!dados) { faltando.push(uri); return }
    const tipo = imagem ? (item.mimeType ?? MIME[ext(uri)] ?? 'image/png') : 'application/octet-stream'
    item.uri = `data:${tipo};base64,${Buffer.from(dados).toString('base64')}`
  }
  for (const b of g.buffers ?? []) trocar(b, false)
  for (const i of g.images ?? []) trocar(i, true)
  return { texto: JSON.stringify(g), faltando }
}

/** Os arquivos que um .gltf pede (para copiar junto quando você importa só o .gltf). */
export function dependenciasDoGltf(texto: string): string[] {
  try {
    const g = JSON.parse(texto) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] }
    return [...(g.buffers ?? []), ...(g.images ?? [])]
      .map((x) => x.uri ?? '')
      .filter((u) => u && !/^data:/i.test(u))
      .map((u) => { try { return decodeURIComponent(u) } catch { return u } })
      .map(caminhoDoZip)
      .filter((u): u is string => !!u)
  } catch {
    return []
  }
}

const sem = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Acha o design pelo que ele falou: nome ou apelido exatos primeiro, depois as palavras parecidas. */
export function acharDesign(termos: string[], designs: Design[]): Design | null {
  const ts = termos.map(sem).filter(Boolean)
  for (const t of ts) {
    const d = designs.find((x) => sem(x.nome) === t || x.apelidos.some((a) => sem(a) === t))
    if (d) return d
  }
  // Por palavras: cada design concorre com o nome e com cada apelido
  const rotulos = designs.flatMap((d, i) => [d.nome, ...d.apelidos].map((r) => `${r}#${i}`))
  const achado = acharArquivo(termos, rotulos)
  return achado ? designs[Number(achado.split('#').pop())] ?? null : null
}

/** Nome que ainda não existe na lista ("reator", "reator 2", "reator 3"...). */
export function nomeLivre(nome: string, usados: string[]): string {
  const ja = new Set(usados.map(sem))
  if (!ja.has(sem(nome))) return nome
  for (let i = 2; ; i++) if (!ja.has(sem(`${nome} ${i}`))) return `${nome} ${i}`
}
