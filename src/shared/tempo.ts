// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Clima de qualquer lugar do mundo, para a FRIDAY do PC e do celular.
// - Lugar: cidade, bairro, região, estado, país ou ponto turístico ("Gramado", "Zona Sul de SP",
//   "Lisboa, Portugal", "Torre Eiffel"). Primeiro a base de cidades do Open-Meteo; se não achar,
//   o OpenStreetMap (que conhece praticamente qualquer lugar).
// - Previsão: agora e até 16 dias, com chuva, vento, umidade, nascer e pôr do sol.
// Tudo grátis e sem chave. Funciona igual no Node (PC) e no navegador (celular).

// Tradução dos códigos de tempo do Open-Meteo (padrão WMO) para português.
const CODIGOS: Record<number, string> = {
  0: 'céu limpo', 1: 'quase limpo', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'neblina', 48: 'neblina com geada',
  51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte', 56: 'garoa congelante', 57: 'garoa congelante forte',
  61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte', 66: 'chuva congelante', 67: 'chuva congelante forte',
  71: 'neve fraca', 73: 'neve', 75: 'neve forte', 77: 'grãos de neve',
  80: 'pancadas de chuva fracas', 81: 'pancadas de chuva', 82: 'pancadas de chuva fortes',
  85: 'pancadas de neve', 86: 'pancadas de neve fortes',
  95: 'trovoadas', 96: 'trovoadas com granizo', 99: 'trovoadas com granizo forte'
}

export function descreverTempo(codigo: number): string {
  return CODIGOS[codigo] ?? 'tempo indefinido'
}

/** Ícone simples para o cartão: sol, nuvem, chuva, neve, raio, neblina. */
export function iconeTempo(codigo: number): 'sol' | 'nuvem' | 'chuva' | 'neve' | 'raio' | 'neblina' {
  if (codigo <= 1) return 'sol'
  if (codigo <= 3) return 'nuvem'
  if (codigo === 45 || codigo === 48) return 'neblina'
  if (codigo >= 95) return 'raio'
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return 'neve'
  return 'chuva'
}


export interface Local { nome: string; regiao: string; pais: string; lat: number; lon: number }

export interface Dia { data: string; min: number; max: number; chuva: number; mm: number; codigo: number; nascer: string; por: string }

export interface Previsao {
  local: Local
  agora: { temp: number; sensacao: number; codigo: number; vento: number; umidade: number; dia: boolean }
  dias: Dia[]
}

type Buscar = (url: string, init?: RequestInit) => Promise<Response>

export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const UF: Record<string, string> = {
  ac: 'Acre', al: 'Alagoas', ap: 'Amapá', am: 'Amazonas', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal', es: 'Espírito Santo',
  go: 'Goiás', ma: 'Maranhão', mt: 'Mato Grosso', ms: 'Mato Grosso do Sul', mg: 'Minas Gerais', pa: 'Pará', pb: 'Paraíba',
  pr: 'Paraná', pe: 'Pernambuco', pi: 'Piauí', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', rs: 'Rio Grande do Sul',
  ro: 'Rondônia', rr: 'Roraima', sc: 'Santa Catarina', sp: 'São Paulo', se: 'Sergipe', to: 'Tocantins'
}

export interface ResultadoGeo { name: string; admin1?: string; country?: string; country_code?: string; latitude: number; longitude: number; population?: number; feature_code?: string }

/**
 * Escolhe o melhor resultado da base de cidades para o que foi falado.
 * "Cidade, Estado/UF/País" filtra pelo complemento; empate vai para a maior população
 * (e cidades brasileiras ganham um empurrão, já que a FRIDAY fala português do Brasil).
 */
export function escolherResultado(resultados: ResultadoGeo[], texto: string): ResultadoGeo | null {
  if (!resultados.length) return null
  const [nomeBruto, ...resto] = texto.split(',')
  const nome = normalizar(nomeBruto)
  const extra = normalizar(resto.join(' '))
  const extraExpandido = extra && UF[extra] ? normalizar(UF[extra]) : extra
  const nota = (r: ResultadoGeo): number => {
    let n = Math.log10((r.population ?? 0) + 10)
    if (normalizar(r.name) === nome) n += 5
    if (r.country_code === 'BR') n += 1.5
    if (extraExpandido) {
      const onde = normalizar(`${r.admin1 ?? ''} ${r.country ?? ''} ${r.country_code ?? ''}`)
      n += onde.includes(extraExpandido) ? 20 : -20
    }
    // Capitais e sedes administrativas primeiro
    if (r.feature_code === 'PPLC') n += 2
    else if (r.feature_code === 'PPLA') n += 1
    return n
  }
  return [...resultados].sort((a, b) => nota(b) - nota(a))[0]
}

/** Acha o lugar: base de cidades do Open-Meteo e, se não der, OpenStreetMap. */
export async function acharLocal(texto: string, buscar: Buscar = fetch): Promise<Local> {
  const limpo = texto.trim()
  if (!limpo) throw new Error('Faltou dizer o lugar.')
  const nome = limpo.split(',')[0].trim()
  try {
    const r = await buscar(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=10&language=pt&format=json`)
    if (r.ok) {
      const d = (await r.json()) as { results?: ResultadoGeo[] }
      const x = escolherResultado(d.results ?? [], limpo)
      if (x) return { nome: x.name, regiao: x.admin1 ?? '', pais: x.country ?? '', lat: x.latitude, lon: x.longitude }
    }
  } catch { /* tenta o OpenStreetMap */ }
  const r = await buscar(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(limpo)}&format=jsonv2&limit=1&addressdetails=1&accept-language=pt-BR`)
  if (!r.ok) throw new Error('O serviço de mapas não respondeu.')
  const d = (await r.json()) as { lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> }[]
  const x = d[0]
  if (!x) throw new Error(`Não achei "${limpo}" no mapa.`)
  const a = x.address ?? {}
  return {
    nome: x.name || x.display_name.split(',')[0],
    regiao: a.state ?? a.region ?? '',
    pais: a.country ?? '',
    lat: Number(x.lat),
    lon: Number(x.lon)
  }
}

/** Previsão de agora e dos próximos `dias` (1 a 16). */
export async function buscarPrevisao(local: Local, dias = 3, buscar: Buscar = fetch): Promise<Previsao> {
  const n = Math.min(16, Math.max(1, Math.round(dias)))
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${local.lat}&longitude=${local.lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset' +
    `&forecast_days=${n}&timezone=auto`
  const r = await buscar(url)
  if (!r.ok) throw new Error(`O serviço de clima respondeu ${r.status}.`)
  const d = await r.json() as {
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number; is_day: number }
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; precipitation_sum: (number | null)[]; sunrise: string[]; sunset: string[] }
  }
  return {
    local,
    agora: {
      temp: Math.round(d.current.temperature_2m), sensacao: Math.round(d.current.apparent_temperature), codigo: d.current.weather_code,
      vento: Math.round(d.current.wind_speed_10m), umidade: Math.round(d.current.relative_humidity_2m), dia: d.current.is_day === 1
    },
    dias: d.daily.time.map((data, i) => ({
      data,
      min: Math.round(d.daily.temperature_2m_min[i]),
      max: Math.round(d.daily.temperature_2m_max[i]),
      chuva: d.daily.precipitation_probability_max[i] ?? 0,
      mm: Math.round((d.daily.precipitation_sum[i] ?? 0) * 10) / 10,
      codigo: d.daily.weather_code[i],
      nascer: (d.daily.sunrise[i] ?? '').slice(11, 16),
      por: (d.daily.sunset[i] ?? '').slice(11, 16)
    }))
  }
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Nome falado do dia: hoje, amanhã ou o dia da semana com a data. */
export function nomeDoDia(data: string, hoje: string): string {
  const dias = Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  const d = new Date(`${data}T12:00:00Z`)
  return `${SEMANA[d.getUTCDay()]} (${data.slice(8, 10)}/${data.slice(5, 7)})`
}

const nomeDoLocal = (l: Local): string => [l.nome, l.regiao && l.regiao !== l.nome ? l.regiao : '', l.pais].filter(Boolean).join(', ')

/**
 * Resumo para a FRIDAY falar. Sem `dia`: agora + hoje (+ os próximos, se pediu mais dias).
 * Com `dia` (AAAA-MM-DD): só aquele dia.
 */
export function resumir(p: Previsao, dia?: string): string {
  const hoje = p.dias[0]?.data ?? ''
  const linhaDia = (d: Dia) => `${nomeDoDia(d.data, hoje)}: ${descreverTempo(d.codigo)}, de ${d.min} a ${d.max} graus, ${d.chuva}% de chance de chuva${d.mm >= 1 ? ` (${String(d.mm).replace('.', ',')} mm)` : ''}`
  if (dia) {
    const d = p.dias.find((x) => x.data === dia)
    return d ? `${nomeDoLocal(p.local)}, ${linhaDia(d)}.` : `Não tenho previsão para ${dia} em ${nomeDoLocal(p.local)} (só até 16 dias).`
  }
  const a = p.agora
  const partes = [
    `${nomeDoLocal(p.local)} agora: ${a.temp} graus, ${descreverTempo(a.codigo)}, sensação de ${a.sensacao}, vento de ${a.vento} km/h, umidade de ${a.umidade}%.`,
    ...p.dias.map((d) => `${linhaDia(d)}.`)
  ]
  if (p.dias[0]?.nascer) partes.push(`Sol nasce às ${p.dias[0].nascer} e se põe às ${p.dias[0].por}.`)
  return partes.join(' ')
}

/** Dados para o cartão de clima do HUD. */
export function cartaoClima(p: Previsao): { cidade: string; temperatura: number; sensacao: number; descricao: string; icone: string; minima: number; maxima: number; chuva: number } {
  const h = p.dias[0]
  return {
    cidade: p.local.nome,
    temperatura: p.agora.temp,
    sensacao: p.agora.sensacao,
    descricao: descreverTempo(p.agora.codigo),
    icone: iconeTempo(p.agora.codigo),
    minima: h?.min ?? p.agora.temp,
    maxima: h?.max ?? p.agora.temp,
    chuva: h?.chuva ?? 0
  }
}
