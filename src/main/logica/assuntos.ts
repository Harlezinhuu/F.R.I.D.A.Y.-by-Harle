// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Vigiar um assunto ("me avisa se sair notícia do GTA 6"): ela pergunta de tempos em tempos e só
// avisa manchete nova. Aqui fica a parte testável: ler as manchetes e saber o que já foi visto.

export interface Manchete { data: string; texto: string }

/** Lê linhas "AAAA-MM-DD | manchete" (ou "- manchete") da resposta da busca. */
export function lerManchetes(texto: string): Manchete[] {
  const out: Manchete[] = []
  for (const bruta of texto.split('\n')) {
    const linha = bruta.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim()
    if (!linha || /^nenhuma|^não (há|encontrei)|^sem novidade/i.test(linha)) continue
    const m = linha.match(/^(\d{4}-\d{2}-\d{2})\s*[|:–-]\s*(.+)$/)
    const t = (m ? m[2] : linha).trim()
    if (t.length < 12 || t.length > 300) continue
    out.push({ data: m ? m[1] : '', texto: t })
  }
  return out.slice(0, 8)
}

const PARADAS = new Set('a o as os de da do das dos e em no na nos nas um uma para por com que se sobre ao à é foi vai ser seu sua mais'.split(' '))

/** Palavras que identificam a notícia (sem acento, sem as palavrinhas). */
export function assinatura(t: string): string[] {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length > 2 && !PARADAS.has(p))
}

/** É a mesma notícia contada com outras palavras? (metade das palavras em comum) */
export function mesmaNoticia(a: string, b: string): boolean {
  const x = new Set(assinatura(a)), y = new Set(assinatura(b))
  if (!x.size || !y.size) return false
  let comuns = 0
  for (const p of x) if (y.has(p)) comuns++
  return comuns / Math.min(x.size, y.size) >= 0.5
}

/** As manchetes que ainda não foram vistas. */
export function novas(manchetes: Manchete[], vistas: string[]): Manchete[] {
  const out: Manchete[] = []
  for (const m of manchetes) if (!vistas.some((v) => mesmaNoticia(v, m.texto)) && !out.some((o) => mesmaNoticia(o.texto, m.texto))) out.push(m)
  return out
}

/** Pergunta para a busca. */
export const perguntaDoAssunto = (tema: string): string =>
  `Quais são as notícias mais recentes (dos últimos 3 dias) sobre: ${tema}? Liste de 1 a 5, uma por linha, no formato "AAAA-MM-DD | manchete curta e factual". Se não houver nada novo nesses dias, responda só "nenhuma".`
