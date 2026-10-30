// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Dupla de programação por voz: rodar os testes e explicar o que quebrou, revisar o que vai para o
// GitHub (chaves, .env, console.log esquecido), explicar o arquivo aberto no VS Code e anotar bugs
// como issue. Só nos projetos do projetos.json e só com os comandos liberados lá.

import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'
import { lerProjetos } from './tarefas'
import { encontrarProjeto, normalizar, type Projeto } from './logica/tarefas'
import { janelaAtiva } from './winctl'
import { arquivoSecreto, ocultarSegredos } from './logica/cerebro'
import { GANCHO_PRE_PUSH, falarRevisao, lerTituloVsCode, linkIssueNova, repoDoGithub, resumirTestes, revisarDiff, trechoComLinhas, type ResumoTestes } from './logica/programacao'

type Resultado = { ok: boolean; mensagem: string }
const MARCA_GANCHO = 'FRIDAY: revisora antes do push'
const COMANDO_SEGURO = /^[\p{L}\p{N}_][\p{L}\p{N}_ .:/=+@-]{0,79}$/u

// ---------- Qual projeto ----------

async function vsCode(): Promise<{ arquivo: string; pasta: string } | null> {
  try { return lerTituloVsCode((await janelaAtiva()).titulo) } catch { return null }
}

/** O projeto pedido pelo nome, o que está aberto no VS Code, ou o único que existe. */
export async function escolherProjeto(nome: string): Promise<{ projeto: Projeto; arquivoAberto: string } | { erro: string }> {
  const { projetos } = lerProjetos()
  if (!projetos.length) return { erro: 'Nenhum projeto configurado. No ícone da bandeja, "Editar projetos de programação".' }
  const janela = await vsCode()
  if (nome.trim()) {
    const p = encontrarProjeto(nome, projetos)
    if (!p) return { erro: `Não achei o projeto "${nome}". Tenho: ${projetos.map((x) => x.nome).join(', ')}.` }
    const mesmo = janela && normalizar(path.basename(p.pasta)) === normalizar(janela.pasta)
    return { projeto: p, arquivoAberto: mesmo ? janela.arquivo : '' }
  }
  if (janela?.pasta) {
    const p = projetos.find((x) => normalizar(path.basename(x.pasta)) === normalizar(janela.pasta) || normalizar(x.nome) === normalizar(janela.pasta))
    if (p) return { projeto: p, arquivoAberto: janela.arquivo }
  }
  if (projetos.length === 1) return { projeto: projetos[0], arquivoAberto: '' }
  return { erro: `Qual projeto? Tenho: ${projetos.map((x) => x.nome).join(', ')}.` }
}

const dentro = (pasta: string, alvo: string): boolean => {
  const rel = path.relative(path.resolve(pasta), path.resolve(alvo))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function git(pasta: string, args: string[]): Promise<string> {
  return new Promise((ok, erro) => execFile('git', args, { cwd: pasta, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (e, out, err) => (e ? erro(new Error(String(err || e.message).trim())) : ok(out))))
}

// ---------- Rodar os testes ----------

function escolherComando(p: Projeto, pedido: string): string | { erro: string } {
  const liberados = p.comandos
  if (pedido.trim()) {
    const c = pedido.trim()
    if (!COMANDO_SEGURO.test(c) || !liberados.some((l) => c === l || c.startsWith(`${l} `))) {
      return { erro: `"${c}" não está liberado no projeto ${p.nome}. Liberados: ${liberados.join(', ') || 'nenhum'}.` }
    }
    return c
  }
  const teste = liberados.find((c) => /\btest|vitest|jest|pytest|tsc|typecheck|lint/i.test(c))
  return teste ?? { erro: `O projeto ${p.nome} não tem comando de teste liberado. Coloque, por exemplo, "npm test" em "comandos" no projetos.json.` }
}

function rodar(comando: string, pasta: string, limiteMs = 5 * 60_000): Promise<{ codigo: number; saida: string; tempo: number }> {
  const inicio = Date.now()
  return new Promise((ok) => {
    // O comando já foi conferido: só texto simples e um dos liberados no projetos.json
    const p = spawn(comando, { cwd: pasta, shell: true, windowsHide: true, env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' } })
    let saida = ''
    const juntar = (d: Buffer) => { saida += d.toString('utf8'); if (saida.length > 400_000) saida = saida.slice(-300_000) }
    p.stdout.on('data', juntar)
    p.stderr.on('data', juntar)
    const relogio = setTimeout(() => { saida += '\n(Parei: passou de 5 minutos.)'; p.kill() }, limiteMs)
    p.on('close', (codigo) => { clearTimeout(relogio); ok({ codigo: codigo ?? 1, saida, tempo: Date.now() - inicio }) })
    p.on('error', (e) => { clearTimeout(relogio); ok({ codigo: 1, saida: `${saida}\n${e.message}`, tempo: Date.now() - inicio }) })
  })
}

function contarResultado(p: Projeto, comando: string, r: { codigo: number; saida: string; tempo: number }, resumo: ResumoTestes): string {
  const tempo = `${Math.max(1, Math.round(r.tempo / 1000))} s`
  if (r.codigo === 0 && !resumo.falhas.length) {
    return `"${comando}" no ${p.nome}: tudo passou${resumo.passaram !== null ? ` (${resumo.passaram} testes)` : ''}, em ${tempo}. Diga isso em uma frase.`
  }
  const linhas = [`"${comando}" no ${p.nome} falhou em ${tempo}${resumo.falharam !== null ? `: ${resumo.falharam} falhando${resumo.passaram !== null ? `, ${resumo.passaram} passando` : ''}` : ''}.`]
  const curto = (a: string) => { const rel = path.relative(p.pasta, a); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.replace(/\\/g, '/') : a }
  resumo.falhas.slice(0, 4).forEach((f, i) => {
    linhas.push(`${i + 1}) ${f.titulo}${f.arquivo ? `, quebrou em ${curto(f.arquivo)}${f.linha ? `:${f.linha}` : ''}` : ''}: ${ocultarSegredos(f.mensagem).slice(0, 300)}`)
  })
  // O código em volta da primeira falha, para ela explicar por que quebrou
  const f = resumo.falhas.find((x) => x.arquivo && x.linha)
  if (f) {
    const arquivo = path.isAbsolute(f.arquivo) ? f.arquivo : path.join(p.pasta, f.arquivo)
    if (dentro(p.pasta, arquivo) && existsSync(arquivo) && !arquivoSecreto(path.basename(arquivo))) {
      try { linhas.push(`Código em volta (${path.relative(p.pasta, arquivo)}, linha ${f.linha} marcada com >):\n${ocultarSegredos(trechoComLinhas(readFileSync(arquivo, 'utf8'), f.linha))}`) } catch { /* sem acesso */ }
    }
  }
  if (!resumo.falhas.length) linhas.push(`Fim da saída:\n${ocultarSegredos(r.saida.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trim().slice(-1500))}`)
  linhas.push('Explique falando, em poucas frases: qual teste quebrou, em que linha e o motivo provável. Ofereça corrigir com uma tarefa de programação.')
  return linhas.join('\n')
}

// ---------- Última rodada (a mesa holográfica pinta de vermelho onde quebrou) ----------

const arquivoTestes = (): string => path.join(app.getPath('userData'), 'testes.json')

function guardarRodada(p: Projeto, codigo: number, resumo: ResumoTestes): void {
  try {
    let tudo: Record<string, { quando: number; ok: boolean; arquivos: string[] }> = {}
    try { tudo = JSON.parse(readFileSync(arquivoTestes(), 'utf8')) } catch { /* primeira vez */ }
    tudo[p.nome] = { quando: Date.now(), ok: codigo === 0 && !resumo.falhas.length, arquivos: [...new Set(resumo.falhas.map((f) => f.arquivo).filter(Boolean))] }
    writeFileSync(arquivoTestes(), JSON.stringify(tudo, null, 2))
  } catch { /* sem disco: só não pinta */ }
}

/** Onde os testes quebraram na última vez que rodaram neste projeto (vazio se passaram). */
export function ultimasFalhas(nomeProjeto: string): { quando: number; arquivos: string[] } | null {
  try {
    const r = (JSON.parse(readFileSync(arquivoTestes(), 'utf8')) as Record<string, { quando: number; arquivos: string[] }>)[nomeProjeto]
    return r ? { quando: r.quando, arquivos: Array.isArray(r.arquivos) ? r.arquivos : [] } : null
  } catch {
    return null
  }
}

/**
 * Roda os testes. Se demorar mais de 25 s, responde já e conta o resultado depois (por `depois`).
 */
export async function rodarTestes(nomeProjeto: string, pedido: string, depois: (texto: string, ok: boolean) => void): Promise<Resultado> {
  const e = await escolherProjeto(nomeProjeto)
  if ('erro' in e) return { ok: false, mensagem: e.erro }
  const comando = escolherComando(e.projeto, pedido)
  if (typeof comando !== 'string') return { ok: false, mensagem: comando.erro }
  const execucao = rodar(comando, e.projeto.pasta).then((r) => {
    const resumo = resumirTestes(r.saida)
    guardarRodada(e.projeto, r.codigo, resumo)
    return { r, texto: contarResultado(e.projeto, comando, r, resumo) }
  })
  const rapido = await Promise.race([execucao, new Promise<null>((ok) => setTimeout(() => ok(null), 25_000))])
  if (rapido) return { ok: rapido.r.codigo === 0, mensagem: rapido.texto }
  void execucao.then(({ r, texto }) => depois(r.codigo === 0 ? `Os testes do ${e.projeto.nome} passaram.` : `Os testes do ${e.projeto.nome} falharam. ${texto.split('\n').slice(0, 3).join(' ')}`, r.codigo === 0))
  return { ok: true, mensagem: `Rodando "${comando}" no ${e.projeto.nome}. Está demorando; te conto quando terminar.` }
}

// ---------- Revisora antes do push ----------

const TEXTO_PEQUENO = 200 * 1024

/** O que ainda não foi para o GitHub: commits não enviados, mudanças e arquivos novos. */
export async function revisarCodigo(nomeProjeto: string, geral: boolean): Promise<Resultado> {
  const e = await escolherProjeto(nomeProjeto)
  if ('erro' in e) return { ok: false, mensagem: e.erro }
  const pasta = e.projeto.pasta
  try { await git(pasta, ['rev-parse', '--is-inside-work-tree']) } catch { return { ok: false, mensagem: `O ${e.projeto.nome} não é um repositório git.` } }
  let upstream = ''
  try { upstream = (await git(pasta, ['rev-parse', '--abbrev-ref', '@{u}'])).trim() } catch { /* branch sem remoto */ }
  const commits = upstream ? (await git(pasta, ['log', '--oneline', `${upstream}..HEAD`])).trim().split('\n').filter(Boolean) : []
  const naoEnviado = upstream ? await git(pasta, ['diff', `${upstream}...HEAD`]) : ''
  const mudancas = await git(pasta, ['diff', 'HEAD']).catch(() => '')
  // Arquivos novos (ainda sem git add) também contam
  const novos = (await git(pasta, ['ls-files', '--others', '--exclude-standard']).catch(() => '')).split('\n').map((x) => x.trim()).filter(Boolean)
  const diffNovos = novos.slice(0, 200).map((rel) => {
    const abs = path.join(pasta, rel)
    let corpo = ''
    try { if (statSync(abs).size <= TEXTO_PEQUENO) { const t = readFileSync(abs, 'utf8'); if (!t.includes('\u0000')) corpo = t.split('\n').map((l) => `+${l}`).join('\n') } } catch { /* sem acesso */ }
    return `+++ b/${rel.replace(/\\/g, '/')}\n@@ -0,0 +1 @@\n${corpo}`
  }).join('\n')
  const achados = revisarDiff([naoEnviado, mudancas, diffNovos].join('\n'))
  const temGancho = (() => { try { return readFileSync(path.join(pasta, '.git', 'hooks', 'pre-push'), 'utf8').includes(MARCA_GANCHO) } catch { return false } })()
  const arquivosMudados = new Set([...mudancas.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1])).size + novos.length
  const linhas = [
    `${e.projeto.nome}: ${commits.length} commit${commits.length === 1 ? '' : 's'} ainda não enviado${commits.length === 1 ? '' : 's'}${upstream ? '' : ' (a branch não tem remoto)'} e ${arquivosMudados} arquivo${arquivosMudados === 1 ? '' : 's'} mudado${arquivosMudados === 1 ? '' : 's'} fora de commit.`,
    falarRevisao(achados),
    ...(temGancho ? [] : ['Ofereça instalar a revisora automática (revisar_codigo com acao=instalar): ela bloqueia o push sozinha se uma chave ou .env for junto.'])
  ]
  if (geral) {
    const diff = ocultarSegredos([naoEnviado, mudancas].join('\n')).slice(0, 7000)
    linhas.push(`Mudanças (para uma revisão geral; comente o que pode dar problema, em poucas frases):\n${diff || '(sem mudanças em arquivos já existentes)'}`)
  }
  return { ok: !achados.some((a) => a.tipo === 'segredo' || a.tipo === 'arquivo_secreto'), mensagem: linhas.join('\n') }
}

/** Instala o gancho que bloqueia o push com chave ou .env (nunca por cima de um gancho que não é dela). */
export async function instalarRevisora(nomeProjeto: string): Promise<Resultado> {
  const e = await escolherProjeto(nomeProjeto)
  if ('erro' in e) return { ok: false, mensagem: e.erro }
  const ganchos = path.join(e.projeto.pasta, '.git', 'hooks')
  if (!existsSync(path.join(e.projeto.pasta, '.git'))) return { ok: false, mensagem: `O ${e.projeto.nome} não é um repositório git.` }
  const arquivo = path.join(ganchos, 'pre-push')
  if (existsSync(arquivo) && !readFileSync(arquivo, 'utf8').includes(MARCA_GANCHO)) {
    return { ok: false, mensagem: `O ${e.projeto.nome} já tem um gancho pre-push que não é meu. Não mexi nele.` }
  }
  mkdirSync(ganchos, { recursive: true })
  writeFileSync(arquivo, GANCHO_PRE_PUSH, { encoding: 'utf8', mode: 0o755 })
  return { ok: true, mensagem: `Revisora instalada no ${e.projeto.nome}: se um push levar chave de API ou .env, o próprio git bloqueia e diz o motivo.` }
}

// ---------- Explicar o código ----------

const PULAR = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', 'target', 'bin', 'obj', '.venv', 'venv', '__pycache__'])

function acharArquivo(pasta: string, nome: string): string | null {
  const alvo = nome.replace(/\\/g, '/').toLowerCase()
  const direto = path.join(pasta, nome)
  if (existsSync(direto) && statSync(direto).isFile() && dentro(pasta, direto)) return direto
  const achados: string[] = []
  const andar = (dir: string, nivel: number) => {
    if (nivel > 8 || achados.length > 20) return
    let itens
    try { itens = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const d of itens) {
      const c = path.join(dir, d.name)
      if (d.isDirectory()) { if (!PULAR.has(d.name) && !d.name.startsWith('.')) andar(c, nivel + 1) } else if (c.replace(/\\/g, '/').toLowerCase().endsWith(`/${alvo}`) || d.name.toLowerCase() === alvo) achados.push(c)
    }
  }
  andar(pasta, 0)
  // O mais raso primeiro (src/app.ts antes de src/velho/app.ts)
  return achados.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length)[0] ?? null
}

export async function explicarCodigo(nomeProjeto: string, arquivoPedido: string, parte: string): Promise<Resultado> {
  const e = await escolherProjeto(nomeProjeto)
  if ('erro' in e) return { ok: false, mensagem: e.erro }
  const nome = arquivoPedido.trim() || e.arquivoAberto
  if (!nome) return { ok: false, mensagem: 'Qual arquivo? Abra ele no VS Code ou diga o nome.' }
  const arquivo = acharArquivo(e.projeto.pasta, nome)
  if (!arquivo) return { ok: false, mensagem: `Não achei ${nome} no ${e.projeto.nome}.` }
  if (arquivoSecreto(path.basename(arquivo))) return { ok: false, mensagem: 'Esse arquivo guarda chaves ou senhas. Não leio.' }
  if (statSync(arquivo).size > 1024 * 1024) return { ok: false, mensagem: 'Esse arquivo é grande demais para explicar inteiro. Diga a função.' }
  const linhas = ocultarSegredos(readFileSync(arquivo, 'utf8')).split(/\r?\n/)
  let ini = 0, fim = Math.min(linhas.length, 260)
  if (parte.trim()) {
    const alvo = parte.trim().toLowerCase()
    const achou = linhas.findIndex((l) => l.toLowerCase().includes(alvo))
    if (achou >= 0) { ini = Math.max(0, achou - 5); fim = Math.min(linhas.length, achou + 150) }
  }
  const largura = String(fim).length
  const codigo = linhas.slice(ini, fim).map((l, i) => `${String(ini + i + 1).padStart(largura)} | ${l}`).join('\n')
  const rel = path.relative(e.projeto.pasta, arquivo).replace(/\\/g, '/')
  return {
    ok: true,
    mensagem: [
      `${rel} (${linhas.length} linhas${ini > 0 || fim < linhas.length ? `; mostrando ${ini + 1} a ${fim}` : ''}):`,
      codigo,
      'Explique falando, parte por parte e em linguagem simples: para que serve o arquivo, o que cada bloco faz (cite as linhas) e qualquer coisa estranha que notar. Se for comprido, ofereça o modo explicação (explicar) ou explicar só uma função.'
    ].join('\n')
  }
}

// ---------- Bug anotado por voz ----------

function gh(args: string[], pasta: string): Promise<string> {
  return new Promise((ok, erro) => execFile('gh', args, { cwd: pasta, windowsHide: true, timeout: 30_000 }, (e, out, err) => (e ? erro(new Error(String(err || e.message).trim())) : ok(out.trim()))))
}

export async function anotarBug(nomeProjeto: string, titulo: string, detalhes: string, confirmado: boolean): Promise<Resultado & { precisaConfirmacao?: boolean; pergunta?: string }> {
  const e = await escolherProjeto(nomeProjeto)
  if ('erro' in e) return { ok: false, mensagem: e.erro }
  let repo: string | null = null
  try { repo = repoDoGithub(await git(e.projeto.pasta, ['remote', 'get-url', 'origin'])) } catch { /* sem remoto */ }
  if (!repo) return { ok: false, mensagem: `O ${e.projeto.nome} não está ligado a um repositório do GitHub.` }
  if (!confirmado) {
    return { ok: false, precisaConfirmacao: true, pergunta: `Criar a issue "${titulo}" no ${repo}?`, mensagem: `Precisa de confirmação: criar no GitHub (${repo}, que pode ser público) a issue "${titulo}"${detalhes ? ` com: ${detalhes}` : ''}. Leia e pergunte antes.` }
  }
  const corpo = `${detalhes.trim()}\n\n_Anotado por voz pela FRIDAY em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}._`
  try {
    const url = await gh(['issue', 'create', '--repo', repo, '--title', titulo, '--body', corpo], e.projeto.pasta)
    const numero = url.match(/\/issues\/(\d+)/)?.[1]
    return { ok: true, mensagem: `Issue ${numero ? `#${numero} ` : ''}criada no ${repo}.${numero ? ` Para resolver depois: "resolve a issue ${numero} do ${e.projeto.nome}" vira uma tarefa de programação.` : ''}` }
  } catch {
    // Sem o GitHub CLI (ou sem login nele): abre a página já preenchida
    await shell.openExternal(linkIssueNova(repo, titulo, corpo))
    return { ok: true, mensagem: 'Abri a página da issue no GitHub já preenchida: é só conferir e clicar em "Submit new issue". (Com o GitHub CLI instalado e logado, eu crio direto.)' }
  }
}

/** "resolve a issue 12": junta o texto da issue ao pedido da tarefa (o motor de código não acessa a internet). */
export async function pedidoComIssue(nomeProjeto: string, pedido: string): Promise<string> {
  const n = pedido.match(/\bissue\s*#?\s*(\d+)/i)?.[1]
  if (!n) return pedido
  const e = await escolherProjeto(nomeProjeto)
  if ('erro' in e) return pedido
  try {
    const repo = repoDoGithub(await git(e.projeto.pasta, ['remote', 'get-url', 'origin']))
    if (!repo) return pedido
    const j = JSON.parse(await gh(['issue', 'view', n, '--repo', repo, '--json', 'title,body'], e.projeto.pasta)) as { title?: string; body?: string }
    return `${pedido}\n\nIssue #${n}: ${j.title ?? ''}\n${(j.body ?? '').slice(0, 4000)}`
  } catch {
    return pedido
  }
}
