import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { semelhanca, reconhecer, podeUsar, quemEsta, filtrarAmostras, type Pessoa } from '../src/shared/rostos.ts'

// Assinaturas de verdade (modelo faceres do Human) de rostos sintéticos (CGI) das amostras do Human, licença MIT:
// "a" em quatro capturas (original, espelhada, escura, girada) e duas outras pessoas, "b" e "c"
const R = JSON.parse(readFileSync(new URL('./dados/rostos.json', import.meta.url), 'utf8')) as Record<string, number[]>
const ana = [R.a, R.a_espelho]
const pessoa = (nome: string, papel: 'dono' | 'convidado', descritores: number[][]): Pessoa => ({ id: nome, nome, papel, descritores, criadoEm: '' })

test('a conta é a mesma do Human', () => {
  assert.equal(semelhanca(ana[0], ana[0]), 1)
  assert.equal(semelhanca(ana[0], ana[1]), 0.97)
  assert.equal(semelhanca(ana[0], R.b), 0.36)
  assert.equal(semelhanca([1, 2], [1]), 0)
})

test('reconhece a mesma pessoa numa captura nova e recusa outra pessoa', () => {
  const pessoas = [pessoa('Ana', 'dono', ana), pessoa('Bia', 'convidado', [R.b])]
  assert.equal(reconhecer(R.a_escuro, pessoas)?.pessoa.nome, 'Ana')
  assert.equal(reconhecer(R.a_girado, pessoas)?.pessoa.nome, 'Ana')
  assert.equal(reconhecer(R.c, pessoas), null)
})

test('empate entre duas pessoas não arrisca', () => {
  const pessoas = [pessoa('A', 'dono', [ana[0]]), pessoa('B', 'convidado', [ana[0]])]
  assert.equal(reconhecer(ana[0], pessoas), null)
})

test('só o dono mexe em arquivos, memória e energia', () => {
  assert.ok(podeUsar('apagar_arquivo', 'dono'))
  assert.ok(!podeUsar('apagar_arquivo', 'convidado'))
  assert.ok(!podeUsar('energia_pc', null))
  assert.ok(podeUsar('clima', null))
  assert.ok(podeUsar('projetar', 'convidado'))
})

test('a linha de quem está falando', () => {
  const p = pessoa('Harle', 'dono', ana)
  assert.equal(quemEsta(null, false, 'Harle'), '')
  assert.match(quemEsta({ pessoa: p, semelhanca: 0.8 }, true, 'Harle'), /Harle, o dono/)
  assert.match(quemEsta(null, true, 'Harle'), /visitante/)
})

test('amostra de outra pessoa no meio do cadastro sai', () => {
  const r = filtrarAmostras([ana[0], ana[1], R.a_escuro, R.b], 3)
  assert.ok(!r.includes(R.b))
  assert.equal(r.length, 3)
})
