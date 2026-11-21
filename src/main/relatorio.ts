// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Relatório da semana: domingo à noite (ou segunda de manhã, se o PC estava desligado) ela junta
// o que aconteceu (código, tarefas, GitHub, agenda da próxima semana, lembretes, a saúde dela e o
// que os outros módulos registrarem, como o negócio e as finanças), salva em
// Documentos > FRIDAY > Relatórios e fala o resumo em um minuto.

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { lerProjetos, statusTarefas } from './tarefas'
import { listarLembretes } from './reminders'
import { ultimaSaude } from './autocuidado'
import { agendaEmTexto, compromissos, googleConectado } from './google'
import { limparSemana, novidadesDaSemana } from './github'
import { emMarkdown, horaDoRelatorio, resumoFalado, secaoProgramacao, semanaDe, type Secao } from './logica/relatorio'

let avisar: (texto: string, serio: boolean) => void = () => {}
let log: (t: string) => void = () => {}

// Outros módulos penduram partes aqui (o negócio e as finanças, por exemplo)
const extras: { ordem: number; gerar: (de: Date, ate: Date) => Secao | null }[] = []
export function registrarSecao(ordem: number, gerar: (de: Date, ate: Date) => Secao | null): void { extras.push({ ordem, gerar }) }

const git = (pasta: string, args: string[]): Promise<string> =>
  new Promise((ok) => execFile('git', args, { cwd: pasta, timeout: 20_000, windowsHide: true }, (e, s) => ok(e ? '' : s.toString())))

async function programacao(de: Date): Promise<Secao> {
  const pastas = new Map<string, string>()
  for (const p of lerProjetos().projetos) pastas.set(p.pasta, p.nome)
  if (!app.isPackaged) pastas.set(app.getAppPath(), 'FRIDAY')
  const porProjeto: { projeto: string; commits: string[] }[] = []
  for (const [pasta, nome] of pastas) {
    if (!existsSync(join(pasta, '.git'))) continue
    // As branches friday/* são das tarefas do Claude Code: contam nas tarefas, não aqui
    const saida = await git(pasta, ['log', '--exclude=friday/*', '--branches', '--no-merges', `--since=${de.toISOString()}`, '--format=%s'])
    porProjeto.push({ projeto: nome, commits: saida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) })
  }
  const semana = statusTarefas().filter((t) => t.terminadaEm && Date.parse(t.terminadaEm) >= de.getTime())
  return secaoProgramacao(porProjeto, semana)
}

async function proximaSemana(agora: Date): Promise<Secao | null> {
  const fim = new Date(agora.getTime() + 7 * 86_400_000)
  const linhas: string[] = []
  let resumo = ''
  if (googleConectado()) {
    try {
      const cs = await compromissos(agora, fim)
      if (cs.length) { linhas.push(agendaEmTexto(cs, agora)); resumo = `Na próxima semana você tem ${cs.length} ${cs.length === 1 ? 'compromisso' : 'compromissos'}` }
    } catch (e) { linhas.push(`Agenda: ${(e as Error).message}`) }
  }
  const ls = listarLembretes().filter((l) => !l.timer && Date.parse(l.quandoIso) > agora.getTime() && Date.parse(l.quandoIso) <= fim.getTime())
  if (ls.length) {
    linhas.push(...ls.slice(0, 10).map((l) => `Lembrete: ${l.texto} (${new Date(l.quandoIso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })})`))
    resumo = resumo ? `${resumo} e ${ls.length} ${ls.length === 1 ? 'lembrete' : 'lembretes'}` : `Na próxima semana: ${ls.length} ${ls.length === 1 ? 'lembrete' : 'lembretes'}`
  }
  return linhas.length ? { titulo: 'Próxima semana', linhas, resumo } : null
}

function github(): Secao | null {
  const ns = novidadesDaSemana()
  if (!ns.length) return null
  const estrelas = ns.filter((n) => n.tipo === 'estrela').length
  return { titulo: 'GitHub', linhas: ns.map((n) => n.texto), resumo: `No GitHub: ${ns.length} ${ns.length === 1 ? 'novidade' : 'novidades'}${estrelas ? ', com estrela nova' : ''}` }
}

function saude(): Secao | null {
  const s = ultimaSaude()
  if (!s.itens.length) return null
  const ruins = s.itens.filter((i) => !i.ok)
  return { titulo: 'A FRIDAY', linhas: s.itens.map((i) => `${i.ok ? 'OK' : 'Atenção'}: ${i.nome} (${i.detalhe})`), resumo: ruins.length ? `Comigo: ${ruins.map((i) => i.nome.toLowerCase()).join(' e ')} ${ruins.length === 1 ? 'precisa' : 'precisam'} de atenção` : '' }
}

export async function gerarRelatorio(agora = new Date()): Promise<{ texto: string; arquivo: string; secoes: Secao[] }> {
  const { de, chave } = semanaDe(agora.getDay() === 1 && agora.getHours() < 12 ? new Date(agora.getTime() - 86_400_000) : agora)
  const secoes: Secao[] = [await programacao(de)]
  for (const x of [...extras].sort((a, b) => a.ordem - b.ordem)) { try { const s = x.gerar(de, agora); if (s) secoes.push(s) } catch (e) { log(`relatório: ${(e as Error).message}`) } }
  for (const s of [github(), await proximaSemana(agora), saude()]) if (s) secoes.push(s)
  const pasta = join(app.getPath('documents'), 'FRIDAY', 'Relatórios')
  mkdirSync(pasta, { recursive: true })
  const arquivo = join(pasta, `semana-${chave}.md`)
  writeFileSync(arquivo, emMarkdown(`Semana de ${de.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`, secoes), 'utf8')
  return { texto: resumoFalado(secoes), arquivo, secoes }
}

const marcador = (): string => join(app.getPath('userData'), 'relatorio.json')
const ultima = (): string => { try { return JSON.parse(readFileSync(marcador(), 'utf8')).chave ?? '' } catch { return '' } }

async function talvez(): Promise<void> {
  const agora = new Date()
  if (!horaDoRelatorio(agora, ultima())) return
  const r = await gerarRelatorio(agora)
  const ref = agora.getDay() === 1 ? new Date(agora.getTime() - 86_400_000) : agora
  writeFileSync(marcador(), JSON.stringify({ chave: semanaDe(ref).chave, quando: agora.toISOString() }))
  limparSemana()
  avisar(`${r.texto} O relatório completo está em Documentos, FRIDAY, Relatórios.`, false)
}

export function iniciarRelatorio(o: { avisar(texto: string, serio: boolean): void; log(t: string): void }): void {
  avisar = o.avisar
  log = o.log
  const vai = () => void talvez().catch((e) => log(`relatório: ${(e as Error).message}`))
  setTimeout(vai, 5 * 60_000)
  setInterval(vai, 30 * 60_000)
}
