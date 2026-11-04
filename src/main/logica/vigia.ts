// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Vigia de ameaças (como a FRIDAY dos filmes avisando o que entra na atmosfera), só com dados
// públicos e reais: asteroides passando perto da Terra (NASA), tempestade solar (NOAA),
// terremotos perto de você (USGS) e tempo severo na sua cidade (Open-Meteo).
// Aqui fica só a parte que dá para testar: ler as respostas e decidir o que vale um aviso.

import type { Previsao } from '../../shared/tempo'

export interface Ameaca {
  /** Identificador estável (para não avisar duas vezes da mesma coisa) */
  id: string
  tipo: 'asteroide' | 'sol' | 'terremoto' | 'tempo'
  /** 0 = curiosidade, 1 = atenção, 2 = alerta */
  nivel: 0 | 1 | 2
  texto: string
}

/** Distância Terra–Lua, para falar de um jeito que dá para imaginar. */
export const KM_LUA = 384_400

const numeroBr = (n: number, casas = 0): string => n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })

/** Resposta do NeoWs (api.nasa.gov/neo/rest/v1/feed), só o que usamos. */
export interface FeedAsteroides {
  near_earth_objects?: Record<string, {
    id: string
    name: string
    is_potentially_hazardous_asteroid?: boolean
    estimated_diameter?: { meters?: { estimated_diameter_min: number; estimated_diameter_max: number } }
    close_approach_data?: { close_approach_date: string; epoch_date_close_approach?: number; relative_velocity?: { kilometers_per_hour: string }; miss_distance?: { kilometers: string }; orbiting_body?: string }[]
  }[]>
}

/**
 * Os asteroides do dia, do mais perto para o mais longe. Vira aviso (nível 1) o que passa a menos de
 * 1 distância da Lua, ou o "potencialmente perigoso" a menos de 5; o resto é curiosidade.
 */
export function lerAsteroides(feed: FeedAsteroides): Ameaca[] {
  const lista: { a: Ameaca; km: number }[] = []
  for (const dia of Object.values(feed.near_earth_objects ?? {})) {
    for (const o of dia) {
      const ap = (o.close_approach_data ?? []).find((c) => (c.orbiting_body ?? 'Earth') === 'Earth')
      const km = Number(ap?.miss_distance?.kilometers)
      if (!ap || !Number.isFinite(km)) continue
      const d = o.estimated_diameter?.meters
      const tamanho = d ? Math.round((d.estimated_diameter_min + d.estimated_diameter_max) / 2) : 0
      const luas = km / KM_LUA
      const vel = Math.round(Number(ap.relative_velocity?.kilometers_per_hour) || 0)
      const perigoso = o.is_potentially_hazardous_asteroid === true
      const nivel: 0 | 1 = luas < 1 || (perigoso && luas < 5) ? 1 : 0
      const nome = o.name.replace(/[()]/g, '').trim()
      const texto = `O asteroide ${nome}${tamanho ? `, de uns ${numeroBr(tamanho)} metros,` : ''} passa a ${numeroBr(luas, luas < 10 ? 1 : 0)} vezes a distância da Lua (${numeroBr(Math.round(km / 1000))} mil km)${vel ? ` a ${numeroBr(vel)} km/h` : ''}${perigoso ? '. A NASA classifica como potencialmente perigoso, mas não há risco de batida nesta passagem' : ''}.`
      lista.push({ a: { id: `ast-${o.id}-${ap.close_approach_date}`, tipo: 'asteroide', nivel, texto }, km })
    }
  }
  return lista.sort((x, y) => x.km - y.km).map((x) => x.a)
}

/** Índice Kp (NOAA): 5 ou mais é tempestade geomagnética (G1 a G5). */
export function lerTempestadeSolar(kp: number, quando = ''): Ameaca | null {
  if (!Number.isFinite(kp)) return null
  if (kp < 5) return null
  const g = Math.min(5, Math.floor(kp) - 4)
  const efeitos = g >= 3 ? 'pode atrapalhar GPS, rádio e satélites, e há risco para redes elétricas em altas latitudes' : 'pode dar pequenas falhas em GPS e rádio'
  return { id: `sol-G${g}-${quando.slice(0, 13)}`, tipo: 'sol', nivel: g >= 3 ? 2 : 1, texto: `Tempestade solar G${g} agora (índice Kp ${numeroBr(kp, 1)}): ${efeitos}.` }
}

/** Lê o JSON do NOAA (planetary_k_index_1m.json ou noaa-planetary-k-index.json) e devolve o Kp mais recente. */
export function kpMaisRecente(dados: unknown): { kp: number; quando: string } | null {
  if (!Array.isArray(dados) || !dados.length) return null
  const ultimo = dados[dados.length - 1] as unknown
  // Formato de lista com cabeçalho: [["time_tag","Kp",...], ["2026-11-04 12:00:00.000","3.33",...]]
  if (Array.isArray(ultimo)) return { kp: Number(ultimo[1]), quando: String(ultimo[0]) }
  const o = ultimo as { kp_index?: number; estimated_kp?: number; kp?: number; time_tag?: string }
  const kp = o.estimated_kp ?? o.kp_index ?? o.kp
  return typeof kp === 'number' ? { kp, quando: String(o.time_tag ?? '') } : null
}

/** Distância entre dois pontos da Terra (km). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface FeedTerremotos {
  features?: { id: string; properties: { mag: number | null; place: string | null; time: number }; geometry: { coordinates: [number, number, number?] } }[]
}

/**
 * Terremotos que importam para você: perto (até 300 km, a partir de 3,5), na região (até 1.500 km,
 * a partir de 5) ou muito fortes em qualquer lugar (7 ou mais, como curiosidade).
 */
export function lerTerremotos(feed: FeedTerremotos, lat: number, lon: number, agora = Date.now()): Ameaca[] {
  const out: Ameaca[] = []
  for (const f of feed.features ?? []) {
    const mag = f.properties.mag ?? 0
    const [qlon, qlat] = f.geometry.coordinates
    const km = Math.round(distanciaKm(lat, lon, qlat, qlon))
    const horas = Math.max(0, Math.round((agora - f.properties.time) / 3_600_000))
    const quando = horas < 1 ? 'agora há pouco' : horas < 24 ? `há ${horas} ${horas === 1 ? 'hora' : 'horas'}` : 'ontem'
    const onde = (f.properties.place ?? 'local não informado').replace(/^(\d+) km ([NSEW]+) of /, '$1 km de ')
    let nivel: 0 | 1 | 2 | -1 = -1
    if (km <= 300 && mag >= 3.5) nivel = mag >= 5 ? 2 : 1
    else if (km <= 1500 && mag >= 5) nivel = 1
    else if (mag >= 7) nivel = 0
    if (nivel < 0) continue
    out.push({ id: `sismo-${f.id}`, tipo: 'terremoto', nivel: nivel as 0 | 1 | 2, texto: `Terremoto de magnitude ${numeroBr(mag, 1)} ${quando}: ${onde}, a ${numeroBr(km)} km de você.` })
  }
  return out.sort((a, b) => b.nivel - a.nivel)
}

/** Tempo severo nos próximos dias (tempestade, chuva forte, calor ou frio fora do comum). */
export function lerTempoSevero(p: Previsao): Ameaca[] {
  const out: Ameaca[] = []
  const hoje = p.dias[0]?.data ?? ''
  const quando = (data: string) => (data === hoje ? 'hoje' : Date.parse(data) - Date.parse(hoje) <= 86_400_000 ? 'amanhã' : `no dia ${data.slice(8, 10)}/${data.slice(5, 7)}`)
  for (const d of p.dias.slice(0, 3)) {
    const avisos: string[] = []
    let nivel: 1 | 2 = 1
    if (d.codigo >= 95) { avisos.push(d.codigo >= 96 ? 'tempestade com granizo' : 'tempestade com raios'); if (d.codigo >= 96) nivel = 2 }
    if (d.mm >= 50) { avisos.push(`chuva muito forte (${numeroBr(d.mm)} mm)`); nivel = 2 } else if (d.mm >= 25) avisos.push(`chuva forte (${numeroBr(d.mm)} mm)`)
    if (d.max >= 38) { avisos.push(`calor extremo (${d.max} graus)`); nivel = 2 } else if (d.max >= 35) avisos.push(`muito calor (${d.max} graus)`)
    if (d.min <= 2) avisos.push(`frio forte (${d.min} graus)`)
    if (avisos.length) out.push({ id: `tempo-${d.data}-${avisos.join('|')}`, tipo: 'tempo', nivel, texto: `Em ${p.local.nome}, ${quando(d.data)}: ${avisos.join(', ')}.` })
  }
  return out
}

/** Só o que ainda não foi avisado e merece aviso (nível 1 ou 2). */
export function novasParaAvisar(ameacas: Ameaca[], jaAvisadas: string[]): Ameaca[] {
  const ja = new Set(jaAvisadas)
  return ameacas.filter((a) => a.nivel >= 1 && !ja.has(a.id))
}

/** Relatório falado: o mais sério primeiro; no fim, a curiosidade do asteroide mais próximo. */
export function relatorio(ameacas: Ameaca[]): string {
  const serias = ameacas.filter((a) => a.nivel >= 1).sort((a, b) => b.nivel - a.nivel)
  const curiosidade = ameacas.find((a) => a.tipo === 'asteroide' && a.nivel === 0)
  if (!serias.length) return `Nenhuma ameaça no radar: sem tempestade solar, sem terremoto perto e sem tempo severo à vista.${curiosidade ? ` Só por curiosidade: ${curiosidade.texto}` : ''}`
  return `${serias.slice(0, 5).map((a) => a.texto).join(' ')}${curiosidade ? ` E mais longe: ${curiosidade.texto}` : ''}`
}
