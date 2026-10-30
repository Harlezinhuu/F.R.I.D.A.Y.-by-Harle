import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharMarcas, aplicar, binarizar, completarQuarta, escolherCantos, homografia, matrix3d, ordenar, paraTela, suavizar, type Ponto } from '../mobile/src/ar-logica.ts'
import { marcasAr, MODULOS_MARCA } from '../src/shared/ar.ts'

/** Gerador de números "aleatórios" repetível. */
function sorteio(semente: number): () => number {
  let s = semente >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

/** A tela do PC (cinza): fundo, umas janelas e "texto", e as quatro marcas nos cantos. */
function telaDoPc(W: number, H: number, tapar = -1): Uint8Array {
  const r = sorteio(7)
  const t = new Uint8Array(W * H).fill(70)
  const ret = (x: number, y: number, w: number, h: number, cor: number) => {
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) t[yy * W + xx] = cor
  }
  ret(300, 150, 900, 600, 235)
  for (let i = 0; i < 400; i++) ret(320 + Math.floor(r() * 860), 180 + Math.floor(r() * 540), 4 + Math.floor(r() * 30), 4, 20)
  ret(1250, 200, 250, 250, 160)
  const m = marcasAr(W, H)
  const mod = m.lado / MODULOS_MARCA
  m.centros.forEach(([cx, cy], i) => {
    if (i === tapar) return
    const x0 = Math.round(cx * W - m.lado / 2), y0 = Math.round(cy * H - m.lado / 2)
    ret(x0, y0, m.lado, m.lado, 255)
    ret(x0 + mod, y0 + mod, 7 * mod, 7 * mod, 0)
    ret(x0 + 2 * mod, y0 + 2 * mod, 5 * mod, 5 * mod, 255)
    ret(x0 + 3 * mod, y0 + 3 * mod, 3 * mod, 3 * mod, 0)
  })
  return t
}

/** O que a câmera vê: a tela do PC em perspectiva (H leva pixel da tela em pixel da câmera), com ruído e um pouco de borrão. */
function fotografar(tela: Uint8Array, W: number, H: number, Hm: number[], w: number, h: number, brilho = 1): Uint8Array {
  const inv = homografia(
    [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }].map((p) => { const q = aplicar(Hm, p.x, p.y); return { x: q.x, y: q.y } }),
    [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]
  )!
  const r = sorteio(3)
  const img = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = aplicar(inv, x + 0.5, y + 0.5)
    let v: number
    if (p.x < 0 || p.y < 0 || p.x >= W - 1 || p.y >= H - 1) v = 35 + (x % 50 < 25 ? 10 : 0) // o quarto
    else {
      // Média de 3 × 3 pontos: borrão leve da câmera
      let s = 0
      for (const dx of [-0.6, 0, 0.6]) for (const dy of [-0.6, 0, 0.6]) s += tela[Math.min(H - 1, Math.max(0, Math.round(p.y + dy))) * W + Math.min(W - 1, Math.max(0, Math.round(p.x + dx)))]
      v = (s / 9) * brilho * (0.85 + 0.15 * (x / w)) // um lado mais claro
    }
    img[y * w + x] = Math.max(0, Math.min(255, Math.round(v + (r() - 0.5) * 18)))
  }
  return img
}

const W = 1600, H = 900

function cenario(Hm: number[], tapar = -1, brilho = 1) {
  const w = 800, h = 450
  const img = fotografar(telaDoPc(W, H, tapar), W, H, Hm, w, h, brilho)
  const esperado = marcasAr(W, H).centros.map(([u, v]) => { const q = aplicar(Hm, (u * W), (v * H)); return { x: q.x, y: q.y } })
  const achado = escolherCantos(acharMarcas(binarizar(img, w, h), w, h))
  return { achado, esperado }
}

const perto = (a: Ponto[], b: Ponto[], tol: number) => a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) < tol)

test('acha as quatro marcas com a tela de frente', () => {
  // Tela ocupando boa parte da foto, um pouco deslocada
  const Hm = [0.42, 0, 70, 0, 0.42, 40, 0, 0, 1]
  const { achado, esperado } = cenario(Hm)
  assert.ok(achado, 'não achou')
  assert.equal(achado!.completou, false)
  assert.ok(perto(achado!.cantos, esperado, 2.5), JSON.stringify({ achado: achado!.cantos, esperado }))
})

test('acha em perspectiva (celular de lado e um pouco girado)', () => {
  const de = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]
  const para = [{ x: 140, y: 70 }, { x: 640, y: 30 }, { x: 680, y: 420 }, { x: 110, y: 360 }]
  const Hm = homografia(de, para)!
  const { achado, esperado } = cenario(Hm, -1, 0.8)
  assert.ok(achado, 'não achou')
  assert.ok(perto(achado!.cantos, esperado, 3), JSON.stringify({ achado: achado!.cantos, esperado }))
})

test('acha com a tela longe (marcas pequenas) e é rápido o bastante para o celular', () => {
  const Hm = [0.22, 0, 260, 0, 0.22, 120, 0, 0, 1]
  const inicio = performance.now()
  const { achado, esperado } = cenario(Hm)
  assert.ok(achado, 'não achou')
  assert.ok(perto(achado!.cantos, esperado, 2), JSON.stringify({ achado: achado!.cantos, esperado }))
  const w = 800, h = 450, img = new Uint8Array(w * h).fill(128)
  const t0 = performance.now()
  for (let i = 0; i < 5; i++) escolherCantos(acharMarcas(binarizar(img, w, h), w, h))
  assert.ok((performance.now() - t0) / 5 < 60, 'lento demais')
  assert.ok(performance.now() - inicio < 10_000)
})

test('com uma marca tapada, completa a quarta', () => {
  const Hm = [0.4, 0.01, 90, -0.01, 0.4, 50, 0, 0, 1]
  const { achado, esperado } = cenario(Hm, 2)
  assert.ok(achado, 'não achou')
  assert.equal(achado!.completou, true)
  assert.ok(perto(achado!.cantos, esperado, 8), JSON.stringify({ achado: achado!.cantos, esperado }))
})

test('sem marcas na foto, não inventa a tela', () => {
  const w = 400, h = 300
  const r = sorteio(11)
  const img = new Uint8Array(w * h).map(() => Math.round(r() * 255))
  assert.equal(escolherCantos(acharMarcas(binarizar(img, w, h), w, h)), null)
})

test('ordena ↖ ↗ ↘ ↙ e completa o paralelogramo', () => {
  const q = ordenar([{ x: 10, y: 90 }, { x: 100, y: 5 }, { x: 0, y: 0 }, { x: 95, y: 100 }])
  assert.deepEqual(q.map((p) => [p.x, p.y]), [[0, 0], [100, 5], [95, 100], [10, 90]])
  const c = completarQuarta([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 50 }])
  assert.deepEqual(c.map((p) => [p.x, p.y]), [[0, 0], [100, 0], [100, 50], [0, 50]])
})

test('homografia leva os cantos certos e o matrix3d bate com ela', () => {
  const de = [{ x: 0, y: 0 }, { x: 1.78, y: 0 }, { x: 1.78, y: 1 }, { x: 0, y: 1 }]
  const para = [{ x: 50, y: 80 }, { x: 330, y: 60 }, { x: 340, y: 260 }, { x: 40, y: 250 }]
  const Hm = homografia(de, para)!
  for (let i = 0; i < 4; i++) {
    const p = aplicar(Hm, de[i].x, de[i].y)
    assert.ok(Math.abs(p.x - para[i].x) < 1e-6 && Math.abs(p.y - para[i].y) < 1e-6)
  }
  // Painel de 500 × 300 px no retângulo (-0.6, 0)–(-0.1, 0.3): o canto (500, 300) do painel cai em H(-0.1, 0.3)
  const css = matrix3d(Hm, 500, 300, -0.6, 0, -0.1, 0.3)!
  const n = css.slice(9, -1).split(',').map(Number)
  const X = n[0] * 500 + n[4] * 300 + n[12], Y = n[1] * 500 + n[5] * 300 + n[13], Wn = n[3] * 500 + n[7] * 300 + n[15]
  const alvo = aplicar(Hm, -0.1, 0.3)
  assert.ok(Math.abs(X / Wn - alvo.x) < 1e-3 && Math.abs(Y / Wn - alvo.y) < 1e-3, `${X / Wn},${Y / Wn} vs ${alvo.x},${alvo.y}`)
})

test('painel atrás da câmera não é desenhado', () => {
  // Perspectiva forte: o plano "some" no horizonte logo à esquerda
  const Hm = [1, 0, 0, 0, 1, 0, 0.9, 0, 1]
  assert.equal(matrix3d(Hm, 100, 100, -3, 0, -1.5, 1), null)
  assert.ok(matrix3d(Hm, 100, 100, 0, 0, 1, 1))
})

test('suaviza o tremido e pula quando o celular mexe muito', () => {
  const a = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }]
  const b = a.map((p) => ({ x: p.x + 2, y: p.y }))
  assert.equal(suavizar(a, b, 0.5)[0].x, 1)
  const c = a.map((p) => ({ x: p.x + 40, y: p.y }))
  assert.equal(suavizar(a, c)[0].x, 40)
})

test('ponto do canvas vai para a tela do celular com o vídeo cobrindo a tela', () => {
  // Vídeo 1280 × 720 numa tela em pé 400 × 800: escala 800/720, sobra para os lados
  const p = paraTela({ x: 320, y: 180 }, 0.5, { w: 1280, h: 720 }, { w: 400, h: 800 })
  const s = 800 / 720
  assert.ok(Math.abs(p.x - (640 * s + (400 - 1280 * s) / 2)) < 1e-9)
  assert.ok(Math.abs(p.y - 360 * s) < 1e-9)
})

test('as marcas do PC: múltiplo de 9 px, nos cantos e do tamanho certo para a câmera achar', () => {
  for (const [w, h] of [[1920, 1080], [2560, 1440], [1366, 768], [3840, 2160]]) {
    const m = marcasAr(w, h)
    assert.equal(m.lado % MODULOS_MARCA, 0)
    assert.ok(m.lado >= h * 0.1 && m.lado <= h * 0.14, `${w}x${h}: ${m.lado}`)
    const [tl, tr, br, bl] = m.centros
    assert.ok(tl[0] < 0.1 && tl[1] < 0.15 && tr[0] > 0.9 && br[1] > 0.85 && bl[0] < 0.1)
    // A marca inteira cabe na tela
    assert.ok(tl[0] * w - m.lado / 2 >= 0 && br[0] * w + m.lado / 2 <= w && br[1] * h + m.lado / 2 <= h)
  }
})
