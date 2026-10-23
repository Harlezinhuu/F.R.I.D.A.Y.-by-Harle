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

