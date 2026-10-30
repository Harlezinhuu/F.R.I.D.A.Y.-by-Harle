import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorHolograma, aplicarMatriz, matrizDaPeca, CORES } from '../src/shared/edicao.ts'
import { escreverGlb } from '../src/shared/glb.ts'
import { GestosOficina, type EventoOficina } from '../src/renderer/src/gestos/oficina.ts'
import type { Ponto } from '../src/renderer/src/gestos/gestos.ts'

const PECAS = ['Corpo', 'Braços', 'Motores', 'Hélices', 'Protetores', 'Câmera', 'Trem de pouso']

test('acha a peça pelo nome falado, no singular ou no plural, com ou sem acento', () => {
  const e = new EditorHolograma(PECAS)
  assert.equal(e.acharPeca('a hélice'), 3)
  assert.equal(e.acharPeca('helices'), 3)
  assert.equal(e.acharPeca('o motor'), 2)
  assert.equal(e.acharPeca('camera'), 5)
  assert.equal(e.acharPeca('trem'), 6)
  assert.equal(e.acharPeca('asa'), -1)
})

test('tirar, duplicar, pintar, desfazer e refazer', () => {
  const e = new EditorHolograma(PECAS)
  e.selecionar(e.acharPeca('hélices'))
  assert.equal(e.tirar()?.nome, 'Hélices')
  assert.equal(e.visiveis, 6)
  assert.equal(e.selecionada, -1)
  assert.equal(e.acharPeca('hélices'), -1, 'peça tirada não é achada')
  assert.ok(e.desfazer())
  assert.equal(e.visiveis, 7)
  assert.ok(e.refazer())
  assert.equal(e.visiveis, 6)
  e.desfazer()

  e.selecionar(e.acharPeca('motores'))
  const copia = e.duplicar()!
  assert.equal(copia.nome, 'Motores 2')
  assert.equal(copia.origem, 2)
  assert.equal(e.estado.pecas.length, 8)
  assert.equal(e.peca, copia)
  e.pintar(CORES.vermelho)
  assert.deepEqual(e.peca!.cor, CORES.vermelho)
  assert.match(e.resumo(), /1 cópias/)
  assert.match(e.resumo(), /1 pintadas/)
  e.desfazer(); e.desfazer()
  assert.equal(e.estado.pecas.length, 7)
  assert.equal(e.selecionada, -1, 'a seleção some quando a peça deixa de existir')
})

test('um gesto contínuo (arrastar) vira um desfazer só', () => {
  const e = new EditorHolograma(PECAS)
  e.selecionar(0)
  e.comecarGesto()
  for (let i = 0; i < 20; i++) e.mover([0.01, 0, 0])
  e.terminarGesto()
  assert.ok(Math.abs(e.peca!.pos[0] - 0.2) < 1e-9)
  e.desfazer()
  assert.deepEqual(e.estado.pecas[0].pos, [0, 0, 0])
  assert.equal(e.podeDesfazer, false)
  // Sem seleção, mexe no modelo inteiro
  e.selecionar(-1)
  e.escalar(2)
  e.girar([0, 1, 0])
  assert.equal(e.estado.escala, 2)
  assert.equal(e.estado.giro[1], 1)
  e.escalar(100)
  assert.equal(e.estado.escala, 8, 'tamanho tem limite')
})

test('a matriz da peça gira em volta do centro dela e soma o deslocamento', () => {
  const m = matrizDaPeca([1, 0, 0], { pos: [0, 2, 0], giro: [0, 0, Math.PI / 2], escala: 2 })
  const p = aplicarMatriz(m, new Float32Array([1, 0, 0, 2, 0, 0]))
  // O centro só anda o deslocamento; o ponto 1 à direita do centro gira 90° (vai para cima) e dobra
  assert.ok(Math.abs(p[0] - 1) < 1e-6 && Math.abs(p[1] - 2) < 1e-6)
  assert.ok(Math.abs(p[3] - 1) < 1e-6 && Math.abs(p[4] - 4) < 1e-6, Array.from(p).join(','))
})

test('salva um .glb válido com as peças e as cores', () => {
  const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const b = escreverGlb('drone v2', [{ nome: 'Corpo', triangulos: tri, cor: [1, 0, 0] }, { nome: 'Vazia', triangulos: new Float32Array(0), cor: [0, 0, 0] }, { nome: 'Lente', triangulos: tri, cor: [0, 1, 1], brilho: true }])
  const v = new DataView(b.buffer)
  assert.equal(v.getUint32(0, true), 0x46546c67)
  assert.equal(v.getUint32(8, true), b.length)
  const tam = v.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + tam)))
  assert.deepEqual(json.nodes.map((n: { name: string }) => n.name), ['Corpo', 'Lente'])
  assert.deepEqual(json.materials[1].emissiveFactor, [0, 1, 1])
  assert.equal(json.accessors[0].count, 3)
  assert.ok(json.buffers[0].byteLength <= v.getUint32(20 + tam, true))
  assert.equal(b.length % 4, 0)
})

// ---------- Gestos com uma mão ----------

type Dedos = [boolean, boolean, boolean, boolean]
function mao(cx: number, cy: number, dedos: Dedos, pinca = false, s = 0.1): Ponto[] {
  const m: Ponto[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy }))
  m[0] = { x: cx, y: cy + s }
  m[1] = { x: cx - 0.5 * s, y: cy + 0.7 * s }; m[2] = { x: cx - 0.8 * s, y: cy + 0.4 * s }; m[3] = { x: cx - s, y: cy + 0.1 * s }; m[4] = { x: cx - 1.1 * s, y: cy - 0.2 * s }
  ;[-0.6, -0.2, 0.2, 0.6].forEach((bx, i) => {
    const k = 5 + i * 4, x = cx + bx * s
    m[k] = { x, y: cy }
    if (dedos[i]) { m[k + 1] = { x, y: cy - 0.4 * s }; m[k + 2] = { x, y: cy - 0.6 * s }; m[k + 3] = { x, y: cy - 0.8 * s } }
    else { m[k + 1] = { x, y: cy - 0.25 * s }; m[k + 2] = { x, y: cy - 0.1 * s }; m[k + 3] = { x, y: cy + 0.05 * s } }
  })
  if (pinca) { m[8] = { x: cx - 1.05 * s, y: cy - 0.22 * s }; m[6] = { x: cx - 0.7 * s, y: cy - 0.3 * s } }
  return m
}
const P: Dedos = [true, false, false, false], ABERTA: Dedos = [true, true, true, true], FECHADA: Dedos = [false, false, false, false]
const rodar = (quadros: Ponto[][][]): EventoOficina[] => { const g = new GestosOficina(); return quadros.flatMap((m, i) => g.atualizar(m, i * 33)) }

test('pinça pega, arrasta junto com a mão e solta ao abrir os dedos (com folga para a detecção piscar)', () => {
  const ev = rodar([
    [mao(0.5, 0.5, P, true)], [mao(0.5, 0.5, P, true)], [mao(0.52, 0.5, P, true)], [mao(0.54, 0.5, P, true)],
    [mao(0.56, 0.5, P)], // piscou: um quadro sem pinça não solta
    [mao(0.58, 0.5, P, true)], [mao(0.6, 0.5, P)], [mao(0.6, 0.5, P)], [mao(0.6, 0.5, P)]
  ])
  const tipos = ev.map((e) => e.tipo)
  assert.equal(tipos.filter((t) => t === 'pegar').length, 1)
  assert.equal(tipos.filter((t) => t === 'soltar').length, 1)
  assert.ok(tipos.indexOf('soltar') > tipos.lastIndexOf('arrastar'))
  const arrastos = ev.filter((e) => e.tipo === 'arrastar') as { dx: number }[]
  assert.ok(arrastos.length >= 2 && arrastos.every((a) => a.dx > 0))
})

test('apontar move o cursor; mão fechada gira; tapa joga fora; duas pinças rápidas são toque duplo', () => {
  assert.ok(rodar([[mao(0.4, 0.4, P)]]).some((e) => e.tipo === 'cursor'))
  const giro = rodar([0.4, 0.43, 0.46].map((x) => [mao(x, 0.5, FECHADA)])).filter((e) => e.tipo === 'girar') as { dx: number }[]
  assert.ok(giro.length >= 2 && giro.every((g) => g.dx > 0))
  const tapa = rodar([0.3, 0.42, 0.54, 0.66, 0.78].map((x) => [mao(x, 0.5, ABERTA)]))
  assert.deepEqual(tapa.filter((e) => e.tipo === 'jogar_fora').length, 1)
  const solta = [mao(0.5, 0.5, P)], pinca = [mao(0.5, 0.5, P, true)]
  const toque = rodar([solta, pinca, pinca, solta, solta, solta, pinca, pinca, solta])
  assert.equal(toque.filter((e) => e.tipo === 'toque_duplo').length, 1)
  // Mão sumiu segurando: solta
  const sumiu = rodar([pinca, pinca, []])
  assert.deepEqual(sumiu.map((e) => e.tipo).slice(-2), ['soltar', 'sem_mao'])
})
