// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Seus projetos no GitHub: o que mudou (build que quebrou ou voltou, issue nova, estrela) e dicas
// para o portfólio ficar mais forte para recrutador. Só regras (sem rede), para testar.

export interface Repo {
  nome: string
  completo: string
  descricao: string
  estrelas: number
  /** Issues + pull requests abertos (o GitHub conta junto) */
  abertos: number
  fork: boolean
  arquivado: boolean
  privado: boolean
  linguagem: string
  topicos: string[]
  licenca: boolean
  site: string
  ramo: string
  mexidoEm: string
}

interface RepoGithub {
  name?: string; full_name?: string; description?: string | null; stargazers_count?: number; open_issues_count?: number; fork?: boolean; archived?: boolean
  private?: boolean; language?: string | null; topics?: string[]; license?: unknown; homepage?: string | null; default_branch?: string; pushed_at?: string
}

export function lerRepos(lista: RepoGithub[]): Repo[] {
  return lista.filter((r) => r.name && r.full_name).map((r) => ({
    nome: r.name!, completo: r.full_name!, descricao: (r.description ?? '').trim(), estrelas: r.stargazers_count ?? 0, abertos: r.open_issues_count ?? 0,
    fork: !!r.fork, arquivado: !!r.archived, privado: !!r.private, linguagem: r.language ?? '', topicos: r.topics ?? [], licenca: !!r.license,
    site: (r.homepage ?? '').trim(), ramo: r.default_branch ?? 'main', mexidoEm: r.pushed_at ?? ''
  }))
}

/** Os que contam no portfólio: seus, públicos, não arquivados. */
export const doPortfolio = (rs: Repo[]): Repo[] => rs.filter((r) => !r.fork && !r.arquivado && !r.privado)

export type EstadoCi = 'ok' | 'falhou' | 'rodando' | ''

export interface Retrato { estrelas: number; abertos: number; ci: EstadoCi }

export interface Novidade { repo: string; tipo: 'quebrou' | 'voltou' | 'estrela' | 'aberto'; texto: string; serio: boolean }

/** O que mudou desde o último retrato. */
export function novidades(antes: Record<string, Retrato>, agora: Record<string, Retrato>): Novidade[] {
  const out: Novidade[] = []
  for (const [nome, a] of Object.entries(agora)) {
    const b = antes[nome]
    if (!b) continue // repositório novo na lista: sem comparação ainda
    if (a.ci === 'falhou' && b.ci !== 'falhou') out.push({ repo: nome, tipo: 'quebrou', texto: `O build do ${nome} falhou.`, serio: false })
    if (a.ci === 'ok' && b.ci === 'falhou') out.push({ repo: nome, tipo: 'voltou', texto: `O build do ${nome} voltou a passar.`, serio: false })
    if (a.estrelas > b.estrelas) out.push({ repo: nome, tipo: 'estrela', texto: `${nome} ganhou ${a.estrelas - b.estrelas} ${a.estrelas - b.estrelas === 1 ? 'estrela' : 'estrelas'}.`, serio: false })
    if (a.abertos > b.abertos) out.push({ repo: nome, tipo: 'aberto', texto: `Abriram ${a.abertos - b.abertos === 1 ? 'uma issue ou pull request nova' : `${a.abertos - b.abertos} issues ou pull requests novas`} no ${nome}.`, serio: false })
  }
  return out
}

export function lerCi(r: { workflow_runs?: { status?: string; conclusion?: string | null }[] }): EstadoCi {
  const u = r.workflow_runs?.[0]
  if (!u) return ''
  if (u.status !== 'completed') return 'rodando'
  return u.conclusion === 'success' || u.conclusion === 'skipped' || u.conclusion === 'neutral' ? 'ok' : u.conclusion === 'cancelled' ? '' : 'falhou'
}

/**
 * Dicas para o portfólio, das mais importantes para as menos: README (o que o recrutador lê
 * primeiro), descrição, tópicos, licença e link de demonstração. Os projetos mais recentes primeiro.
 */
export function dicasDoPortfolio(rs: Repo[], semReadme: Set<string>, limite = 8): string[] {
  const ordem = doPortfolio(rs).sort((a, b) => (a.mexidoEm < b.mexidoEm ? 1 : -1))
  const dicas: { peso: number; texto: string }[] = []
  for (const [i, r] of ordem.entries()) {
    const recente = i < 6 ? 2 : 0
    if (semReadme.has(r.nome)) dicas.push({ peso: 10 + recente, texto: `${r.nome}: falta um README (o que é, print ou GIF, como rodar e o que você aprendeu).` })
    if (!r.descricao) dicas.push({ peso: 8 + recente, texto: `${r.nome}: falta a descrição de uma linha (aparece na lista e na busca).` })
    if (!r.topicos.length) dicas.push({ peso: 5 + recente, texto: `${r.nome}: sem tópicos (ponha a linguagem e o tipo do projeto, como ${r.linguagem ? r.linguagem.toLowerCase() : 'typescript'}, electron, discord-bot).` })
    if (!r.site && /javascript|typescript|html|css|vue|svelte/i.test(r.linguagem)) dicas.push({ peso: 4 + recente, texto: `${r.nome}: se dá para ver funcionando, coloque o link da demonstração em "Website".` })
    if (!r.licenca) dicas.push({ peso: 2 + recente, texto: `${r.nome}: sem licença (mostra que você sabe como o código pode ser usado).` })
  }
  const geral: string[] = []
  const publicos = doPortfolio(rs)
  if (publicos.length > 6) geral.push('No seu perfil, fixe os 4 a 6 melhores projetos (Customize your pins): é o que o recrutador vê primeiro.')
  return [...geral, ...dicas.sort((a, b) => b.peso - a.peso).map((d) => d.texto)].slice(0, limite)
}

export function resumoDosRepos(rs: Repo[], cis: Record<string, EstadoCi>): string {
  const p = doPortfolio(rs)
  const quebrados = Object.entries(cis).filter(([, c]) => c === 'falhou').map(([n]) => n)
  const estrelas = p.reduce((s, r) => s + r.estrelas, 0)
  const abertos = p.filter((r) => r.abertos > 0)
  return `${p.length} ${p.length === 1 ? 'projeto público' : 'projetos públicos'}, ${estrelas} ${estrelas === 1 ? 'estrela' : 'estrelas'} no total.` +
    (quebrados.length ? ` Build quebrado em: ${quebrados.join(', ')}.` : ' Nenhum build quebrado.') +
    (abertos.length ? ` Com issue ou pull request aberto: ${abertos.map((r) => `${r.nome} (${r.abertos})`).join(', ')}.` : '')
}

/** Dono do repositório pela URL do git ("https://github.com/Harlezinhuu/x.git" → "Harlezinhuu"). */
export const donoDaUrl = (url: string): string => url.match(/github\.com[/:]([^/]+)\//i)?.[1] ?? ''
