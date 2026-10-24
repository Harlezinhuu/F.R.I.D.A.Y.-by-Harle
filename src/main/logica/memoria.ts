// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Regras da memória: o que pode ser guardado, como evitar repetidos e como entra no prompt.
// Senhas, PINs, chaves, documentos e números de cartão ou conta nunca são guardados.

export type Categoria = 'gosto' | 'pessoa' | 'projeto' | 'preferencia' | 'rotina' | 'outro'
export const CATEGORIAS: Categoria[] = ['gosto', 'pessoa', 'projeto', 'preferencia', 'rotina', 'outro']

export interface Fato {
  id: string
  texto: string
  categoria: Categoria
  criadoEm: string
}

export const MAX_FATOS = 300
const MAX_TEXTO = 200

const PALAVRAS_PROIBIDAS = /\b(senha|password|pin|cpf|rg|cnh|passaporte|cart[aã]o de cr[eé]dito|cvv|c[oó]digo de seguran[cç]a|token|api[ _-]?key|chave d[ae] api|chave pix|conta banc[aá]ria|ag[eê]ncia)\b/i
const SEGREDOS = /(AIza[0-9A-Za-z_-]{10,}|AQ\.[0-9A-Za-z_.-]{10,}|sk-[0-9A-Za-z_-]{10,}|ghp_[0-9A-Za-z]{10,}|\d[\d .-]{7,}\d)/

export const normalizar = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export type Checagem = { ok: true; texto: string } | { ok: false; motivo: string }

export function checarFato(entrada: unknown): Checagem {
  const texto = typeof entrada === 'string' ? entrada.replace(/\s+/g, ' ').trim() : ''
  if (texto.length < 3) return { ok: false, motivo: 'Fato vazio.' }
  if (texto.length > MAX_TEXTO) return { ok: false, motivo: 'Fato longo demais; resuma em uma frase.' }
  if (PALAVRAS_PROIBIDAS.test(texto) || SEGREDOS.test(texto)) {
    return { ok: false, motivo: 'Por segurança, não guardo senhas, PINs, chaves, documentos nem números de cartão ou conta.' }
  }
  return { ok: true, texto }
}

/** Já existe um fato igual ou que contém este? */
export function ehRepetido(novo: string, existentes: Fato[]): Fato | null {
  const n = normalizar(novo)
  return existentes.find((f) => { const e = normalizar(f.texto); return e === n || (n.length > 12 && e.includes(n)) }) ?? null
}

/** Fatos que batem com um trecho ("esquece o que eu disse sobre café"). */
export function encontrarPorTrecho(trecho: string, fatos: Fato[]): Fato[] {
  const t = normalizar(trecho)
  if (!t) return []
  const palavras = t.split(' ').filter((p) => p.length > 2)
  return fatos.filter((f) => {
    const e = normalizar(f.texto)
    return e.includes(t) || (palavras.length > 0 && palavras.every((p) => e.includes(p)))
  })
}

/** Bloco que vai no começo de cada conversa, do mais novo para o mais antigo, com limite de tamanho. */
export function paraPrompt(fatos: Fato[], limite = 3000): string {
  const linhas: string[] = []
  let total = 0
  for (const f of [...fatos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))) {
    const l = `- (${f.categoria}) ${f.texto}`
    if (total + l.length > limite) break
    linhas.push(l)
    total += l.length + 1
  }
  return linhas.join('\n')
}
