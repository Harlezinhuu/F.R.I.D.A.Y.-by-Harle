// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Clima pelo Open-Meteo (grátis, sem chave). A cidade vem do pedido, do FRIDAY_CIDADE no .env
// ou, sem nada disso, da localização aproximada pelo IP.

import { descreverTempo, iconeTempo } from './logica/clima'

interface Local { nome: string; lat: number; lon: number }
let cacheIp: Local | null = null

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'FRIDAY/0.2' } })
  if (!r.ok) throw new Error(`Serviço de clima respondeu ${r.status}.`)
  return (await r.json()) as T
}

async function localPorNome(cidade: string): Promise<Local> {
  const d = await json<{ results?: { name: string; admin1?: string; latitude: number; longitude: number }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt&format=json`
  )
  const r = d.results?.[0]
  if (!r) throw new Error(`Não achei a cidade "${cidade}".`)
  return { nome: r.admin1 && r.admin1 !== r.name ? `${r.name}, ${r.admin1}` : r.name, lat: r.latitude, lon: r.longitude }
}

async function localPorIp(): Promise<Local> {
  if (cacheIp) return cacheIp
  const d = await json<{ success?: boolean; city?: string; latitude?: number; longitude?: number }>('https://ipwho.is/?fields=success,city,latitude,longitude')
  if (!d.success || d.latitude === undefined || d.longitude === undefined) throw new Error('Não descobri a sua cidade. Coloque FRIDAY_CIDADE no .env.')
  cacheIp = { nome: d.city ?? 'sua região', lat: d.latitude, lon: d.longitude }
  return cacheIp
}

export interface Clima {
  cidade: string
  temperatura: number
  sensacao: number
  descricao: string
  icone: string
  minima: number
  maxima: number
  chuva: number
}

export async function buscarClima(cidade: string | undefined, cidadePadrao: string): Promise<Clima> {
  const local = cidade ? await localPorNome(cidade) : cidadePadrao ? await localPorNome(cidadePadrao) : await localPorIp()
  const d = await json<{
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number }
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] }
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${local.lat}&longitude=${local.lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto'
  )
  return {
    cidade: local.nome,
    temperatura: Math.round(d.current.temperature_2m),
    sensacao: Math.round(d.current.apparent_temperature),
    descricao: descreverTempo(d.current.weather_code),
    icone: iconeTempo(d.current.weather_code),
    minima: Math.round(d.daily.temperature_2m_min[0]),
    maxima: Math.round(d.daily.temperature_2m_max[0]),
    chuva: d.daily.precipitation_probability_max[0] ?? 0
  }
}
