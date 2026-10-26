// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Escolha de modelos 3D: achar no catálogo da NASA, nos seus arquivos e validar as peças da IA.
// Sem dependências, para ter testes.

import type { PecaPrimitiva } from '../../shared/types'

export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const IGNORAR = new Set(['the', 'a', 'an', 'of', 'de', 'do', 'da', 'dos', 'das', 'o', 'os', 'as', 'um', 'uma', 'nasa', 'modelo', 'model', '3d', 'e', 'and'])
const palavras = (s: string): string[] => normalizar(s).split(' ').filter((p) => p && !IGNORAR.has(p))

/** Como se fala em português → nome do modelo da NASA. */
const APELIDOS_NASA: [string, string][] = [
  ['estacao espacial internacional', 'International Space Station ISS'],
  ['estacao espacial', 'International Space Station ISS'],
  ['telescopio hubble', 'Hubble Space Telescope'],
  ['hubble', 'Hubble Space Telescope'],
  ['james webb', 'James Webb Space Telescope'],
  ['jwst', 'James Webb Space Telescope'],
  ['onibus espacial', 'Space Shuttle'],
  ['nave espacial', 'Space Shuttle'],
  ['saturno v', 'Saturn V'],
  ['saturno 5', 'Saturn V'],
  ['foguete saturno', 'Saturn V'],
  ['modulo lunar', 'Apollo Lunar Module'],
  ['astronauta', 'Astronaut'],
  ['traje espacial', 'Z2 Spacesuit'],
  ['capacete', 'Helmet'],
  ['luva de astronauta', 'Astronaut Glove'],
  ['perseverance', 'Mars 2020 Perseverance Rover'],
  ['rover de marte', 'Mars 2020 Perseverance Rover'],
  ['opportunity', 'Mars Exploration Rover Opportunity'],
  ['ingenuity', 'Ingenuity Mars Helicopter'],
  ['helicoptero de marte', 'Ingenuity Mars Helicopter'],
  ['voyager', 'Voyager Probe'],
  ['sonda parker', 'Parker Solar Probe'],
  ['robonauta', 'Robonaut 2'],
  ['chave inglesa', 'Wrench'],
  ['martelo', 'Hammer'],
  ['bennu', '1999 RQ36 asteroid'],
  ['asteroide bennu', '1999 RQ36 asteroid'],
  ['nebulosa do caranguejo', 'Crab Nebula'],
  ['estacao mir', 'Mir'],
  ['antena da nasa', '70 meter dish'],
  ['controle da missao', 'JSC Mission Control Room']
]

/** Nome bonito do item do catálogo ("pasta/arquivo.glb" → "arquivo"). */
export const nomeNasa = (item: string): string => item.split('/').pop()!.replace(/\.glb$/i, '')

/**
 * Acha o modelo da NASA que melhor bate com os termos (em português ou inglês).
 * Todas as palavras importantes do pedido precisam estar no nome do modelo.
 */
export function acharNasa(termos: string[], catalogo: string[]): string | null {
  const consultas: string[] = []
  for (const t of termos.filter(Boolean)) {
    const n = normalizar(t)
    const apelido = APELIDOS_NASA.find(([pt]) => ` ${n} `.includes(` ${pt} `))
    if (apelido) consultas.push(apelido[1])
    consultas.push(t)
  }
  let melhor: { item: string; nota: number } | null = null
  for (const consulta of consultas) {
    const q = palavras(consulta)
    if (!q.length) continue
    for (const item of catalogo) {
      const nome = nomeNasa(item)
      const c = palavras(nome)
      const achadas = q.filter((p) => c.includes(p) || (p.length >= 4 && c.some((x) => x.startsWith(p)))).length
      if (achadas < q.length) continue
      // Mais específico (menos palavras sobrando) e versões "inteiras" vencem
      let nota = 100 - (c.length - q.length) * 3
      if (/without|\(compact\)|door|eng\)|rcs\)|\(part/i.test(nome)) nota -= 25
      if (/\(A\)$/.test(nome)) nota += 2
      if (!melhor || nota > melhor.nota) melhor = { item, nota }
    }
    if (melhor) break
  }
  return melhor?.item ?? null
}

/** Acha um dos seus arquivos pelo nome falado. */
export function acharArquivo(termos: string[], arquivos: string[]): string | null {
  let melhor: { a: string; nota: number } | null = null
  for (const t of termos.filter(Boolean)) {
    const q = palavras(t)
    if (!q.length) continue
    for (const a of arquivos) {
      const c = palavras(a.replace(/\.[a-z0-9]+$/i, ''))
      const achadas = q.filter((p) => c.some((x) => x === p || (p.length >= 4 && x.startsWith(p)))).length
      if (achadas < Math.max(1, Math.ceil(q.length * 0.67))) continue
      const nota = achadas * 10 - c.length
      if (!melhor || nota > melhor.nota) melhor = { a, nota }
    }
  }
  return melhor?.a ?? null
}

const FORMAS_PRIMITIVAS = ['caixa', 'esfera', 'cilindro', 'cone', 'toro', 'capsula'] as const
const MAX_PECAS = 80

const numero = (v: unknown, padrao: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}
const trio = (v: unknown, padrao: number, min: number, max: number): [number, number, number] => {
  const a = Array.isArray(v) ? v : []
  return [numero(a[0], padrao, min, max), numero(a[1], padrao, min, max), numero(a[2], padrao, min, max)]
}

/** Confere as peças que a IA mandou: formas conhecidas, números dentro do limite. */
export function validarPrimitivas(entrada: unknown): PecaPrimitiva[] {
  const lista = Array.isArray(entrada) ? entrada : []
  const out: PecaPrimitiva[] = []
  for (const item of lista.slice(0, MAX_PECAS)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const forma = String(o.forma ?? '').toLowerCase()
    if (!(FORMAS_PRIMITIVAS as readonly string[]).includes(forma)) continue
    out.push({
      peca: String(o.peca ?? '').replace(/[<>]/g, '').trim().slice(0, 32) || 'peça',
      forma: forma as PecaPrimitiva['forma'],
      posicao: trio(o.posicao, 0, -50, 50),
      tamanho: trio(o.tamanho, 1, 0.01, 50),
      rotacao: trio(o.rotacao, 0, -360, 360)
    })
  }
  return out
}

/** Tira as tags HTML (o autor na Wikimedia vem em HTML). */
export const semHtml = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
