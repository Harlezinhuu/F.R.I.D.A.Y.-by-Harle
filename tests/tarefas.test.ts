// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slug, nomeBranch, validarProjetos, encontrarProjeto, argumentosMotor } from '../src/main/logica/tarefas.ts'

test('slug e branch', () => {
  assert.equal(slug('Criar a página de Contato com formulário!'), 'criar-a-pagina-de-contato')
  assert.equal(nomeBranch(7, 'Arrumar o README'), 'friday/tarefa-7-arrumar-o-readme')
  assert.equal(slug('!!!'), 'tarefa')
})

test('valida projetos e ignora comandos perigosos', () => {
  const r = validarProjetos([
    { nome: 'Site', pasta: 'C:\\\\Users\\\\Harle\\\\site', comandos: ['npm test', 'npm run build; del *', 'rm -rf / && x', 'git status'] },
    { nome: '', pasta: 'x' },
    { nome: 'Site', pasta: 'y' },
    { nome: 'Harle Bot', pasta: 'D:\\\\bot' }
  ])
  assert.deepEqual(r.projetos.map((p) => p.nome), ['Site', 'Harle Bot'])
  assert.deepEqual(r.projetos[0].comandos, ['npm test', 'git status'])
  assert.equal(r.avisos.length, 3)
  assert.equal(validarProjetos('x').projetos.length, 0)
})

test('encontra projeto pelo nome falado', () => {
  const { projetos } = validarProjetos([{ nome: 'Harle Bot', pasta: 'a' }, { nome: 'Site', pasta: 'b' }])
  assert.equal(encontrarProjeto('harle bot', projetos)?.pasta, 'a')
  assert.equal(encontrarProjeto('o site', projetos)?.pasta, 'b')
  assert.equal(encontrarProjeto('jogo', projetos), null)
})

test('sem comandos liberados, o terminal fica bloqueado', () => {
  const sem = argumentosMotor({ nome: 'a', pasta: 'b', comandos: [] })
  assert.ok(sem.includes('Bash'))
  assert.equal(sem.some((a) => a.startsWith('Bash(')), false)
  const com = argumentosMotor({ nome: 'a', pasta: 'b', comandos: ['npm test'] }, 'sonnet')
  assert.ok(com.includes('Bash(npm test:*)'))
  assert.equal(com.at(-1), 'sonnet')
  assert.equal(com.filter((a) => a === 'Bash').length, 0)
})
