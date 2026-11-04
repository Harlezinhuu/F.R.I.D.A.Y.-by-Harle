// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Vigia de ameaças em segundo plano: a cada 3 horas olha asteroides (NASA), o Sol (NOAA),
// terremotos (USGS) e o tempo da sua cidade, e avisa só o que é novo e merece atenção.
// Desliga com FRIDAY_VIGIA=0 no .env (ou "para de vigiar ameaças").

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { carregarConfig, variavel } from './config'
import { meuLocal } from './clima'
import { buscarPrevisao } from '../shared/tempo'
import { kpMaisRecente, lerAsteroides, lerTempestadeSolar, lerTempoSevero, lerTerremotos, novasParaAvisar, relatorio, type Ameaca, type FeedAsteroides, type FeedTerremotos } from './logica/vigia'

interface Guardado { ligado: boolean; avisadas: string[]; ultima: number }

const UA = { 'User-Agent': 'FRIDAY-by-Harle/1.0 (assistente pessoal)' }
const buscar = (url: string) => fetch(url, { signal: AbortSignal.timeout(12_000), headers: UA })
const arquivo = (): string => join(app.getPath('userData'), 'vigia.json')
let opcoes: { avisar(texto: string, serio: boolean): void; log(t: string): void } = { avisar() {}, log() {} }

function ler(): Guardado {
  try { if (existsSync(arquivo())) return { ligado: true, avisadas: [], ultima: 0, ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch { /* refaz */ }
  return { ligado: variavel('FRIDAY_VIGIA') !== '0', avisadas: [], ultima: 0 }
}
const salvar = (g: Guardado): void => { try { writeFileSync(arquivo(), JSON.stringify({ ...g, avisadas: g.avisadas.slice(-400) }, null, 2)) } catch { /* sem disco */ } }

const dia = (d: Date): string => d.toISOString().slice(0, 10)

/** Olha tudo agora. Cada fonte é independente: uma fora do ar não derruba as outras. */
export async function olharAmeacas(): Promise<{ ameacas: Ameaca[]; falhas: string[] }> {
  const falhas: string[] = []
  const ameacas: Ameaca[] = []
  const tentar = async (nome: string, f: () => Promise<Ameaca[]>) => {
    try { ameacas.push(...(await f())) } catch (e) { falhas.push(nome); opcoes.log(`vigia ${nome}: ${(e as Error).message}`) }
  }
  const local = await meuLocal(carregarConfig().cidade).catch(() => null)
  await Promise.all([
    tentar('asteroides', async () => {
      const chave = variavel('NASA_API_KEY') || 'DEMO_KEY'
      const hoje = new Date()
      const amanha = new Date(Date.now() + 86_400_000)
      const r = await buscar(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${dia(hoje)}&end_date=${dia(amanha)}&api_key=${chave}`)
      if (!r.ok) throw new Error(`NASA respondeu ${r.status}`)
      return lerAsteroides((await r.json()) as FeedAsteroides)
    }),
    tentar('sol', async () => {
      const r = await buscar('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')
      if (!r.ok) throw new Error(`NOAA respondeu ${r.status}`)
      const k = kpMaisRecente(await r.json())
      const a = k ? lerTempestadeSolar(k.kp, k.quando) : null
      return a ? [a] : []
    }),
    tentar('terremotos', async () => {
      if (!local) return []
      const r = await buscar('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')
      if (!r.ok) throw new Error(`USGS respondeu ${r.status}`)
      return lerTerremotos((await r.json()) as FeedTerremotos, local.lat, local.lon)
    }),
    tentar('tempo', async () => (local ? lerTempoSevero(await buscarPrevisao(local, 3, buscar)) : []))
  ])
  return { ameacas, falhas }
}

/** Relatório na hora ("alguma ameaça?"). */
export async function relatorioDeAmeacas(): Promise<{ texto: string; itens: string[] }> {
  const { ameacas, falhas } = await olharAmeacas()
  const g = ler()
  g.avisadas.push(...ameacas.filter((a) => a.nivel >= 1).map((a) => a.id))
  salvar(g)
  const texto = relatorio(ameacas) + (falhas.length ? ` (Não consegui olhar: ${falhas.join(', ')}.)` : '')
  return { texto, itens: ameacas.filter((a) => a.nivel >= 1).slice(0, 6).map((a) => a.texto) }
}

async function passada(): Promise<void> {
  const g = ler()
  if (!g.ligado) return
  const { ameacas } = await olharAmeacas()
  const novas = novasParaAvisar(ameacas, g.avisadas)
  g.avisadas.push(...novas.map((a) => a.id))
  g.ultima = Date.now()
  salvar(g)
  for (const a of novas.sort((x, y) => y.nivel - x.nivel).slice(0, 3)) opcoes.avisar(a.texto, a.nivel >= 2)
}

export function vigiaLigada(): boolean { return ler().ligado }
export function ligarVigia(ligar: boolean): void { const g = ler(); g.ligado = ligar; salvar(g) }

/** Ao abrir: primeira olhada em 5 minutos, depois a cada 3 horas. */
export function iniciarVigia(o: typeof opcoes): void {
  opcoes = o
  const rodar = () => void passada().catch((e) => opcoes.log(`vigia: ${(e as Error).message}`))
  setTimeout(rodar, 5 * 60_000)
  setInterval(rodar, 3 * 3600_000)
}
