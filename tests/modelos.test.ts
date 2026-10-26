// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharNasa, acharArquivo, validarPrimitivas, nomeNasa, semHtml } from '../src/main/logica/modelos.ts'
import { NASA_MODELOS } from '../src/main/dados/nasa.ts'

const nasa = (...t: string[]) => { const r = acharNasa(t, NASA_MODELOS); return r ? nomeNasa(r) : null }

test('NASA: acha pelo nome em inglês', () => {
  assert.equal(nasa('Hubble Space Telescope'), 'Hubble Space Telescope (A)')
  assert.equal(nasa('Saturn V'), 'Saturn V')
  assert.equal(nasa('Perseverance'), 'Mars 2020 Perseverance Rover')
  assert.match(nasa('International Space Station')!, /^International Space Station \(ISS\)/)
})

test('NASA: acha pelo jeito de falar em português', () => {
  assert.match(nasa('estação espacial internacional')!, /International Space Station/)
  assert.match(nasa('o ônibus espacial')!, /^Space Shuttle/)
  assert.equal(nasa('módulo lunar'), 'Apollo Lunar Module')
  assert.equal(nasa('asteroide Bennu'), '1999 RQ36 asteroid')
})

test('NASA: prefere a versão inteira e não inventa', () => {
  assert.equal(nasa('Stardust'), 'Stardust')
  assert.equal(nasa('Cassini Huygens'), 'Cassini-Huygens (A)')
  assert.equal(nasa('Ferrari'), null)
  assert.equal(nasa('carro'), null)
})

test('seus arquivos: acha pelo nome falado', () => {
  const arquivos = ['motor v8.glb', 'Engrenagem_planetaria.stl', 'capacete-final.obj']
  assert.equal(acharArquivo(['motor'], arquivos), 'motor v8.glb')
  assert.equal(acharArquivo(['engrenagem planetária'], arquivos), 'Engrenagem_planetaria.stl')
  assert.equal(acharArquivo(['avião'], arquivos), null)
})

test('peças da IA: só formas conhecidas e números no limite', () => {
  const r = validarPrimitivas([
    { peca: 'roda', forma: 'cilindro', posicao: [1, 0, 0], tamanho: [1, 0.2, 1], rotacao: [90, 0, 0] },
    { peca: 'x', forma: 'script', posicao: [0, 0, 0] },
    { peca: '<b>corpo</b>', forma: 'CAIXA', posicao: [0, 999, 'a'], tamanho: [-1, 2, 3] },
    'lixo'
  ])
  assert.equal(r.length, 2)
  assert.deepEqual(r[0].rotacao, [90, 0, 0])
  assert.equal(r[1].forma, 'caixa')
  assert.equal(r[1].peca, 'bcorpo/b')
  assert.deepEqual(r[1].posicao, [0, 50, 0])
  assert.deepEqual(r[1].tamanho, [0.01, 2, 3])
  assert.deepEqual(validarPrimitivas(null), [])
})

test('autor sem HTML', () => {
  assert.equal(semHtml('<a href="x">Fulano &amp; Cia</a>'), 'Fulano & Cia')
})
