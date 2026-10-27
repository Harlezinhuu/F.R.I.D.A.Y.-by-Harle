import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharApp, acharContato, numeroWhatsapp, diasDoAlarme, botaoSensivel, resumirTela, pareceNumero, horaMinuto } from '../mobile/src/celular-logica.ts'

const apps = [
  { nome: 'WhatsApp', pacote: 'com.whatsapp' },
  { nome: 'Spotify', pacote: 'com.spotify.music' },
  { nome: 'Configurações', pacote: 'com.android.settings' },
  { nome: 'YouTube', pacote: 'com.google.android.youtube' },
  { nome: 'YouTube Music', pacote: 'com.google.android.apps.youtube.music' },
  { nome: 'Câmera', pacote: 'com.sec.android.app.camera' }
]

test('acha apps pelo nome e pelos apelidos', () => {
  assert.equal(acharApp('spotify', apps).app?.pacote, 'com.spotify.music')
  assert.equal(acharApp('zap', apps).app?.pacote, 'com.whatsapp')
  assert.equal(acharApp('ajustes', apps).app?.pacote, 'com.android.settings')
  assert.equal(acharApp('camera', apps).app?.pacote, 'com.sec.android.app.camera')
  assert.equal(acharApp('youtube', apps).app?.pacote, 'com.google.android.youtube')
  assert.equal(acharApp('youtube music', apps).app?.pacote, 'com.google.android.apps.youtube.music')
  assert.equal(acharApp('netflix', apps).app, null)
})

const contatos = [
  { nome: 'Mãe ❤️', numeros: [{ numero: '(11) 3333-4444', tipo: 'Casa', celular: false }, { numero: '+55 11 98888-7777', tipo: 'Celular', celular: true }] },
  { nome: 'Pedro Silva', numeros: [{ numero: '11 97777-6666', tipo: 'Celular', celular: true }] },
  { nome: 'Pedro Souza', numeros: [{ numero: '11 96666-5555', tipo: 'Celular', celular: true }] }
]

test('acha o contato e prefere o celular', () => {
  const r = acharContato('mãe', contatos)
  assert.ok(r && 'contato' in r)
  assert.equal(r.numero.numero, '+55 11 98888-7777')
  const s = acharContato('pro Pedro Silva', contatos)
  assert.ok(s && 'contato' in s && s.contato.nome === 'Pedro Silva')
})

test('nome ambíguo devolve as opções', () => {
  const r = acharContato('pedro', contatos)
  assert.ok(r && 'varios' in r)
  assert.deepEqual(r.varios, ['Pedro Silva', 'Pedro Souza'])
  assert.equal(acharContato('joana', contatos), null)
})

test('número do WhatsApp com código do país', () => {
  assert.equal(numeroWhatsapp('(11) 98888-7777'), '5511988887777')
  assert.equal(numeroWhatsapp('+1 (415) 555-0100'), '14155550100')
  assert.equal(numeroWhatsapp('015 11 98888-7777'), '5511988887777')
  assert.equal(numeroWhatsapp('5511988887777'), '5511988887777')
  assert.ok(pareceNumero('11 98888-7777'))
  assert.ok(!pareceNumero('mãe'))
})

test('dias do alarme', () => {
  assert.deepEqual(diasDoAlarme('dias úteis'), [2, 3, 4, 5, 6])
  assert.deepEqual(diasDoAlarme('todo dia'), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(diasDoAlarme('segunda e quarta'), [2, 4])
  assert.deepEqual(diasDoAlarme(''), [])
})

test('botões sensíveis pedem confirmação', () => {
  assert.ok(botaoSensivel('Finalizar compra'))
  assert.ok(botaoSensivel('Pagar com Pix'))
  assert.ok(botaoSensivel('Enviar'))
  assert.ok(botaoSensivel('Excluir conversa'))
  assert.ok(!botaoSensivel('Buscar'))
  assert.ok(!botaoSensivel('Tocar'))
})

test('resumo da tela', () => {
  const t = resumirTela({ pacote: 'com.spotify.music', elementos: [{ i: 0, texto: 'Buscar', tipo: 'botão', toca: true }, { i: 1, texto: 'Senha', tipo: 'campo', campo: true, senha: true }] })
  assert.match(t, /#0 botão "Buscar" \(toca\)/)
  assert.match(t, /SENHA/)
})

test('hora do alarme', () => {
  assert.deepEqual(horaMinuto('2026-10-28T07:30:00'), { hora: 7, minuto: 30 })
  assert.deepEqual(horaMinuto('19h'), { hora: 19, minuto: 0 })
  assert.equal(horaMinuto('nada'), null)
})
