// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// GitHub: leitura dos repositórios, o que mudou, estado do build e dicas para o portfólio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dicasDoPortfolio, donoDaUrl, lerCi, lerRepos, novidades, resumoDosRepos } from '../src/main/logica/github.ts'

const repos = lerRepos([
  { name: 'harle-bot', full_name: 'Harlezinhuu/harle-bot', description: 'Bot de Discord', stargazers_count: 3, open_issues_count: 1, language: 'TypeScript', topics: ['discord-bot'], license: { key: 'mit' }, pushed_at: '2026-11-20T10:00:00Z', default_branch: 'main' },
  { name: 'friday', full_name: 'Harlezinhuu/friday', description: null, stargazers_count: 0, open_issues_count: 0, language: 'TypeScript', topics: [], license: null, pushed_at: '2026-11-21T10:00:00Z' },
  { name: 'fork-de-algo', full_name: 'Harlezinhuu/fork-de-algo', fork: true, pushed_at: '2026-11-21T11:00:00Z' },
  { name: 'privado', full_name: 'Harlezinhuu/privado', private: true, pushed_at: '2026-11-21T11:00:00Z' }
])

test('repositórios: leitura, resumo e dono pela URL', () => {
  assert.equal(repos.length, 4)
  assert.equal(repos[1].descricao, '')
  assert.equal(repos[1].ramo, 'main')
  assert.equal(resumoDosRepos(repos, { friday: 'falhou', 'harle-bot': 'ok' }), '2 projetos públicos, 3 estrelas no total. Build quebrado em: friday. Com issue ou pull request aberto: harle-bot (1).')
  assert.equal(donoDaUrl('https://github.com/Harlezinhuu/friday-privado.git'), 'Harlezinhuu')
  assert.equal(donoDaUrl('git@github.com:Harlezinhuu/x.git'), 'Harlezinhuu')
})

test('build: estado do último run e o que mudou desde a última olhada', () => {
  assert.equal(lerCi({ workflow_runs: [{ status: 'completed', conclusion: 'failure' }] }), 'falhou')
  assert.equal(lerCi({ workflow_runs: [{ status: 'in_progress', conclusion: null }] }), 'rodando')
  assert.equal(lerCi({ workflow_runs: [] }), '')
  const ns = novidades(
    { a: { estrelas: 1, abertos: 0, ci: 'ok' }, b: { estrelas: 0, abertos: 0, ci: 'falhou' } },
    { a: { estrelas: 3, abertos: 1, ci: 'falhou' }, b: { estrelas: 0, abertos: 0, ci: 'ok' }, novo: { estrelas: 9, abertos: 0, ci: 'falhou' } })
  assert.deepEqual(ns.map((n) => n.tipo).sort(), ['aberto', 'estrela', 'quebrou', 'voltou'])
  assert.match(ns.find((n) => n.tipo === 'estrela')!.texto, /a ganhou 2 estrelas/)
})

test('dicas para o portfólio: README primeiro, sem fork nem privado', () => {
  const d = dicasDoPortfolio(repos, new Set(['friday']))
  assert.match(d[0], /^friday: falta um README/)
  assert.ok(d.some((x) => /friday: falta a descrição/.test(x)))
  assert.ok(!d.some((x) => /fork-de-algo|privado/.test(x)))
  assert.ok(!d.some((x) => /harle-bot: (falta|sem)/.test(x)), 'o harle-bot já está bem apresentado')
})
