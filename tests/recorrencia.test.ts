// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proximaOcorrencia, primeiraOcorrencia } from '../src/main/logica/recorrencia.ts'

const d = (s: string) => new Date(s)

test('nunca não repete', () => {
  assert.equal(proximaOcorrencia(d('2026-10-24T09:00:00'), 'nunca', d('2026-10-24T09:00:01')), null)
})

test('diário mantém o horário e pula para depois de agora', () => {
  const r = proximaOcorrencia(d('2026-10-20T08:00:00'), 'diario', d('2026-10-24T10:00:00'))!
  assert.equal(r.getDate(), 25)
  assert.equal(r.getHours(), 8)
})

test('dias úteis pula o fim de semana', () => {
  // 23/10/2026 é sexta
  const r = proximaOcorrencia(d('2026-10-23T08:00:00'), 'dias_uteis', d('2026-10-23T08:00:01'))!
  assert.equal(r.getDay(), 1) // segunda
  assert.equal(r.getDate(), 26)
})

test('dias úteis criado no sábado começa na segunda', () => {
  const r = primeiraOcorrencia(d('2026-10-24T08:00:00'), 'dias_uteis')
  assert.equal(r.getDay(), 1)
})

test('semanal soma 7 dias', () => {
  const r = proximaOcorrencia(d('2026-10-23T19:00:00'), 'semanal', d('2026-10-23T19:00:00'))!
  assert.equal(r.getDate(), 30)
})

test('mensal no dia 31 vira o último dia do mês e volta ao 31', () => {
  const fev = proximaOcorrencia(d('2027-01-31T09:00:00'), 'mensal', d('2027-01-31T09:00:00'))!
  assert.equal(fev.getMonth(), 1)
  assert.equal(fev.getDate(), 28)
  const mar = proximaOcorrencia(d('2027-01-31T09:00:00'), 'mensal', d('2027-02-28T09:00:00'))!
  assert.equal(mar.getMonth(), 2)
  assert.equal(mar.getDate(), 31)
})
