// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Visão de Deus: monta o link do God's Eye View (projeto MIT de Bilawal Sidhu) com o lugar,
// as camadas e o estilo pedidos por voz. Sem dependências, para ter testes.

/** Camadas que dá para pedir por voz → código da camada no link do God's Eye View. */
export const CAMADAS: Record<string, { token: string; nome: string }> = {
  avioes: { token: 'f', nome: 'aviões' },
  militares: { token: 'm', nome: 'aviões militares' },
  satelites: { token: 's', nome: 'satélites' },
  navios: { token: 'a', nome: 'navios' },
  terremotos: { token: 'e', nome: 'terremotos' },
  cameras: { token: 'c', nome: 'câmeras públicas' },
  foguetes: { token: 'x', nome: 'lançamentos de foguetes' },
  radar: { token: 'v', nome: 'radar de chuva' },
  raios: { token: 'l', nome: 'raios' },
  ciclones: { token: 'y', nome: 'ciclones' },
  vento: { token: 'k', nome: 'vento' },
  transito: { token: 't', nome: 'trânsito' }
}

const APELIDOS: Record<string, string> = {
  aviao: 'avioes', voos: 'avioes', voo: 'avioes', trafego_aereo: 'avioes',
  militar: 'militares', avioes_militares: 'militares',
  satelite: 'satelites', iss: 'satelites',
  navio: 'navios', barcos: 'navios', barco: 'navios',
  terremoto: 'terremotos', sismos: 'terremotos', tremores: 'terremotos',
  camera: 'cameras', cctv: 'cameras',
  foguete: 'foguetes', lancamentos: 'foguetes',
  chuva: 'radar', tempestades: 'radar',
  raio: 'raios', relampagos: 'raios',
  ciclone: 'ciclones', furacoes: 'ciclones', furacao: 'ciclones',
  ventos: 'vento',
  trafego: 'transito'
}

/** Estilo visual pedido → nome do estilo no link. */
export const ESTILOS: Record<string, string> = {
  normal: 'normal',
  noturno: 'nvg',
  visao_noturna: 'nvg',
  termico: 'flir',
  retro: 'crt',
  anime: 'anime',
  noir: 'noir',
  neve: 'snow'
}

export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/[\s-]+/g, '_')

/** Converte os nomes falados das camadas nos códigos do link. */
export function lerCamadas(nomes: unknown): { chaves: string[]; desconhecidas: string[] } {
  const lista = Array.isArray(nomes) ? nomes : typeof nomes === 'string' && nomes ? nomes.split(/[,;]| e /) : []
  const chaves: string[] = []
  const desconhecidas: string[] = []
  for (const bruto of lista) {
    if (typeof bruto !== 'string' || !bruto.trim()) continue
    const n = normalizar(bruto)
    const chave = CAMADAS[n] ? n : APELIDOS[n]
    if (!chave) desconhecidas.push(bruto.trim())
    else if (!chaves.includes(chave)) chaves.push(chave)
  }
  return { chaves, desconhecidas }
}

export function lerEstilo(estilo: unknown): string | null {
  if (typeof estilo !== 'string' || !estilo.trim()) return null
  return ESTILOS[normalizar(estilo)] ?? null
}

/**
 * Altitude da câmera para enquadrar a área do lugar (caixa sul, norte, oeste, leste, em graus).
 * Uma cidade fica a alguns quilômetros; um país, a milhares.
 */
export function altitudePorCaixa(sul: number, norte: number, oeste: number, leste: number): number {
  const latMedia = ((sul + norte) / 2) * (Math.PI / 180)
  const dLat = Math.abs(norte - sul)
  let dLon = Math.abs(leste - oeste)
  if (dLon > 180) dLon = 360 - dLon
  const graus = Math.max(dLat, dLon * Math.cos(latMedia))
  const metros = graus * 111_320 * 1.6
  return Math.round(Math.min(15_000_000, Math.max(2_500, metros)))
}

export interface Vista {
  lat: number
  lon: number
  /** Altitude da câmera, em metros */
  alt: number
  /** Código do estilo no link (normal, nvg, flir...) */
  estilo: string
  /** Chaves de CAMADAS; vazio = as camadas que o próprio app já usa */
  camadas: string[]
}

/** Abaixo disso a câmera fica inclinada (vista 3D); acima, olha reto para baixo. */
const ALT_INCLINADA = 80_000
const INCLINACAO = -40

/**
 * Monta o trecho depois do # no link do God's Eye View.
 * A posição no link é a da câmera; com a câmera inclinada para o norte, ela recua
 * para o sul para que o lugar pedido fique no centro da tela.
 */
export function montarHash(v: Vista): string {
  const inclinada = v.alt < ALT_INCLINADA
  const pitch = inclinada ? INCLINACAO : -90
  let lat = v.lat
  if (inclinada) {
    const recuo = v.alt / Math.tan((-INCLINACAO * Math.PI) / 180)
    lat = v.lat - recuo / 111_320
  }
  const p = new URLSearchParams()
  p.set('lat', lat.toFixed(5))
  p.set('lon', v.lon.toFixed(5))
  p.set('alt', String(Math.round(v.alt)))
  p.set('heading', '0')
  p.set('pitch', String(pitch))
  p.set('style', v.estilo)
  p.set('map', 'esri-imagery')
  p.set('hv', '1')
  if (v.camadas.length) {
    p.set('v', '2')
    p.set('l', v.camadas.map((c) => CAMADAS[c].token).join('.'))
  }
  return p.toString()
}

/** O God's Eye View pede Node 24.14+ (fora o 25) ou Node 26. */
export function nodeServe(versao: string): boolean {
  const m = versao.trim().match(/^v?(\d+)\.(\d+)/)
  if (!m) return false
  const maior = Number(m[1]), menor = Number(m[2])
  return (maior === 24 && menor >= 14) || maior === 26
}

/** Vista inicial quando não pedem lugar: o planeta inteiro, centrado no Brasil. */
export const VISTA_PLANETA: Omit<Vista, 'estilo' | 'camadas'> = { lat: -14, lon: -52, alt: 18_000_000 }
