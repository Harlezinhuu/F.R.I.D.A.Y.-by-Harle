// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O negócio de sites para lojas, do lado do PC: cada cliente numa pasta (Documentos > FRIDAY >
// Clientes > nome da loja), as pendências que esperam o seu "pode", o diário do que ela fez
// sozinha e o vigia que, de hora em hora, vê o que precisa ser feito com cada cliente.
// As regras ficam em src/main/logica/negocio.ts e src/main/logica/autonomia.ts.

import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { variavel } from './config'
import { mandarWhatsApp } from './whatsweb'
import { emAndamento, numeroWhats } from '../shared/consulta'
import { consultaAtual } from './consultas'
import { novaPendencia, vencidas, type Pendencia, type TipoDeAcao, NIVEIS } from './logica/autonomia'
import { REGRAS_PADRAO, novoCliente, proximasAcoes, slugDoCliente, type Acao, type Cliente, type Regras } from './logica/negocio'

// ---------- Quem é você no negócio (do .env) ----------

export interface Empresa { nome: string; responsavel: string; documento: string; cidade: string; whatsapp: string; email: string; site: string; pix: string }
export function empresa(): Empresa {
  return {
    nome: variavel('FRIDAY_NEGOCIO_NOME') || 'Harle',
    responsavel: variavel('FRIDAY_NEGOCIO_RESPONSAVEL') || 'Ahmad Mourad',
    documento: variavel('FRIDAY_NEGOCIO_DOCUMENTO'),
    cidade: variavel('FRIDAY_NEGOCIO_CIDADE') || variavel('FRIDAY_CIDADE'),
    whatsapp: variavel('FRIDAY_NEGOCIO_WHATSAPP'),
    email: variavel('FRIDAY_NEGOCIO_EMAIL'),
    site: variavel('FRIDAY_NEGOCIO_SITE'),
    pix: variavel('FRIDAY_NEGOCIO_PIX')
  }
}
export function regras(): Regras {
  const n = Number(variavel('FRIDAY_SITES_POR_MES'))
  return { ...REGRAS_PADRAO, ...(Number.isInteger(n) && n >= 1 && n <= 30 ? { sitesPorMes: n } : {}) }
}

// ---------- Clientes (uma pasta por loja) ----------

export const pastaClientes = (): string => join(app.getPath('documents'), 'FRIDAY', 'Clientes')
export const pastaDoCliente = (id: string): string => join(pastaClientes(), id)
const arquivoCliente = (id: string): string => join(pastaDoCliente(id), 'cliente.json')

export function lerClientes(): Cliente[] {
  if (!existsSync(pastaClientes())) return []
  const out: Cliente[] = []
  for (const d of readdirSync(pastaClientes(), { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    try { out.push({ ...novoCliente(d.name), ...JSON.parse(readFileSync(arquivoCliente(d.name), 'utf8')), id: d.name }) } catch { /* pasta sem ficha */ }
  }
  return out.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
}

export function salvarCliente(c: Cliente, evento?: string): Cliente {
  const agora = new Date().toISOString()
  c.atualizadoEm = agora
  if (evento) c.historico = [...c.historico, { quando: agora, texto: evento }].slice(-200)
  mkdirSync(pastaDoCliente(c.id), { recursive: true })
  const tmp = `${arquivoCliente(c.id)}.tmp`
  writeFileSync(tmp, JSON.stringify(c, null, 2), 'utf8')
  renameSync(tmp, arquivoCliente(c.id))
  return c
}

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Acha o cliente pelo que ele falou ("a padaria do João", "pet shop"). */
export function acharCliente(alvo: string): Cliente | null {
  const t = norm(alvo)
  if (!t) return null
  const lista = lerClientes()
  return lista.find((c) => c.id === slugDoCliente(alvo)) ?? lista.find((c) => norm(c.nome) === t)
    ?? lista.find((c) => norm(c.nome).includes(t) || t.includes(norm(c.nome)))
    ?? lista.find((c) => t.split(' ').filter((p) => p.length > 3).some((p) => norm(`${c.nome} ${c.contato.responsavel} ${c.segmento}`).includes(p))) ?? null
}

export function criarCliente(nome: string): { cliente: Cliente; novo: boolean } {
  const ja = acharCliente(nome)
  if (ja && norm(ja.nome) === norm(nome)) return { cliente: ja, novo: false }
  let c = novoCliente(nome)
  let n = 2
  while (existsSync(pastaDoCliente(c.id))) c = { ...c, id: `${slugDoCliente(nome)}-${n++}` }
  for (const sub of ['fotos', 'documentos', 'relatorios']) mkdirSync(join(pastaDoCliente(c.id), sub), { recursive: true })
  return { cliente: salvarCliente(c), novo: true }
}

// ---------- Pendências e diário ----------

interface Estado { pendencias: Pendencia[]; diario: { quando: string; texto: string }[]; ultimoDiario: string }
const arquivoEstado = (): string => join(app.getPath('userData'), 'negocio.json')
function lerEstado(): Estado {
  try { if (existsSync(arquivoEstado())) return { pendencias: [], diario: [], ultimoDiario: '', ...JSON.parse(readFileSync(arquivoEstado(), 'utf8')) } } catch { /* refaz */ }
  return { pendencias: [], diario: [], ultimoDiario: '' }
}
function salvarEstado(e: Estado): void {
  try { writeFileSync(arquivoEstado(), JSON.stringify({ ...e, pendencias: e.pendencias.slice(-200), diario: e.diario.slice(-500) }, null, 2)) } catch { /* sem disco */ }
}

export const pendencias = (): Pendencia[] => lerEstado().pendencias
export function anotarNoDiario(texto: string): void {
  const e = lerEstado()
  e.diario.push({ quando: new Date().toISOString(), texto })
  salvarEstado(e)
}

/** Guarda uma pendência (sem repetir uma igual que ainda está aberta). */
export function pedirPermissao(acao: TipoDeAcao, texto: string, extra: Partial<Pendencia> = {}): Pendencia {
  const e = lerEstado()
  const igual = e.pendencias.find((p) => p.estado === 'aguardando' && p.acao === acao && p.cliente === extra.cliente && p.texto === texto)
  if (igual) return igual
  const p = novaPendencia(acao, texto, new Date(), extra)
  e.pendencias.push(p)
  salvarEstado(e)
  opcoes.avisar(`Preciso do seu "pode": ${texto}`, NIVEIS[acao] === 'sempre')
  return p
}

export function resolverPendencia(id: string, aprovada: boolean): Pendencia | null {
  const e = lerEstado()
  const p = e.pendencias.find((x) => x.id === id)
  if (!p || p.estado !== 'aguardando') return null
  p.estado = aprovada ? 'aprovada' : 'recusada'
  p.resolvidaEm = new Date().toISOString()
  salvarEstado(e)
  return p
}

/** O diário do dia: o que ela fez sozinha e o que ainda espera você. */
export function diarioDeHoje(agora = new Date()): { feitos: string[]; esperando: number } {
  const e = lerEstado()
  const dia = agora.toISOString().slice(0, 10)
  return { feitos: e.diario.filter((d) => d.quando.startsWith(dia)).map((d) => d.texto), esperando: e.pendencias.filter((p) => p.estado === 'aguardando').length }
}

// ---------- Mandar mensagem para um cliente ----------

let opcoes: { avisar(texto: string, serio: boolean): void; log(t: string): void; qr(): void } = { avisar() {}, log() {}, qr() {} }

export async function mensagemParaCliente(c: Cliente, texto: string): Promise<void> {
  const numero = numeroWhats(c.contato.whatsapp || c.contato.telefone)
  if (!numero) throw new Error(`Não tenho o WhatsApp da ${c.nome}.`)
  // O WhatsApp Web da FRIDAY está no meio de uma consulta: não atrapalha
  if (emAndamento(consultaAtual())) throw new Error('o WhatsApp está ocupado marcando uma consulta')
  await mandarWhatsApp(numero, texto, () => opcoes.qr())
}

/** Executa o que foi aprovado (ou o plano seguro de uma pendência que venceu). */
export async function executarPendencia(p: Pendencia, comoPlanoSeguro = false): Promise<string> {
  const c = p.cliente ? lerClientes().find((x) => x.id === p.cliente) ?? null : null
  if (p.mensagem && c) {
    await mensagemParaCliente(c, p.mensagem)
    const agora = new Date().toISOString()
    if (p.acao === 'pedir_indicacao') c.indicacaoPedidaEm = agora
    c.ultimoLembreteEm = agora
    salvarCliente(c, `${comoPlanoSeguro ? 'Sem resposta sua a tempo; ' : ''}mensagem enviada: ${p.texto}`)
    anotarNoDiario(`${comoPlanoSeguro ? '(plano seguro) ' : ''}${p.texto}: mensagem enviada para ${c.nome}.`)
    return `Mandei para ${c.nome}.`
  }
  return 'Aprovado.'
}

// ---------- O vigia de hora em hora ----------

const ACAO_PARA_TIPO: Record<Acao['tipo'], TipoDeAcao | null> = {
  cobrar_material: 'cobrar_material', lembrar_proposta: 'lembrar_proposta', pedir_depoimento: 'pedir_depoimento',
  pedir_indicacao: 'pedir_indicacao', cobrar_pagamento: 'cobrar_pagamento', emitir_nota: null, prazo_perto: null
}

async function passada(): Promise<void> {
  const agora = new Date()
  const nome = empresa().nome
  for (const c of lerClientes().filter((x) => x.etapa !== 'arquivado')) {
    for (const a of proximasAcoes(c, agora, nome)) {
      const tipo = ACAO_PARA_TIPO[a.tipo]
      if (!tipo) {
        // Avisos só para você (nota a emitir, prazo chegando): uma vez por dia
        const marca = `${a.tipo}:${c.id}:${agora.toISOString().slice(0, 10)}`
        const e = lerEstado()
        if (e.diario.some((d) => d.texto.endsWith(`[${marca}]`))) continue
        anotarNoDiario(`${a.texto} [${marca}]`)
        opcoes.avisar(a.texto, false)
        continue
      }
      if (NIVEIS[tipo] === 'livre' && a.mensagem) {
        try {
          await mensagemParaCliente(c, a.mensagem)
          const iso = agora.toISOString()
          c.ultimoLembreteEm = iso
          if (a.tipo === 'pedir_depoimento') c.depoimentoPedidoEm = iso
          salvarCliente(c, `Lembrete enviado: ${a.texto}`)
          anotarNoDiario(`Mandei um lembrete para ${c.nome}: ${a.texto}`)
        } catch (e) {
          // Sem WhatsApp conectado (ou sem número): vira pendência para você mandar
          pedirPermissao(tipo, `${a.texto} Não consegui mandar sozinha (${(e as Error).message}).`, { cliente: c.id, mensagem: a.mensagem })
        }
        continue
      }
      pedirPermissao(tipo, a.texto, {
        cliente: c.id, mensagem: a.mensagem,
        ...(NIVEIS[tipo] === 'pergunta' ? { planoSeguro: 'Mando a mensagem padrão' } : {})
      })
    }
  }
  // Pendências de "pergunta" que venceram: plano seguro
  const e = lerEstado()
  for (const p of vencidas(e.pendencias, agora)) {
    try {
      await executarPendencia(p, true)
      p.estado = 'plano_seguro'
      p.resolvidaEm = agora.toISOString()
    } catch (erro) {
      opcoes.log(`plano seguro ${p.id}: ${(erro as Error).message}`)
    }
  }
  const e2 = lerEstado()
  for (const p of e.pendencias.filter((x) => x.estado === 'plano_seguro')) {
    const alvo = e2.pendencias.find((x) => x.id === p.id)
    if (alvo) { alvo.estado = p.estado; alvo.resolvidaEm = p.resolvidaEm }
  }
  salvarEstado(e2)
}

/** Às 21h, ela conta o que fez sozinha no dia e o que ainda espera você. */
function diarioDaNoite(): void {
  const agora = new Date()
  const dia = agora.toISOString().slice(0, 10)
  const e = lerEstado()
  if (agora.getHours() < 21 || e.ultimoDiario === dia) return
  e.ultimoDiario = dia
  salvarEstado(e)
  const { feitos, esperando } = diarioDeHoje(agora)
  const limpos = feitos.map((f) => f.replace(/ \[[^\]]+\]$/, ''))
  if (!limpos.length && !esperando) return
  opcoes.avisar(`Resumo do dia do negócio: ${limpos.length ? `fiz sozinha ${limpos.length} ${limpos.length === 1 ? 'coisa' : 'coisas'} (${limpos.slice(0, 4).join('; ')})` : 'não precisei fazer nada sozinha'}${esperando ? `, e ${esperando} ${esperando === 1 ? 'coisa espera' : 'coisas esperam'} o seu "pode"` : ''}.`, false)
}

export function iniciarNegocio(o: typeof opcoes): void {
  opcoes = o
  const rodar = () => void passada().catch((e) => opcoes.log(`negócio: ${(e as Error).message}`))
  setTimeout(rodar, 3 * 60_000)
  setInterval(rodar, 60 * 60_000)
  setInterval(diarioDaNoite, 10 * 60_000)
}
