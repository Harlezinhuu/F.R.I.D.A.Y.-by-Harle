// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Autocuidado: todo dia ela confere a própria saúde e avisa só quando algo precisa de você.
// - Chave e modelos do Gemini: se o Google tirar um modelo do ar, ela troca sozinha pelo
//   substituto mais novo e conta o que fez (foi o que derrubou a voz em novembro).
// - Versão nova no GitHub: pergunta se pode se atualizar; só atualiza com o seu "pode".
// - Erro que se repete: oferece abrir uma tarefa no Claude Code para consertar o próprio código
//   (o conserto fica numa branch para você revisar; nada é aplicado sozinho).
// - Disco quase cheio e o que os outros módulos registrarem (o backup, por exemplo).

import { app } from 'electron'
import { GoogleGenAI } from '@google/genai'
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, statfsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODELO_DE_VOZ, MODELO_TEXTO, carregarConfig, modeloTexto, salvarTrocaDeModelo } from './config'
import { garantirProjeto, pedirTarefa } from './tarefas'
import { errosRepetidos, escolherModelo, melhoriasDoLog, modeloSumiu, resumoDaSaude, type ItemSaude, type ModeloListado } from './logica/autocuidado'

let avisar: (texto: string, serio: boolean) => void = () => {}
let log: (t: string) => void = () => {}

// Outros módulos podem pendurar conferências aqui (o backup do negócio, por exemplo)
const conferencias: { nome: string; conferir: () => ItemSaude | null }[] = []
export function registrarConferencia(nome: string, conferir: () => ItemSaude | null): void {
  if (!conferencias.some((c) => c.nome === nome)) conferencias.push({ nome, conferir })
}

interface Estado { ultimoCheck: string; ultimoAviso: string; avisoVersao: string; itens: ItemSaude[]; atrasadas: string[]; erros: { erro: string; vezes: number; exemplo: string }[] }
const arquivo = (): string => join(app.getPath('userData'), 'autocuidado.json')
function lerEstado(): Estado {
  try { return { ultimoCheck: '', ultimoAviso: '', avisoVersao: '', itens: [], atrasadas: [], erros: [], ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch {
    return { ultimoCheck: '', ultimoAviso: '', avisoVersao: '', itens: [], atrasadas: [], erros: [] }
  }
}
const salvar = (e: Estado): void => { try { writeFileSync(arquivo(), JSON.stringify(e, null, 2)) } catch { /* sem disco */ } }

const pastaDoApp = (): string => app.getAppPath()
const ehGit = (): boolean => !app.isPackaged && existsSync(join(pastaDoApp(), '.git'))

function git(args: string[], segundos = 60): Promise<string> {
  return new Promise((ok, erro) => {
    execFile('git', args, { cwd: pastaDoApp(), timeout: segundos * 1000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } }, (e, saida, err) => (e ? erro(new Error((err || e.message).toString().trim().split('\n').pop())) : ok(saida.toString())))
  })
}

// ---------- Gemini ----------

async function conferirModelos(): Promise<ItemSaude[]> {
  const cfg = carregarConfig()
  if (!cfg.apiKey) return [{ nome: 'Chave do Gemini', ok: false, grave: true, detalhe: 'falta a GEMINI_API_KEY no .env' }]
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey })
  const itens: ItemSaude[] = []
  let lista: ModeloListado[] | null = null
  const listar = async (): Promise<ModeloListado[]> => {
    if (lista) return lista
    const out: ModeloListado[] = []
    const pager = await ai.models.list({ config: { pageSize: 200 } })
    for await (const m of pager) out.push({ name: m.name, supportedActions: (m as { supportedActions?: string[] }).supportedActions })
    return (lista = out)
  }
  for (const [tipo, atual, padrao, nome] of [['texto', modeloTexto(), MODELO_TEXTO, 'Cérebro de texto'], ['voz', cfg.modelo, MODELO_DE_VOZ, 'Voz (Live)']] as const) {
    try {
      await ai.models.get({ model: atual })
      itens.push({ nome, ok: true, detalhe: atual })
    } catch (e) {
      const msg = (e as Error).message
      if (/API key|permission|401|403/i.test(msg)) { itens.push({ nome: 'Chave do Gemini', ok: false, grave: true, detalhe: 'o Google recusou a chave (venceu ou foi apagada?)' }); break }
      if (!modeloSumiu(msg)) { itens.push({ nome, ok: false, detalhe: `não consegui conferir (${msg.slice(0, 80)})` }); continue }
      // O modelo saiu do ar: escolhe o substituto mais novo
      try {
        const novo = escolherModelo(await listar(), tipo, atual) ?? (atual !== padrao ? padrao : null)
        if (!novo) { itens.push({ nome, ok: false, grave: true, detalhe: `${atual} saiu do ar e não achei substituto` }); continue }
        salvarTrocaDeModelo(tipo === 'texto' ? { texto: novo } : { voz: novo })
        log(`autocuidado: ${atual} saiu do ar; troquei para ${novo}`)
        avisar(`O Google tirou do ar o modelo ${atual}. Já troquei para o ${novo}${tipo === 'voz' ? ' (vale da próxima conversa em diante)' : ''}.`, false)
        itens.push({ nome, ok: true, detalhe: `${novo} (troquei sozinha; ${atual} saiu do ar)` })
      } catch (e2) {
        itens.push({ nome, ok: false, grave: true, detalhe: `${atual} saiu do ar e a troca falhou: ${(e2 as Error).message.slice(0, 80)}` })
      }
    }
  }
  return itens
}

// ---------- Versão ----------

async function conferirVersao(e: Estado): Promise<ItemSaude | null> {
  if (!ehGit()) return null
  try {
    await git(['fetch', '-q', 'origin'], 90)
    const saida = await git(['log', '--no-merges', '--format=%h %s', 'HEAD..origin/main'])
    e.atrasadas = melhoriasDoLog(saida)
    return e.atrasadas.length
      ? { nome: 'Versão', ok: false, detalhe: `${e.atrasadas.length} ${e.atrasadas.length === 1 ? 'melhoria nova' : 'melhorias novas'} esperando (diga "pode se atualizar")` }
      : { nome: 'Versão', ok: true, detalhe: 'em dia' }
  } catch (erro) {
    return { nome: 'Versão', ok: true, detalhe: `não deu para conferir agora (${(erro as Error).message.slice(0, 60)})` }
  }
}

function conferirDisco(): ItemSaude | null {
  try {
    const s = statfsSync(app.getPath('userData'))
    const livreGb = (s.bavail * s.bsize) / 1024 ** 3
    return livreGb < 5 ? { nome: 'Disco', ok: false, detalhe: `só ${livreGb.toFixed(1)} GB livres` } : { nome: 'Disco', ok: true, detalhe: `${Math.round(livreGb)} GB livres` }
  } catch { return null }
}

function conferirErros(e: Estado): ItemSaude {
  let texto = ''
  try { texto = readFileSync(join(app.isPackaged ? app.getPath('userData') : pastaDoApp(), 'friday.log'), 'utf8').slice(-400_000) } catch { /* sem log */ }
  e.erros = errosRepetidos(texto, Date.now()).slice(0, 5)
  return e.erros.length
    ? { nome: 'Erros', ok: false, detalhe: `${e.erros.length === 1 ? 'um erro se repetiu' : `${e.erros.length} erros se repetiram`} hoje (o maior, ${e.erros[0].vezes} vezes); posso pedir o conserto ao Claude Code` }
    : { nome: 'Erros', ok: true, detalhe: 'nenhum se repetindo' }
}

/** O check-up completo. */
export async function checarSaude(): Promise<{ itens: ItemSaude[]; texto: string; atrasadas: string[] }> {
  const e = lerEstado()
  const itens: ItemSaude[] = [...(await conferirModelos())]
  const v = await conferirVersao(e)
  if (v) itens.push(v)
  const d = conferirDisco()
  if (d) itens.push(d)
  itens.push(conferirErros(e))
  for (const c of conferencias) { try { const i = c.conferir(); if (i) itens.push(i) } catch { /* ignora */ } }
  e.itens = itens
  e.ultimoCheck = new Date().toISOString()
  salvar(e)
  return { itens, texto: resumoDaSaude(itens), atrasadas: e.atrasadas }
}

export function ultimaSaude(): { itens: ItemSaude[]; quando: string; atrasadas: string[]; erros: Estado['erros'] } {
  const e = lerEstado()
  return { itens: e.itens, quando: e.ultimoCheck, atrasadas: e.atrasadas, erros: e.erros }
}

// ---------- Atualizar e consertar (só com o "pode" dele) ----------

/** Fecha a FRIDAY, atualiza pelo git, instala e abre de novo (numa janela própria). */
export function atualizarAgora(): string {
  if (!ehGit()) throw new Error('Esta FRIDAY não foi instalada pelo git; atualize pelo instalador.')
  if (process.platform !== 'win32') throw new Error('A atualização sozinha é só no Windows.')
  const bat = join(tmpdir(), 'friday-atualizar.bat')
  writeFileSync(bat, [
    '@echo off', 'chcp 65001 >nul', 'title Atualizando a F.R.I.D.A.Y',
    'echo Esperando a FRIDAY fechar...', 'timeout /t 6 /nobreak >nul',
    `cd /d "${pastaDoApp()}" || goto erro`,
    'git stash push -m "antes da atualizacao" >nul 2>nul',
    'git pull --ff-only origin main || goto erro',
    'call npm install --no-audit --no-fund || goto erro',
    'echo Pronto! Abrindo a FRIDAY...',
    'start "F.R.I.D.A.Y" cmd /c npm run dev',
    'exit /b 0', ':erro', 'echo A atualizacao falhou. Copie a mensagem acima e mande para o Claude.', 'pause'
  ].join('\r\n'))
  spawn(`start "Atualizando a FRIDAY" cmd /c "${bat}"`, { detached: true, stdio: 'ignore', shell: true }).unref()
  setTimeout(() => app.quit(), 1500)
  return 'Vou fechar, me atualizar e voltar em alguns minutos.'
}

/** Pede ao Claude Code o conserto do erro que mais se repetiu (o resultado fica numa branch friday/*). */
export async function pedirConserto(qual = 0): Promise<string> {
  const e = lerEstado()
  const erro = e.erros[qual]
  if (!erro) throw new Error('Não tem erro se repetindo agora.')
  garantirProjeto('FRIDAY', pastaDoApp())
  const r = await pedirTarefa('FRIDAY', `A FRIDAY anotou este erro ${erro.vezes} vezes nas últimas 24 horas no friday.log:\n\n${erro.exemplo}\n\nAche a causa no código e corrija com a menor mudança possível. Se precisar, adicione um teste em tests/. Não mude nada que não tenha a ver com esse erro.`)
  if (!r.ok) throw new Error(r.motivo)
  return `Pedi o conserto ao Claude Code (tarefa ${r.tarefa.id}). Quando terminar, fica numa branch para você revisar; nada é aplicado sozinho.`
}

// ---------- Agenda ----------

async function rodar(): Promise<void> {
  const e0 = lerEstado()
  if (e0.ultimoCheck && Date.now() - Date.parse(e0.ultimoCheck) < 20 * 3600_000) return
  const r = await checarSaude()
  const e = lerEstado()
  const hoje = new Date().toISOString().slice(0, 10)
  const graves = r.itens.filter((i) => !i.ok && i.grave)
  const outros = r.itens.filter((i) => !i.ok && !i.grave && i.nome !== 'Versão')
  if ((graves.length || outros.length) && e.ultimoAviso !== hoje) {
    e.ultimoAviso = hoje
    avisar(`Check-up meu: ${resumoDaSaude([...graves, ...outros])}`, graves.length > 0)
  }
  // Versão nova: avisa uma vez por versão
  if (r.atrasadas.length && e.avisoVersao !== r.atrasadas[0]) {
    e.avisoVersao = r.atrasadas[0]
    avisar(`Tenho ${r.atrasadas.length === 1 ? 'uma melhoria nova' : `${r.atrasadas.length} melhorias novas`} esperando (${r.atrasadas.slice(0, 3).join('; ')}). Quando quiser, diga "pode se atualizar".`, false)
  }
  salvar(e)
}

export function iniciarAutocuidado(o: { avisar(texto: string, serio: boolean): void; log(t: string): void }): void {
  avisar = o.avisar
  log = o.log
  const vai = () => void rodar().catch((e) => log(`autocuidado: ${(e as Error).message}`))
  setTimeout(vai, 3 * 60_000)
  setInterval(vai, 4 * 3600_000)
}
