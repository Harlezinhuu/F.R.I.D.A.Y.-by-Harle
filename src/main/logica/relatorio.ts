// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Relatório da semana: as partes (programação, agenda, GitHub, saúde dela e o que os outros
// módulos registrarem) viram um texto para ler e um resumo curto para falar.
// Só regras, para testar.

export interface Secao { titulo: string; linhas: string[]; resumo: string }

/** A semana que o relatório cobre: de segunda 0h até agora. */
export function semanaDe(agora: Date): { de: Date; ate: Date; chave: string } {
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const desdeSegunda = (d.getDay() + 6) % 7
  const de = new Date(d.getTime() - desdeSegunda * 86_400_000)
  const chave = `${de.getFullYear()}-${String(de.getMonth() + 1).padStart(2, '0')}-${String(de.getDate()).padStart(2, '0')}`
  return { de, ate: agora, chave }
}

/** Domingo a partir das 19h, ou segunda até meio-dia se o PC estava desligado no domingo. */
export function horaDoRelatorio(agora: Date, ultimaChave: string): boolean {
  const dom = agora.getDay() === 0 && agora.getHours() >= 19
  const seg = agora.getDay() === 1 && agora.getHours() < 12
  if (!dom && !seg) return false
  // Na segunda, a semana que acabou é a anterior
  const ref = seg ? new Date(agora.getTime() - 86_400_000) : agora
  return semanaDe(ref).chave !== ultimaChave
}

/** Commits por projeto ("abc Faz X" por linha) → linhas e resumo. */
export function secaoProgramacao(porProjeto: { projeto: string; commits: string[] }[], tarefas: { pedido: string; estado: string }[]): Secao {
  const ativos = porProjeto.filter((p) => p.commits.length).sort((a, b) => b.commits.length - a.commits.length)
  const total = ativos.reduce((s, p) => s + p.commits.length, 0)
  const prontas = tarefas.filter((t) => t.estado === 'pronta')
  const linhas = ativos.map((p) => `${p.projeto}: ${p.commits.length} ${p.commits.length === 1 ? 'mudança' : 'mudanças'} (${p.commits.slice(0, 3).join('; ')})`)
  if (prontas.length) linhas.push(`Tarefas do Claude Code prontas: ${prontas.map((t) => t.pedido.slice(0, 60)).join('; ')}`)
  return {
    titulo: 'Programação',
    linhas,
    resumo: total ? `Você fez ${total} ${total === 1 ? 'mudança' : 'mudanças'} em ${ativos.length} ${ativos.length === 1 ? 'projeto' : 'projetos'}, mais no ${ativos[0].projeto}` : 'Nenhuma mudança de código esta semana'
  }
}

export function emMarkdown(titulo: string, secoes: Secao[]): string {
  return [`# ${titulo}`, '', ...secoes.flatMap((s) => [`## ${s.titulo}`, '', s.resumo ? `**${s.resumo}.**` : '', '', ...s.linhas.map((l) => `- ${l}`), ''])].join('\n').replace(/\n{3,}/g, '\n\n')
}

/** O resumo falado: uma frase de cada parte, no máximo 6. */
export const resumoFalado = (secoes: Secao[]): string =>
  `Resumo da semana: ${secoes.filter((s) => s.resumo).slice(0, 6).map((s) => s.resumo).join('. ')}.`.replace(/\.\./g, '.')
