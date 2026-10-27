// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Gestos, pose, type Ponto, type Comando } from '../src/renderer/src/gestos/gestos.ts'

type Dedos = [boolean, boolean, boolean, boolean]

/** Mão de mentira: 21 pontos no formato do MediaPipe. */
function mao(cx: number, cy: number, dedos: Dedos, pinca = false, s = 0.1): Ponto[] {
  const m: Ponto[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy }))
  m[0] = { x: cx, y: cy + s }
  m[1] = { x: cx - 0.5 * s, y: cy + 0.7 * s }; m[2] = { x: cx - 0.8 * s, y: cy + 0.4 * s }; m[3] = { x: cx - s, y: cy + 0.1 * s }; m[4] = { x: cx - 1.1 * s, y: cy - 0.2 * s }
  const bases = [-0.6, -0.2, 0.2, 0.6]
  bases.forEach((bx, i) => {
    const k = 5 + i * 4, x = cx + bx * s
    m[k] = { x, y: cy }
    if (dedos[i]) { m[k + 1] = { x, y: cy - 0.4 * s }; m[k + 2] = { x, y: cy - 0.6 * s }; m[k + 3] = { x, y: cy - 0.8 * s } }
    else { m[k + 1] = { x, y: cy - 0.25 * s }; m[k + 2] = { x, y: cy - 0.1 * s }; m[k + 3] = { x, y: cy + 0.05 * s } }
  })
  if (pinca) { m[8] = { x: cx - 1.05 * s, y: cy - 0.22 * s }; m[6] = { x: cx - 0.7 * s, y: cy - 0.3 * s } }
  return m
}
const ABERTA: Dedos = [true, true, true, true], FECHADA: Dedos = [false, false, false, false], APONTA: Dedos = [true, false, false, false]

test('reconhece as poses', () => {
  assert.equal(pose(mao(0.5, 0.5, ABERTA)), 'aberta')
  assert.equal(pose(mao(0.5, 0.5, FECHADA)), 'fechada')
  assert.equal(pose(mao(0.5, 0.5, APONTA)), 'aponta')
  assert.equal(pose(mao(0.5, 0.5, [true, false, false, false], true)), 'pinca')
  assert.equal(pose(mao(0.5, 0.5, [true, true, false, false])), 'outra')
  assert.equal(pose([]), 'outra')
})

const rodar = (quadros: Ponto[][][], passoMs = 33): Comando[] => {
  const g = new Gestos()
  return quadros.flatMap((maos, i) => g.atualizar(maos, i * passoMs))
}

test('mão fechada movendo para a direita gira para a direita', () => {
  const cmds = rodar([0.4, 0.42, 0.44, 0.46, 0.48].map((x) => [mao(x, 0.5, FECHADA)]))
  const giros = cmds.filter((c) => c.tipo === 'girar') as { dx: number }[]
  assert.ok(giros.length >= 3)
  assert.ok(giros.every((c) => c.dx > 0))
})

test('mão aberta movendo devagar não faz nada', () => {
  const cmds = rodar([0.4, 0.41, 0.42, 0.43].map((x) => [mao(x, 0.5, ABERTA)]))
  assert.deepEqual(cmds, [])
})

test('pinça subindo aproxima', () => {
  const cmds = rodar([0.6, 0.58, 0.56, 0.54].map((y) => [mao(0.5, y, [true, false, false, false], true)]))
  const zoom = cmds.filter((c) => c.tipo === 'escalar') as { fator: number }[]
  assert.ok(zoom.length >= 2)
  assert.ok(zoom.every((c) => c.fator > 1))
})

test('duas mãos fechadas se afastando aumentam', () => {
  const cmds = rodar([0.1, 0.13, 0.16, 0.19].map((d) => [mao(0.5 - d, 0.5, FECHADA), mao(0.5 + d, 0.5, FECHADA)]))
  const zoom = cmds.filter((c) => c.tipo === 'escalar') as { fator: number }[]
  assert.ok(zoom.length >= 2 && zoom.every((c) => c.fator > 1))
})

test('abrir os braços com as mãos abertas explode; fechar junta', () => {
  const abrir = rodar([0.08, 0.13, 0.18, 0.23, 0.28].map((d) => [mao(0.5 - d, 0.5, ABERTA), mao(0.5 + d, 0.5, ABERTA)]), 80)
  assert.equal(abrir.filter((c) => c.tipo === 'explodir').length, 1)
  const fechar = rodar([0.3, 0.24, 0.18, 0.12].map((d) => [mao(0.5 - d, 0.5, ABERTA), mao(0.5 + d, 0.5, ABERTA)]), 80)
  assert.equal(fechar.filter((c) => c.tipo === 'juntar').length, 1)
})

test('tapa rápido com a mão aberta arremessa, uma vez só', () => {
  const cmds = rodar([0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((x) => [mao(x, 0.5, ABERTA)]), 33)
  const arr = cmds.filter((c) => c.tipo === 'arremessar') as { direcao: number }[]
  assert.equal(arr.length, 1)
  assert.equal(arr[0].direcao, 1)
})

test('apontar mostra a mira na ponta do indicador', () => {
  const cmds = rodar([[mao(0.5, 0.5, APONTA)]])
  const mira = cmds.find((c) => c.tipo === 'mira') as { x: number; y: number }
  assert.ok(mira)
  assert.ok(Math.abs(mira.y - (0.5 - 0.08)) < 1e-9)
})
