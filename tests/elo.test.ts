import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abrir, chaveDoCodigo, chaveElo, lacrar, lerPareamento, novoCodigo, novoSegredo, textoDoPareamento } from '../src/shared/elo.ts'
import { gerarQR, qrSvg } from '../src/shared/qr.ts'
import { mesclarMemoria, type Fato } from '../src/main/logica/memoria.ts'

test('lacra e abre com a mesma chave', async () => {
  const k = await chaveElo('segredo-de-teste')
  const env = await lacrar(k, { acao: 'ping', x: 'ação ✓' })
  assert.deepEqual(await abrir(k, env), { acao: 'ping', x: 'ação ✓' })
})

test('chave errada, repetição e envelope adulterado falham', async () => {
  const k = await chaveElo('a'), outra = await chaveElo('b')
  const env = await lacrar(k, 1)
  await assert.rejects(abrir(outra, env))
  const vistos = new Map<string, number>()
  await abrir(k, env, vistos)
  await assert.rejects(abrir(k, env, vistos), /repetida/)
  const bytes = Buffer.from(env, 'base64'); bytes[bytes.length - 1] ^= 1
  await assert.rejects(abrir(k, bytes.toString('base64')))
})

test('código de pareamento: só os dígitos contam', async () => {
  const c = novoCodigo()
  assert.match(c, /^\d{4}-\d{4}$/)
  const env = await lacrar(await chaveDoCodigo(c), 'oi')
  assert.equal(await abrir(await chaveDoCodigo(c.replace('-', ' ')), env), 'oi')
})

test('texto do QR vai e volta', () => {
  const p = { nome: 'DESKTOP HARLE', porta: 47923, segredo: novoSegredo(), ips: ['192.168.0.10', '100.101.1.2'], macs: ['AA:BB:CC:DD:EE:FF'] }
  const t = textoDoPareamento(p)
  assert.deepEqual(lerPareamento(t), { ...p, nome: 'DESKTOP-HARLE' })
  assert.equal(lerPareamento('qualquer coisa'), null)
  assert.equal(lerPareamento('FRIDAY1|x|99999|abc|1.2.3.4|'), null)
})

test('QR: tamanho certo para o texto do pareamento e SVG com margem', () => {
  const t = 'FRIDAY1|DESKTOP-HARLE|47923|' + 'k'.repeat(43) + '|192.168.0.10,100.101.12.7|AA:BB:CC:DD:EE:FF'
  const m = gerarQR(t)
  assert.equal(m.length, 45) // versão 7
  assert.ok(m[0][0] && m[6][6] && !m[7][7]) // localizador e separador
  assert.match(qrSvg('FRIDAY'), /^<svg[^>]+viewBox="0 0 29 29"/)
  assert.throws(() => gerarQR('x'.repeat(500)))
})

const fato = (id: string, texto: string, dia: number): Fato => ({ id, texto, categoria: 'outro', criadoEm: `2026-10-${String(dia).padStart(2, '0')}T10:00:00Z` })

test('memória do PC e do celular se juntam sem repetir e sem ressuscitar o que foi esquecido', () => {
  const pc = [fato('1', 'Gosta de café sem açúcar', 1), fato('2', 'Trabalha com Electron', 2)]
  const cel = [fato('3', 'gosta de cafe sem acucar', 3), fato('4', 'Tem um cachorro chamado Thor', 4), fato('5', 'Torce para o Palmeiras', 5)]
  const r = mesclarMemoria(pc, cel, ['Torce para o Palmeiras'])
  assert.deepEqual(r.map((f) => f.id), ['1', '2', '4'])
})
