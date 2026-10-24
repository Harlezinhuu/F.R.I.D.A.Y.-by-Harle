// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Corta o texto que vai chegando em frases completas, para a voz começar antes da resposta acabar.

const FIM_DE_FRASE = /([.!?…]+["')\]]?\s+|\n+)/
const MIN_FRASE = 12

/** Devolve as frases prontas e o que ainda está incompleto. */
export function cortarFrases(texto: string): { frases: string[]; resto: string } {
  const frases: string[] = []
  let resto = texto
  for (;;) {
    const m = resto.match(FIM_DE_FRASE)
    if (!m || m.index === undefined) break
    const corte = m.index + m[0].length
    const frase = resto.slice(0, corte).trim()
    const depois = resto.slice(corte)
    // Frases muito curtas ("Ok.") esperam a próxima para soar mais natural
    if (frase.length < MIN_FRASE) {
      const prox = depois.match(FIM_DE_FRASE)
      if (!prox || prox.index === undefined) break
      const corte2 = prox.index + prox[0].length
      frases.push(`${frase} ${depois.slice(0, corte2).trim()}`.trim())
      resto = depois.slice(corte2)
      continue
    }
    if (frase) frases.push(frase)
    resto = depois
  }
  return { frases, resto }
}

const CORTE_RAPIDO = /[,;:—–]\s+/

/**
 * Primeiro pedaço da resposta: sai na primeira vírgula (ou após ~60 caracteres numa quebra de palavra),
 * para a voz começar o quanto antes. As frases seguintes saem inteiras, que soam mais naturais.
 */
export function cortarPrimeiro(texto: string): { pedaco: string | null; resto: string } {
  const { frases, resto } = cortarFrases(texto)
  const primeiraCompleta = frases[0]
  const virgula = texto.match(CORTE_RAPIDO)
  if (virgula && virgula.index !== undefined && virgula.index >= 18 && (!primeiraCompleta || virgula.index < primeiraCompleta.length)) {
    const corte = virgula.index + virgula[0].length
    return { pedaco: texto.slice(0, corte).trim(), resto: texto.slice(corte) }
  }
  if (primeiraCompleta) return { pedaco: primeiraCompleta, resto: [...frases.slice(1), resto].join(' ').trimStart() }
  if (texto.length >= 70) {
    const espaco = texto.lastIndexOf(' ', 60)
    if (espaco > 25) return { pedaco: texto.slice(0, espaco).trim(), resto: texto.slice(espaco + 1) }
  }
  return { pedaco: null, resto: texto }
}


// ---------- Números por extenso, em português ----------
// O Fish lê melhor "dezenove graus" do que "19 graus": converter os números por conta própria
// evita que ele use regras de pronúncia de outro idioma.

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n < 20) return UNIDADES[n]
  if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? ` e ${UNIDADES[n % 10]}` : '')
  if (n === 100) return 'cem'
  return CENTENAS[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : '')
}

/** Inteiro por extenso (até 999.999.999). */
export function porExtenso(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) return String(n)
  if (n < 1000) return ate999(n)
  const milhoes = Math.floor(n / 1_000_000), milhares = Math.floor((n % 1_000_000) / 1000), resto = n % 1000
  const partes: string[] = []
  if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`)
  if (milhares) partes.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`)
  if (resto) partes.push(ate999(resto))
  // "e" antes da última parte quando ela é menor que 100 ou uma centena redonda: "mil e cem", "dois mil e cinco"
  const ultimo = resto || (milhoes ? milhares : 0)
  if (partes.length > 1 && ultimo && (ultimo < 100 || ultimo % 100 === 0)) return `${partes.slice(0, -1).join(' ')} e ${partes.at(-1)}`
  return partes.join(' ')
}

const lerInteiro = (s: string): number => Number(s.replace(/\./g, ''))

/** Troca números do texto por palavras: horas, porcentagens, graus, decimais e inteiros. */
export function numerosParaFala(texto: string): string {
  return texto
    // Horas: 9:30 → nove e trinta; 9:00 → nove horas
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_, h: string, m: string) =>
      Number(m) === 0 ? `${porExtenso(Number(h))} ${Number(h) === 1 ? 'hora' : 'horas'}` : `${porExtenso(Number(h))} e ${porExtenso(Number(m))}`)
    // Decimais com vírgula: 19,5 → dezenove vírgula cinco
    .replace(/\b(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})\b/g, (_, i: string, d: string) =>
      `${porExtenso(lerInteiro(i))} vírgula ${d.startsWith('0') ? `zero ${porExtenso(Number(d))}` : porExtenso(Number(d))}`)
    // Inteiros, inclusive com ponto de milhar: 1.500 → mil e quinhentos
    .replace(/\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b/g, (n) => porExtenso(lerInteiro(n)))
    .replace(/\s*%/g, ' por cento')
    .replace(/\s*°\s*C\b/g, ' graus')
    .replace(/\s*[°º]/g, ' graus')
}
