// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// "O código vira prédio" na mesa holográfica: cada projeto vira uma maquete. As pastas são os andares
// (o térreo são os arquivos da raiz), os arquivos são as salas, do tamanho do código que têm.
// Sala com teste falhando acende vermelho; sala mexida e ainda não enviada para o GitHub, âmbar.

import type { Andar, EstadoSala, Predio, Sala } from '../../shared/mesa'
export type { Andar, EstadoSala, Predio, Sala }

/** Pastas que não são código do projeto (dependências, saída do build, cache). */
export const PASTAS_FORA = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'release', '.next', '.nuxt', 'coverage', '__pycache__', '.venv', 'venv', 'env', 'target', 'bin', 'obj', '.idea', '.vscode', '.gradle', 'vendor', '.cache', '.turbo', '.parcel-cache', 'android', 'ios'])

/** Arquivos de código e texto que entram na maquete. */
export const EXTENSOES_CODIGO = /\.(?:[cm]?[jt]sx?|py|java|kt|cs|go|rs|rb|php|swift|dart|c|h|cpp|hpp|cc|vue|svelte|html|css|scss|sass|less|json|ya?ml|toml|md|sql|sh|ps1|bat|lua|gd|glsl|wgsl|xml)$/i

const pior = (a: EstadoSala, b: EstadoSala): EstadoSala => (a === 'falha' || b === 'falha' ? 'falha' : a === 'mudado' || b === 'mudado' ? 'mudado' : 'ok')

const norm = (c: string): string => c.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()

/** O arquivo (relativo ao projeto) bate com um caminho de falha, que pode vir absoluto ou relativo? */
function bate(caminho: string, lista: string[]): boolean {
  const c = norm(caminho)
  return lista.some((x) => { const n = norm(x); return n === c || n.endsWith(`/${c}`) || c.endsWith(`/${n}`) })
}

/** Agrupa por pasta. Se uma pasta tem quase tudo (o "src"), abre as subpastas dela em andares. */
function agrupar(arquivos: { caminho: string; linhas: number }[], nivel: number, prefixo: string): Map<string, { caminho: string; linhas: number }[]> {
  const grupos = new Map<string, { caminho: string; linhas: number }[]>()
  for (const a of arquivos) {
    const partes = a.caminho.split('/')
    const chave = partes.length > nivel + 1 ? `${prefixo}${partes[nivel]}` : `${prefixo}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), a])
  }
  return grupos
}

export function montarPredio(projeto: string, arquivos: { caminho: string; linhas: number }[], falhas: string[], mudados: string[], maxAndares = 12, maxSalas = 18): Predio {
  const lista = arquivos.map((a) => ({ caminho: a.caminho.replace(/\\/g, '/').replace(/^\.\//, ''), linhas: Math.max(0, Math.round(a.linhas)) })).filter((a) => a.caminho)
  // Raiz → pastas de primeiro nível; uma pasta com quase metade de tudo (o "src") é aberta em subpastas (até 2 vezes)
  let grupos = agrupar(lista, 0, '')
  for (let rodada = 0; rodada < 2; rodada++) {
    const total = lista.length
    const grande = [...grupos.entries()].find(([k, v]) => k && v.length > total * 0.45 && v.some((a) => a.caminho.split('/').length > k.split('/').length + 1))
    if (!grande) break
    const [chave, dentro] = grande
    grupos.delete(chave)
    for (const [k, v] of agrupar(dentro, chave.split('/').length, `${chave}/`)) grupos.set(k.endsWith('/') ? k.slice(0, -1) : k, [...(grupos.get(k) ?? []), ...v])
  }
  let andares: Andar[] = [...grupos.entries()].map(([chave, fs]) => {
    const salas = fs
      .map((f): Sala => ({ nome: f.caminho.split('/').pop() ?? f.caminho, caminho: f.caminho, linhas: f.linhas, estado: bate(f.caminho, falhas) ? 'falha' : bate(f.caminho, mudados) ? 'mudado' : 'ok' }))
      .sort((a, b) => Number(b.estado !== 'ok') - Number(a.estado !== 'ok') || b.linhas - a.linhas)
    return {
      nome: chave ? (chave.split('/').pop() ?? chave).toUpperCase() : 'TÉRREO',
      caminho: chave,
      linhas: fs.reduce((s, f) => s + f.linhas, 0),
      arquivos: fs.length,
      salas: salas.slice(0, maxSalas),
      estado: salas.reduce<EstadoSala>((e, s) => pior(e, s.estado), 'ok')
    }
  })
  // Térreo embaixo; os andares maiores mais para baixo (o prédio afina para cima)
  andares.sort((a, b) => Number(b.caminho === '') - Number(a.caminho === '') || b.linhas - a.linhas)
  if (andares.length > maxAndares) {
    const ficam = andares.slice(0, maxAndares - 1), resto = andares.slice(maxAndares - 1)
    const salas = resto.flatMap((a) => a.salas).sort((a, b) => b.linhas - a.linhas)
    ficam.push({ nome: 'OUTROS', caminho: '*', linhas: resto.reduce((s, a) => s + a.linhas, 0), arquivos: resto.reduce((s, a) => s + a.arquivos, 0), salas: salas.slice(0, maxSalas), estado: resto.reduce<EstadoSala>((e, a) => pior(e, a.estado), 'ok') })
    andares = ficam
  }
  // Nomes repetidos (src/ui e lib/ui): mostra a pasta de cima
  const vistos = new Map<string, number>()
  for (const a of andares) vistos.set(a.nome, (vistos.get(a.nome) ?? 0) + 1)
  for (const a of andares) if ((vistos.get(a.nome) ?? 0) > 1 && a.caminho.includes('/')) a.nome = a.caminho.split('/').slice(-2).join('/').toUpperCase()
  const todas = lista.map((f) => f.caminho)
  return {
    projeto,
    andares,
    arquivos: lista.length,
    linhas: lista.reduce((s, f) => s + f.linhas, 0),
    falhas: todas.filter((c) => bate(c, falhas)).length,
    mudados: todas.filter((c) => !bate(c, falhas) && bate(c, mudados)).length
  }
}

/** Arquivos mudados no "git status --porcelain" (inclui os novos; tira os apagados). */
export function lerGitStatus(saida: string): string[] {
  const out: string[] = []
  for (const linha of saida.split(/\r?\n/)) {
    if (linha.length < 4) continue
    const x = linha.slice(0, 2)
    if (x.includes('D')) continue
    let c = linha.slice(3)
    if (c.includes(' -> ')) c = c.split(' -> ').pop()!
    out.push(c.replace(/^"|"$/g, ''))
  }
  return out
}

/** Frase curta do prédio, para ela falar. */
export function descreverPredio(p: Predio): string {
  const partes = [`O ${p.projeto} tem ${p.andares.length} andares, ${p.arquivos} arquivos e umas ${p.linhas.toLocaleString('pt-BR')} linhas.`]
  const maior = [...p.andares].sort((a, b) => b.linhas - a.linhas)[0]
  if (maior) partes.push(`O maior andar é ${maior.nome.toLowerCase()}.`)
  if (p.falhas) partes.push(`${p.falhas} ${p.falhas === 1 ? 'sala está' : 'salas estão'} em vermelho: teste falhando em ${p.andares.filter((a) => a.estado === 'falha').map((a) => a.nome.toLowerCase()).join(', ')}.`)
  if (p.mudados) partes.push(`${p.mudados} ${p.mudados === 1 ? 'arquivo mexido ainda não foi' : 'arquivos mexidos ainda não foram'} para o GitHub (em âmbar).`)
  if (!p.falhas && !p.mudados) partes.push('Tudo limpo: nada falhando e nada pendente.')
  return partes.join(' ')
}
