import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { resolverCaminho, caminhoAmigavel, type ChavePasta } from '../src/main/logica/caminhos.ts'

const p = path.posix
const raizes: Record<ChavePasta, string> = {
  desktop: '/u/Desktop', documents: '/u/Documents', downloads: '/u/Downloads',
  pictures: '/u/Pictures', music: '/u/Music', videos: '/u/Videos'
}

test('resolve apelidos com acento e barras dos dois tipos', () => {
  const r = resolverCaminho('Área de Trabalho\\projetos/nota.txt', raizes, p)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.absoluto, '/u/Desktop/projetos/nota.txt')
  const f = resolverCaminho('fotos/praia.png', raizes, p)
  assert.equal(f.ok && f.absoluto, '/u/Pictures/praia.png')
})

test('recusa sair da pasta pessoal', () => {
  assert.equal(resolverCaminho('downloads/../../etc/passwd', raizes, p).ok, false)
  assert.equal(resolverCaminho('downloads/a:b', raizes, p).ok, false)
})

test('recusa pastas que não são pessoais', () => {
  assert.equal(resolverCaminho('windows/system32', raizes, p).ok, false)
  assert.equal(resolverCaminho('', raizes, p).ok, false)
  assert.equal(resolverCaminho('downloads/a*.png', raizes, p).ok, false)
})

test('a própria raiz é válida', () => {
  const r = resolverCaminho('downloads', raizes, p)
  assert.equal(r.ok && r.absoluto, '/u/Downloads')
})

test('caminho amigável', () => {
  assert.equal(caminhoAmigavel('/u/Downloads/x/y.zip', raizes, p), 'Downloads/x/y.zip')
})
