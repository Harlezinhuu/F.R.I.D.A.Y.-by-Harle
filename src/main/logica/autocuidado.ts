// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Autocuidado: ela confere a própria saúde (chave, modelos do Gemini, versão nova, backup, disco,
// erros que se repetem) e, quando o Google tira um modelo do ar, escolhe o substituto.
// Só regras (sem rede, sem disco), para testar.

export interface ModeloListado { name?: string; supportedActions?: string[] }

const versao = (s: string): number[] => s.split('.').map((n) => Number(n) || 0)
const maior = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  return 0
}

/**
 * O substituto mais novo e estável: "gemini-X-flash" para texto e "gemini-X-live" para voz
 * (nada de preview, experimental, lite ou com data no nome).
 */
export function escolherModelo(lista: ModeloListado[], tipo: 'texto' | 'voz', evitar = ''): string | null {
  const re = tipo === 'texto' ? /^(?:models\/)?gemini-(\d+(?:\.\d+)*)-flash$/ : /^(?:models\/)?gemini-(\d+(?:\.\d+)*)-live$/
  const acao = tipo === 'texto' ? 'generateContent' : 'bidiGenerateContent'
  let melhor: { nome: string; v: number[] } | null = null
  for (const m of lista) {
    const nome = (m.name ?? '').trim()
    const r = nome.match(re)
    if (!r) continue
    if (m.supportedActions?.length && !m.supportedActions.includes(acao)) continue
    const curto = nome.replace(/^models\//, '')
    if (curto === evitar) continue
    const v = versao(r[1])
    if (!melhor || maior(v, melhor.v) > 0) melhor = { nome: curto, v }
  }
  return melhor?.nome ?? null
}

/** O erro do Google quer dizer "esse modelo não existe mais (para você)"? */
export const modeloSumiu = (mensagem: string): boolean =>
  /\b404\b|not found|no longer available|is not supported|deprecated|has been (shut ?down|retired)/i.test(mensagem)

// ---------- Erros que se repetem no friday.log ----------

/** Tira o que muda de uma vez para outra (horário, números, caminhos, ids) para juntar erros iguais. */
export function normalizarErro(linha: string): string {
  return linha
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '')
    .replace(/[A-Z]:\\[^\s'"]+|\/(?:home|tmp|Users|mnt)\/[^\s'"]+/g, '<caminho>')
    .replace(/https?:\/\/\S+/g, '<link>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

const RUIDO = /mic pico|NotFoundError: Requested device|dbus|GPU stall|ssl_client|OpenSky|desligando o servidor/i

/** Erros das últimas 24 h que apareceram pelo menos `minimo` vezes, do mais frequente para o menos. */
export function errosRepetidos(log: string, agora: number, minimo = 3): { erro: string; vezes: number; exemplo: string }[] {
  const contagem = new Map<string, { vezes: number; exemplo: string }>()
  for (const linha of log.split(/\r?\n/)) {
    const t = Date.parse(linha.slice(0, 24))
    if (!Number.isFinite(t) || agora - t > 86_400_000) continue
    if (!/\[error\]|\berro\b|falhou|exception|TypeError|ReferenceError|não consegui/i.test(linha) || RUIDO.test(linha)) continue
    const chave = normalizarErro(linha)
    const c = contagem.get(chave) ?? { vezes: 0, exemplo: linha.slice(25, 400) }
    c.vezes++
    contagem.set(chave, c)
  }
  return [...contagem].filter(([, c]) => c.vezes >= minimo).sort((a, b) => b[1].vezes - a[1].vezes).map(([erro, c]) => ({ erro, ...c }))
}

// ---------- O relatório da saúde ----------

export interface ItemSaude { nome: string; ok: boolean; detalhe: string; grave?: boolean }

export function resumoDaSaude(itens: ItemSaude[]): string {
  const ruins = itens.filter((i) => !i.ok)
  if (!ruins.length) return `Está tudo certo comigo: ${itens.map((i) => i.nome.toLowerCase()).join(', ')}.`
  return `${ruins.length === 1 ? 'Uma coisa precisa' : `${ruins.length} coisas precisam`} de atenção: ${ruins.map((i) => `${i.nome}: ${i.detalhe}`).join('; ')}.`
}

/** "abc123 Corrige X" (git log --format="%h %s") → lista de melhorias. */
export const melhoriasDoLog = (saida: string): string[] =>
  saida.split(/\r?\n/).map((l) => l.trim().replace(/^[0-9a-f]{6,40}\s+/, '')).filter((l) => l && !/^Merge |^Traz /.test(l))
