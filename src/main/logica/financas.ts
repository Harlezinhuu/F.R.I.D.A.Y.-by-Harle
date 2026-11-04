// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Finanças: lançamentos (o que entrou e o que saiu), categorias, orçamento por categoria e o resumo
// do mês. Também lê os avisos de compra e Pix que o banco manda no celular (se você ligar isso),
// ficando só com valor, estabelecimento e data: nada de número de cartão, saldo ou limite.
// A FRIDAY só anota e avisa; ela nunca mexe no app do banco nem paga nada.
// Só regras e contas (sem disco, sem rede), para testar.

export type TipoLancamento = 'entrada' | 'saida'

export interface Lancamento {
  id: string
  /** AAAA-MM-DD */
  data: string
  /** Sempre positivo; o tipo diz se entrou ou saiu */
  valor: number
  tipo: TipoLancamento
  descricao: string
  categoria: string
  origem: 'voz' | 'celular' | 'cliente'
  /** Para não anotar o mesmo aviso do banco duas vezes */
  chave?: string
}

export interface Financas {
  lancamentos: Lancamento[]
  /** Limite por mês de cada categoria de gasto */
  orcamento: Record<string, number>
  /** "AAAA-MM|categoria|80" já avisados */
  avisados: string[]
  /** Último mês (AAAA-MM) com resumo mandado */
  resumoMandado: string
}

export const FINANCAS_VAZIO: Financas = { lancamentos: [], orcamento: {}, avisados: [], resumoMandado: '' }

/** Categorias de gasto e as palavras que entregam cada uma (na descrição ou no nome do estabelecimento). */
export const CATEGORIAS: { nome: string; palavras: RegExp }[] = [
  { nome: 'mercado', palavras: /mercad|supermerc|atacad|assa[ií]|carrefour|p[aã]o de a[cç]|extra\b|dia\b|hortifruti|sacol[aã]o|a[cç]ougue|feira/ },
  { nome: 'comida', palavras: /ifood|rappi|restaur|lanch|burger|pizz|padaria|caf[eé]|a[cç]a[ií]|sorvet|bar\b|delivery|mc ?donald|bk\b|subway|esfih|pastel|food/ },
  { nome: 'transporte', palavras: /uber|99|cabify|posto|combust|gasolin|etanol|shell|ipiranga|petrobras|br mania|estaciona|ped[aá]gio|sem parar|metr[oô]|[oô]nibus|bilhete|recarga transp/ },
  { nome: 'saúde', palavras: /farm[aá]c|droga|droga ?raia|pague menos|panvel|m[eé]dic|cl[ií]nic|hospital|laborat|dentist|plano de sa[uú]de|unimed|amil|academia|smart ?fit/ },
  { nome: 'casa', palavras: /aluguel|condom[ií]n|\bluz\b|energia|\benel\b|light|cemig|copel|\b[aá]gua\b|sabesp|comg[aá]s|\bg[aá]s\b|internet|\bvivo\b|\bclaro\b|\btim\b|\boi\b|\bnet\b|iptu/ },
  { nome: 'assinaturas', palavras: /netflix|spotify|disney|prime video|amazon prime|hbo|max\b|youtube|apple\.com|icloud|google (one|storage)|deezer|globoplay|chatgpt|openai|claude|anthropic|adobe|canva|microsoft|xbox|playstation/ },
  { nome: 'trabalho', palavras: /hospedag|dom[ií]nio|registro\.br|hostinger|hostgator|locaweb|vercel|netlify|github|figma|shopify|nuvemshop|google ads|meta ads|facebook ads|contador|das\b|mei\b|simples nacional/ },
  { nome: 'educação', palavras: /escola|faculd|curso|udemy|alura|livr|papelar|mensalidade escolar|material escolar/ },
  { nome: 'lazer', palavras: /cinema|ingresso|show|teatro|parque|viagem|hotel|airbnb|booking|passagem|latam|gol\b|azul\b|steam|jogo/ },
  { nome: 'compras', palavras: /shopee|mercado ?livre|amazon|magalu|magazine|americanas|aliexpress|shein|renner|riachuelo|c&a|zara|centauro|netshoes|kabum|casas bahia/ }
]

export const CATEGORIAS_DE_ENTRADA = ['trabalho', 'salário', 'pix recebido', 'outros']

const sem = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Acha a categoria pela descrição. Entrada é "trabalho" quando vem de cliente, senão "outros". */
export function categorizar(descricao: string, tipo: TipoLancamento = 'saida'): string {
  const d = descricao.toLowerCase()
  if (tipo === 'entrada') {
    if (/sal[aá]rio|holerite|folha/.test(d)) return 'salário'
    if (/site|cliente|entrada|parcela|manuten[cç][aã]o|projeto/.test(d)) return 'trabalho'
    if (/pix/.test(d)) return 'pix recebido'
    return 'outros'
  }
  return CATEGORIAS.find((c) => c.palavras.test(d) || c.palavras.test(sem(d)))?.nome ?? 'outros'
}

/** "R$ 1.234,56" → 1234.56; "45,9" → 45.9; "1234.5" → 1234.5. */
export function lerValor(s: string): number | null {
  const m = s.replace(/\s/g, '').match(/-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+(?:,\d{1,2})?|-?\d+(?:\.\d{1,2})?/)
  if (!m) return null
  let t = m[0]
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const v = Number(t)
  return Number.isFinite(v) ? Math.abs(v) : null
}

export const dataLocal = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const limparNome = (s: string): string =>
  s.replace(/\s*\b(para|no|na|do|da|em|com)?\s*(o|a|seu|sua)?\s*cart[aã]o\b.*$/i, '').replace(/\bfinal\s*\d{3,4}\b.*$/i, '').replace(/[*_]+/g, ' ')
    .replace(/[.,;!]+\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 60)

/** Título com cara de gente: "PADARIA SOL LTDA" → "Padaria Sol". */
const bonito = (s: string): string =>
  s.replace(/\b(ltda|me|eireli|s\.?a\.?|epp|cia)\b\.?/gi, '').trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())

/**
 * Lê um aviso de banco ("Compra de R$ 45,90 APROVADA em PADARIA SOL", "Você recebeu um Pix de
 * R$ 200,00 de Maria"). Devolve só o que precisa para o lançamento, ou null se não é compra nem Pix.
 */
export function lerAvisoDeBanco(titulo: string, texto: string, quando: number): Omit<Lancamento, 'id' | 'origem'> | null {
  const t = `${titulo}. ${texto}`.replace(/\s+/g, ' ').trim()
  const s = sem(t)
  if (!/r\$\s*\d/.test(s)) return null
  // Não é movimento: fatura, limite, saldo, ofertas, agendamentos e recusas
  if (/fatura (fechou|fechada|aberta|vence|disponivel)|limite (disponivel|aumentou|de credito)|saldo (disponivel|atual)|pre-?aprovad|emprestimo|oferta|cashback de|agendad|recusad|negad|nao aprovad|estorn|cancelad/.test(s)) return null
  const valorTxt = t.match(/R\$\s*([\d.,]+)/)
  const valor = valorTxt ? lerValor(valorTxt[1]) : null
  if (!valor) return null
  const data = dataLocal(new Date(quando))
  const chave = `${data}|${valor.toFixed(2)}|${s.replace(/final\s*\d+/g, '').replace(/\d{4}[ .]?\d{4}[ .]?\d{4}[ .]?\d{4}/g, '').replace(/[^a-z0-9]/g, '').slice(0, 80)}`

  // Entrada: Pix ou transferência recebida
  if (/(recebeu|recebido|recebida|caiu|chegou).{0,40}(pix|transfer|ted|deposito)|(pix|transfer[eê]ncia|ted|dep[oó]sito).{0,25}(recebid|chegou|caiu)/.test(s)) {
    const de = t.match(/\bde\s+R\$\s*[\d.,]+\s+(?:de|do|da)\s+(.+)$/i) ?? t.match(/(?:recebid[oa]|recebeu)[^.]*?\b(?:de|do|da)\s+([A-ZÀ-Ú][^.,]+)/i)
    const nome = de ? bonito(limparNome(de[1])) : ''
    return { data, valor, tipo: 'entrada', descricao: nome ? `Pix de ${nome}` : 'Pix recebido', categoria: 'pix recebido', chave }
  }
  // Saída: Pix ou transferência enviada
  if (/(pix|transfer[eê]ncia|ted).{0,30}(enviad|realizad|feit|efetuad)|(enviou|fez|realizou).{0,20}(pix|transfer)/.test(s)) {
    const para = t.match(/\bpara\s+(.+)$/i)
    const nome = para ? bonito(limparNome(para[1])) : ''
    return { data, valor, tipo: 'saida', descricao: nome ? `Pix para ${nome}` : 'Pix enviado', categoria: categorizar(nome || 'pix'), chave }
  }
  // Saída: compra no cartão ou débito
  if (/compra|debito|d[eé]bito|pagamento (aprovado|realizado|efetuado)|aprovad/.test(s)) {
    const em = t.match(/R\$\s*[\d.,]+[^.]*?\b(?:em|no|na)\s+(.+)$/i) ?? t.match(/\b(?:em|no|na)\s+([A-Z0-9][A-Z0-9 &*'.-]{2,})(?:\s+(?:de|no valor de)\s+R\$|[.,]|$)/)
    let nome = em ? limparNome(em[1]) : ''
    if (/^(seu|sua)\b/i.test(nome)) nome = ''
    nome = nome ? bonito(nome) : ''
    return { data, valor, tipo: 'saida', descricao: nome || 'Compra no cartão', categoria: categorizar(nome), chave }
  }
  return null
}

export const doMes = (ls: Lancamento[], mes: string): Lancamento[] => ls.filter((l) => l.data.startsWith(mes))

export interface ResumoDoMes {
  mes: string
  entradas: number
  saidas: number
  saldo: number
  porCategoria: { categoria: string; total: number; limite: number; pct: number }[]
  maiores: Lancamento[]
  quantos: number
}

const r2 = (v: number): number => Math.round(v * 100) / 100

export function resumoDoMes(ls: Lancamento[], mes: string, orcamento: Record<string, number> = {}): ResumoDoMes {
  const m = doMes(ls, mes)
  const entradas = r2(m.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0))
  const saidasL = m.filter((l) => l.tipo === 'saida')
  const saidas = r2(saidasL.reduce((s, l) => s + l.valor, 0))
  const cats = new Map<string, number>()
  for (const l of saidasL) cats.set(l.categoria, (cats.get(l.categoria) ?? 0) + l.valor)
  for (const c of Object.keys(orcamento)) if (!cats.has(c)) cats.set(c, 0)
  const porCategoria = [...cats].map(([categoria, total]) => {
    const limite = orcamento[categoria] ?? 0
    return { categoria, total: r2(total), limite, pct: limite ? Math.round((total / limite) * 100) : 0 }
  }).sort((a, b) => b.total - a.total)
  return { mes, entradas, saidas, saldo: r2(entradas - saidas), porCategoria, maiores: [...saidasL].sort((a, b) => b.valor - a.valor).slice(0, 3), quantos: m.length }
}

export const reais = (v: number): string => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function resumoEmTexto(r: ResumoDoMes, nomeMes: string): string {
  if (!r.quantos) return `Nada anotado em ${nomeMes} ainda.`
  const cats = r.porCategoria.filter((c) => c.total > 0).slice(0, 5).map((c) => `${c.categoria} ${reais(c.total)}${c.limite ? ` (${c.pct}% do limite)` : ''}`)
  const passou = r.porCategoria.filter((c) => c.limite && c.total > c.limite).map((c) => c.categoria)
  return `Em ${nomeMes}: entrou ${reais(r.entradas)}, saiu ${reais(r.saidas)}, ${r.saldo >= 0 ? 'sobrou' : 'faltou'} ${reais(Math.abs(r.saldo))}.` +
    (cats.length ? ` Onde foi mais: ${cats.join(', ')}.` : '') +
    (r.maiores.length ? ` Maior gasto: ${r.maiores[0].descricao}, ${reais(r.maiores[0].valor)}.` : '') +
    (passou.length ? ` Passou do limite em ${passou.join(' e ')}.` : '')
}

/** Categorias que acabaram de passar de 80% ou de 100% do limite (cada uma avisa uma vez por mês). */
export function alertasDeOrcamento(f: Financas, mes: string): { categoria: string; pct: number; chave: string }[] {
  const r = resumoDoMes(f.lancamentos, mes, f.orcamento)
  const out: { categoria: string; pct: number; chave: string }[] = []
  for (const c of r.porCategoria) {
    if (!c.limite) continue
    const faixa = c.pct >= 100 ? 100 : c.pct >= 80 ? 80 : 0
    if (!faixa) continue
    const chave = `${mes}|${c.categoria}|${faixa}`
    if (!f.avisados.includes(chave)) out.push({ categoria: c.categoria, pct: c.pct, chave })
  }
  return out
}

/** Acha o lançamento pelo que ele falou ("o último", "o do ifood", "o de 45 reais"). */
export function acharLancamento(ls: Lancamento[], alvo: string): Lancamento | null {
  const ordenados = [...ls].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
  const t = sem(alvo).trim()
  if (!t || /ultim/.test(t)) return ls[ls.length - 1] ?? null
  const v = /\d/.test(t) ? lerValor(t) : null
  const palavras = t.split(/\s+/).filter((w) => w.length > 2 && !/^(reais|real|gasto|compra|lancamento|que|dos?|das?)$/.test(w))
  return ordenados.find((l) => (v === null || Math.abs(l.valor - v) < 0.01) && (!palavras.length || palavras.some((w) => sem(l.descricao).includes(w)))) ??
    (v !== null ? ordenados.find((l) => Math.abs(l.valor - v) < 0.01) ?? null : null)
}
