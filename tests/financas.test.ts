// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Finanças (lançamentos, avisos do banco, orçamento) e a planilha .xlsx feita na mão.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FINANCAS_VAZIO, acharLancamento, alertasDeOrcamento, categorizar, lerAvisoDeBanco, lerValor, resumoDoMes, resumoEmTexto, type Lancamento } from '../src/main/logica/financas.ts'
import { celulaDoTexto, crc32, formatoDaColuna, letraDaColuna, planilhaXlsx, serialDaData, traduzirFormula } from '../src/main/logica/xlsx.ts'

const quando = Date.parse('2026-11-04T15:30:00')

test('valores em real e categorias', () => {
  assert.equal(lerValor('R$ 1.234,56'), 1234.56)
  assert.equal(lerValor('45,9'), 45.9)
  assert.equal(lerValor('1.200'), 1200)
  assert.equal(lerValor('R$ 37'), 37)
  assert.equal(lerValor('sem número'), null)
  assert.equal(categorizar('iFood'), 'comida')
  assert.equal(categorizar('Uber Trip'), 'transporte')
  assert.equal(categorizar('Drogasil'), 'saúde')
  assert.equal(categorizar('Netflix.com'), 'assinaturas')
  assert.equal(categorizar('Hostinger'), 'trabalho')
  assert.equal(categorizar('coisa qualquer'), 'outros')
  assert.equal(categorizar('Entrada do site da padaria', 'entrada'), 'trabalho')
})

test('avisos do banco: compra, Pix enviado e recebido; fatura, limite e recusa ficam de fora', () => {
  const nu = lerAvisoDeBanco('Compra aprovada', 'Compra de R$ 45,90 APROVADA em PADARIA SOL LTDA para o cartão com final 1234.', quando)!
  assert.deepEqual([nu.tipo, nu.valor, nu.descricao, nu.categoria, nu.data], ['saida', 45.9, 'Padaria Sol', 'comida', '2026-11-04'])
  assert.ok(!JSON.stringify(nu).includes('1234'), 'número do cartão não fica')
  const itau = lerAvisoDeBanco('Itaú', 'Compra aprovada no seu cartão final 9876 de R$ 120,00 em UBER *TRIP.', quando)!
  assert.equal(itau.valor, 120)
  assert.equal(itau.categoria, 'transporte')
  const enviado = lerAvisoDeBanco('Pix enviado', 'Você enviou um Pix de R$ 50,00 para MARIA SOUZA', quando)!
  assert.deepEqual([enviado.tipo, enviado.descricao], ['saida', 'Pix para Maria Souza'])
  const recebido = lerAvisoDeBanco('Pix recebido', 'Você recebeu um Pix de R$ 750,00 de JOAO DA SILVA', quando)!
  assert.deepEqual([recebido.tipo, recebido.valor, recebido.descricao, recebido.categoria], ['entrada', 750, 'Pix de Joao Da Silva', 'pix recebido'])
  for (const [t, x] of [['Fatura fechada', 'Sua fatura fechou em R$ 1.200,00'], ['Limite', 'Seu limite disponível é de R$ 3.000'], ['Compra recusada', 'Compra de R$ 99,00 recusada em LOJA X'], ['Oferta', 'Empréstimo pré-aprovado de R$ 5.000'], ['Nubank', 'Você tem uma nova mensagem']]) {
    assert.equal(lerAvisoDeBanco(t, x, quando), null, x)
  }
  assert.equal(lerAvisoDeBanco('Compra aprovada', 'Compra de R$ 45,90 APROVADA em PADARIA SOL', quando)!.chave, lerAvisoDeBanco('Compra aprovada', 'Compra de R$ 45,90 APROVADA em PADARIA SOL', quando + 1000)!.chave, 'mesma compra, mesma chave')
})

const l = (data: string, valor: number, tipo: 'entrada' | 'saida', descricao: string, categoria: string): Lancamento => ({ id: `${data}${descricao}`, data, valor, tipo, descricao, categoria, origem: 'voz' })
const ls = [
  l('2026-11-01', 1500, 'entrada', 'Entrada site Padaria', 'trabalho'),
  l('2026-11-02', 300, 'saida', 'Mercado', 'mercado'),
  l('2026-11-03', 450, 'saida', 'iFood', 'comida'),
  l('2026-11-04', 90, 'saida', 'Uber', 'transporte'),
  l('2026-10-30', 999, 'saida', 'Mês passado', 'compras')
]

test('resumo do mês, limite por categoria e achar lançamento', () => {
  const r = resumoDoMes(ls, '2026-11', { comida: 500, lazer: 200 })
  assert.deepEqual([r.entradas, r.saidas, r.saldo, r.quantos], [1500, 840, 660, 4])
  assert.deepEqual(r.porCategoria.map((c) => c.categoria), ['comida', 'mercado', 'transporte', 'lazer'])
  assert.equal(r.porCategoria[0].pct, 90)
  assert.match(resumoEmTexto(r, 'novembro'), /entrou R\$ 1\.500,00, saiu R\$ 840,00, sobrou R\$ 660,00\. Onde foi mais: comida R\$ 450,00 \(90% do limite\)/)
  const f = { ...FINANCAS_VAZIO, lancamentos: ls, orcamento: { comida: 500, mercado: 300 } }
  const al = alertasDeOrcamento(f, '2026-11')
  assert.deepEqual(al.map((a) => [a.categoria, a.chave]), [['comida', '2026-11|comida|80'], ['mercado', '2026-11|mercado|100']])
  assert.equal(alertasDeOrcamento({ ...f, avisados: al.map((a) => a.chave) }, '2026-11').length, 0, 'avisa uma vez só')
  assert.equal(acharLancamento(ls, 'o do ifood')?.valor, 450)
  assert.equal(acharLancamento(ls, 'o de 90 reais')?.descricao, 'Uber')
  assert.equal(acharLancamento(ls, 'o último')?.descricao, 'Mês passado')
})

test('planilha: zip válido, células, datas, fórmulas em português e formatos', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  assert.deepEqual([letraDaColuna(0), letraDaColuna(25), letraDaColuna(26), letraDaColuna(701)], ['A', 'Z', 'AA', 'ZZ'])
  assert.equal(serialDaData(new Date(2026, 10, 4)), 46330)
  assert.equal(celulaDoTexto('R$ 1.234,50'), 1234.5)
  assert.equal(celulaDoTexto('-12,5'), -12.5)
  assert.equal(celulaDoTexto('15%'), 0.15)
  assert.equal(celulaDoTexto('0011'), 11)
  assert.equal(celulaDoTexto('Padaria'), 'Padaria')
  assert.ok(celulaDoTexto('04/11/2026') instanceof Date)
  assert.deepEqual(celulaDoTexto('=SOMA(B2:B9;0,5)'), { f: 'SUM(B2:B9,0.5)' })
  assert.equal(traduzirFormula('SE(A1>1;"a;b";MÉDIA(C1:C3))'), 'IF(A1>1,"a;b",AVERAGE(C1:C3))')
  assert.equal(formatoDaColuna('Valor', [10, 20]), 'moeda')
  assert.equal(formatoDaColuna('Dia', [new Date()]), 'data')
  const z = planilhaXlsx([{ nome: 'Gastos: <nov>', linhas: [['Data', 'Valor'], [new Date(2026, 10, 4), 45.9], ['Total', { f: 'SUM(B2:B2)' }]], formatos: ['data', 'moeda'], destaque: [2] }])
  const dv = new DataView(z.buffer)
  assert.equal(dv.getUint32(0, true), 0x04034b50)
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50)
  assert.equal(dv.getUint16(z.length - 22 + 10, true), 6, '6 arquivos no zip')
  const texto = new TextDecoder().decode(z)
  assert.match(texto, /<sheet name="Gastos  &lt;nov&gt;"/)
  assert.match(texto, /<c r="A2" s="3"><v>46330<\/v><\/c><c r="B2" s="2"><v>45\.9<\/v><\/c>/)
  assert.match(texto, /<c r="B3" s="7"><f>SUM\(B2:B2\)<\/f><\/c>/)
  assert.match(texto, /<pane ySplit="1"/)
})
