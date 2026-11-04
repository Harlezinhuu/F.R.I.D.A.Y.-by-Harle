// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Planilhas prontas (Documentos > FRIDAY > Planilhas): gastos do mês, clientes, tabela de preços,
// ou qualquer uma que você pedir ("faz uma planilha de estudos da semana"), com as colunas e as
// linhas que a IA montar. Abre no Excel (ou no que estiver instalado) assim que fica pronta.

import { app, shell } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { celulaDoTexto, formatoDaColuna, letraDaColuna, planilhaXlsx, type Aba, type Celula, type Formato } from './logica/xlsx'
import { doMes } from './logica/financas'
import { MANUTENCAO, PACOTES, minimoDoPacote, nomeDaEtapa } from './logica/negocio'
import { lerFinancas, mesDe, nomeDoMes } from './financas'
import { lerClientes, regras } from './negocio'

export const pastaPlanilhas = (): string => join(app.getPath('documents'), 'FRIDAY', 'Planilhas')

const nomeDeArquivo = (s: string): string => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Planilha'

/** Salva e abre. Devolve o caminho. */
export async function salvarPlanilha(titulo: string, abas: Aba[], abrir = true): Promise<string> {
  mkdirSync(pastaPlanilhas(), { recursive: true })
  const arq = join(pastaPlanilhas(), `${nomeDeArquivo(titulo)}.xlsx`)
  writeFileSync(arq, planilhaXlsx(abas))
  if (abrir) {
    const erro = await shell.openPath(arq)
    if (erro) throw new Error(`A planilha foi salva em ${arq}, mas não abriu: ${erro}`)
  }
  return arq
}

const data = (iso: string): Date | null => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : null)

/** Gastos e entradas do mês, com o resumo por categoria em fórmulas (mexeu num valor, o resumo acompanha). */
export function abasDeGastos(mes = mesDe()): Aba[] {
  const f = lerFinancas()
  const ls = doMes(f.lancamentos, mes).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
  const n = ls.length + 1
  const lanc: Aba = {
    nome: 'Lançamentos', formatos: ['data', '', '', '', 'moeda'],
    linhas: [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor'], ...ls.map((l): Celula[] => [data(l.data), l.tipo === 'entrada' ? 'Entrada' : 'Saída', l.descricao, l.categoria, l.valor])]
  }
  const cats = [...new Set([...ls.filter((l) => l.tipo === 'saida').map((l) => l.categoria), ...Object.keys(f.orcamento)])].sort()
  const L = "'Lançamentos'!"
  const porCat: Aba = {
    nome: 'Por categoria', formatos: ['', 'moeda', 'moeda', 'pct'],
    destaque: [cats.length + 1, cats.length + 2, cats.length + 3],
    linhas: [
      ['Categoria', 'Gasto', 'Limite do mês', '% do limite'],
      ...cats.map((c, i): Celula[] => [c, { f: `SUMIFS(${L}$E$2:$E$${Math.max(2, n)},${L}$D$2:$D$${Math.max(2, n)},A${i + 2},${L}$B$2:$B$${Math.max(2, n)},"Saída")` }, f.orcamento[c] ?? null, { f: `IF(C${i + 2}>0,B${i + 2}/C${i + 2},"")` }]),
      ['Total gasto', { f: `SUM(B2:B${cats.length + 1})` }, { f: `SUM(C2:C${cats.length + 1})` }, null],
      ['Entrou', { f: `SUMIF(${L}$B$2:$B$${Math.max(2, n)},"Entrada",${L}$E$2:$E$${Math.max(2, n)})` }, null, null],
      ['Sobrou', { f: `B${cats.length + 3}-B${cats.length + 2}` }, null, null]
    ]
  }
  return [porCat, lanc]
}

export function abasDeClientes(): Aba[] {
  const cs = lerClientes().filter((c) => c.etapa !== 'arquivado')
  const linhas: Celula[][] = [['Loja', 'Segmento', 'Etapa', 'Pacote', 'Valor', 'Mensalidade', 'Prazo', 'Recebido', 'A receber', 'WhatsApp', 'Site']]
  for (const c of cs) {
    const recebido = c.pagamentos.filter((p) => p.pago).reduce((s, p) => s + p.valor, 0)
    const aberto = c.pagamentos.filter((p) => !p.pago).reduce((s, p) => s + p.valor, 0)
    linhas.push([c.nome, c.segmento, nomeDaEtapa(c.etapa), PACOTES.find((p) => p.id === c.pacote)?.nome ?? '', c.valor || null, c.mensalidade || null, data(c.prazo), recebido || null, aberto || null, c.contato.whatsapp, c.site])
  }
  const k = linhas.length
  if (cs.length) linhas.push(['Total', '', '', '', { f: `SUM(E2:E${k})` }, { f: `SUM(F2:F${k})` }, null, { f: `SUM(H2:H${k})` }, { f: `SUM(I2:I${k})` }, '', ''])
  return [{ nome: 'Clientes', linhas, formatos: ['', '', '', '', 'moeda', 'moeda', 'data', 'moeda', 'moeda', '', ''], destaque: cs.length ? [k] : [] }]
}

export function abasDePrecos(): Aba[] {
  const r = regras()
  return [{
    nome: 'Tabela de preços', formatos: ['', '', 'moeda', 'moeda', 'moeda', 'inteiro'], larguras: [16, 60, 14, 14, 18, 14],
    linhas: [
      ['Pacote', 'O que inclui', 'Preço base', 'Até', `Mínimo (−${Math.round(r.descontoMaximo * 100)}%)`, 'Dias de trabalho'],
      ...PACOTES.map((p): Celula[] => [p.nome, p.inclui, p.base, p.maximo, minimoDoPacote(p, r), p.diasDeTrabalho]),
      ['Manutenção (mês)', MANUTENCAO.inclui, MANUTENCAO.minimo, MANUTENCAO.maximo, MANUTENCAO.minimo, null],
      [],
      [`Entrada de ${r.entrada}% para começar, o resto na entrega. ${r.rodadas} rodadas de ajustes. Até ${r.sitesPorMes} sites por mês.`]
    ]
  }]
}

/** Planilha montada pela IA: colunas + linhas em texto (números, datas e fórmulas são reconhecidos). */
export function abaLivre(nome: string, colunas: string[], linhas: unknown[][], total: boolean): Aba {
  const corpo = linhas.slice(0, 5000).map((l) => colunas.map((_, j) => celulaDoTexto(Array.isArray(l) ? l[j] : null)))
  const formatos: Formato[] = colunas.map((c, j) => formatoDaColuna(c, corpo.map((l) => l[j])))
  const out: Celula[][] = [colunas.map(String), ...corpo]
  const destaque: number[] = []
  if (total && corpo.length) {
    const fim = corpo.length + 1
    out.push(colunas.map((_, j) => (j === 0 ? 'Total' : corpo.some((l) => typeof l[j] === 'number') && formatos[j] !== 'pct' && formatos[j] !== 'data' ? { f: `SUM(${letraDaColuna(j)}2:${letraDaColuna(j)}${fim})` } : null)))
    destaque.push(fim)
  }
  return { nome, linhas: out, formatos, destaque }
}

export const tituloDosGastos = (mes: string): string => `Gastos de ${nomeDoMes(mes)}`
