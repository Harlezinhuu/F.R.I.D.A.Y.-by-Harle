// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerCamadas, lerEstilo, altitudePorCaixa, montarHash, nodeServe } from '../src/main/logica/visao.ts'

test('entende as camadas faladas, com e sem acento', () => {
  const r = lerCamadas(['Aviões', 'satélite', 'barcos', 'furacões', 'aviões', 'unicórnios'])
  assert.deepEqual(r.chaves, ['avioes', 'satelites', 'navios', 'ciclones'])
  assert.deepEqual(r.desconhecidas, ['unicórnios'])
})

test('aceita camadas numa frase só', () => {
  assert.deepEqual(lerCamadas('aviões, terremotos e raios').chaves, ['avioes', 'terremotos', 'raios'])
  assert.deepEqual(lerCamadas(undefined).chaves, [])
})

test('estilos', () => {
  assert.equal(lerEstilo('visão noturna'), 'nvg')
  assert.equal(lerEstilo('Térmico'), 'flir')
  assert.equal(lerEstilo('qualquer'), null)
})

test('altitude: cidade perto, país longe', () => {
  const cidade = altitudePorCaixa(-23.8, -23.35, -46.83, -46.36) // São Paulo
  const pais = altitudePorCaixa(-33.8, 5.3, -73.99, -34.8) // Brasil
  assert.ok(cidade > 30_000 && cidade < 120_000, `cidade ${cidade}`)
  assert.ok(pais > 4_000_000, `país ${pais}`)
  assert.equal(altitudePorCaixa(48.8584, 48.8584, 2.2945, 2.2945), 2_500) // ponto: altitude mínima
})

test('link com câmera inclinada recua para o sul e leva as camadas', () => {
  const h = new URLSearchParams(montarHash({ lat: 35.68, lon: 139.76, alt: 20_000, estilo: 'nvg', camadas: ['avioes', 'satelites'] }))
  assert.equal(h.get('pitch'), '-40')
  assert.ok(Number(h.get('lat')) < 35.68)
  assert.equal(h.get('lon'), '139.76000')
  assert.equal(h.get('style'), 'nvg')
  assert.equal(h.get('v'), '2')
  assert.equal(h.get('l'), 'f.s')
})

test('link do planeta inteiro olha reto e sem camadas fixas', () => {
  const h = new URLSearchParams(montarHash({ lat: -14, lon: -52, alt: 18_000_000, estilo: 'normal', camadas: [] }))
  assert.equal(h.get('pitch'), '-90')
  assert.equal(h.get('lat'), '-14.00000')
  assert.equal(h.get('l'), null)
})

test('versões do Node aceitas pelo God\'s Eye View', () => {
  assert.equal(nodeServe('v24.14.0'), true)
  assert.equal(nodeServe('v24.22.0'), true)
  assert.equal(nodeServe('v26.1.0'), true)
  assert.equal(nodeServe('v24.13.1'), false)
  assert.equal(nodeServe('v25.2.0'), false)
  assert.equal(nodeServe('v22.11.0'), false)
  assert.equal(nodeServe('lixo'), false)
})
