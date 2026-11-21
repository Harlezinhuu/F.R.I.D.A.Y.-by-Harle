// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Relatório da semana: quando sai, a semana certa, a parte de programação e o texto final.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emMarkdown, horaDoRelatorio, resumoFalado, secaoProgramacao, semanaDe } from '../src/main/logica/relatorio.ts'

test('semana de segunda a domingo e a hora certa (domingo à noite ou segunda cedo)', () => {
  const domingo = new Date(2026, 10, 22, 20, 0)
  assert.equal(semanaDe(domingo).chave, '2026-11-16')
  assert.equal(semanaDe(new Date(2026, 10, 16, 1)).chave, '2026-11-16')
  assert.equal(horaDoRelatorio(domingo, ''), true)
  assert.equal(horaDoRelatorio(domingo, '2026-11-16'), false, 'uma vez por semana')
  assert.equal(horaDoRelatorio(new Date(2026, 10, 22, 15), ''), false, 'domingo à tarde ainda não')
  assert.equal(horaDoRelatorio(new Date(2026, 10, 23, 9), ''), true, 'segunda cedo, se o PC estava desligado')
  assert.equal(horaDoRelatorio(new Date(2026, 10, 23, 9), '2026-11-16'), false)
  assert.equal(horaDoRelatorio(new Date(2026, 10, 25, 20), ''), false)
})

test('programação e o texto final', () => {
  const s = secaoProgramacao([{ projeto: 'FRIDAY', commits: ['Pix', 'Backup', 'Agenda'] }, { projeto: 'Harle Bot', commits: ['Corrige música'] }, { projeto: 'Parado', commits: [] }], [{ pedido: 'Consertar erro da pesquisa', estado: 'pronta' }, { pedido: 'x', estado: 'falhou' }])
  assert.equal(s.resumo, 'Você fez 4 mudanças em 2 projetos, mais no FRIDAY')
  assert.deepEqual(s.linhas, ['FRIDAY: 3 mudanças (Pix; Backup; Agenda)', 'Harle Bot: 1 mudança (Corrige música)', 'Tarefas do Claude Code prontas: Consertar erro da pesquisa'])
  assert.equal(secaoProgramacao([], []).resumo, 'Nenhuma mudança de código esta semana')
  const md = emMarkdown('Semana de 16 de novembro', [s, { titulo: 'GitHub', linhas: ['x ganhou 1 estrela.'], resumo: 'No GitHub: 1 novidade' }])
  assert.match(md, /^# Semana de 16 de novembro\n\n## Programação\n\n\*\*Você fez 4 mudanças/)
  assert.equal(resumoFalado([s, { titulo: 'A', linhas: [], resumo: '' }, { titulo: 'G', linhas: [], resumo: 'No GitHub: 1 novidade' }]), 'Resumo da semana: Você fez 4 mudanças em 2 projetos, mais no FRIDAY. No GitHub: 1 novidade.')
})
