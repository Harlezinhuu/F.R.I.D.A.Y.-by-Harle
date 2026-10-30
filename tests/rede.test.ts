import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharAparelho, atualizar, fabricante, lerArp, lerOui, macAleatorio, mbps, nomeCurto, nomeDoAparelho } from '../src/main/logica/rede.ts'

const ARP_WINDOWS = `
Interface: 192.168.0.10 --- 0x7
  Endereço IP           Endereço físico       Tipo
  192.168.0.1           a4-2b-b0-11-22-33     dinâmico
  192.168.0.37          8c-de-f9-44-55-66     dinâmico
  192.168.0.52          da-a1-19-77-88-99     dinâmico
  192.168.0.255         ff-ff-ff-ff-ff-ff     estático
  224.0.0.22            01-00-5e-00-00-16     estático
`

test('lê a tabela ARP do Windows e ignora broadcast', () => {
  const v = lerArp(ARP_WINDOWS)
  assert.deepEqual(v.map((x) => x.ip), ['192.168.0.1', '192.168.0.37', '192.168.0.52'])
  assert.equal(v[0].mac, 'A4:2B:B0:11:22:33')
  assert.deepEqual(lerArp('? (192.168.1.5) at 0:1a:2b:3:4:5 on en0 ifscope [ethernet]').map((x) => x.mac), ['00:1A:2B:03:04:05'])
})

test('fabricante pela lista da IEEE e endereço privado de celular', () => {
  const oui = lerOui('A4-2B-B0   (hex)\t\tTP-LINK TECHNOLOGIES CO.,LTD.\n8C-DE-F9   (hex)\t\tBeijing Xiaomi Mobile Software Co., Ltd\n')
  assert.equal(fabricante('A4:2B:B0:11:22:33', oui), 'TP-LINK')
  assert.equal(nomeCurto('Samsung Electronics Co.,Ltd'), 'Samsung')
  assert.equal(macAleatorio('DA:A1:19:77:88:99'), true)
  assert.match(fabricante('DA:A1:19:77:88:99', oui), /endereço privado/)
})

test('primeira varredura aprende; depois, quem aparece é novo', () => {
  const v = (ip: string, mac: string) => ({ ip, mac, host: '', fabricante: 'X' })
  const a = atualizar([], [v('192.168.0.1', 'AA'), v('192.168.0.37', 'BB')], 1000, true)
  assert.equal(a.novos.length, 0)
  const b = atualizar(a.aparelhos, [v('192.168.0.1', 'AA'), v('192.168.0.88', 'CC')], 2000, false)
  assert.deepEqual(b.novos.map((x) => x.mac), ['CC'])
  assert.equal(b.aparelhos.find((x) => x.mac === 'BB')!.ultimaVez, 1000)
})

test('nomes e busca de aparelho', () => {
  const ap = { mac: 'BB', ip: '192.168.0.37', apelido: '', fabricante: 'Xiaomi', host: 'redmi-note.lan', primeiraVez: 0, ultimaVez: 0 }
  assert.equal(nomeDoAparelho(ap), 'redmi-note (Xiaomi)')
  assert.equal(acharAparelho('37', [ap]), ap)
  assert.equal(acharAparelho('xiaomi', [ap]), ap)
  assert.equal(nomeDoAparelho({ ...ap, apelido: 'celular da mãe' }), 'celular da mãe')
  assert.equal(mbps(0, 5_000_000, 4), 10)
})
