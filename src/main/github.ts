// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Vigia dos seus projetos no GitHub: a cada 6 horas olha os repositórios e avisa quando um build
// quebra (ou volta) e quando alguém abre issue ou pull request. Estrelas vão para o relatório da
// semana. Sem token, vê só os públicos; com GITHUB_TOKEN (só leitura) vê os privados também.
// Ela só lê: nunca comenta, fecha nem mexe em nada no GitHub.

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { variavel } from './config'
import { dicasDoPortfolio, donoDaUrl, lerCi, lerRepos, novidades, resumoDosRepos, type EstadoCi, type Novidade, type Repo, type Retrato } from './logica/github'

let avisar: (texto: string, serio: boolean) => void = () => {}
let log: (t: string) => void = () => {}

interface Estado { usuario: string; retratos: Record<string, Retrato>; semana: Novidade[]; quando: string }
const arquivo = (): string => join(app.getPath('userData'), 'github.json')
function ler(): Estado {
  try { return { usuario: '', retratos: {}, semana: [], quando: '', ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch { return { usuario: '', retratos: {}, semana: [], quando: '' } }
}
const salvar = (e: Estado): void => { try { writeFileSync(arquivo(), JSON.stringify({ ...e, semana: e.semana.slice(-100) }, null, 2)) } catch { /* sem disco */ } }

/** Quem é ele no GitHub: GITHUB_USUARIO, ou o dono do repositório da própria FRIDAY. */
async function usuario(): Promise<string> {
  const u = variavel('GITHUB_USUARIO').trim()
  if (u) return u
  const e = ler()
  if (e.usuario) return e.usuario
  const url = await new Promise<string>((ok) => execFile('git', ['remote', 'get-url', 'origin'], { cwd: app.getAppPath(), windowsHide: true, timeout: 10_000 }, (err, s) => ok(err ? '' : s.toString().trim())))
  return donoDaUrl(url)
}

async function api<T>(caminho: string): Promise<T | null> {
  const token = variavel('GITHUB_TOKEN').trim()
  const r = await fetch(`https://api.github.com${caminho}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FRIDAY-by-Harle', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(20_000)
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'o GitHub pediu para esperar (limite de consultas)' : `o GitHub respondeu ${r.status}`)
  return (await r.json()) as T
}

export async function meusRepos(): Promise<Repo[]> {
  const u = await usuario()
  if (!u) throw new Error('Não sei o seu usuário do GitHub: coloque GITHUB_USUARIO no .env.')
  const comToken = !!variavel('GITHUB_TOKEN').trim()
  const lista = await api<Parameters<typeof lerRepos>[0]>(comToken ? '/user/repos?per_page=100&sort=pushed&affiliation=owner' : `/users/${encodeURIComponent(u)}/repos?per_page=100&sort=pushed&type=owner`)
  return lerRepos(lista ?? [])
}

async function ciDe(r: Repo): Promise<EstadoCi> {
  const runs = await api<Parameters<typeof lerCi>[0]>(`/repos/${r.completo}/actions/runs?per_page=1&branch=${encodeURIComponent(r.ramo)}`)
  return runs ? lerCi(runs) : ''
}

/** Olha os repositórios mexidos nos últimos 90 dias (até 12) e devolve o retrato de cada um. */
async function retratar(rs: Repo[]): Promise<{ retratos: Record<string, Retrato>; cis: Record<string, EstadoCi> }> {
  const limite = Date.now() - 90 * 86_400_000
  const ativos = rs.filter((r) => !r.fork && !r.arquivado && Date.parse(r.mexidoEm) > limite).slice(0, 12)
  const retratos: Record<string, Retrato> = {}, cis: Record<string, EstadoCi> = {}
  for (const r of ativos) {
    let ci: EstadoCi = ''
    try { ci = await ciDe(r) } catch { /* sem actions */ }
    cis[r.nome] = ci
    retratos[r.nome] = { estrelas: r.estrelas, abertos: r.abertos, ci }
  }
  return { retratos, cis }
}

export async function resumoGithub(): Promise<{ texto: string; repos: Repo[]; cis: Record<string, EstadoCi> }> {
  const rs = await meusRepos()
  const { cis } = await retratar(rs)
  return { texto: resumoDosRepos(rs, cis), repos: rs, cis }
}

export async function dicasGithub(): Promise<string[]> {
  const rs = await meusRepos()
  const semReadme = new Set<string>()
  for (const r of rs.filter((x) => !x.fork && !x.arquivado && !x.privado).slice(0, 20)) {
    try { if (!(await api(`/repos/${r.completo}/readme`))) semReadme.add(r.nome) } catch { /* segue */ }
  }
  return dicasDoPortfolio(rs, semReadme)
}

/** O que aconteceu nos repositórios nos últimos 7 dias (para o relatório da semana). */
export function novidadesDaSemana(): Novidade[] {
  const e = ler()
  return e.semana
}
export function limparSemana(): void { const e = ler(); e.semana = []; salvar(e) }

async function vigiar(): Promise<void> {
  const e = ler()
  if (e.quando && Date.now() - Date.parse(e.quando) < 5.5 * 3600_000) return
  const rs = await meusRepos()
  const { retratos } = await retratar(rs)
  const ns = novidades(e.retratos, retratos)
  for (const n of ns) {
    if (n.tipo === 'quebrou' || n.tipo === 'voltou' || n.tipo === 'aberto') avisar(n.texto, n.serio)
    e.semana.push(n)
  }
  e.retratos = { ...e.retratos, ...retratos }
  e.usuario = await usuario()
  e.quando = new Date().toISOString()
  salvar(e)
}

export function iniciarGithub(o: { avisar(texto: string, serio: boolean): void; log(t: string): void }): void {
  avisar = o.avisar
  log = o.log
  const vai = () => void vigiar().catch((er) => log(`github: ${(er as Error).message}`))
  setTimeout(vai, 7 * 60_000)
  setInterval(vai, 6 * 3600_000)
}
