import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sincronia, normalizar, bate, ehAlerta, escolherDestaques, termoFalado } from '../src/renderer/src/explicacao/palavras.ts'

test('normaliza acentos e hífens', () => {
  assert.equal(normalizar('Escondê-la'), 'escondela')
  assert.equal(normalizar('VERSÕES'), 'versoes')
})

test('mesma raiz bate, palavras curtas diferentes não', () => {
  assert.ok(bate('investigar', 'investigacao'))
  assert.ok(bate('verdade', 'verdades'))
  assert.ok(!bate('casa', 'caso'))
  assert.ok(!bate('esconder', 'escola'))
})

test('acompanha a fala em pedaços e só solta a palavra quando ela termina', () => {
  const s = new Sincronia(['esconder', 'verdade', 'versões contraditórias'], ['esconder'])
  let texto = 'Eu tentaria escon'
  assert.deepEqual(s.consumir(texto), [])
  texto += 'der a '
  const a = s.consumir(texto)
  assert.equal(a.length, 1)
  assert.equal(a[0].palavra, 'ESCONDER')
  assert.equal(a[0].alerta, true)
  texto += 'verdade criando versões contraditórias.'
  const b = s.consumir(texto)
  assert.deepEqual(b.map((d) => d.palavra), ['VERDADE', 'VERSÕES CONTRADITÓRIAS'])
  assert.equal(b[0].alerta, false)
  assert.equal(s.dito, 3)
})

test('pula uma palavra que ela não disse', () => {
  const s = new Sincronia(['enterrar', 'provas', 'ninguém'], [], false)
  const r = s.consumir('Sem provas, ninguém acredita. ')
  assert.deepEqual(r.map((d) => d.palavra), ['PROVAS', 'NINGUÉM'])
})

test('sem lista, escolhe a palavra forte de cada frase terminada', () => {
  const s = new Sincronia([])
  assert.deepEqual(s.consumir('O Apollo 11 pousou na Lua em'), [])
  const r = s.consumir('O Apollo 11 pousou na Lua em 1969. Foi transmitido para o mundo inteiro. ')
  assert.equal(r.length, 2)
  assert.ok(r.every((d) => d.indice === -1))
  assert.ok(!r.some((d) => ['O', 'NA', 'EM', 'PARA'].includes(d.palavra)))
})

test('palavras de alerta ficam vermelhas sozinhas', () => {
  assert.ok(ehAlerta('PROIBIDO'))
  assert.ok(ehAlerta('enterrar'))
  assert.ok(!ehAlerta('original'))
})

test('destaques ignoram palavras vazias e já usadas', () => {
  const d = escolherDestaques('Então basicamente ele escondeu os documentos originais', 2, new Set(['documentos']))
  assert.ok(!d.includes('basicamente'))
  assert.ok(!d.includes('documentos'))
  assert.ok(d.length >= 1)
})

test('termo da imagem falado', () => {
  assert.ok(termoFalado('Torre Eiffel', 'ela fica na torre eiffel, em Paris'))
  assert.ok(!termoFalado('Torre Eiffel', 'ela fica em Londres'))
})

test('expressão de duas palavras quebrada entre pedaços', () => {
  const s = new Sincronia(['nenhuma prova'], [], false)
  assert.deepEqual(s.consumir('Sem nenhuma '), [])
  assert.deepEqual(s.consumir('Sem nenhuma prova, ').map((d) => d.palavra), ['NENHUMA PROVA'])
})

test('palavra que nunca vem é pulada depois de duas frases', () => {
  const s = new Sincronia(['satélite', 'órbita'], [], false)
  assert.deepEqual(s.consumir('Primeiro isso. Depois aquilo. '), [])
  assert.deepEqual(s.consumir('Primeiro isso. Depois aquilo. Ela gira em órbita. ').map((d) => d.palavra), ['ÓRBITA'])
})
