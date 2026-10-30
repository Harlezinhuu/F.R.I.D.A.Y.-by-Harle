import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharDesign, caminhoDoZip, dependenciasDoGltf, embutirGltf, modeloPrincipal, nomeDoArquivo, nomeLivre, nomeSeguro, type Design } from '../src/main/logica/designs.ts'

test('nome do arquivo vira nome falável', () => {
  assert.equal(nomeDoArquivo('mk_arc-reactor_FINAL_v3.glb'), 'mk arc reactor final v3')
  assert.equal(nomeDoArquivo('C:\\\\Users\\\\Ahmad\\\\Downloads\\\\holoTable.gltf'), 'holo table')
  assert.equal(nomeSeguro('Mesa: "holo" / v2?'), 'Mesa holo v2')
  assert.equal(nomeLivre('reator', ['Reator', 'reator 2']), 'reator 3')
})

test('zip não escreve fora da pasta nem traz lixo do macOS', () => {
  assert.equal(caminhoDoZip('modelo/scene.gltf'), 'modelo/scene.gltf')
  assert.equal(caminhoDoZip('modelo\\\\textures\\\\a.png'), 'modelo/textures/a.png')
  for (const ruim of ['../fora.glb', 'a/../../fora.glb', '/etc/passwd', 'C:/Windows/x.dll', '__MACOSX/a/._x.glb', 'pasta/', 'a/.DS_Store']) assert.equal(caminhoDoZip(ruim), null, ruim)
})

test('modelo principal do pacote: glb, depois gltf; o mais raso e o maior', () => {
  assert.equal(modeloPrincipal([{ caminho: 'a/scene.gltf', tamanho: 10 }, { caminho: 'b/peca.glb', tamanho: 5 }, { caminho: 'leia.txt', tamanho: 1 }]), 'b/peca.glb')
  assert.equal(modeloPrincipal([{ caminho: 'x/y/scene.gltf', tamanho: 99 }, { caminho: 'scene.gltf', tamanho: 10 }]), 'scene.gltf')
  assert.equal(modeloPrincipal([{ caminho: 'leia.txt', tamanho: 1 }]), null)
})

test('gltf: embute o .bin e as texturas e diz o que falta', () => {
  const gltf = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'scene.bin', byteLength: 3 }], images: [{ uri: 'textures/cor%20base.png' }, { uri: 'falta.jpg' }, { uri: 'data:image/png;base64,AAAA' }] })
  assert.deepEqual(dependenciasDoGltf(gltf), ['scene.bin', 'textures/cor base.png', 'falta.jpg'])
  const arquivos: Record<string, Uint8Array> = { 'scene.bin': new Uint8Array([1, 2, 3]), 'textures/cor base.png': new Uint8Array([9]) }
  const r = embutirGltf(gltf, (u) => arquivos[u] ?? null)
  const g = JSON.parse(r.texto)
  assert.equal(g.buffers[0].uri, 'data:application/octet-stream;base64,AQID')
  assert.equal(g.images[0].uri, 'data:image/png;base64,CQ==')
  assert.equal(g.images[1].uri, 'falta.jpg')
  assert.equal(g.images[2].uri, 'data:image/png;base64,AAAA')
  assert.deepEqual(r.faltando, ['falta.jpg'])
  // Um .gltf que tenta ler fora da pasta não lê nada
  const mau = embutirGltf(JSON.stringify({ buffers: [{ uri: '../../segredo.bin' }] }), () => new Uint8Array([1]))
  assert.deepEqual(mau.faltando, ['../../segredo.bin'])
})

test('acha o design pelo nome, pelo apelido ou por palavras', () => {
  const l: Design[] = [
    { arquivo: 'reator.glb', nome: 'reator', apelidos: ['núcleo', 'arc'], importadoEm: '' },
    { arquivo: 'mesa/scene.gltf', nome: 'mesa holográfica', apelidos: [], importadoEm: '' },
    { arquivo: 'armadura.glb', nome: 'armadura vermelha', apelidos: ['traje'], importadoEm: '' }
  ]
  assert.equal(acharDesign(['reator'], l)?.arquivo, 'reator.glb')
  assert.equal(acharDesign(['Núcleo'], l)?.arquivo, 'reator.glb')
  assert.equal(acharDesign(['a mesa holografica'], l)?.arquivo, 'mesa/scene.gltf')
  assert.equal(acharDesign(['traje'], l)?.arquivo, 'armadura.glb')
  assert.equal(acharDesign(['armadura'], l)?.arquivo, 'armadura.glb')
  assert.equal(acharDesign(['satélite'], l), null)
})
