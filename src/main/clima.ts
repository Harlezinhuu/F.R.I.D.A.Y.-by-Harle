// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Clima no PC: qualquer lugar do mundo (src/shared/tempo.ts). Sem lugar, usa o FRIDAY_CIDADE do .env
// ou, sem ele, a localização aproximada pelo IP.

import { acharLocal, buscarPrevisao, cartaoClima, resumir, type Local, type Previsao } from '../shared/tempo'

const UA = { 'User-Agent': 'FRIDAY-by-Harle/0.5 (assistente pessoal)' }
const buscar = (url: string) => fetch(url, { signal: AbortSignal.timeout(9000), headers: UA })

let cacheIp: Local | null = null
async function localPorIp(): Promise<Local> {
  if (cacheIp) return cacheIp
  const r = await buscar('https://ipwho.is/?fields=success,city,region,country,latitude,longitude')
  const d = (await r.json()) as { success?: boolean; city?: string; region?: string; country?: string; latitude?: number; longitude?: number }
  if (!d.success || d.latitude === undefined || d.longitude === undefined) throw new Error('Não descobri a sua cidade. Coloque FRIDAY_CIDADE no .env.')
  cacheIp = { nome: d.city ?? 'sua região', regiao: d.region ?? '', pais: d.country ?? '', lat: d.latitude, lon: d.longitude }
  return cacheIp
}

export type Clima = ReturnType<typeof cartaoClima>

/** Previsão de `lugar` (ou da cidade padrão) para `dias` dias; `dia` (AAAA-MM-DD) foca num dia só. */
export async function previsao(lugar: string | undefined, cidadePadrao: string, dias = 1, dia?: string): Promise<{ texto: string; cartao: Clima; previsao: Previsao }> {
  const local = lugar ? await acharLocal(lugar, buscar) : cidadePadrao ? await acharLocal(cidadePadrao, buscar) : await localPorIp()
  // Para um dia específico, busca até ele
  const ate = dia ? Math.max(1, Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.now()) / 86_400_000) + 2) : dias
  const p = await buscarPrevisao(local, ate, buscar)
  return { texto: resumir(p, dia), cartao: cartaoClima(p), previsao: p }
}

/** Compatível com o uso antigo (saudação): só o cartão de hoje. */
export async function buscarClima(cidade: string | undefined, cidadePadrao: string): Promise<Clima> {
  return (await previsao(cidade, cidadePadrao, 1)).cartao
}
