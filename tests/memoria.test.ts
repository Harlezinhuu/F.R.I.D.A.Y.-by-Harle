// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checarFato, ehRepetido, encontrarPorTrecho, paraPrompt, type Fato } from '../src/main/logica/memoria.ts'

const f = (texto: string, criadoEm = '2026-10-23T00:00:00Z'): Fato => ({ id: texto, texto, categoria: 'gosto', criadoEm })

test('aceita fatos comuns', () => {
  assert.equal(checarFato('Gosta de café sem açúcar').ok, true)
  assert.equal(checarFato('Está fazendo um bot de Discord chamado Harle Bot').ok, true)
})

test('recusa segredos e documentos', () => {
  for (const t of ['minha senha do email é banana123', 'meu PIN é 4321', 'meu cpf é 123.456.789-00',
    'a chave é AIzaSyAbcdefghijklmnop', 'cartão de crédito 4111 1111 1111 1111', 'token sk-abcdefghijklmnop']) {
    assert.equal(checarFato(t).ok, false, t)
  }
})

test('recusa vazio e longo demais', () => {
  assert.equal(checarFato('').ok, false)
  assert.equal(checarFato('a'.repeat(201)).ok, false)
})

test('detecta repetidos ignorando acentos e caixa', () => {
  const lista = [f('Gosta de café sem açúcar')]
  assert.ok(ehRepetido('gosta de cafe sem acucar', lista))
  assert.equal(ehRepetido('Gosta de chá', lista), null)
})

test('encontra por trecho', () => {
  const lista = [f('Gosta de café sem açúcar'), f('Torce para o Corinthians')]
  assert.equal(encontrarPorTrecho('café', lista).length, 1)
  assert.equal(encontrarPorTrecho('corinthians', lista)[0].texto, 'Torce para o Corinthians')
  assert.equal(encontrarPorTrecho('', lista).length, 0)
})

test('prompt vem do mais novo e respeita o limite', () => {
  const lista = [f('antigo', '2026-01-01T00:00:00Z'), f('novo', '2026-10-01T00:00:00Z')]
  assert.ok(paraPrompt(lista).startsWith('- (gosto) novo'))
  assert.equal(paraPrompt(lista, 18), '- (gosto) novo')
})
