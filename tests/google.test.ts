// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Agenda e e-mail do Google: login com PKCE, compromissos, avisos, evento novo e e-mails.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { agendaEmTexto, ehAutomatico, emailsEmTexto, eventoNovo, lerCompromissos, lerEmail, nomeDoRemetente, novoPkce, paraAvisar, urlDeLogin } from '../src/main/logica/google.ts'

test('login: PKCE S256 e a URL do Google', () => {
  const p = novoPkce()
  assert.ok(p.verificador.length >= 43 && /^[A-Za-z0-9_-]+$/.test(p.verificador))
  assert.equal(p.desafio, createHash('sha256').update(p.verificador).digest('base64url'))
  const u = new URL(urlDeLogin('id.apps.googleusercontent.com', 'http://127.0.0.1:5000', p.desafio, p.estado))
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('access_type'), 'offline')
  assert.match(u.searchParams.get('scope')!, /calendar\.events .*gmail\.readonly/)
  assert.ok(!/gmail\.(send|modify|compose)|mail\.google\.com/.test(u.searchParams.get('scope')!), 'e-mail só leitura')
})

const hoje = new Date(2026, 10, 23, 8, 0)
const ev = (id: string, ini: string, titulo: string, extra = {}) => ({ id, summary: titulo, start: { dateTime: ini }, end: { dateTime: ini }, ...extra })

test('agenda: lê, ordena, ignora cancelados e fala por dia', () => {
  const cs = lerCompromissos({ items: [
    ev('b', new Date(2026, 10, 24, 14, 30).toISOString(), 'Reunião com a padaria', { location: 'Centro' }),
    ev('a', new Date(2026, 10, 23, 9, 0).toISOString(), 'Dentista'),
    { id: 'c', status: 'cancelled', summary: 'Cancelado', start: { dateTime: new Date(2026, 10, 23, 10).toISOString() } },
    { id: 'd', summary: 'Aniversário da mãe', start: { date: '2026-11-25' }, end: { date: '2026-11-26' } }
  ] })
  assert.deepEqual(cs.map((c) => c.titulo), ['Dentista', 'Reunião com a padaria', 'Aniversário da mãe'])
  assert.equal(cs[2].diaInteiro, true)
  const t = agendaEmTexto(cs, hoje)
  assert.match(t, /^Hoje: 09:00 Dentista\. Amanhã: 14:30 Reunião com a padaria \(Centro\)\. .*o dia todo Aniversário da mãe\.$/)
  assert.equal(agendaEmTexto([], hoje), 'Nada na agenda nesse período.')
})

test('aviso 15 minutos antes, uma vez só', () => {
  const agora = new Date(2026, 10, 23, 8, 50)
  const cs = lerCompromissos({ items: [ev('a', new Date(2026, 10, 23, 9, 0).toISOString(), 'Dentista'), ev('b', new Date(2026, 10, 23, 10, 0).toISOString(), 'Aula')] })
  const p = paraAvisar(cs, agora, [])
  assert.deepEqual(p.map((c) => c.titulo), ['Dentista'])
  assert.equal(paraAvisar(cs, agora, [`a@${cs[0].inicio.toISOString()}`]).length, 0)
})

test('evento novo: hora local, dia inteiro, duração e sem convidados', () => {
  const e = eventoNovo({ titulo: 'Dentista', inicio: '2026-11-27T15:00', duracaoMin: 45, local: 'Rua X' }) as { start: { dateTime: string; timeZone: string }; end: { dateTime: string }; attendees?: unknown }
  assert.equal(e.start.dateTime, '2026-11-27T15:00:00')
  assert.equal(e.end.dateTime, '2026-11-27T15:45:00')
  assert.equal(e.start.timeZone, 'America/Sao_Paulo')
  assert.equal(e.attendees, undefined)
  const d = eventoNovo({ titulo: 'Feriado', inicio: '2026-12-25' }) as { start: { date: string }; end: { date: string } }
  assert.deepEqual([d.start.date, d.end.date], ['2026-12-25', '2026-12-26'])
  assert.throws(() => eventoNovo({ titulo: 'x', inicio: 'sexta às 3' }), /Não entendi a data/)
  assert.throws(() => eventoNovo({ titulo: 'x', inicio: '2026-11-27T15:00', fim: '2026-11-27T14:00' }), /fim ficou antes/)
})

test('e-mails: remetente, propaganda de fora e o resumo', () => {
  assert.equal(nomeDoRemetente('"Maria Souza" <maria@x.com>'), 'Maria Souza')
  assert.equal(nomeDoRemetente('loja@x.com'), 'loja@x.com')
  const m = lerEmail({ id: '1', snippet: 'Oi Ahmad, o material est&aacute; pronto &amp; segue', internalDate: '1795000000000', payload: { headers: [{ name: 'From', value: 'Maria Souza <maria@x.com>' }, { name: 'Subject', value: 'Material do site' }] } })
  assert.equal(m.assunto, 'Material do site')
  assert.match(m.trecho, /pronto & segue/)
  const promo = lerEmail({ id: '2', payload: { headers: [{ name: 'From', value: 'Loja <no-reply@loja.com>' }, { name: 'Subject', value: 'Black Friday: 50% off' }] } })
  assert.equal(ehAutomatico(promo), true)
  assert.equal(emailsEmTexto([m, promo]), '1 e-mail que importa: Maria Souza: "Material do site". E mais 1 automático.')
  assert.equal(emailsEmTexto([promo]), 'Um e-mail novo, mas parece automático ou propaganda.')
})
