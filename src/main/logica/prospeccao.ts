// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Prospecção: achar lojas da sua região que ainda não têm site, pelo mapa aberto (OpenStreetMap,
// gratuito), e ordenar as mais promissoras. Mensagem para loja que ainda não é cliente nunca sai
// sem o seu "pode" (poucas por dia, sempre personalizadas, para não parecer spam).
// Também aqui: o resumo do vigia dos sites no ar (para o relatório mensal).

export interface LojaAchada {
  osm: string
  nome: string
  segmento: string
  telefone: string
  instagram: string
  site: string
  endereco: string
  horario: boolean
  distanciaKm: number
}

/** Ramo falado → etiquetas do OpenStreetMap. */
const RAMOS: { palavras: RegExp; nome: string; filtros: string[] }[] = [
  { palavras: /padaria|confeitaria|doce|bolo/, nome: 'padaria', filtros: ['"shop"~"^(bakery|confectionery|pastry)$"'] },
  { palavras: /pet|animal|ra[cç][aã]o/, nome: 'pet shop', filtros: ['"shop"="pet"'] },
  { palavras: /roupa|moda|boutique|cal[cç]ado|sapato/, nome: 'moda', filtros: ['"shop"~"^(clothes|boutique|shoes|fashion_accessories)$"'] },
  { palavras: /sal[aã]o|cabel|est[eé]tica|beleza|barbearia|unha/, nome: 'salão e estética', filtros: ['"shop"~"^(hairdresser|beauty|cosmetics)$"'] },
  { palavras: /a[cç]a[ií]|sorvete|gelato/, nome: 'açaí e sorvete', filtros: ['"amenity"="ice_cream"'] },
  { palavras: /lanche|hamburg|pizza|restaurante|comida/, nome: 'comida', filtros: ['"amenity"~"^(fast_food|restaurant)$"'] },
  { palavras: /caf[eé]/, nome: 'café', filtros: ['"amenity"="cafe"'] },
  { palavras: /flor/, nome: 'floricultura', filtros: ['"shop"="florist"'] },
  { palavras: /[oó]tica|[oó]culos/, nome: 'ótica', filtros: ['"shop"="optician"'] },
  { palavras: /celular|eletr[oô]nic|inform[aá]tica/, nome: 'eletrônicos', filtros: ['"shop"~"^(mobile_phone|electronics|computer)$"'] },
  { palavras: /m[oó]ve|decora/, nome: 'móveis e decoração', filtros: ['"shop"~"^(furniture|interior_decoration)$"'] },
  { palavras: /bicicleta|bike/, nome: 'bicicletas', filtros: ['"shop"="bicycle"'] },
  { palavras: /papelaria|livr/, nome: 'papelaria e livros', filtros: ['"shop"~"^(stationery|books)$"'] }
]

const SEGMENTO_DA_ETIQUETA: Record<string, string> = {
  bakery: 'padaria', confectionery: 'confeitaria', pastry: 'confeitaria', pet: 'pet shop', clothes: 'moda', boutique: 'moda', shoes: 'calçados',
  hairdresser: 'salão', beauty: 'estética', cosmetics: 'cosméticos', ice_cream: 'açaí e sorvete', fast_food: 'lanchonete', restaurant: 'restaurante',
  cafe: 'café', florist: 'floricultura', optician: 'ótica', mobile_phone: 'celulares', electronics: 'eletrônicos', computer: 'informática',
  furniture: 'móveis', interior_decoration: 'decoração', bicycle: 'bicicletas', stationery: 'papelaria', books: 'livraria', gift: 'presentes', jewelry: 'joalheria'
}

/** A consulta ao Overpass (o banco do OpenStreetMap) para lojas num raio. */
export function consultaOverpass(lat: number, lon: number, raioKm: number, ramo = ''): string {
  const r = Math.round(Math.min(15, Math.max(0.5, raioKm)) * 1000)
  const escolhido = RAMOS.find((x) => x.palavras.test(ramo.toLowerCase()))
  const filtros = escolhido ? escolhido.filtros : ['"shop"', '"amenity"~"^(ice_cream|cafe|fast_food)$"']
  return `[out:json][timeout:25];(${filtros.map((f) => `nwr[${f}][name](around:${r},${lat},${lon});`).join('')});out center tags 400;`
}

export const nomeDoRamo = (ramo: string): string => RAMOS.find((x) => x.palavras.test(ramo.toLowerCase()))?.nome ?? ''

const dist = (a: number, b: number, c: number, d: number): number => {
  const k = Math.PI / 180
  const x = Math.sin(((c - a) * k) / 2) ** 2 + Math.cos(a * k) * Math.cos(c * k) * Math.sin(((d - b) * k) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x)))
}

interface Elemento { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

/** Lê a resposta do Overpass e fica com as lojas sem site, das mais promissoras para as menos. */
export function lerLojas(dados: { elements?: Elemento[] }, lat: number, lon: number, jaVistas: string[] = []): LojaAchada[] {
  const vistas = new Set(jaVistas)
  const out: (LojaAchada & { nota: number })[] = []
  for (const e of dados.elements ?? []) {
    const t = e.tags ?? {}
    const osm = `${e.type}/${e.id}`
    if (!t.name || vistas.has(osm)) continue
    // Grandes redes e franquias não são o seu cliente
    if (t.brand || t['brand:wikidata'] || /^(supermarket|department_store|mall|car|fuel)$/.test(t.shop ?? '')) continue
    const site = t.website || t['contact:website'] || t.url || ''
    if (site) continue
    const p = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null)
    if (!p) continue
    const telefone = t.phone || t['contact:phone'] || t['contact:whatsapp'] || t['contact:mobile'] || ''
    const instagram = t['contact:instagram'] || ''
    const endereco = [t['addr:street'], t['addr:housenumber'], t['addr:suburb'] || t['addr:neighbourhood']].filter(Boolean).join(', ')
    const km = Math.round(dist(lat, lon, p.lat, p.lon) * 10) / 10
    const etiqueta = t.shop || t.amenity || t.craft || ''
    const nota = (telefone ? 3 : 0) + (instagram ? 2 : 0) + (t.opening_hours ? 1 : 0) + (endereco ? 1 : 0) - km / 3
    out.push({ osm, nome: t.name, segmento: SEGMENTO_DA_ETIQUETA[etiqueta] ?? etiqueta.replace(/_/g, ' '), telefone, instagram, site, endereco, horario: !!t.opening_hours, distanciaKm: km, nota })
  }
  return out.sort((a, b) => b.nota - a.nota).map(({ nota: _n, ...l }) => l)
}

/** Primeira mensagem para uma loja (curta, pessoal, com a prévia como gancho). */
export function mensagemDeAbordagem(l: { nome: string; segmento: string }, seuNome: string, cidade: string): string {
  return `Oi! Tudo bem? Sou o ${seuNome} e faço sites para lojas${cidade ? ` aqui de ${cidade}` : ''}. Vi que a ${l.nome} ainda não tem site e montei uma ideia de como ficaria o de vocês, pensado para quem procura ${l.segmento || 'a loja'} pelo celular. Posso te mostrar? Leva 2 minutinhos e não tem compromisso.`
}

// ---------- Vigia dos sites no ar ----------

export interface Checagem { t: number; ok: boolean; ms: number }

/** Resumo de um período: quanto tempo no ar e a velocidade média de resposta. */
export function resumoDoMonitor(cs: Checagem[], de: number, ate: number): { checagens: number; noAr: number; msMedio: number; quedas: number } {
  const no = cs.filter((c) => c.t >= de && c.t < ate).sort((a, b) => a.t - b.t)
  if (!no.length) return { checagens: 0, noAr: 100, msMedio: 0, quedas: 0 }
  const ok = no.filter((c) => c.ok)
  let quedas = 0
  for (let i = 1; i < no.length; i++) if (no[i - 1].ok && !no[i].ok) quedas++
  if (!no[0].ok) quedas++
  return { checagens: no.length, noAr: Math.round((ok.length / no.length) * 1000) / 10, msMedio: ok.length ? Math.round(ok.reduce((s, c) => s + c.ms, 0) / ok.length) : 0, quedas }
}

/** Saiu do ar agora? (duas falhas seguidas, para não avisar por um soluço da internet) */
export function caiu(cs: Checagem[]): boolean {
  const u = cs.slice(-2)
  return u.length === 2 && u.every((c) => !c.ok) && (cs.length === 2 || cs[cs.length - 3].ok)
}

/** Voltou depois de cair? */
export const voltou = (cs: Checagem[]): boolean => cs.length >= 3 && cs[cs.length - 1].ok && !cs[cs.length - 2].ok && !cs[cs.length - 3].ok

/** Mensagem do relatório mensal para o cliente. */
export function mensagemDoRelatorio(loja: string, mes: string, r: { noAr: number; msMedio: number }, seuNome: string): string {
  const vel = r.msMedio ? `, respondendo em ${(r.msMedio / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} segundo${r.msMedio >= 2000 ? 's' : ''} em média` : ''
  return `Oi! Aqui é o ${seuNome}, com o relatório de ${mes} do site da ${loja}: ficou no ar ${r.noAr.toLocaleString('pt-BR')}% do tempo${vel}. Se quiser mudar algum produto, preço ou foto este mês, é só me mandar por aqui!`
}
