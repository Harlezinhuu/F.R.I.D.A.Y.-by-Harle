// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Tarefas de programação em segundo plano com o Claude Code.
//
// Cada tarefa roda numa cópia isolada do projeto (git worktree), numa branch própria.
// O Claude Code só lê e edita arquivos; terminal, só os comandos liberados no projetos.json.
// Sem push e sem merge: o resultado fica na branch para você revisar.

import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { validarProjetos, encontrarProjeto, nomeBranch, slug, argumentosMotor, instrucao, type Projeto } from './logica/tarefas'

export type EstadoTarefa = 'na fila' | 'trabalhando' | 'pronta' | 'sem mudanças' | 'falhou' | 'cancelada'

export interface Tarefa {
  id: number
  projeto: string
  pedido: string
  estado: EstadoTarefa
  branch: string
  arquivos: string[]
  resumo: string
  andamento: string
  criadaEm: string
  terminadaEm?: string
}

interface Historico { proximoId: number; tarefas: Tarefa[] }

const dados = (): string => app.getPath('userData')
const arquivoProjetos = (): string => path.join(dados(), 'projetos.json')
const arquivoHistorico = (): string => path.join(dados(), 'tarefas.json')

let aoMudar: (t: Tarefa) => void = () => {}
let rodando: { tarefa: Tarefa; processo: ChildProcess | null; cancelada: boolean } | null = null
const fila: Tarefa[] = []

// ---------- Arquivos ----------

export function caminhoProjetos(): string {
  const arq = arquivoProjetos()
  if (!existsSync(arq)) {
    mkdirSync(path.dirname(arq), { recursive: true })
    // Em desenvolvimento, o próprio projeto da FRIDAY já vem como exemplo
    const exemplo = app.isPackaged ? [] : [{ nome: 'FRIDAY', pasta: app.getAppPath(), comandos: ['npm test'] }]
    writeFileSync(arq, JSON.stringify(exemplo, null, 2), 'utf8')
  }
  return arq
}

export function lerProjetos(): { projetos: Projeto[]; avisos: string[] } {
  try { return validarProjetos(JSON.parse(readFileSync(caminhoProjetos(), 'utf8'))) } catch { return { projetos: [], avisos: ['projetos.json está com erro de formato.'] } }
}

function lerHistorico(): Historico {
  try {
    const h = JSON.parse(readFileSync(arquivoHistorico(), 'utf8')) as Historico
    return { proximoId: Number(h.proximoId) || 1, tarefas: Array.isArray(h.tarefas) ? h.tarefas : [] }
  } catch {
    return { proximoId: 1, tarefas: [] }
  }
}

function salvarTarefa(t: Tarefa): void {
  const h = lerHistorico()
  const tarefas = [...h.tarefas.filter((x) => x.id !== t.id), t].sort((a, b) => a.id - b.id).slice(-30)
  const tmp = `${arquivoHistorico()}.tmp`
  writeFileSync(tmp, JSON.stringify({ proximoId: Math.max(h.proximoId, t.id + 1), tarefas }, null, 2), 'utf8')
  renameSync(tmp, arquivoHistorico())
  aoMudar(t)
}

// ---------- Git e motor ----------

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (erro, saida, err) => {
      if (erro) reject(new Error((err || erro.message).trim().split('\n').slice(-1)[0] || 'git falhou'))
      else resolve(saida.trim())
    })
  })
}

let motorCache: string | null | undefined
function acharMotor(): Promise<string | null> {
  if (motorCache !== undefined) return Promise.resolve(motorCache)
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', ['claude'], { windowsHide: true, timeout: 5000 }, (erro, saida) => {
      const linhas = erro ? [] : saida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      // No Windows, prefere o .exe (instalador nativo) e depois o .cmd (instalado pelo npm)
      motorCache = linhas.find((l) => /\.exe$/i.test(l)) ?? linhas.find((l) => /\.(cmd|bat)$/i.test(l)) ?? linhas[0] ?? null
      resolve(motorCache)
    })
  })
}

function iniciarMotor(motor: string, args: string[], cwd: string): ChildProcess {
  // Chaves da FRIDAY não vão para o Claude Code
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(FRIDAY_|FISH_|GEMINI_)/.test(k)))
  if (/\.(cmd|bat)$/i.test(motor)) {
    // .cmd só roda pelo cmd.exe; todos os argumentos são fixos ou validados (sem aspas, % ou &)
    const linha = [motor, ...args].map((a) => `"${a}"`).join(' ')
    return spawn('cmd.exe', ['/d', '/s', '/c', `"${linha}"`], { cwd, env, windowsHide: true, windowsVerbatimArguments: true })
  }
  return spawn(motor, args, { cwd, env, windowsHide: true })
}

function matarArvore(p: ChildProcess | null): void {
  if (!p?.pid) return
  if (process.platform === 'win32') execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {})
  else p.kill('SIGTERM')
}

const descreverFerramenta = (nome: string, entrada: Record<string, unknown>): string => {
  const alvo = String(entrada.file_path ?? entrada.path ?? entrada.pattern ?? entrada.command ?? '')
  const verbo: Record<string, string> = { Read: 'lendo', Edit: 'editando', MultiEdit: 'editando', Write: 'criando', Glob: 'procurando', Grep: 'buscando', LS: 'listando', Bash: 'rodando', TodoWrite: 'planejando' }
  return `${verbo[nome] ?? nome.toLowerCase()} ${entrada.file_path ? path.basename(alvo) : alvo}`.trim().slice(0, 120)
}

/** Roda o Claude Code e devolve o resumo final. */
function dirigir(t: Tarefa, motor: string, projeto: Projeto, pasta: string, branch: string, minutos: number): Promise<{ ok: boolean; resumo: string }> {
  return new Promise((resolve) => {
    const p = iniciarMotor(motor, argumentosMotor(projeto, process.env.FRIDAY_TAREFA_MODELO ?? ''), pasta)
    if (rodando) rodando.processo = p
    let resultado = '', erroFinal = false, resto = '', ultimoAviso = 0
    const erros: string[] = []
    const limite = setTimeout(() => { erros.push(`passou de ${minutos} minutos`); matarArvore(p) }, minutos * 60_000)

    p.stdout?.setEncoding('utf8')
    p.stdout?.on('data', (pedaco: string) => {
      resto += pedaco
      const linhas = resto.split('\n')
      resto = linhas.pop() ?? ''
      for (const linha of linhas) {
        let m: Record<string, unknown>
        try { m = JSON.parse(linha) } catch { continue }
        if (m.type === 'assistant') {
          const blocos = ((m.message as { content?: unknown[] })?.content ?? []) as Record<string, unknown>[]
          for (const b of blocos) {
            if (b.type === 'tool_use') t.andamento = descreverFerramenta(String(b.name), (b.input ?? {}) as Record<string, unknown>)
          }
          if (Date.now() - ultimoAviso > 5000) { ultimoAviso = Date.now(); aoMudar(t) }
        } else if (m.type === 'result') {
          resultado = String(m.result ?? '')
          erroFinal = m.is_error === true
        }
      }
    })
    p.stderr?.setEncoding('utf8')
    p.stderr?.on('data', (s: string) => { const l = s.trim(); if (l) erros.splice(0, erros.length, ...[...erros, l.slice(0, 300)].slice(-3)) })
    p.on('error', (e) => erros.push(e.message))
    p.on('close', (codigo) => {
      clearTimeout(limite)
      try { p.stdin?.end() } catch { /* já fechado */ }
      const ok = codigo === 0 && !erroFinal && !!resultado
      resolve({ ok, resumo: resultado || erros.join(' · ') || `o Claude Code terminou com código ${codigo}` })
    })
    p.stdin?.write(instrucao(projeto, branch, t.pedido))
    p.stdin?.end()
  })
}

async function executar(t: Tarefa): Promise<void> {
  const { projetos } = lerProjetos()
  const projeto = encontrarProjeto(t.projeto, projetos)
  const motor = await acharMotor()
  if (!projeto || !motor) {
    Object.assign(t, { estado: 'falhou', resumo: !motor ? 'O Claude Code não está instalado neste PC.' : `O projeto ${t.projeto} não está no projetos.json.`, terminadaEm: new Date().toISOString() })
    return salvarTarefa(t)
  }
  const minutos = Math.min(120, Math.max(5, Number(process.env.FRIDAY_TAREFA_MINUTOS) || 30))
  const trabalho = path.join(dados(), 'trabalho')
  const pasta = path.join(trabalho, `${slug(projeto.nome, 3)}-${t.id}`)
  let branch = nomeBranch(t.id, t.pedido)
  let base = ''
  let manter = false
  try {
    base = await git(['rev-parse', 'HEAD'], projeto.pasta)
    const existentes = (await git(['branch', '--list', '--format=%(refname:short)', 'friday/*'], projeto.pasta)).split(/\s+/)
    for (let n = 2; existentes.includes(branch); n++) branch = `${nomeBranch(t.id, t.pedido)}-${n}`
    if (existsSync(pasta)) { await git(['worktree', 'remove', '--force', pasta], projeto.pasta).catch(() => {}); rmSync(pasta, { recursive: true, force: true }) }
    mkdirSync(trabalho, { recursive: true })
    await git(['worktree', 'add', '-b', branch, pasta, base], projeto.pasta)

    Object.assign(t, { estado: 'trabalhando', branch, andamento: 'começando' })
    salvarTarefa(t)
    const r = await dirigir(t, motor, projeto, pasta, branch, minutos)
    if (rodando?.cancelada) { Object.assign(t, { estado: 'cancelada', resumo: 'Cancelada; nada foi guardado.' }); return }

    await git(['add', '-A'], pasta)
    if (await git(['status', '--porcelain'], pasta)) {
      await git(['-c', 'user.name=F.R.I.D.A.Y', '-c', 'user.email=friday@local', 'commit', '--no-verify', '-q', '-m', `FRIDAY: ${t.pedido.replace(/\s+/g, ' ').slice(0, 72)}`, '-m', `Tarefa ${t.id} pedida por voz à F.R.I.D.A.Y.`], pasta)
    }
    const arquivos = (await git(['diff', '--name-only', base, 'HEAD'], pasta)).split('\n').filter(Boolean).slice(0, 60)
    manter = arquivos.length > 0
    Object.assign(t, {
      estado: r.ok && manter ? 'pronta' : r.ok ? 'sem mudanças' : 'falhou',
      arquivos,
      branch: manter ? branch : '',
      resumo: r.resumo.slice(0, 2000)
    })
  } catch (e) {
    Object.assign(t, { estado: 'falhou', resumo: `Não consegui preparar a cópia do projeto: ${(e as Error).message}` })
  } finally {
    await git(['worktree', 'remove', '--force', pasta], projeto.pasta).catch(() => {})
    rmSync(pasta, { recursive: true, force: true })
    if (!manter && base) await git(['branch', '-D', branch], projeto.pasta).catch(() => {})
    t.terminadaEm = new Date().toISOString()
    t.andamento = ''
    salvarTarefa(t)
  }
}

async function proxima(): Promise<void> {
  if (rodando || !fila.length) return
  const t = fila.shift()!
  rodando = { tarefa: t, processo: null, cancelada: false }
  try { await executar(t) } finally { rodando = null; void proxima() }
}

// ---------- API usada pelas ferramentas ----------

export function iniciarTarefas(cb: (t: Tarefa) => void): void {
  aoMudar = cb
  // Tarefas que estavam rodando quando o PC desligou não continuam sozinhas
  const h = lerHistorico()
  for (const t of h.tarefas.filter((x) => x.estado === 'trabalhando' || x.estado === 'na fila')) {
    salvarTarefa({ ...t, estado: 'falhou', resumo: 'Interrompida porque a FRIDAY foi fechada.', andamento: '' })
  }
}

export async function pedirTarefa(nomeProjeto: string, pedido: string): Promise<{ ok: true; tarefa: Tarefa; posicao: number } | { ok: false; motivo: string }> {
  const texto = pedido.replace(/\s+/g, ' ').trim()
  if (texto.length < 8) return { ok: false, motivo: 'Descreva melhor a tarefa.' }
  if (texto.length > 2000) return { ok: false, motivo: 'Pedido longo demais.' }
  const { projetos } = lerProjetos()
  const projeto = encontrarProjeto(nomeProjeto, projetos)
  if (!projeto) return { ok: false, motivo: projetos.length ? `Não achei o projeto "${nomeProjeto}". Projetos: ${projetos.map((p) => p.nome).join(', ')}.` : 'Nenhum projeto configurado. Adicione no projetos.json (ícone da bandeja > Editar projetos).' }
  if (!existsSync(projeto.pasta)) return { ok: false, motivo: `A pasta do projeto ${projeto.nome} não existe: ${projeto.pasta}` }
  if (!(await acharMotor())) return { ok: false, motivo: 'O Claude Code não está instalado. Instale com "npm install -g @anthropic-ai/claude-code" e faça login rodando "claude" uma vez.' }
  try { await git(['rev-parse', '--is-inside-work-tree'], projeto.pasta) } catch { return { ok: false, motivo: `${projeto.nome} não é um repositório git; a tarefa precisa de git para ficar isolada.` } }
  const h = lerHistorico()
  const id = Math.max(h.proximoId, ...fila.map((t) => t.id + 1), (rodando?.tarefa.id ?? 0) + 1)
  const t: Tarefa = { id, projeto: projeto.nome, pedido: texto, estado: 'na fila', branch: '', arquivos: [], resumo: '', andamento: '', criadaEm: new Date().toISOString() }
  salvarTarefa(t)
  fila.push(t)
  const posicao = fila.length + (rodando ? 1 : 0)
  void proxima()
  return { ok: true, tarefa: t, posicao }
}

export function statusTarefas(): Tarefa[] {
  const h = lerHistorico()
  return h.tarefas.slice(-5).reverse()
}

export function cancelarTarefaAtual(): Tarefa | null {
  if (rodando) {
    rodando.cancelada = true
    matarArvore(rodando.processo)
    return rodando.tarefa
  }
  const t = fila.shift()
  if (t) { Object.assign(t, { estado: 'cancelada', resumo: 'Cancelada antes de começar.', terminadaEm: new Date().toISOString() }); salvarTarefa(t) }
  return t ?? null
}
