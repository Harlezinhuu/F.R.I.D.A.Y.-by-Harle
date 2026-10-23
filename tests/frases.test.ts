import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cortarFrases } from '../src/renderer/src/voz/frases.ts'

test('corta frases completas e guarda o resto', () => {
  const r = cortarFrases('O Spotify já está aberto. Agora vou colocar a playlist de foco')
  assert.deepEqual(r.frases, ['O Spotify já está aberto.'])
  assert.equal(r.resto, 'Agora vou colocar a playlist de foco')
})

test('frase curta espera a próxima', () => {
  const r = cortarFrases('Feito. O volume está em trinta por cento. E')
  assert.deepEqual(r.frases, ['Feito. O volume está em trinta por cento.'])
  assert.equal(r.resto, 'E')
})

test('frase curta sozinha fica no resto', () => {
  const r = cortarFrases('Feito. ')
  assert.deepEqual(r.frases, [])
  assert.equal(r.resto, 'Feito. ')
})
