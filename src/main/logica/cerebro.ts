// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Segundo cérebro, a parte que não depende do Windows: quebrar os textos em pedaços, montar o índice
// e buscar. A busca é a BM25 (a mesma ideia dos buscadores) com acentos e plurais tratados; quem dá
// o "sentido" é a FRIDAY, que manda junto palavras relacionadas (sinônimos, termos em inglês).
// Tudo roda no seu PC: os seus arquivos nunca são enviados inteiros para lugar nenhum.

// ---------- Texto ----------

const PARADAS = new Set((
  'a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra pro com sem sob sobre ' +
  'e ou mas que se como quando onde qual quais quem cujo isso isto aquilo esse essa este esta aquele aquela ele ela eles elas ' +
  'eu tu voce voces nos me te lhe meu minha seu sua nosso nossa ja nao sim mais menos muito pouco tambem so ate entre ' +
  'foi ser sao era tem ter ha tinha esta estao estava vai vou fazer feito ao aos the of and or to in on for with is are was ' +
  'be by an at it this that from as not but'
).split(' '))

const semAcento = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Raiz simples (português e inglês): "sub-redes" e "sub-rede" viram a mesma coisa. */
export function raiz(p: string): string {
  if (p.length <= 3 || /^\d+$/.test(p)) return p
  if (p.endsWith('oes') || p.endsWith('aes')) return `${p.slice(0, -3)}ao`
  if (p.endsWith('ais')) return `${p.slice(0, -3)}al`
  if (p.endsWith('eis') && p.length > 5) return `${p.slice(0, -3)}el`
  if (p.endsWith('ies') && p.length > 5) return `${p.slice(0, -3)}y`
  if (p.endsWith('res') || p.endsWith('zes')) return p.slice(0, -2)
  if (p.endsWith('ns')) return `${p.slice(0, -2)}m`
  if (p.endsWith('s') && !p.endsWith('ss') && p.length > 4) return p.slice(0, -1)
  return p
}

/** Palavras que contam para a busca (sem acento, sem as muito comuns, na raiz). */
export function termos(texto: string): string[] {
  const saida: string[] = []
  for (const bruto of semAcento(texto.toLowerCase()).split(/[^a-z0-9]+/)) {
    if (bruto.length < 2 || bruto.length > 40 || PARADAS.has(bruto)) continue
    saida.push(raiz(bruto))
  }
  return saida
}

/** Quebra o texto em pedaços de ~900 letras, respeitando parágrafos (com um pouco de sobra entre eles). */
export function fatiar(texto: string, tamanho = 900, sobra = 120): string[] {
  const limpo = texto.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (!limpo) return []
  const pedacos: string[] = []
  let atual = ''
  for (const par of limpo.split(/\n\n+/)) {
    if ((atual + '\n\n' + par).length <= tamanho) { atual = atual ? `${atual}\n\n${par}` : par; continue }
    if (atual) pedacos.push(atual)
    if (par.length <= tamanho) { atual = (atual ? atual.slice(-sobra) + '\n\n' : '') + par; continue }
    // Parágrafo enorme: corta por frases
    let resto = par
    while (resto.length > tamanho) {
      let corte = resto.lastIndexOf('. ', tamanho)
      if (corte < tamanho / 2) corte = resto.lastIndexOf(' ', tamanho)
      if (corte < tamanho / 2) corte = tamanho
      pedacos.push(resto.slice(0, corte + 1).trim())
      resto = resto.slice(Math.max(0, corte + 1 - sobra))
    }
    atual = resto.trim()
  }
  if (atual) pedacos.push(atual)
  return pedacos
}

// ---------- Segredos ----------

/** Arquivos que nunca entram no índice. */
export function arquivoSecreto(nome: string): boolean {
  const n = nome.toLowerCase()
  return /^\.env(\..*)?$/.test(n) || /\.(pem|key|pfx|p12|keystore|jks|kdbx|ovpn|ppk|asc|gpg)$/.test(n) || /^id_(rsa|ed25519|ecdsa|dsa)/.test(n) ||
    /(senha|password|credenciais|credentials|secrets?|token)s?\.(txt|json|md|csv|ya?ml)$/.test(n)
}

/** Chaves e senhas que aparecerem no meio de um texto viram [oculto]. */
export function ocultarSegredos(texto: string): string {
  return texto
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[chave privada oculta]')
    .replace(/\b(AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_.-]{30,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abpr]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g, '[oculto]')
    .replace(/\b((?:api[_-]?key|token|secret|senha|password|passwd)\s*[:=]\s*)["']?[^\s"']{6,}["']?/gi, '$1[oculto]')
}

// ---------- Office (docx, pptx, xlsx, odt): o texto mora em XML dentro de um zip ----------

/** Lê os arquivos de dentro de um zip (só os que `quero` aceitar), sem biblioteca: o zlib do Node basta. */
export function lerZip(dados: Uint8Array, quero: (nome: string) => boolean, inflar: (d: Uint8Array) => Uint8Array): Record<string, Uint8Array> {
  const v = new DataView(dados.buffer, dados.byteOffset, dados.byteLength)
  let fim = -1
  for (let i = dados.length - 22; i >= Math.max(0, dados.length - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break }
  }
  if (fim < 0) throw new Error('não é um zip')
  const quantos = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  const saida: Record<string, Uint8Array> = {}
  const nomeDe = (ini: number, n: number) => new TextDecoder().decode(dados.subarray(ini, ini + n))
  for (let k = 0; k < quantos && p + 46 <= dados.length; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const metodo = v.getUint16(p + 10, true)
    const tamanho = v.getUint32(p + 20, true)
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const nome = nomeDe(p + 46, nl)
    p += 46 + nl + el + cl
    if (!quero(nome) || v.getUint32(local, true) !== 0x04034b50) continue
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const bruto = dados.subarray(ini, ini + tamanho)
    if (metodo === 0) saida[nome] = bruto
    else if (metodo === 8) saida[nome] = inflar(bruto)
  }
  return saida
}

const entidades = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')

/** Texto de um XML do Office: cada parágrafo numa linha. */
export function textoDeXml(xml: string): string {
  return entidades(
    xml
      .replace(/<(w:p|a:p|text:p|text:h|si|row)[\s>][\s\S]*?<\/\1>/g, (p) => `${p}\n`)
      .replace(/<(w:tab|text:tab)\s*\/>/g, ' ')
      .replace(/<(w:br|text:line-break)\s*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Quais arquivos de dentro do zip têm o texto, para cada formato. */
export function partesDoOffice(ext: string, nomes: string[]): string[] {
  const ordem = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
  switch (ext) {
    case '.docx': return nomes.filter((n) => /^word\/(document|footnotes|endnotes)\.xml$/.test(n))
    case '.pptx': return nomes.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(ordem)
    case '.xlsx': return nomes.filter((n) => n === 'xl/sharedStrings.xml')
    case '.odt': case '.odp': case '.ods': return nomes.filter((n) => n === 'content.xml')
    default: return []
  }
}

// ---------- Índice e busca (BM25) ----------

export interface Pedaco { arquivo: string; i: number; texto: string }
export interface Achado { arquivo: string; nota: number; trechos: string[] }

export class Indice {
  private pedacos: Pedaco[] = []
  private tamanhos: number[] = []
  private soma = 0
  /** termo → [índice do pedaço, quantas vezes] */
  private postagens = new Map<string, number[]>()
  /** Termos do nome de cada arquivo (contam mais) */
  private nomes = new Map<string, Set<string>>()

  get total(): number { return this.pedacos.length }

  adicionar(arquivo: string, nome: string, textos: string[]): void {
    this.nomes.set(arquivo, new Set(termos(nome.replace(/\.[a-z0-9]+$/i, ''))))
    textos.forEach((texto, i) => {
      const id = this.pedacos.length
      const ts = termos(texto)
      this.pedacos.push({ arquivo, i, texto })
      this.tamanhos.push(ts.length)
      this.soma += ts.length
      const conta = new Map<string, number>()
      for (const t of ts) conta.set(t, (conta.get(t) ?? 0) + 1)
      for (const [t, n] of conta) {
        let p = this.postagens.get(t)
        if (!p) { p = []; this.postagens.set(t, p) }
        p.push(id, n)
      }
    })
  }

  /**
   * Busca pela pergunta e pelas palavras relacionadas (com peso menor). Devolve os arquivos mais
   * relevantes, cada um com os melhores trechos.
   */
  buscar(pergunta: string, relacionadas: string[] = [], limite = 6): Achado[] {
    const pesos = new Map<string, number>()
    for (const t of termos(relacionadas.join(' '))) pesos.set(t, Math.max(pesos.get(t) ?? 0, 0.6))
    for (const t of termos(pergunta)) pesos.set(t, 1)
    if (!pesos.size || !this.pedacos.length) return []
    const N = this.pedacos.length
    const media = this.soma / N || 1
    const k1 = 1.2, b = 0.75
    const notas = new Map<number, number>()
    for (const [t, peso] of pesos) {
      const p = this.postagens.get(t)
      if (!p) continue
      const df = p.length / 2
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      for (let j = 0; j < p.length; j += 2) {
        const id = p[j], tf = p[j + 1]
        const bm = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * this.tamanhos[id] / media))
        notas.set(id, (notas.get(id) ?? 0) + peso * bm)
      }
    }
    // Junta por arquivo: o melhor pedaço manda; os outros e o nome do arquivo ajudam
    const porArquivo = new Map<string, { nota: number; ids: { id: number; nota: number }[] }>()
    for (const [id, nota] of notas) {
      const a = this.pedacos[id].arquivo
      const g = porArquivo.get(a) ?? { nota: 0, ids: [] }
      g.ids.push({ id, nota })
      porArquivo.set(a, g)
    }
    const achados: Achado[] = []
    for (const [arquivo, g] of porArquivo) {
      g.ids.sort((x, y) => y.nota - x.nota)
      const nome = this.nomes.get(arquivo) ?? new Set<string>()
      let bonusNome = 0
      for (const [t, peso] of pesos) if (nome.has(t)) bonusNome += peso
      const nota = g.ids[0].nota + 0.25 * g.ids.slice(1, 4).reduce((s, x) => s + x.nota, 0) + 1.5 * bonusNome
      achados.push({ arquivo, nota, trechos: g.ids.slice(0, 2).map((x) => trecho(this.pedacos[x.id].texto, [...pesos.keys()])) })
    }
    return achados.sort((x, y) => y.nota - x.nota).slice(0, limite)
  }
}

/** O pedaço do texto (~260 letras) onde as palavras buscadas mais aparecem. */
export function trecho(texto: string, procurados: string[], tamanho = 260): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (limpo.length <= tamanho) return limpo
  const alvo = new Set(procurados)
  let melhor = 0, melhorConta = -1
  const palavras = [...limpo.matchAll(/\S+/g)]
  const bate = palavras.map((p) => { const t = termos(p[0])[0]; return !!t && alvo.has(t) })
  for (let i = 0; i < palavras.length; i++) {
    if (!bate[i]) continue
    // Janela que começa numa palavra procurada: conta quantas cabem nela
    const inicio = palavras[i].index ?? 0
    let conta = 0
    for (let j = i; j < palavras.length && (palavras[j].index ?? 0) < inicio + tamanho - 60; j++) if (bate[j]) conta++
    if (conta > melhorConta) { melhorConta = conta; melhor = inicio }
  }
  const comeco = Math.max(0, melhor - 60)
  return `${comeco > 0 ? '…' : ''}${limpo.slice(comeco, comeco + tamanho).trim()}${comeco + tamanho < limpo.length ? '…' : ''}`
}
