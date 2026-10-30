import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descreverPredio, lerGitStatus, montarPredio } from '../src/main/logica/predio.ts'

const ARQUIVOS = [
  { caminho: 'package.json', linhas: 40 },
  { caminho: 'README.md', linhas: 300 },
  { caminho: 'src/main/index.ts', linhas: 400 },
  { caminho: 'src/main/tools.ts', linhas: 900 },
  { caminho: 'src/main/logica/rede.ts', linhas: 95 },
  { caminho: 'src/renderer/src/main.ts', linhas: 1100 },
  { caminho: 'src/renderer/src/hud/hud.ts', linhas: 340 },
  { caminho: 'src/shared/tools.ts', linhas: 700 },
  { caminho: 'src/shared/elo.ts', linhas: 150 },
  { caminho: 'src/preload/index.ts', linhas: 60 },
  { caminho: 'tests/rede.test.ts', linhas: 120 },
  { caminho: 'tests/ar.test.ts', linhas: 180 }
]

test('pastas viram andares; o "src" que tem quase tudo é aberto em subpastas; térreo embaixo', () => {
  const p = montarPredio('FRIDAY', ARQUIVOS, [], [])
  assert.equal(p.andares[0].nome, 'TÉRREO')
  assert.deepEqual(p.andares[0].salas.map((s) => s.nome), ['README.md', 'package.json'])
  const nomes = p.andares.map((a) => a.nome)
  for (const n of ['MAIN', 'RENDERER', 'SHARED', 'PRELOAD', 'TESTS']) assert.ok(nomes.includes(n), `${n} em ${nomes}`)
  assert.ok(!nomes.includes('SRC'))
  // Do maior para o menor, subindo
  const semTerreo = p.andares.slice(1).map((a) => a.linhas)
  assert.deepEqual(semTerreo, [...semTerreo].sort((a, b) => b - a))
  assert.equal(p.arquivos, ARQUIVOS.length)
  assert.equal(p.linhas, ARQUIVOS.reduce((s, a) => s + a.linhas, 0))
})

test('teste falhando acende a sala e o andar de vermelho; mexido e não enviado fica âmbar', () => {
  const p = montarPredio('FRIDAY', ARQUIVOS, ['C:/Users/Ahmad/FRIDAY/src/main/logica/rede.ts'], ['src/shared/elo.ts', 'src/main/logica/rede.ts'])
  const main = p.andares.find((a) => a.nome === 'MAIN')!
  assert.equal(main.estado, 'falha')
  assert.equal(main.salas[0].nome, 'rede.ts')
  assert.equal(main.salas[0].estado, 'falha')
  assert.equal(p.andares.find((a) => a.nome === 'SHARED')!.estado, 'mudado')
  assert.equal(p.falhas, 1)
  assert.equal(p.mudados, 1)
  assert.match(descreverPredio(p), /1 sala está em vermelho: teste falhando em main/)
})

test('muitas pastas: as menores viram "OUTROS"; salas limitadas por andar', () => {
  const muitos = Array.from({ length: 30 }, (_, i) => ({ caminho: `p${i}/a.ts`, linhas: 100 - i })).concat(Array.from({ length: 40 }, (_, i) => ({ caminho: `p0/x${i}.ts`, linhas: 1 })))
  const p = montarPredio('X', muitos, [], [], 8, 10)
  assert.equal(p.andares.length, 8)
  assert.equal(p.andares[7].nome, 'OUTROS')
  assert.ok(p.andares.every((a) => a.salas.length <= 10))
})

test('git status: novos e mudados entram, apagados não, renomeado vale o nome novo', () => {
  const s = ' M src/a.ts\n?? novo.ts\n D velho.ts\nR  antes.ts -> depois.ts\nAM "com espaço.ts"\n'
  assert.deepEqual(lerGitStatus(s), ['src/a.ts', 'novo.ts', 'depois.ts', 'com espaço.ts'])
})
