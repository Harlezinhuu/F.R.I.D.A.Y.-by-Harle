// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerFormula } from '../src/renderer/src/projetor/expressao.ts'
import { posicoes, seculos } from '../src/renderer/src/projetor/sistemaSolar.ts'
import { lerSdf, lerPdb } from '../src/renderer/src/projetor/quimica.ts'

const perto = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`)

test('fórmulas: operações, precedência e funções', () => {
  perto(lerFormula('1 + 2*3').f(0, 0, 0), 7)
  perto(lerFormula('2^3^2').f(0, 0, 0), 512)
  perto(lerFormula('-x^2').f(3, 0, 0), -9)
  perto(lerFormula('sin(x)*cos(y)').f(1, 2, 0), Math.sin(1) * Math.cos(2))
  perto(lerFormula('z = sen(x) + raiz(y)').f(1, 4, 0), Math.sin(1) + 2)
  perto(lerFormula('2x + 3(y - 1)').f(2, 3, 0), 10)
  perto(lerFormula('sen x cos y').f(1, 2, 0), Math.sin(1) * Math.cos(2))
  perto(lerFormula('max(x, y, 3)').f(1, 2, 0), 3)
  perto(lerFormula('pi').f(0, 0, 0), Math.PI)
  perto(lerFormula('x²+y²').f(3, 4, 0), 25)
})

test('fórmulas: tempo e pontos impossíveis', () => {
  const r = lerFormula('sin(x - t)')
  assert.equal(r.usaTempo, true)
  perto(r.f(1, 0, 1), 0)
  assert.equal(lerFormula('x + y').usaTempo, false)
  assert.equal(lerFormula('1/x').f(0, 0, 0), 0)
  assert.equal(lerFormula('sqrt(x)').f(-1, 0, 0), 0)
})

test('fórmulas: recusa o que não é matemática', () => {
  assert.throws(() => lerFormula('alert(1)'), /Não conheço/)
  assert.throws(() => lerFormula('x + '), /terminou/)
  assert.throws(() => lerFormula('(x + 1'), /parênteses/)
  assert.throws(() => lerFormula('x; y'), /símbolo/)
  assert.throws(() => lerFormula(''), /vazia/)
  assert.throws(() => lerFormula('constructor'), /Não conheço/)
})

test('sistema solar: Terra perto do periélio em janeiro e do afélio em julho', () => {
  const terra = (d: string) => { const p = posicoes(new Date(d)).find((x) => x.nome === 'Terra')!; return Math.hypot(p.x, p.y, p.z) }
  perto(terra('2026-01-03T12:00:00Z'), 0.9833, 0.001)
  perto(terra('2026-07-06T12:00:00Z'), 1.0166, 0.001)
  perto(seculos(new Date('2000-01-01T12:00:00Z')), 0, 1e-6)
})

test('sistema solar: distâncias dos planetas no lugar certo', () => {
  const ps = posicoes(new Date('2026-10-26T00:00:00Z'))
  assert.equal(ps.length, 8)
  const jup = ps.find((p) => p.nome === 'Júpiter')!
  const r = Math.hypot(jup.x, jup.y, jup.z)
  assert.ok(r > 4.9 && r < 5.5, `Júpiter a ${r} UA`)
})

const AGUA = `water
  test

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.1173 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.7572   -0.4692 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -0.7572   -0.4692 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
M  END
$$$$
`

test('moléculas: lê átomos e ligações do SDF', () => {
  const m = lerSdf(AGUA)
  assert.equal(m.nome, 'water')
  assert.deepEqual(m.atomos.map((a) => a.el), ['O', 'H', 'H'])
  assert.equal(m.ligacoes.length, 2)
  assert.deepEqual(m.ligacoes[0], { a: 0, b: 1, ordem: 1 })
  perto(m.atomos[1].y, 0.7572)
})

test('proteínas: lê o PDB, ignora água e para no primeiro modelo', () => {
  const pdb = [
    'TITLE     CRAMBIN',
    'ATOM      1  N   THR A   1      17.047  14.099   3.625  1.00 13.79           N',
    'ATOM      2  CA  THR A   1      16.967  12.784   4.338  1.00 10.80           C',
    'HETATM  328  O   HOH A  67      10.000  10.000  10.000  1.00 20.00           O',
    'ENDMDL',
    'ATOM      3  C   THR A   1      15.685  12.755   5.133  1.00  9.19           C'
  ].join('\n')
  const p = lerPdb(pdb)
  assert.equal(p.titulo, 'CRAMBIN')
  assert.equal(p.atomos.length, 2)
  assert.equal(p.atomos[1].ca, true)
  assert.equal(p.atomos[0].el, 'N')
})
