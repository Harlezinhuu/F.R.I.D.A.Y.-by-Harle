// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherResultado, resumir, nomeDoDia, acharLocal, type ResultadoGeo, type Previsao } from '../src/shared/tempo.ts'

const R = (name: string, admin1: string, country_code: string, population = 0, extra: Partial<ResultadoGeo> = {}): ResultadoGeo =>
  ({ name, admin1, country: country_code === 'BR' ? 'Brasil' : country_code === 'PT' ? 'Portugal' : 'Estados Unidos', country_code, latitude: 0, longitude: 0, population, ...extra })

test('escolhe a cidade certa pelo complemento (UF, estado ou país)', () => {
  const lista = [R('São José', 'Santa Catarina', 'BR', 250_000), R('São José', 'Costa Rica', 'CR', 300_000), R('São José', 'São Paulo', 'BR', 10_000)]
  assert.equal(escolherResultado(lista, 'São José, SP')!.admin1, 'São Paulo')
  assert.equal(escolherResultado(lista, 'São José, Santa Catarina')!.admin1, 'Santa Catarina')
  const lis = [R('Lisboa', 'Lisboa', 'PT', 500_000), R('Lisbon', 'Ohio', 'US', 3000)]
  assert.equal(escolherResultado(lis, 'Lisboa, Portugal')!.country_code, 'PT')
})

test('sem complemento: nome exato, maior população e preferência pelo Brasil', () => {
  const lista = [R('Paris', 'Texas', 'US', 25_000), R('Paris', 'Île-de-France', 'FR', 2_100_000, { feature_code: 'PPLC' })]
  assert.equal(escolherResultado(lista, 'Paris')!.admin1, 'Île-de-France')
  const br = [R('Campinas', 'São Paulo', 'BR', 1_100_000), R('Campinas', 'Mindanao', 'PH', 1_000_000)]
  assert.equal(escolherResultado(br, 'Campinas')!.country_code, 'BR')
  assert.equal(escolherResultado([], 'x'), null)
})

test('nome falado dos dias', () => {
  assert.equal(nomeDoDia('2026-10-27', '2026-10-27'), 'hoje')
  assert.equal(nomeDoDia('2026-10-28', '2026-10-27'), 'amanhã')
  assert.equal(nomeDoDia('2026-10-31', '2026-10-27'), 'sábado (31/10)')
})

const P: Previsao = {
  local: { nome: 'Gramado', regiao: 'Rio Grande do Sul', pais: 'Brasil', lat: 0, lon: 0 },
  agora: { temp: 14, sensacao: 12, codigo: 3, vento: 18, umidade: 82, dia: true },
  dias: [
    { data: '2026-10-27', min: 10, max: 17, chuva: 40, mm: 2.4, codigo: 61, nascer: '05:48', por: '19:12' },
    { data: '2026-10-28', min: 9, max: 20, chuva: 5, mm: 0, codigo: 1, nascer: '05:47', por: '19:13' }
  ]
}

test('resumo de agora e dos próximos dias', () => {
  const t = resumir(P)
  assert.match(t, /^Gramado, Rio Grande do Sul, Brasil agora: 14 graus, nublado, sensação de 12, vento de 18 km\/h, umidade de 82%\./)
  assert.match(t, /hoje: chuva fraca, de 10 a 17 graus, 40% de chance de chuva \(2,4 mm\)\./)
  assert.match(t, /amanhã: quase limpo, de 9 a 20 graus, 5% de chance de chuva\./)
  assert.match(t, /Sol nasce às 05:48/)
})

test('resumo de um dia específico', () => {
  assert.equal(resumir(P, '2026-10-28'), 'Gramado, Rio Grande do Sul, Brasil, amanhã: quase limpo, de 9 a 20 graus, 5% de chance de chuva.')
  assert.match(resumir(P, '2026-12-25'), /só até 16 dias/)
})

test('lugar que a base de cidades não conhece vai para o OpenStreetMap', async () => {
  const chamadas: string[] = []
  const falso = async (url: string) => {
    chamadas.push(url)
    if (url.includes('open-meteo')) return new Response(JSON.stringify({}), { status: 200 })
    return new Response(JSON.stringify([{ lat: '-23.62', lon: '-46.70', name: 'Zona Sul', display_name: 'Zona Sul, São Paulo, Brasil', address: { state: 'São Paulo', country: 'Brasil' } }]), { status: 200 })
  }
  const l = await acharLocal('Zona Sul de São Paulo', falso)
  assert.equal(l.nome, 'Zona Sul')
  assert.equal(l.regiao, 'São Paulo')
  assert.equal(chamadas.length, 2)
  assert.match(chamadas[1], /nominatim/)
})
