// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cortarFrases, cortarPrimeiro } from '../src/renderer/src/voz/frases.ts'

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

test('primeiro pedaço sai na vírgula', () => {
  const r = cortarPrimeiro('A GPU está em quarenta por cento, então dá para jogar tranquilo')
  assert.equal(r.pedaco, 'A GPU está em quarenta por cento,')
  assert.equal(r.resto, 'então dá para jogar tranquilo')
})

test('vírgula muito cedo não corta', () => {
  const r = cortarPrimeiro('Pronto, abri o Spotify. E a playlist')
  assert.equal(r.pedaco, 'Pronto, abri o Spotify.')
  assert.equal(r.resto, 'E a playlist')
})

test('sem pontuação, corta depois de uns 60 caracteres', () => {
  const r = cortarPrimeiro('a previsão para amanhã em são paulo é de muito sol com máxima de trinta graus e')
  assert.ok(r.pedaco && r.pedaco.length <= 60 && r.pedaco.length > 25)
  assert.equal(`${r.pedaco} ${r.resto}`, 'a previsão para amanhã em são paulo é de muito sol com máxima de trinta graus e')
})

test('texto curto espera', () => {
  assert.equal(cortarPrimeiro('Abrindo o').pedaco, null)
})
