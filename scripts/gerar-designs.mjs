// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Gera os designs originais que já vêm importados na FRIDAY (resources/designs/*.glb).
// Tudo desenhado aqui, peça por peça, com nomes em português (aparecem quando a projeção "explode").
// Uso: node scripts/gerar-designs.mjs   (precisa do three, que já é dependência do projeto)

import * as THREE from 'three'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'designs')
const { PI, cos, sin } = Math

// ---------- Peças ----------

/** Geometria com posição, rotação (graus) e escala aplicadas. */
function g(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r.map((x) => (x * PI) / 180))),
    new THREE.Vector3(...s)
  )
  return geo.applyMatrix4(m)
}
const caixa = (w, h, d, o) => g(new THREE.BoxGeometry(w, h, d), o)
const cil = (rt, rb, h, seg = 32, o) => g(new THREE.CylinderGeometry(rt, rb, h, seg), o)
const esfera = (r, o) => g(new THREE.SphereGeometry(r, 24, 16), o)
const toro = (r, t, o, arco = 2 * PI) => g(new THREE.TorusGeometry(r, t, 12, 48, arco), o)
const cone = (r, h, seg = 32, o) => g(new THREE.ConeGeometry(r, h, seg), o)
const torno = (perfil, seg = 48, o) => g(new THREE.LatheGeometry(perfil.map(([x, y]) => new THREE.Vector2(x, y)), seg), o)

/** Fita de Möbius com espessura (a identidade da FRIDAY). */
function mobius(raio = 1, largura = 0.36, espessura = 0.03, n = 160, m = 8) {
  const pos = [], idx = []
  const ponto = (u, v, lado) => {
    const w = largura * v, c = cos(u / 2)
    const x = (raio + w * c) * cos(u), y = w * sin(u / 2), z = (raio + w * c) * sin(u)
    // Normal aproximada para dar espessura
    const nx = cos(u) * sin(u / 2), ny = -cos(u / 2), nz = sin(u) * sin(u / 2)
    return [x + nx * espessura * lado, y + ny * espessura * lado, z + nz * espessura * lado]
  }
  for (const lado of [1, -1]) {
    const base = pos.length / 3
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) pos.push(...ponto((i / n) * 2 * PI, (j / m) * 2 - 1, lado))
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const a = base + i * (m + 1) + j, b = a + m + 1
      if (lado > 0) idx.push(a, b, a + 1, b, b + 1, a + 1)
      else idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** Repete uma peça em volta do eixo Y. */
function emVolta(n, criar) {
  const lista = []
  for (let i = 0; i < n; i++) lista.push(criar((i / n) * 360, i))
  return lista
}

// ---------- GLB ----------

function juntar(geos) {
  const pos = [], nor = [], idx = []
  for (const geo0 of geos) {
    const geo = geo0.index ? geo0 : geo0
    if (!geo.attributes.normal) geo.computeVertexNormals()
    const base = pos.length / 3
    const p = geo.attributes.position, n = geo.attributes.normal
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)) }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(base + geo.index.getX(i))
    else for (let i = 0; i < p.count; i++) idx.push(base + i)
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) }
}

/** Escreve um .glb: uma malha por peça, cada uma com o nome e a cor dela. */
function glb(nome, pecas) {
  const json = { asset: { version: '2.0', generator: 'FRIDAY by Harle · gerar-designs' }, scene: 0, scenes: [{ name: nome, nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }
  const blocos = []
  let tamanho = 0
  const vista = (dados, alvo) => {
    const bytes = new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
    json.bufferViews.push({ buffer: 0, byteOffset: tamanho, byteLength: bytes.length, target: alvo })
    blocos.push(bytes)
    tamanho += bytes.length
    const resto = (4 - (tamanho % 4)) % 4
    if (resto) { blocos.push(new Uint8Array(resto)); tamanho += resto }
    return json.bufferViews.length - 1
  }
  for (const peca of pecas) {
    const { pos, nor, idx } = juntar(peca.geos)
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]) }
    const a = json.accessors.length
    json.accessors.push(
      { bufferView: vista(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: vista(nor, 34962), componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: vista(idx, 34963), componentType: 5125, count: idx.length, type: 'SCALAR' }
    )
    const cor = new THREE.Color(peca.cor)
    json.materials.push({
      name: peca.nome,
      pbrMetallicRoughness: { baseColorFactor: [cor.r, cor.g, cor.b, 1], metallicFactor: peca.brilho ? 0 : 0.35, roughnessFactor: 0.45 },
      ...(peca.brilho ? { emissiveFactor: [cor.r, cor.g, cor.b] } : {})
    })
    json.meshes.push({ name: peca.nome, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: json.materials.length - 1 }] })
    json.nodes.push({ name: peca.nome, mesh: json.meshes.length - 1 })
    json.scenes[0].nodes.push(json.nodes.length - 1)
  }
  json.buffers.push({ byteLength: tamanho })
  let texto = Buffer.from(JSON.stringify(json), 'utf8')
  const pad = (4 - (texto.length % 4)) % 4
  if (pad) texto = Buffer.concat([texto, Buffer.alloc(pad, 0x20)])
  const bin = Buffer.concat(blocos.map((b) => Buffer.from(b)))
  const cab = Buffer.alloc(12)
  cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + texto.length + 8 + bin.length, 8)
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(texto.length, 0); c1.writeUInt32LE(0x4e4f534a, 4)
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([cab, c1, texto, c2, bin])
}

// ---------- Os designs ----------

const CIANO = '#5FE1F2', AZUL = '#4E8FE8', VIOLETA = '#9B8CFF', BRANCO = '#E7ECF7', GRAFITE = '#2A3346', LARANJA = '#FF9A4A', VERMELHO = '#FF5A6E'

const DESIGNS = [
  {
    arquivo: 'nucleo-da-friday.glb',
    nome: 'núcleo da FRIDAY',
    apelidos: ['núcleo', 'fita', 'coração da friday'],
    pecas: [
      { nome: 'Fita de Möbius', cor: CIANO, brilho: true, geos: [g(mobius(1, 0.38, 0.025), { p: [0, 1.25, 0], r: [12, 0, 0] })] },
      { nome: 'Anel interno', cor: AZUL, geos: [toro(1.55, 0.025, { p: [0, 1.25, 0], r: [90, 0, 0] })] },
      { nome: 'Anel externo', cor: VIOLETA, geos: [toro(1.85, 0.018, { p: [0, 1.25, 0], r: [78, 0, 18] })] },
      { nome: 'Núcleo', cor: BRANCO, brilho: true, geos: [esfera(0.16, { p: [0, 1.25, 0] })] },
      { nome: 'Emissor', cor: GRAFITE, geos: [torno([[0, 0], [1.3, 0], [1.4, 0.08], [1.1, 0.2], [0.6, 0.26], [0, 0.26]]), toro(1.05, 0.03, { p: [0, 0.22, 0], r: [90, 0, 0] })] },
      { nome: 'Feixe', cor: CIANO, brilho: true, geos: [cil(0.05, 0.45, 0.9, 32, { p: [0, 0.7, 0] })] },
      { nome: 'Hastes', cor: AZUL, geos: emVolta(3, (a) => cil(0.025, 0.025, 1.3, 8, { p: [1.25 * cos((a * PI) / 180), 0.85, 1.25 * sin((a * PI) / 180)], r: [0, 0, 0] })) }
    ]
  },
  {
    arquivo: 'oficina-do-harle.glb',
    nome: 'oficina do Harle',
    apelidos: ['oficina', 'meu setup', 'meu quarto', 'laboratório'],
    pecas: [
      { nome: 'Piso', cor: GRAFITE, geos: [caixa(5, 0.08, 3.6, { p: [0, -0.04, 0] })] },
      { nome: 'Mesa', cor: '#3B4660', geos: [caixa(2.6, 0.06, 1, { p: [0, 0.75, -0.9] }), ...[-1.22, 1.22].flatMap((x) => [caixa(0.06, 0.75, 0.9, { p: [x, 0.375, -0.9] })])] },
      { nome: 'Fita de LED', cor: VIOLETA, brilho: true, geos: [caixa(2.56, 0.015, 0.015, { p: [0, 0.72, -0.4] })] },
      { nome: 'Monitor central', cor: '#141A28', geos: [caixa(1, 0.56, 0.04, { p: [0, 1.25, -1.2] }), caixa(0.08, 0.3, 0.06, { p: [0, 0.93, -1.22] }), caixa(0.36, 0.02, 0.22, { p: [0, 0.79, -1.2] })] },
      { nome: 'Tela central', cor: CIANO, brilho: true, geos: [caixa(0.94, 0.5, 0.005, { p: [0, 1.25, -1.177] })] },
      { nome: 'Monitores laterais', cor: '#141A28', geos: [caixa(0.6, 0.36, 0.04, { p: [-0.86, 1.18, -1.08], r: [0, 28, 0] }), caixa(0.6, 0.36, 0.04, { p: [0.86, 1.18, -1.08], r: [0, -28, 0] })] },
      { nome: 'Gabinete', cor: '#1C2233', geos: [caixa(0.24, 0.52, 0.5, { p: [1.05, 1.04, -0.95] })] },
      { nome: 'Vidro do gabinete', cor: AZUL, geos: [caixa(0.005, 0.46, 0.44, { p: [0.928, 1.04, -0.95] })] },
      { nome: 'Fans RGB', cor: VIOLETA, brilho: true, geos: [0.88, 1.04, 1.2].map((y) => toro(0.07, 0.012, { p: [0.925, y, -1.05], r: [0, 90, 0] })) },
      { nome: 'Teclado', cor: '#202838', geos: [caixa(0.46, 0.025, 0.15, { p: [-0.05, 0.795, -0.62] })] },
      { nome: 'Mouse', cor: '#202838', geos: [g(new THREE.SphereGeometry(0.04, 16, 10), { p: [0.35, 0.79, -0.62], s: [0.8, 0.45, 1.3] })] },
      { nome: 'Microfone', cor: BRANCO, geos: [cil(0.03, 0.03, 0.12, 16, { p: [-0.7, 0.98, -0.7], r: [20, 0, 0] }), cil(0.006, 0.006, 0.4, 8, { p: [-0.75, 0.95, -0.9], r: [60, 0, 0] })] },
      { nome: 'Cadeira', cor: '#2D3650', geos: [caixa(0.55, 0.08, 0.55, { p: [0, 0.5, 0.05] }), caixa(0.55, 0.75, 0.08, { p: [0, 0.92, 0.32], r: [-8, 0, 0] }), cil(0.03, 0.03, 0.4, 12, { p: [0, 0.27, 0.05] }), ...emVolta(5, (a) => caixa(0.36, 0.03, 0.05, { p: [0.18 * cos((a * PI) / 180), 0.08, 0.05 + 0.18 * sin((a * PI) / 180)], r: [0, -a, 0] }))] },
      { nome: 'Estante', cor: '#3B4660', geos: [caixa(0.05, 1.8, 0.4, { p: [-2.3, 0.9, -1.2] }), caixa(0.05, 1.8, 0.4, { p: [-1.6, 0.9, -1.2] }), ...[0.4, 0.9, 1.4, 1.78].map((y) => caixa(0.7, 0.03, 0.4, { p: [-1.95, y, -1.2] }))] },
      { nome: 'Harle Bot de enfeite', cor: CIANO, brilho: true, geos: [caixa(0.14, 0.1, 0.11, { p: [-1.95, 1.62, -1.2] }), caixa(0.12, 0.16, 0.1, { p: [-1.95, 1.5, -1.2] }), cil(0.006, 0.006, 0.06, 6, { p: [-1.92, 1.7, -1.2] })] },
      { nome: 'Caixas de som', cor: '#1C2233', geos: [caixa(0.16, 0.26, 0.16, { p: [-1.1, 0.91, -1.25] }), caixa(0.16, 0.26, 0.16, { p: [1.1, 0.91, -1.4] })] }
    ]
  },
  {
    arquivo: 'turbina-harle.glb',
    nome: 'turbina Harle',
    apelidos: ['turbina', 'motor do harle', 'otimizador'],
    pecas: [
      { nome: 'Carenagem', cor: AZUL, geos: [torno([[0.62, -1.2], [0.7, -1.1], [0.72, -0.6], [0.66, 0.4], [0.5, 1.2], [0.47, 1.2], [0.62, 0.4], [0.68, -0.6], [0.66, -1.1], [0.58, -1.2]], 64, { r: [90, 0, 0] })] },
      { nome: 'Ventoinha', cor: CIANO, brilho: true, geos: [cone(0.18, 0.3, 32, { p: [0, 0, -1.25], r: [-90, 0, 0] }), ...emVolta(18, (a) => caixa(0.5, 0.012, 0.12, { p: [0.33 * cos((a * PI) / 180), 0.33 * sin((a * PI) / 180), -1.05], r: [0, 25, a] }))] },
      { nome: 'Compressor', cor: VIOLETA, geos: [0, 1, 2, 3, 4].flatMap((i) => [cil(0.5 - i * 0.04, 0.5 - i * 0.04, 0.04, 48, { p: [0, 0, -0.75 + i * 0.13], r: [90, 0, 0] })]) },
      { nome: 'Câmara de combustão', cor: LARANJA, brilho: true, geos: [toro(0.38, 0.07, { p: [0, 0, 0.0] }), toro(0.38, 0.07, { p: [0, 0, 0.14] })] },
      { nome: 'Turbina', cor: BRANCO, geos: [0, 1, 2].map((i) => cil(0.36 - i * 0.03, 0.36 - i * 0.03, 0.05, 48, { p: [0, 0, 0.35 + i * 0.12], r: [90, 0, 0] })) },
      { nome: 'Eixo', cor: GRAFITE, geos: [cil(0.05, 0.05, 2.1, 16, { p: [0, 0, 0], r: [90, 0, 0] })] },
      { nome: 'Cone de exaustão', cor: '#7A86A6', geos: [cone(0.28, 0.6, 32, { p: [0, 0, 0.98], r: [90, 0, 0] })] }
    ]
  },
  {
    arquivo: 'toca-discos-harle-player.glb',
    nome: 'toca-discos do Harle Player',
    apelidos: ['toca-discos', 'harle player', 'vitrola', 'player'],
    pecas: [
      { nome: 'Base', cor: '#1C2233', geos: [caixa(1.6, 0.14, 1.2, { p: [0, 0.07, 0] })] },
      { nome: 'Prato', cor: GRAFITE, geos: [cil(0.5, 0.5, 0.04, 64, { p: [-0.2, 0.16, 0] })] },
      { nome: 'Disco', cor: '#0B0F1A', geos: [cil(0.47, 0.47, 0.012, 64, { p: [-0.2, 0.186, 0] })] },
      { nome: 'Sulcos', cor: VIOLETA, brilho: true, geos: [0.18, 0.24, 0.3, 0.36, 0.42].map((r) => toro(r, 0.002, { p: [-0.2, 0.193, 0], r: [90, 0, 0] })) },
      { nome: 'Selo', cor: CIANO, brilho: true, geos: [cil(0.12, 0.12, 0.014, 32, { p: [-0.2, 0.194, 0] })] },
      { nome: 'Braço', cor: BRANCO, geos: [cil(0.05, 0.06, 0.08, 24, { p: [0.5, 0.18, -0.38] }), cil(0.012, 0.012, 0.62, 12, { p: [0.33, 0.24, -0.12], r: [90, 0, 0], s: [1, 1, 1] }), caixa(0.05, 0.02, 0.09, { p: [0.18, 0.225, 0.17], r: [0, 25, 0] })] },
      { nome: 'Contrapeso', cor: GRAFITE, geos: [cil(0.035, 0.035, 0.07, 16, { p: [0.55, 0.24, -0.5], r: [90, 0, 0] })] },
      { nome: 'Botões', cor: CIANO, geos: [[0.55, 0.4], [0.68, 0.4]].map(([x, z]) => cil(0.035, 0.035, 0.03, 20, { p: [x, 0.155, z] })) },
      { nome: 'Equalizador', cor: CIANO, brilho: true, geos: [0.2, 0.45, 0.3, 0.6, 0.38, 0.52, 0.25, 0.4].map((h, i) => caixa(0.05, h, 0.05, { p: [-0.62 + i * 0.09, 0.14 + h / 2, -0.62] })) },
      { nome: 'Caixa de som esquerda', cor: '#1C2233', geos: [caixa(0.4, 0.7, 0.4, { p: [-1.15, 0.35, 0] }), cone(0.12, 0.06, 32, { p: [-1.15, 0.48, 0.2], r: [-90, 0, 0] }), cone(0.07, 0.04, 24, { p: [-1.15, 0.22, 0.2], r: [-90, 0, 0] })] },
      { nome: 'Caixa de som direita', cor: '#1C2233', geos: [caixa(0.4, 0.7, 0.4, { p: [1.15, 0.35, 0] }), cone(0.12, 0.06, 32, { p: [1.15, 0.48, 0.2], r: [-90, 0, 0] }), cone(0.07, 0.04, 24, { p: [1.15, 0.22, 0.2], r: [-90, 0, 0] })] }
    ]
  },
  {
    arquivo: 'harle-bot.glb',
    nome: 'Harle Bot',
    apelidos: ['bot', 'robô', 'mascote', 'harlebot'],
    pecas: [
      { nome: 'Cabeça', cor: BRANCO, geos: [caixa(0.7, 0.5, 0.55, { p: [0, 1.55, 0] })] },
      { nome: 'Visor', cor: '#0B0F1A', geos: [caixa(0.6, 0.24, 0.02, { p: [0, 1.57, 0.28] })] },
      { nome: 'Olhos', cor: CIANO, brilho: true, geos: [-0.14, 0.14].map((x) => g(new THREE.SphereGeometry(0.055, 16, 12), { p: [x, 1.58, 0.29], s: [1, 1.4, 0.4] })) },
      { nome: 'Antena', cor: VIOLETA, brilho: true, geos: [cil(0.015, 0.015, 0.25, 8, { p: [0.2, 1.92, 0] }), esfera(0.05, { p: [0.2, 2.06, 0] })] },
      { nome: 'Pescoço', cor: GRAFITE, geos: [cil(0.1, 0.12, 0.12, 20, { p: [0, 1.24, 0] })] },
      { nome: 'Corpo', cor: AZUL, geos: [torno([[0, 0], [0.36, 0], [0.42, 0.2], [0.4, 0.55], [0.3, 0.62], [0, 0.62]], 40, { p: [0, 0.56, 0] })] },
      { nome: 'Emblema', cor: CIANO, brilho: true, geos: [cil(0.11, 0.11, 0.02, 6, { p: [0, 0.92, 0.41], r: [90, 0, 0] })] },
      { nome: 'Braço esquerdo', cor: BRANCO, geos: [esfera(0.08, { p: [-0.47, 1.05, 0] }), cil(0.05, 0.05, 0.42, 12, { p: [-0.52, 0.82, 0.04], r: [8, 0, -10] }), toro(0.07, 0.02, { p: [-0.56, 0.56, 0.06], r: [90, 0, 0] }, 1.5 * PI)] },
      { nome: 'Braço direito', cor: BRANCO, geos: [esfera(0.08, { p: [0.47, 1.05, 0] }), cil(0.05, 0.05, 0.42, 12, { p: [0.55, 0.9, 0.12], r: [-40, 0, 25] }), toro(0.07, 0.02, { p: [0.64, 0.74, 0.28], r: [50, 0, 0] }, 1.5 * PI)] },
      { nome: 'Esteiras', cor: GRAFITE, geos: [-0.28, 0.28].flatMap((x) => [caixa(0.16, 0.3, 0.7, { p: [x, 0.2, 0] }), ...[-0.25, 0, 0.25].map((z) => cil(0.11, 0.11, 0.18, 20, { p: [x, 0.13, z], r: [0, 0, 90] }))]) },
      { nome: 'Luzes da esteira', cor: VIOLETA, brilho: true, geos: [-0.37, 0.37].map((x) => caixa(0.01, 0.02, 0.6, { p: [x, 0.3, 0] })) }
    ]
  },
  {
    arquivo: 'drone-falcao.glb',
    nome: 'drone Falcão',
    apelidos: ['drone', 'falcão', 'quadricóptero'],
    pecas: [
      { nome: 'Corpo', cor: BRANCO, geos: [g(new THREE.SphereGeometry(0.35, 32, 16), { p: [0, 0.4, 0], s: [1, 0.38, 1.5] })] },
      { nome: 'Faixa', cor: CIANO, brilho: true, geos: [g(new THREE.TorusGeometry(0.35, 0.012, 8, 48), { p: [0, 0.4, 0], r: [90, 0, 0], s: [1, 1.5, 1] })] },
      { nome: 'Braços', cor: GRAFITE, geos: [45, 135, 225, 315].map((a) => caixa(0.75, 0.04, 0.06, { p: [0.38 * cos((a * PI) / 180), 0.42, 0.38 * sin((a * PI) / 180)], r: [0, -a, 0] })) },
      { nome: 'Motores', cor: '#1C2233', geos: [45, 135, 225, 315].map((a) => cil(0.07, 0.08, 0.1, 20, { p: [0.72 * cos((a * PI) / 180), 0.47, 0.72 * sin((a * PI) / 180)] })) },
      { nome: 'Hélices', cor: AZUL, geos: [45, 135, 225, 315].flatMap((a, i) => [0, 90].map((b) => caixa(0.56, 0.006, 0.04, { p: [0.72 * cos((a * PI) / 180), 0.53, 0.72 * sin((a * PI) / 180)], r: [0, b + i * 20, 4] }))) },
      { nome: 'Protetores', cor: VIOLETA, geos: [45, 135, 225, 315].map((a) => toro(0.31, 0.01, { p: [0.72 * cos((a * PI) / 180), 0.53, 0.72 * sin((a * PI) / 180)], r: [90, 0, 0] })) },
      { nome: 'Câmera', cor: '#0B0F1A', geos: [esfera(0.09, { p: [0, 0.28, 0.42] }), cil(0.045, 0.05, 0.06, 20, { p: [0, 0.28, 0.5], r: [90, 0, 0] })] },
      { nome: 'Lente', cor: CIANO, brilho: true, geos: [cil(0.035, 0.035, 0.01, 20, { p: [0, 0.28, 0.535], r: [90, 0, 0] })] },
      { nome: 'Trem de pouso', cor: GRAFITE, geos: [-0.2, 0.2].flatMap((x) => [cil(0.015, 0.015, 0.7, 8, { p: [x, 0.02, 0], r: [90, 0, 0] }), cil(0.012, 0.012, 0.28, 8, { p: [x * 0.8, 0.16, 0.15], r: [0, 0, x > 0 ? 15 : -15] }), cil(0.012, 0.012, 0.28, 8, { p: [x * 0.8, 0.16, -0.15], r: [0, 0, x > 0 ? 15 : -15] })]) },
      { nome: 'Luzes de navegação', cor: VERMELHO, brilho: true, geos: [45, 135].map((a) => esfera(0.025, { p: [0.72 * cos((a * PI) / 180), 0.4, 0.72 * sin((a * PI) / 180)] })) }
    ]
  }
]

mkdirSync(PASTA, { recursive: true })
// Mantém os que vêm de outros geradores (as peças para imprimir, de hardware/gerar.ts)
let lista = []
try { lista = JSON.parse(readFileSync(join(PASTA, 'designs.json'), 'utf8')).filter((d) => !DESIGNS.some((n) => n.arquivo === d.arquivo)) } catch { /* primeira vez */ }
for (const d of DESIGNS) {
  const dados = glb(d.nome, d.pecas)
  writeFileSync(join(PASTA, d.arquivo), dados)
  lista.push({ arquivo: d.arquivo, nome: d.nome, apelidos: d.apelidos })
  console.log(`${d.arquivo}: ${d.pecas.length} peças, ${(dados.length / 1024).toFixed(0)} KB`)
}
// O que a FRIDAY importa sozinha na primeira vez (nome e apelidos de cada um)
writeFileSync(join(PASTA, 'designs.json'), JSON.stringify(lista, null, 2) + '\n')
