// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Cenas: foto e resumo da Wikipédia sobre o que a FRIDAY está falando.
// A imagem vem como data URL, então o HUD não precisa acessar nenhum site.

const MAX_IMAGEM = 600 * 1024
const cache = new Map<string, Cena | null>()

export interface Cena {
  titulo: string
  descricao: string
  imagem: string | null
}

async function resumo(idioma: 'pt' | 'en', termo: string): Promise<Cena | null> {
  const r = await fetch(`https://${idioma}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo.replace(/ /g, '_'))}?redirect=true`, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'FRIDAY-assistente/0.3 (projeto pessoal)', Accept: 'application/json' }
  })
  if (!r.ok) return null
  const d = (await r.json()) as { type?: string; title?: string; extract?: string; thumbnail?: { source?: string } }
  if (!d.title || d.type === 'disambiguation') return null
  let imagem: string | null = null
  const fonte = d.thumbnail?.source
  if (fonte && /^https:\/\/upload\.wikimedia\.org\//.test(fonte)) {
    try {
      const img = await fetch(fonte, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'FRIDAY-assistente/0.3 (projeto pessoal)' } })
      const tipo = img.headers.get('content-type') ?? ''
      if (img.ok && /^image\/(jpeg|png|webp|gif)/.test(tipo)) {
        const buf = Buffer.from(await img.arrayBuffer())
        if (buf.length <= MAX_IMAGEM) imagem = `data:${tipo.split(';')[0]};base64,${buf.toString('base64')}`
      }
    } catch { /* sem foto, segue só com o texto */ }
  }
  const frase = (d.extract ?? '').split(/(?<=[.!?])\s/)[0] ?? ''
  return { titulo: d.title, descricao: frase.slice(0, 220), imagem }
}

export async function buscarCena(termo: string): Promise<Cena | null> {
  const chave = termo.trim().toLowerCase()
  if (!chave || chave.length > 80) return null
  if (cache.has(chave)) return cache.get(chave) ?? null
  let cena: Cena | null = null
  try { cena = (await resumo('pt', termo)) ?? (await resumo('en', termo)) } catch { cena = null }
  cache.set(chave, cena)
  if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  return cena
}
