// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Regras das tarefas de programação: projetos permitidos, nome da branch e o que o Claude Code pode fazer.

export interface Projeto {
  nome: string
  pasta: string
  /** Comandos de terminal liberados (prefixos), ex.: ["npm test", "npm run build"] */
  comandos: string[]
}

/** O motor só lê e edita arquivos. Terminal, só os comandos que você liberou no projeto. */
export const LER_EDITAR = ['Read', 'Edit', 'MultiEdit', 'Write', 'Glob', 'Grep', 'LS', 'TodoWrite', 'NotebookEdit']
export const NUNCA = ['WebFetch', 'WebSearch']

const NOME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u
// Prefixo de comando: texto simples, sem nada que transforme em outro comando (; | & > ` $ etc.)
const COMANDO = /^[\p{L}\p{N}_][\p{L}\p{N}_ .:/=+@-]{0,79}$/u

export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

export function slug(texto: string, palavras = 5): string {
  return normalizar(texto).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean).slice(0, palavras).join('-').slice(0, 40) || 'tarefa'
}

export function nomeBranch(id: number, pedido: string): string {
  return `friday/tarefa-${id}-${slug(pedido)}`
}

export type ValidacaoProjetos = { projetos: Projeto[]; avisos: string[] }

/** Lê o projetos.json sem confiar nele: projetos inválidos são ignorados com um aviso. */
export function validarProjetos(bruto: unknown): ValidacaoProjetos {
  const avisos: string[] = []
  const projetos: Projeto[] = []
  if (!Array.isArray(bruto)) return { projetos, avisos: ['projetos.json precisa ser uma lista.'] }
  for (const [i, item] of bruto.entries()) {
    const p = item as Record<string, unknown>
    const nome = typeof p?.nome === 'string' ? p.nome.trim() : ''
    const pasta = typeof p?.pasta === 'string' ? p.pasta.trim() : ''
    if (!NOME.test(nome)) { avisos.push(`Projeto ${i + 1}: nome inválido.`); continue }
    if (!pasta) { avisos.push(`Projeto ${nome}: falta a pasta.`); continue }
    if (projetos.some((x) => normalizar(x.nome) === normalizar(nome))) { avisos.push(`Projeto ${nome} repetido.`); continue }
    const comandos = Array.isArray(p.comandos) ? p.comandos.filter((c): c is string => typeof c === 'string').map((c) => c.trim()) : []
    const ruins = comandos.filter((c) => !COMANDO.test(c))
    if (ruins.length) avisos.push(`Projeto ${nome}: comandos ignorados por segurança: ${ruins.join(', ')}.`)
    projetos.push({ nome, pasta, comandos: comandos.filter((c) => COMANDO.test(c)) })
  }
  return { projetos, avisos }
}

export function encontrarProjeto(nome: string, projetos: Projeto[]): Projeto | null {
  const alvo = normalizar(nome)
  if (!alvo) return null
  return projetos.find((p) => normalizar(p.nome) === alvo) ?? projetos.find((p) => normalizar(p.nome).includes(alvo) || alvo.includes(normalizar(p.nome))) ?? null
}

/** Argumentos do Claude Code em modo não interativo. O pedido vai pela entrada padrão, nunca pela linha de comando. */
export function argumentosMotor(projeto: Projeto, modelo = ''): string[] {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', ...LER_EDITAR, ...projeto.comandos.map((c) => `Bash(${c}:*)`),
    '--disallowedTools', ...NUNCA, ...(projeto.comandos.length ? [] : ['Bash'])
  ]
  if (modelo) args.push('--model', modelo)
  return args
}

export function instrucao(projeto: Projeto, branch: string, pedido: string): string {
  const comandos = projeto.comandos.length
    ? `- Você pode rodar só estes comandos: ${projeto.comandos.join(', ')}.`
    : '- Você não pode rodar comandos no terminal; só ler e editar arquivos.'
  return [
    'Você é o programador da F.R.I.D.A.Y, trabalhando sozinho numa tarefa que o dono pediu por voz.',
    '',
    `Projeto: ${projeto.nome}`,
    `Você está numa cópia isolada do projeto (git worktree), na branch ${branch}. Trabalhe só aqui dentro.`,
    '',
    'Tarefa do dono:',
    pedido,
    '',
    'Regras:',
    '- Faça a tarefa por completo, seguindo o estilo do código que já existe.',
    '- Não faça push, merge nem mude de branch. O dono revisa depois.',
    '- Não use a rede.',
    comandos,
    '- Termine com um resumo curto, em português, do que mudou e de como o dono pode conferir. Esse resumo será falado em voz alta: escreva em frases simples, sem markdown.'
  ].join('\n')
}
