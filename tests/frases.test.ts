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

import { porExtenso, numerosParaFala } from '../src/renderer/src/voz/frases.ts'

test('números por extenso', () => {
  assert.equal(porExtenso(0), 'zero')
  assert.equal(porExtenso(19), 'dezenove')
  assert.equal(porExtenso(21), 'vinte e um')
  assert.equal(porExtenso(100), 'cem')
  assert.equal(porExtenso(101), 'cento e um')
  assert.equal(porExtenso(330), 'trezentos e trinta')
  assert.equal(porExtenso(1000), 'mil')
  assert.equal(porExtenso(1100), 'mil e cem')
  assert.equal(porExtenso(1889), 'mil oitocentos e oitenta e nove')
  assert.equal(porExtenso(2005), 'dois mil e cinco')
  assert.equal(porExtenso(2026), 'dois mil e vinte e seis')
  assert.equal(porExtenso(1500000), 'um milhão e quinhentos mil')
  assert.equal(porExtenso(1250000), 'um milhão duzentos e cinquenta mil')
})

test('troca números no texto', () => {
  assert.equal(numerosParaFala('São Paulo: 19 graus, 100% de chance de chuva.'), 'São Paulo: dezenove graus, cem por cento de chance de chuva.')
  assert.equal(numerosParaFala('Lembrete às 9:30 e às 15:00.'), 'Lembrete às nove e trinta e às quinze horas.')
  assert.equal(numerosParaFala('Está 19,5°C.'), 'Está dezenove vírgula cinco graus.')
  assert.equal(numerosParaFala('Inaugurada em 1889, com 330 metros.'), 'Inaugurada em mil oitocentos e oitenta e nove, com trezentos e trinta metros.')
  assert.equal(numerosParaFala('Custa 1.500 reais.'), 'Custa mil e quinhentos reais.')
})
