// Tradução de "downloads/fotos/praia.png" para um caminho real, sempre dentro das pastas pessoais.
// A FRIDAY nunca mexe fora delas: nada de Windows, Arquivos de Programas ou outras contas.

type PlatformPath = typeof import('node:path')

export type ChavePasta = 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos'

export const NOMES_PASTAS: Record<ChavePasta, string> = {
  desktop: 'Área de Trabalho',
  documents: 'Documentos',
  downloads: 'Downloads',
  pictures: 'Imagens',
  music: 'Músicas',
  videos: 'Vídeos'
}

const APELIDOS: Record<string, ChavePasta> = {
  'area de trabalho': 'desktop', desktop: 'desktop', 'area-de-trabalho': 'desktop',
  documentos: 'documents', documents: 'documents', 'meus documentos': 'documents',
  downloads: 'downloads', download: 'downloads', baixados: 'downloads',
  imagens: 'pictures', fotos: 'pictures', pictures: 'pictures',
  musicas: 'music', musica: 'music', music: 'music',
  videos: 'videos', video: 'videos'
}

export const normalizar = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

export type Resolvido = { ok: true; chave: ChavePasta; raiz: string; absoluto: string; relativo: string } | { ok: false; erro: string }

/**
 * `entrada` começa com o nome de uma pasta pessoal ("downloads", "área de trabalho"...),
 * seguido do caminho dentro dela, com / ou \.
 */
export function resolverCaminho(entrada: string, raizes: Record<ChavePasta, string>, p: PlatformPath): Resolvido {
  const limpa = String(entrada ?? '').trim().replace(/^["']|["']$/g, '')
  if (!limpa) return { ok: false, erro: 'Faltou o caminho.' }
  if (/[<>"|?*\u0000-\u001f]/.test(limpa)) return { ok: false, erro: 'O caminho tem caracteres que o Windows não aceita.' }
  const partes = limpa.split(/[\\/]+/).filter(Boolean)
  const chave = APELIDOS[normalizar(partes[0] ?? '')]
  if (!chave) return { ok: false, erro: `Só mexo nas pastas pessoais: ${Object.values(NOMES_PASTAS).join(', ')}.` }
  const resto = partes.slice(1)
  if (resto.some((s) => s === '..' || s.includes(':'))) return { ok: false, erro: 'Caminho inválido.' }
  const raiz = p.resolve(raizes[chave])
  const absoluto = p.resolve(raiz, ...resto)
  const rel = p.relative(raiz, absoluto)
  if (rel.startsWith('..') || p.isAbsolute(rel)) return { ok: false, erro: 'Esse caminho sai da pasta pessoal.' }
  return { ok: true, chave, raiz, absoluto, relativo: [NOMES_PASTAS[chave], ...resto].join('/') }
}

/** Caminho amigável para falar e mostrar: "Downloads/fotos/praia.png". */
export function caminhoAmigavel(absoluto: string, raizes: Record<ChavePasta, string>, p: PlatformPath): string {
  for (const [chave, raiz] of Object.entries(raizes) as [ChavePasta, string][]) {
    const rel = p.relative(p.resolve(raiz), absoluto)
    if (!rel.startsWith('..') && !p.isAbsolute(rel)) return [NOMES_PASTAS[chave], ...rel.split(/[\\/]+/).filter(Boolean)].join('/')
  }
  return p.basename(absoluto)
}
