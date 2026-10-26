// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Transforma o que o processo principal buscou (arquivo 3D, molécula, proteína ou as peças da IA)
// num modelo pronto para a projeção.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import dracoWrapper from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url'
import dracoWasm from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url'
import type { DadosModelo3D, PecaPrimitiva } from '../../../shared/types'
import type { Modelo3D } from './tipos'
import { partesDeObjeto } from './malha'
import { moleculaDeSdf, proteinaDePdb } from './molecula'

/**
 * Decodificador de modelos comprimidos (Draco, usado pelos modelos da NASA). Os arquivos vêm do
 * próprio three e vão junto no build, então funciona offline. O DRACOLoader pede os arquivos pelo
 * nome; aqui eles são trocados pelo endereço que o Vite gerou.
 */
const ARQUIVOS_DRACO: Record<string, string> = { 'draco_wasm_wrapper.js': dracoWrapper, 'draco_decoder.wasm': dracoWasm }
class DracoLocal extends DRACOLoader {
  _loadLibrary(nome: string, tipo: string): Promise<string | ArrayBuffer> {
    const leitor = new THREE.FileLoader(this.manager)
    leitor.setResponseType(tipo)
    return new Promise((ok, erro) => leitor.load(ARQUIVOS_DRACO[nome] ?? nome, (d) => ok(d as string | ArrayBuffer), undefined, erro))
  }
}

const binario = (b64: string): ArrayBuffer => {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out.buffer
}

let gltf: GLTFLoader | null = null
function carregadorGltf(): GLTFLoader {
  if (gltf) return gltf
  gltf = new GLTFLoader()
  const draco = new DracoLocal()
  draco.setDecoderConfig({ type: 'wasm' })
  gltf.setDRACOLoader(draco)
  gltf.setMeshoptDecoder(MeshoptDecoder)
  return gltf
}

function medidaDe(obj: THREE.Object3D, unidade: string): Modelo3D['medidaReal'] {
  const t = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
  return { largura: t.x, altura: t.y, profundidade: t.z, unidade }
}

/** Monta o objeto a partir das peças simples que a IA descreveu. */
function objetoDePrimitivas(pecas: PecaPrimitiva[]): THREE.Object3D {
  const raiz = new THREE.Group()
  for (const p of pecas) {
    const geo =
      p.forma === 'esfera' ? new THREE.SphereGeometry(0.5, 24, 16)
        : p.forma === 'cilindro' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1)
          : p.forma === 'cone' ? new THREE.ConeGeometry(0.5, 1, 28, 1)
            : p.forma === 'toro' ? new THREE.TorusGeometry(0.4, 0.1, 14, 40)
              : p.forma === 'capsula' ? new THREE.CapsuleGeometry(0.25, 0.5, 6, 18)
                : new THREE.BoxGeometry(1, 1, 1)
    const m = new THREE.Mesh(geo)
    m.name = p.peca
    m.position.set(...p.posicao)
    m.scale.set(...p.tamanho)
    m.rotation.set(...(p.rotacao.map((g) => (g * Math.PI) / 180) as [number, number, number]))
    raiz.add(m)
  }
  return raiz
}

export async function modeloDeDados(d: DadosModelo3D): Promise<Modelo3D> {
  const base = { nome: d.nome, fonte: d.fonte, detalhes: d.detalhes, credito: d.credito }
  switch (d.formato) {
    case 'sdf': return moleculaDeSdf(d.texto ?? '', d.nome, d.credito ?? '')
    case 'pdb': return proteinaDePdb(d.texto ?? '', d.nome, d.credito ?? '')
    case 'primitivas': {
      const obj = objetoDePrimitivas(d.primitivas ?? [])
      return { ...base, partes: partesDeObjeto(obj, { agruparPorNome: true }) }
    }
    case 'stl': {
      const geo = new STLLoader().parse(binario(d.base64 ?? ''))
      const m = new THREE.Mesh(geo)
      m.name = d.nome
      if (d.zParaCima) m.rotation.x = -Math.PI / 2
      const partes = partesDeObjeto(m)
      const medidaReal = medidaDe(m, d.unidade ?? 'unidades do arquivo (em geral, milímetros)')
      geo.dispose()
      return { ...base, partes, medidaReal }
    }
    case 'obj': {
      const obj = new OBJLoader().parse(d.texto ?? '')
      return { ...base, partes: partesDeObjeto(obj), medidaReal: medidaDe(obj, d.unidade ?? 'unidades do arquivo') }
    }
    case 'glb':
    case 'gltf': {
      const dados = d.formato === 'glb' ? binario(d.base64 ?? '') : (d.texto ?? '')
      const cena = await new Promise<THREE.Object3D>((ok, erro) => carregadorGltf().parse(dados, '', (g) => ok(g.scene), (e: unknown) => erro(new Error(`Não consegui abrir o modelo: ${(e as { message?: string } | null)?.message ?? String(e)}`))))
      const partes = partesDeObjeto(cena)
      const medidaReal = d.unidade ? medidaDe(cena, d.unidade) : undefined
      // Libera o que o modelo carregou (texturas e geometrias): só as partículas ficam
      cena.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.geometry?.dispose()
        for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
          mat.dispose()
        }
      })
      return { ...base, partes, medidaReal }
    }
  }
}
