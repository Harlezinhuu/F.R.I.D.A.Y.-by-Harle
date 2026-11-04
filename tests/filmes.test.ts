// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O que veio dos filmes: vigia de ameaças, raio-X, bem-estar, assuntos, cotações, sentinela e chegada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanciaKm, kpMaisRecente, lerAsteroides, lerTempestadeSolar, lerTempoSevero, lerTerremotos, novasParaAvisar, relatorio } from '../src/main/logica/vigia.ts'
import { analisar, maisPesados, resumoFalado } from '../src/main/logica/raiox.ts'
import { estadoInicial, passo, resumoDoDia } from '../src/main/logica/bemestar.ts'
import { lerManchetes, mesmaNoticia, novas } from '../src/main/logica/assuntos.ts'
import { codigoDaMoeda, converter, falarCotacao, lerCotacoes, responderCotacao } from '../src/shared/cotacao.ts'
import { DetectorDeMovimento, cinza, mudanca } from '../src/shared/sentinela.ts'
import { chegou, type Aparelho } from '../src/main/logica/rede.ts'
import { validarPassos } from '../src/main/logica/rotinas.ts'
import { SO_DONO } from '../src/shared/rostos.ts'
import { TOOL_DECLARATIONS, TOOLS_DO_HUD, TOOLS_REMOTAS } from '../src/shared/tools.ts'

// ---------- Vigia de ameaças ----------

const feed = {
  near_earth_objects: {
    '2026-11-04': [
      { id: '1', name: '(2026 AB)', is_potentially_hazardous_asteroid: false, estimated_diameter: { meters: { estimated_diameter_min: 20, estimated_diameter_max: 40 } }, close_approach_data: [{ close_approach_date: '2026-11-04', relative_velocity: { kilometers_per_hour: '45000' }, miss_distance: { kilometers: '200000' }, orbiting_body: 'Earth' }] },
      { id: '2', name: '99942 Apophis', is_potentially_hazardous_asteroid: true, estimated_diameter: { meters: { estimated_diameter_min: 300, estimated_diameter_max: 400 } }, close_approach_data: [{ close_approach_date: '2026-11-04', miss_distance: { kilometers: '30000000' }, orbiting_body: 'Earth' }] }
    ]
  }
}

test('asteroides: o que passa mais perto que a Lua vira aviso, o resto é curiosidade', () => {
  const a = lerAsteroides(feed)
  assert.equal(a.length, 2)
  assert.equal(a[0].id, 'ast-1-2026-11-04')
  assert.equal(a[0].nivel, 1)
  assert.match(a[0].texto, /0,5 vezes a distância da Lua/)
  assert.equal(a[1].nivel, 0)
  assert.match(a[1].texto, /potencialmente perigoso, mas não há risco/)
})

test('Sol: Kp abaixo de 5 é calmo; 7 é tempestade G3', () => {
  assert.equal(lerTempestadeSolar(3.3), null)
  const g3 = lerTempestadeSolar(7.2, '2026-11-04T12:00')
  assert.ok(g3)
  assert.equal(g3!.nivel, 2)
  assert.match(g3!.texto, /G3/)
  assert.deepEqual(kpMaisRecente([{ time_tag: 'a', kp_index: 0, estimated_kp: 0.33, kp: '0P' }, { time_tag: 'b', kp_index: 5, estimated_kp: 5.33, kp: '5M' }]), { kp: 5.33, quando: 'b' })
  assert.deepEqual(kpMaisRecente([['time_tag', 'Kp'], ['2026-11-04 12:00', '4.67']]), { kp: 4.67, quando: '2026-11-04 12:00' })
})

test('terremotos: perto conta, longe e fraco não', () => {
  const sp = [-23.55, -46.63] as const
  assert.ok(Math.abs(distanciaKm(sp[0], sp[1], -22.9, -43.2) - 360) < 20)
  const r = lerTerremotos({
    features: [
      { id: 'a', properties: { mag: 4.1, place: '50 km SSW of Somewhere', time: Date.now() - 3600_000 }, geometry: { coordinates: [-46.8, -23.9] } },
      { id: 'b', properties: { mag: 3.0, place: 'Japan', time: Date.now() }, geometry: { coordinates: [139, 35] } },
      { id: 'c', properties: { mag: 7.4, place: 'Chile', time: Date.now() }, geometry: { coordinates: [-71, -33] } }
    ]
  }, sp[0], sp[1])
  assert.deepEqual(r.map((x) => x.id), ['sismo-a', 'sismo-c'])
  assert.equal(r[0].nivel, 1)
})

test('tempo severo e só o que é novo vira aviso', () => {
  const p = { local: { nome: 'São Paulo', regiao: '', pais: '', lat: 0, lon: 0 }, agora: { temp: 25, sensacao: 25, codigo: 0, vento: 5, umidade: 60, dia: true }, dias: [
    { data: '2026-11-04', min: 18, max: 30, chuva: 90, mm: 60, codigo: 95, nascer: '', por: '' },
    { data: '2026-11-05', min: 18, max: 27, chuva: 10, mm: 0, codigo: 1, nascer: '', por: '' }
  ] }
  const t = lerTempoSevero(p)
  assert.equal(t.length, 1)
  assert.equal(t[0].nivel, 2)
  assert.match(t[0].texto, /hoje: tempestade com raios, chuva muito forte/)
  assert.equal(novasParaAvisar(t, [t[0].id]).length, 0)
  assert.match(relatorio([]), /Nenhuma ameaça/)
})

// ---------- Raio-X ----------

test('raio-X: acha o que deixa lento, disco cheio, antivírus desligado', () => {
  const agora = Date.parse('2026-11-04T12:00:00Z')
  const achados = analisar({
    ligadoDesde: '2026-10-20T08:00:00Z',
    ramTotalGb: 16, ramLivreGb: 1.2,
    processos: [
      { nome: 'chrome', cpu: 12, ramMb: 4200, n: 31 },
      { nome: 'svchost', cpu: 1, ramMb: 3000, n: 80 },
      { nome: 'Code', cpu: 70, ramMb: 900, n: 8 }
    ],
    volumes: [{ letra: 'C', rotulo: '', totalGb: 476, livreGb: 9 }],
    discos: [{ nome: 'Samsung SSD', tipo: 'SSD', saude: 'Healthy', temperatura: 41, desgaste: 3 }],
    gpu: { nome: 'RTX', temp: 66, uso: 10 },
    defender: { ligado: false, tempoReal: false, assinaturaDias: 1, varreduraDias: 2 },
    outrosAntivirus: ['Windows Defender'],
    firewall: [{ nome: 'Domain', ligado: true }, { nome: 'Private', ligado: true }, { nome: 'Public', ligado: false }],
    ultimaAtualizacao: '2026-10-25T00:00:00Z',
    reinicioPendente: true
  }, agora)
  const textos = achados.map((a) => a.texto).join(' | ')
  assert.equal(achados[0].gravidade, 2)
  assert.match(textos, /memória está em 93%/)
  assert.match(textos, /Chrome com 4,1 GB \(31 processos\)/)
  assert.match(textos, /VS Code \(70%\)/)
  assert.doesNotMatch(textos, /svchost/)
  assert.match(textos, /disco C está quase cheio/)
  assert.match(textos, /não reinicia faz 15 dias/)
  assert.match(textos, /proteção em tempo real do antivírus está desligada/)
  assert.match(textos, /firewall está desligado na rede pública/)
  assert.match(resumoFalado(achados, 'seguranca'), /firewall/)
  assert.doesNotMatch(resumoFalado(achados, 'seguranca'), /Chrome/)
})

test('raio-X: PC em ordem diz que está tudo bem', () => {
  const a = analisar({ ramTotalGb: 32, ramLivreGb: 20, processos: [{ nome: 'chrome', cpu: 2, ramMb: 800, n: 10 }], volumes: [{ letra: 'C', rotulo: '', totalGb: 1000, livreGb: 600 }], discos: [{ nome: 'NVMe', tipo: 'SSD', saude: 'Healthy', temperatura: 35, desgaste: 1 }], defender: { ligado: true, tempoReal: true, assinaturaDias: 0, varreduraDias: 1 }, firewall: [{ nome: 'Public', ligado: true }] })
  assert.ok(a.every((x) => x.gravidade === 0))
  assert.match(resumoFalado(a), /^Tudo em ordem/)
  assert.equal(maisPesados([{ nome: 'System', cpu: 50, ramMb: 9999, n: 1 }]).ram.length, 0)
})

// ---------- Bem-estar ----------

test('bem-estar: pausa depois de 2 horas, uma vez por hora; pausa de 5 minutos zera', () => {
  const e = estadoInicial()
  const t0 = new Date(2026, 10, 4, 14, 0)
  let aviso: string | null = null
  for (let m = 0; m <= 121; m++) { const r = passo(e, new Date(t0.getTime() + m * 60_000), 5); if (r) aviso = r }
  assert.match(aviso!, /2 horas direto/)
  assert.equal(passo(e, new Date(t0.getTime() + 125 * 60_000), 5), null)
  passo(e, new Date(t0.getTime() + 130 * 60_000), 400)
  assert.equal(e.ativoDesde, null)
  assert.match(resumoDoDia(e, new Date(t0.getTime() + 131 * 60_000)), /Hoje você ficou 2 horas/)
})

test('bem-estar: de madrugada avisa da hora de dormir, uma vez só', () => {
  const e = estadoInicial()
  assert.match(passo(e, new Date(2026, 10, 5, 1, 30), 3)!, /uma da manhã/)
  assert.equal(passo(e, new Date(2026, 10, 5, 1, 31), 3), null)
  assert.equal(passo(estadoInicial(), new Date(2026, 10, 5, 23, 30), 3), null)
})

// ---------- Assuntos ----------

test('assuntos: lê manchetes e reconhece a mesma notícia com outras palavras', () => {
  const m = lerManchetes('Aqui estão:\n- 2026-11-03 | Rockstar confirma data do trailer 3 de GTA 6\n2. 2026-11-02 | **GTA 6** ganha novas imagens vazadas\nnenhuma')
  // A linha de introdução e o "nenhuma" ficam de fora
  assert.equal(m.length, 2)
  const reais = m.filter((x) => x.data)
  assert.equal(reais.length, 2)
  assert.ok(mesmaNoticia('Rockstar confirma a data do trailer 3 do GTA 6', reais[0].texto))
  assert.ok(!mesmaNoticia('Preço do PS5 cai no Brasil', reais[0].texto))
  assert.equal(novas(reais, ['Rockstar confirmou a data do terceiro trailer de GTA 6']).length, 1)
})

// ---------- Cotações ----------

test('cotações: nomes falados, leitura da API e conversão', async () => {
  assert.equal(codigoDaMoeda('Dólares')?.codigo, 'USD')
  assert.equal(codigoDaMoeda('bitcoin')?.codigo, 'BTC')
  assert.equal(codigoDaMoeda('peso argentino')?.codigo, 'ARS')
  assert.equal(codigoDaMoeda('banana'), null)
  const api = { USDBRL: { code: 'USD', codein: 'BRL', bid: '5.4321', pctChange: '0.42', create_date: '2026-11-04 12:00:00' }, EURBRL: { code: 'EUR', codein: 'BRL', bid: '6.1', pctChange: '-0.8' } }
  const c = lerCotacoes(api)
  assert.equal(c.length, 2)
  assert.equal(falarCotacao(c[0]), 'Dólar: R$ 5,43 (subiu 0,4% hoje).')
  assert.equal(Math.round(converter(100, 'USD', 'EUR', c)! * 100) / 100, 89.05)
  const buscar = async () => ({ ok: true, status: 200, json: async () => api })
  assert.equal(await responderCotacao(['dólar'], 50, 'real', buscar), '50,00 USD dá R$ 271,61, pela cotação de agora.')
  assert.match(await responderCotacao(['dólar', 'euro'], null, '', buscar), /Euro: R\$ 6,10 \(caiu 0,8% hoje\)/)
})

// ---------- Sentinela ----------

test('sentinela: luz mudando no quarto inteiro não dispara; alguém entrando dispara', () => {
  const n = 64 * 48
  const fundo = new Uint8Array(n).fill(80)
  const maisClaro = new Uint8Array(n).fill(110)
  assert.ok(mudanca(fundo, maisClaro) < 0.01)
  const pessoa = Uint8Array.from(fundo, (v, i) => ((i % 64) > 20 && (i % 64) < 44 && i > 64 * 10 ? 200 : v))
  assert.ok(mudanca(fundo, pessoa) > 0.2)
  const d = new DetectorDeMovimento()
  assert.equal(d.quadro(fundo), false)
  assert.equal(d.quadro(pessoa), false)
  assert.equal(d.quadro(fundo), true)
  assert.deepEqual([...cinza(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]))], [255, 0])
})

// ---------- Chegada em casa ----------

test('chegada: só o celular do dono, e só depois de um tempo fora', () => {
  const agora = Date.now()
  const cel: Aparelho = { mac: 'AA', ip: '1', apelido: 'meu celular', fabricante: 'Xiaomi', host: '', primeiraVez: 0, ultimaVez: agora - 2 * 3600_000, dono: true }
  assert.equal(chegou(cel, true, agora), true)
  assert.equal(chegou({ ...cel, ultimaVez: agora - 10 * 60_000 }, true, agora), false)
  assert.equal(chegou({ ...cel, dono: false }, true, agora), false)
  assert.equal(chegou(cel, false, agora), false)
})

// ---------- Declarações ----------

test('as ferramentas novas estão declaradas, protegidas e no celular', () => {
  const nomes = TOOL_DECLARATIONS.map((t) => t.name)
  for (const n of ['protocolo', 'sentinela', 'achar_celular', 'ameacas', 'raio_x', 'bem_estar', 'vigiar_assunto', 'cotacao']) assert.ok(nomes.includes(n), n)
  for (const n of ['sentinela', 'protocolo']) assert.ok((TOOLS_DO_HUD as readonly string[]).includes(n), n)
  for (const n of ['sentinela', 'protocolo', 'raio_x', 'achar_celular']) assert.ok(SO_DONO.has(n), n)
  assert.ok(TOOLS_REMOTAS.includes('ameacas') && TOOLS_REMOTAS.includes('sentinela'))
  assert.ok(!TOOLS_REMOTAS.includes('achar_celular'), 'o celular não precisa pedir ao PC para tocar a si mesmo')
  const v = validarPassos([{ ferramenta: 'ameacas' }, { ferramenta: 'cotacao', argumentos: { moedas: ['dólar'] } }])
  assert.ok(v.ok)
})
