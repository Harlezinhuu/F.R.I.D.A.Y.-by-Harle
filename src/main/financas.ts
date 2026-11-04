// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Finanças do lado do PC: os lançamentos ficam só aqui (na pasta de dados do app, não nos
// Documentos), entram por voz, pelos avisos de compra do banco no celular (se você ligar) e pelos
// pagamentos dos clientes. Avisa quando uma categoria chega a 80% e a 100% do limite, e no dia 1
// faz o resumo do mês que passou. Ela anota e avisa; nunca paga nem mexe no banco.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FINANCAS_VAZIO, alertasDeOrcamento, categorizar, dataLocal, lerAvisoDeBanco, reais, resumoDoMes, resumoEmTexto,
  type Financas, type Lancamento, type TipoLancamento
} from './logica/financas'

const arquivo = (): string => join(app.getPath('userData'), 'financas.json')

export function lerFinancas(): Financas {
  try { if (existsSync(arquivo())) return { ...FINANCAS_VAZIO, ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch { /* recomeça */ }
  return { ...FINANCAS_VAZIO, lancamentos: [], orcamento: {}, avisados: [] }
}
const salvar = (f: Financas): void => writeFileSync(arquivo(), JSON.stringify({ ...f, avisados: f.avisados.slice(-200) }, null, 2))

const novoId = (): string => `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
export const mesDe = (d = new Date()): string => dataLocal(d).slice(0, 7)
export const nomeDoMes = (mes: string): string => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

let avisar: (texto: string, serio: boolean) => void = () => {}

/** Depois de anotar: avisa se alguma categoria chegou a 80% ou passou do limite. */
function conferirOrcamento(f: Financas): string {
  const frases: string[] = []
  for (const a of alertasDeOrcamento(f, mesDe())) {
    f.avisados.push(a.chave)
    frases.push(a.pct >= 100 ? `Você passou do limite de ${a.categoria} este mês (${a.pct}%).` : `${a.categoria[0].toUpperCase()}${a.categoria.slice(1)} já está em ${a.pct}% do limite do mês.`)
  }
  return frases.join(' ')
}

export function lancar(o: { valor: number; tipo: TipoLancamento; descricao: string; categoria?: string; data?: string; origem?: Lancamento['origem'] }): { lancamento: Lancamento; alerta: string } {
  const f = lerFinancas()
  const l: Lancamento = {
    id: novoId(), data: /^\d{4}-\d{2}-\d{2}$/.test(o.data ?? '') ? o.data! : dataLocal(new Date()), valor: Math.round(Math.abs(o.valor) * 100) / 100,
    tipo: o.tipo, descricao: o.descricao.trim().slice(0, 80) || (o.tipo === 'entrada' ? 'Entrada' : 'Gasto'),
    categoria: (o.categoria ?? '').trim().toLowerCase() || categorizar(o.descricao, o.tipo), origem: o.origem ?? 'voz'
  }
  f.lancamentos.push(l)
  const alerta = l.tipo === 'saida' ? conferirOrcamento(f) : ''
  salvar(f)
  return { lancamento: l, alerta }
}

/** Avisos de compra e Pix que o celular pegou do banco. Devolve quantos viraram lançamento. */
export function importarAvisos(avisos: { titulo?: unknown; texto?: unknown; quando?: unknown }[]): { novos: Lancamento[]; alerta: string } {
  const f = lerFinancas()
  const chaves = new Set(f.lancamentos.map((l) => l.chave).filter(Boolean))
  const novos: Lancamento[] = []
  for (const a of avisos.slice(0, 200)) {
    const quando = typeof a.quando === 'number' ? a.quando : Date.now()
    const l = lerAvisoDeBanco(String(a.titulo ?? '').slice(0, 200), String(a.texto ?? '').slice(0, 600), quando)
    if (!l || chaves.has(l.chave)) continue
    chaves.add(l.chave)
    const n: Lancamento = { ...l, id: novoId(), origem: 'celular' }
    f.lancamentos.push(n)
    novos.push(n)
  }
  const alerta = novos.length ? conferirOrcamento(f) : ''
  salvar(f)
  if (alerta) avisar(alerta, false)
  return { novos, alerta }
}

export function apagarLancamento(id: string): void {
  const f = lerFinancas()
  f.lancamentos = f.lancamentos.filter((l) => l.id !== id)
  salvar(f)
}

export function definirOrcamento(categoria: string, valor: number): Financas['orcamento'] {
  const f = lerFinancas()
  const c = categoria.trim().toLowerCase()
  if (valor > 0) f.orcamento[c] = Math.round(valor * 100) / 100
  else delete f.orcamento[c]
  salvar(f)
  return f.orcamento
}

export function resumo(mes = mesDe()): string {
  const f = lerFinancas()
  return resumoEmTexto(resumoDoMes(f.lancamentos, mes, f.orcamento), nomeDoMes(mes))
}

/** Pagamento de cliente que você confirmou: vira entrada em "trabalho". */
export function entradaDeCliente(cliente: string, descricao: string, valor: number): void {
  try { lancar({ valor, tipo: 'entrada', descricao: `${descricao} · ${cliente}`, categoria: 'trabalho', origem: 'cliente' }) } catch { /* sem disco */ }
}

/** No dia 1, o resumo do mês que passou (uma vez). */
function resumoDoMesPassado(): void {
  const agora = new Date()
  if (agora.getDate() > 2 || agora.getHours() < 9) return
  const f = lerFinancas()
  const passado = mesDe(new Date(agora.getFullYear(), agora.getMonth() - 1, 1))
  if (f.resumoMandado === passado) return
  const r = resumoDoMes(f.lancamentos, passado, f.orcamento)
  f.resumoMandado = passado
  salvar(f)
  if (r.quantos) avisar(`Fechamento de ${nomeDoMes(passado)}: ${resumoEmTexto(r, nomeDoMes(passado)).replace(/^Em [^:]+: /, '')} Se quiser, eu gero a planilha do mês.`, false)
}

export function iniciarFinancas(o: { avisar(texto: string, serio: boolean): void }): void {
  avisar = o.avisar
  setTimeout(resumoDoMesPassado, 6 * 60_000)
  setInterval(resumoDoMesPassado, 60 * 60_000)
}

export { reais }
