// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Palavras-chave da explicação: acompanha a transcrição da fala dela e avisa quando cada
// palavra-chave foi dita, para a palavra aparecer na tela junto com a voz.
// Sem lista (ou quando a lista acaba), escolhe sozinha a palavra mais forte de cada frase.

export interface Destaque {
  /** Como aparece na tela (maiúsculas, com acento) */
  palavra: string
  /** Palavra de alerta: aparece em vermelho */
  alerta: boolean
  /** Posição na lista do modelo (-1 quando foi escolhida automaticamente) */
  indice: number
}

/** Minúsculas, sem acento, sem hífen: "Escondê-la" → "escondela". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-‐‑'’]/g, '')
}

/** Separa em palavras normalizadas, mantendo onde cada uma termina no texto. */
function tokens(texto: string): { t: string; orig: string }[] {
  const out: { t: string; orig: string }[] = []
  for (const m of texto.matchAll(/[\p{L}\p{N}]+(?:[-‐‑'’][\p{L}\p{N}]+)*/gu)) out.push({ t: normalizar(m[0]), orig: m[0] })
  return out
}

const PALAVRAS_VAZIAS = new Set(
  ('a o as os um uma uns umas de da do das dos dum duma em na no nas nos num numa por pela pelo pelas pelos para pra pro ' +
    'com sem sob sobre entre ate apos ante e ou mas porem que se nao sim ja so tambem muito muita muitos muitas mais menos ' +
    'eu tu ele ela nos vos eles elas voce voces me te lhe lhes meu minha meus minhas seu sua seus suas teu tua nosso nossa ' +
    'esse essa esses essas este esta estes estas isso isto aquilo aquele aquela aqueles aquelas ai ali aqui la cada qual quais ' +
    'quem onde quando como porque pois entao assim bem tao tanto toda todo todas todos outro outra outros outras mesmo mesma ' +
    'ser sou es era eram foi foram sera seria seriam sao estar estou estava estavam esteve estao ter tenho tem tinha tinham teve ' +
    'haver ha havia houve fazer faz fazia fez feito faria poder pode podia pude poderia ir vai vou ia indo vem veio ' +
    'tipo coisa coisas gente agora depois antes ainda sempre nunca alguem algum alguma alguns algumas nada tudo nenhum ' +
    'ne ok ah oh olha veja bom boa enfim claro certo exatamente basicamente realmente simplesmente').split(' ')
)

/** Palavras que ficam vermelhas sozinhas: perigo, mentira, morte, segredo... */
const ALERTA = /^(proib|perig|fals|mentir|mort|morr|mata|assassin|enterr|escond|crim|amea|risc|golpe|fraud|alert|guerr|explo|ataq|destru|culp|segred|venen|toxic|vitim|desastr|catastr|colap|extin|bomba|armadilh|sabot|trai|fug|proibid|ilegal|negad|apag|cuidado|emergenc|fatal|radiac|virus|infec|pandem|panic|caos|ruin|falh)/

export function ehAlerta(palavra: string): boolean {
  return normalizar(palavra).split(/\s+/).some((p) => ALERTA.test(p))
}

/** Duas palavras "batem": iguais, ou a mesma raiz ("investigar" e "investigação", "verdade" e "verdades"). */
export function bate(a: string, b: string): boolean {
  if (a === b) return true
  const menor = Math.min(a.length, b.length)
  if (menor < 5) return false
  let i = 0
  while (i < menor && a[i] === b[i]) i++
  return i >= Math.max(5, menor - 2)
}

/** Formata a palavra como aparece na tela. */
export function exibir(p: string): string {
  return p.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR')
}

/** A palavra mais forte de uma frase: nomes próprios, números e palavras longas que não sejam vazias. */
export function escolherDestaques(frase: string, quantas: number, jaUsadas: Set<string>): string[] {
  const ts = tokens(frase)
  const notas = ts.map((tk, i) => {
    if (PALAVRAS_VAZIAS.has(tk.t) || jaUsadas.has(tk.t)) return -1
    if (/^\d+$/.test(tk.t)) return tk.t.length >= 3 ? 7 : -1
    if (tk.t.length < 5) return -1
    let n = Math.min(tk.t.length, 11)
    if (i > 0 && /^\p{Lu}/u.test(tk.orig)) n += 4 // nome próprio no meio da frase
    if (ALERTA.test(tk.t)) n += 5
    if (/(mente|ando|endo|indo)$/.test(tk.t)) n -= 4 // advérbios e gerúndios carregam pouco
    return n
  })
  const ordem = notas.map((n, i) => [n, i] as const).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, quantas)
  // Na ordem em que aparecem na frase
  return ordem.sort((a, b) => a[1] - b[1]).map(([, i]) => ts[i].orig)
}

/**
 * Acompanha a fala. `consumir` recebe o texto inteiro dito até agora (a transcrição vem em pedaços)
 * e devolve só os destaques novos, na ordem.
 */
export class Sincronia {
  private alvos: { tokens: string[]; palavra: string; alerta: boolean }[]
  private proximo = 0
  private lidos = 0 // tokens completos já analisados
  private frasesLidas = 0
  private frasesSemAchar = 0
  private usadas = new Set<string>()
  private automatico: boolean

  constructor(palavras: string[], alertas: string[] = [], automatico = true) {
    this.automatico = automatico
    const vermelhas = new Set(alertas.map((a) => normalizar(a).trim()))
    this.alvos = palavras
      .map((p) => exibir(p))
      .filter(Boolean)
      .slice(0, 24)
      .map((p) => {
        const tks = tokens(p).map((t) => t.t)
        return { tokens: tks, palavra: p, alerta: vermelhas.has(normalizar(p).trim()) || (!alertas.length && ehAlerta(p)) }
      })
      .filter((a) => a.tokens.length)
  }

  get total(): number { return this.alvos.length }
  get dito(): number { return this.proximo }

  /** Palavras da lista que ainda não apareceram. */
  restantes(): Destaque[] {
    return this.alvos.slice(this.proximo).map((a, i) => ({ palavra: a.palavra, alerta: a.alerta, indice: this.proximo + i }))
  }

  consumir(texto: string): Destaque[] {
    const todos = tokens(texto)
    // A última palavra pode estar pela metade ("ESCON" + "DER" chegam separados)
    const completo = /[\s.,!?;:…"')\]]$/.test(texto)
    const ts = completo ? todos : todos.slice(0, -1)
    const novos: Destaque[] = []

    // 1) Palavras da lista, na ordem; se o modelo pulou uma, aceita a seguinte
    let fimDoUltimo = this.lidos
    for (let i = this.lidos; i < ts.length; i++) {
      for (let olhar = 0; olhar < 2 && this.proximo + olhar < this.alvos.length; olhar++) {
        const alvo = this.alvos[this.proximo + olhar]
        if (i + alvo.tokens.length > ts.length) continue
        if (alvo.tokens.every((t, k) => bate(t, ts[i + k].t))) {
          novos.push({ palavra: alvo.palavra, alerta: alvo.alerta, indice: this.proximo + olhar })
          for (const t of alvo.tokens) this.usadas.add(t)
          this.proximo += olhar + 1
          i += alvo.tokens.length - 1
          fimDoUltimo = i + 1
          break
        }
      }
    }
    // Não passa do começo de uma expressão que ainda pode se completar ("nenhuma" + "prova")
    const maior = Math.max(1, ...this.alvos.slice(this.proximo, this.proximo + 2).map((a) => a.tokens.length))
    this.lidos = Math.max(fimDoUltimo, ts.length - (maior - 1))

    // 2) Sem lista, ou lista no fim: uma palavra forte por frase terminada
    // (a frase em que a lista terminou não ganha palavra automática)
    if (this.automatico && this.proximo >= this.alvos.length && !novos.length) {
      const frases = texto.split(/(?<=[.!?…])\s+/)
      const prontas = /[.!?…]\s*$/.test(texto) ? frases.length : frases.length - 1
      for (let f = this.frasesLidas; f < prontas; f++) {
        const frase = frases[f]
        const n = tokens(frase).length > 16 ? 2 : 1
        for (const p of escolherDestaques(frase, n, this.usadas)) {
          this.usadas.add(normalizar(p))
          novos.push({ palavra: exibir(p), alerta: ehAlerta(p), indice: -1 })
        }
      }
      this.frasesLidas = Math.max(this.frasesLidas, prontas)
    } else {
      // Enquanto a lista anda, as frases já ditas não entram no automático depois
      const frases = texto.split(/(?<=[.!?…])\s+/)
      const prontas = /[.!?…]\s*$/.test(texto) ? frases.length : frases.length - 1
      // Duas frases inteiras sem a palavra esperada: ela não vai dizer, segue para a próxima
      if (novos.length) this.frasesSemAchar = 0
      else this.frasesSemAchar += Math.max(0, prontas - this.frasesLidas)
      if (this.frasesSemAchar >= 2 && this.proximo < this.alvos.length) { this.proximo++; this.frasesSemAchar = 0 }
      this.frasesLidas = prontas
    }
    return novos
  }
}

/** O termo de uma imagem foi falado? ("Torre Eiffel" bate com "...a torre eiffel foi..."). */
export function termoFalado(termo: string, texto: string): boolean {
  const alvo = tokens(termo).map((t) => t.t).filter((t) => !PALAVRAS_VAZIAS.has(t) && t.length >= 3)
  if (!alvo.length) return false
  const ts = tokens(texto).map((t) => t.t)
  return alvo.some((a) => ts.some((t) => bate(a, t)))
}
