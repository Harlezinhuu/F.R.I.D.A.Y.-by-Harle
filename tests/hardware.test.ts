// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caixa, cilindro, conferir, esfera, malha, mover, simplificar, soltos, subtrair, tetraedros } from '../hardware/sdf.mjs'
import { PECAS_NUCLEO } from '../hardware/nucleo.mjs'
import { PECAS_CAPACETE, MEDIDAS } from '../hardware/capacete.mjs'

test('malha de uma esfera fecha e tem o volume certo', () => {
  const c = conferir(malha(esfera(10), [[-12, -12, -12], [12, 12, 12]], 0.5))
  assert.equal(c.abertas, 0)
  assert.equal(c.demais, 0)
  assert.ok(Math.abs(c.volume - (4 / 3) * Math.PI * 1000) < 40, `volume ${c.volume}`)
})

test('simplificar mantém a peça fechada e quase com o mesmo volume', () => {
  const forma = subtrair(caixa([20, 12, 8], 1), cilindro(3, 20), mover(caixa([30, 3, 3]), [0, 0, 0]))
  const m = tetraedros(forma, [[-12, -8, -6], [12, 8, 6]], 0.4)
  const antes = conferir(soltos(m))
  simplificar(m, 0.05)
  const depois = conferir(soltos(m))
  assert.equal(depois.abertas, 0)
  assert.equal(depois.demais, 0)
  assert.ok(depois.triangulos < antes.triangulos / 5, `${antes.triangulos} -> ${depois.triangulos}`)
  assert.ok(Math.abs(depois.volume - antes.volume) / antes.volume < 0.01)
})

test('as peças cabem numa impressora de 220 × 220 × 250', () => {
  for (const p of [...PECAS_NUCLEO, ...PECAS_CAPACETE]) {
    const [[x0, y0, z0], [x1, y1, z1]] = p.caixa
    const lados = [x1 - x0, y1 - y0, z1 - z0]
    // Em pé (Y ou X para cima), a área da mesa usa os outros dois lados
    const altura = p.orientacao ? lados[0] : lados[1]
    const mesa = p.orientacao ? [lados[1], lados[2]] : [lados[0], lados[2]]
    assert.ok(altura <= 250 + 8 && Math.max(...mesa) <= 220 + 12, `${p.arquivo}: ${lados.join(' × ')}`)
  }
})

test('o vão do capacete deixa espaço para a cabeça', () => {
  const { W, R, parede } = MEDIDAS
  assert.ok(2 * (W - parede) >= 175, 'largura por dentro')
  assert.ok(2 * (R - parede) >= 225, 'profundidade por dentro')
})

test('o casulo do servo sai fechado (pronto para o fatiador)', () => {
  const p = PECAS_CAPACETE.find((x) => x.arquivo.includes('casulo-servo'))!
  const c = conferir(malha(p.f, p.caixa, 1.2, 0.1))
  assert.equal(c.abertas, 0)
  assert.equal(c.demais, 0)
})
