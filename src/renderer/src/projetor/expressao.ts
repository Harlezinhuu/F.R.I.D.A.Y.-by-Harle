// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Leitor seguro de fórmulas (z = f(x, y, t)) para as funções projetadas por voz.
// Nada de eval: a fórmula é lida símbolo por símbolo e vira uma função JavaScript fechada.
// Aceita nomes em português: sen, tg, raiz, ln.

export type Funcao = (x: number, y: number, t: number) => number

type No = (x: number, y: number, t: number) => number

const FUNCOES: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, sen: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  asin: Math.asin, arcsen: Math.asin, acos: Math.acos, arccos: Math.acos, atan: Math.atan, arctg: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, raiz: Math.sqrt, abs: Math.abs, exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sinal: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2
}
const CONSTANTES: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 }

interface Token { tipo: 'num' | 'nome' | 'op' | '(' | ')' | ','; valor: string }

function tokens(texto: string): Token[] {
  const out: Token[] = []
  const s = texto.toLowerCase().replace(/π/g, 'pi').replace(/×|·/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/³/g, '^3')
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      const v = s.slice(i, j)
      if (!/^\d*\.?\d+$|^\d+\.$/.test(v)) throw new Error(`Número estranho: ${v}`)
      out.push({ tipo: 'num', valor: v }); i = j; continue
    }
    if (/[a-z_]/.test(c)) {
      let j = i
      while (j < s.length && /[a-z0-9_]/.test(s[j])) j++
      out.push({ tipo: 'nome', valor: s.slice(i, j) }); i = j; continue
    }
    if ('+-*/^%'.includes(c)) { out.push({ tipo: 'op', valor: c }); i++; continue }
    if (c === '(' || c === ')' || c === ',') { out.push({ tipo: c, valor: c }); i++; continue }
    throw new Error(`Não entendi o símbolo "${c}".`)
  }
  return out
}

/** Lê a fórmula. Lança erro em português se ela não fizer sentido. */
export function lerFormula(texto: string): { f: Funcao; usaTempo: boolean } {
  const limpo = texto.trim().replace(/^z\s*=\s*/i, '')
  if (!limpo) throw new Error('A fórmula veio vazia.')
  if (limpo.length > 240) throw new Error('A fórmula é longa demais.')
  const ts = tokens(limpo)
  let i = 0
  let usaTempo = false
  const ver = () => ts[i]
  const pegar = () => ts[i++]
  const esperar = (tipo: Token['tipo']) => { const t = pegar(); if (!t || t.tipo !== tipo) throw new Error('A fórmula está com parênteses ou vírgulas fora do lugar.'); return t }

  // soma := produto (('+'|'-') produto)*
  function soma(): No {
    let a = produto()
    for (let t = ver(); t && t.tipo === 'op' && (t.valor === '+' || t.valor === '-'); t = ver()) {
      pegar()
      const b = produto(), esq = a
      a = t.valor === '+' ? (x, y, tt) => esq(x, y, tt) + b(x, y, tt) : (x, y, tt) => esq(x, y, tt) - b(x, y, tt)
    }
    return a
  }
  // produto := unario (('*'|'/'|'%' | implícito) unario)*
  function produto(): No {
    let a = unario()
    for (;;) {
      const t = ver()
      if (t && t.tipo === 'op' && (t.valor === '*' || t.valor === '/' || t.valor === '%')) {
        pegar()
        const b = unario(), esq = a
        a = t.valor === '*' ? (x, y, tt) => esq(x, y, tt) * b(x, y, tt) : t.valor === '/' ? (x, y, tt) => esq(x, y, tt) / b(x, y, tt) : (x, y, tt) => esq(x, y, tt) % b(x, y, tt)
      } else if (t && (t.tipo === 'nome' || t.tipo === '(' || t.tipo === 'num')) {
        // Multiplicação implícita: 2x, 3(x+1), x y
        const b = unario(), esq = a
        a = (x, y, tt) => esq(x, y, tt) * b(x, y, tt)
      } else return a
    }
  }
  // unario := ('-'|'+') unario | potencia
  function unario(): No {
    const t = ver()
    if (t && t.tipo === 'op' && (t.valor === '-' || t.valor === '+')) {
      pegar()
      const a = unario()
      return t.valor === '-' ? (x, y, tt) => -a(x, y, tt) : a
    }
    return potencia()
  }
  // potencia := atomo ('^' unario)?   (associa à direita: 2^3^2 = 2^9)
  function potencia(): No {
    const base = atomo()
    const t = ver()
    if (t && t.tipo === 'op' && t.valor === '^') {
      pegar()
      const exp = unario()
      return (x, y, tt) => Math.pow(base(x, y, tt), exp(x, y, tt))
    }
    return base
  }
  function atomo(): No {
    const t = pegar()
    if (!t) throw new Error('A fórmula terminou no meio.')
    if (t.tipo === 'num') { const v = Number(t.valor); return () => v }
    if (t.tipo === '(') { const a = soma(); esperar(')'); return a }
    if (t.tipo === 'nome') {
      if (t.valor === 'x') return (x) => x
      if (t.valor === 'y') return (_x, y) => y
      if (t.valor === 't') { usaTempo = true; return (_x, _y, tt) => tt }
      if (Object.hasOwn(CONSTANTES, t.valor)) { const v = CONSTANTES[t.valor]; return () => v }
      const fn = Object.hasOwn(FUNCOES, t.valor) ? FUNCOES[t.valor] : undefined
      if (fn) {
        // Aceita "sen x" sem parênteses
        if (ver()?.tipo !== '(') { const a = potencia(); return (x, y, tt) => fn(a(x, y, tt)) }
        pegar()
        const args: No[] = [soma()]
        while (ver()?.tipo === ',') { pegar(); args.push(soma()) }
        esperar(')')
        if (args.length === 1) { const a = args[0]; return (x, y, tt) => fn(a(x, y, tt)) }
        return (x, y, tt) => fn(...args.map((a) => a(x, y, tt)))
      }
      throw new Error(`Não conheço "${t.valor}". Use x, y, t, pi e funções como sen, cos, raiz, exp.`)
    }
    throw new Error('A fórmula está com um operador fora do lugar.')
  }

  const raiz = soma()
  if (i < ts.length) throw new Error('Sobrou um pedaço da fórmula que não entendi.')
  // Pontos onde a fórmula não existe (divisão por zero, raiz negativa) ficam no zero
  const f: Funcao = (x, y, t) => { const v = raiz(x, y, t); return Number.isFinite(v) ? v : 0 }
  return { f, usaTempo }
}
