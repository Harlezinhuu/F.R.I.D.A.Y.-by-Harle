// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Escreve um .glb (glTF binário) com uma malha por peça, cada uma com o nome e a cor dela.
// Funciona no navegador e no Node (sem Buffer): é como o editor de hologramas salva a versão nova.

export interface PecaGlb {
  nome: string
  /** Triângulos soltos: 9 números por triângulo */
  triangulos: Float32Array
  cor: [number, number, number]
  brilho?: boolean
}

function normais(t: Float32Array): Float32Array {
  const n = new Float32Array(t.length)
  for (let i = 0; i < t.length; i += 9) {
    const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2]
    const vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2]
    let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx
    const l = Math.hypot(x, y, z) || 1
    x /= l; y /= l; z /= l
    for (let k = 0; k < 9; k += 3) { n[i + k] = x; n[i + k + 1] = y; n[i + k + 2] = z }
  }
  return n
}

export function escreverGlb(nomeCena: string, pecas: PecaGlb[]): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = { asset: { version: '2.0', generator: 'FRIDAY by Harle · editor de hologramas' }, scene: 0, scenes: [{ name: nomeCena, nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }
  const blocos: Uint8Array[] = []
  let tamanho = 0
  const vista = (dados: Float32Array) => {
    const bytes = new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
    json.bufferViews.push({ buffer: 0, byteOffset: tamanho, byteLength: bytes.length, target: 34962 })
    blocos.push(bytes)
    tamanho += bytes.length
    return json.bufferViews.length - 1
  }
  for (const p of pecas) {
    if (p.triangulos.length < 9) continue
    const pos = p.triangulos.length % 9 ? p.triangulos.slice(0, p.triangulos.length - (p.triangulos.length % 9)) : p.triangulos
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]) }
    const a = json.accessors.length
    json.accessors.push(
      { bufferView: vista(pos), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: vista(normais(pos)), componentType: 5126, count: pos.length / 3, type: 'VEC3' }
    )
    json.materials.push({
      name: p.nome,
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [...p.cor, 1], metallicFactor: p.brilho ? 0 : 0.35, roughnessFactor: 0.45 },
      ...(p.brilho ? { emissiveFactor: p.cor } : {})
    })
    json.meshes.push({ name: p.nome, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, material: json.materials.length - 1 }] })
    json.nodes.push({ name: p.nome, mesh: json.meshes.length - 1 })
    json.scenes[0].nodes.push(json.nodes.length - 1)
  }
  json.buffers.push({ byteLength: tamanho })
  const texto0 = new TextEncoder().encode(JSON.stringify(json))
  const padJ = (4 - (texto0.length % 4)) % 4
  const texto = new Uint8Array(texto0.length + padJ).fill(0x20)
  texto.set(texto0)
  const padB = (4 - (tamanho % 4)) % 4
  const total = 12 + 8 + texto.length + 8 + tamanho + padB
  const out = new Uint8Array(total)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true)
  v.setUint32(12, texto.length, true); v.setUint32(16, 0x4e4f534a, true)
  out.set(texto, 20)
  let p = 20 + texto.length
  v.setUint32(p, tamanho + padB, true); v.setUint32(p + 4, 0x004e4942, true)
  p += 8
  for (const b of blocos) { out.set(b, p); p += b.length }
  return out
}
