import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarPassos, resumirPassos } from '../src/main/logica/rotinas.ts'

test('aceita passos com argumentos em JSON', () => {
  const v = validarPassos([
    { ferramenta: 'abrir_app', argumentos_json: '{"nome":"Chrome"}' },
    { ferramenta: 'volume', argumentos_json: '{"acao":"definir","valor":30}' },
    { ferramenta: 'dizer', argumentos_json: '{"texto":"Bom trabalho."}' }
  ])
  assert.equal(v.ok, true)
  if (v.ok) {
    assert.equal(v.perigosa, false)
    assert.equal(resumirPassos(v.passos), 'abrir Chrome, volume em 30, dizer "Bom trabalho."')
  }
})

test('marca rotina com fechar_app como perigosa e remove confirmado', () => {
  const v = validarPassos([{ ferramenta: 'fechar_app', argumentos: { nome: 'Discord', confirmado: true } }])
  assert.equal(v.ok && v.perigosa, true)
  if (v.ok) assert.equal('confirmado' in v.passos[0].argumentos, false)
})

test('recusa ferramentas fora da lista e passos ruins', () => {
  assert.equal(validarPassos([{ ferramenta: 'apagar_arquivo', argumentos: {} }]).ok, false)
  assert.equal(validarPassos([]).ok, false)
  assert.equal(validarPassos('não é json').ok, false)
  assert.equal(validarPassos([{ ferramenta: 'esperar', argumentos: { segundos: 600 } }]).ok, false)
  assert.equal(validarPassos([{ ferramenta: 'abrir_app', argumentos_json: '{quebrado' }]).ok, false)
  assert.equal(validarPassos(Array.from({ length: 16 }, () => ({ ferramenta: 'midia', argumentos: { acao: 'proxima' } }))).ok, false)
})
