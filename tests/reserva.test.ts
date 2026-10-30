import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entender, ferramentasOllama, numerosPorExtenso, quandoFalado } from '../src/main/logica/reserva.ts'
import { TOOL_DECLARATIONS } from '../src/shared/tools.ts'

test('números falados viram dígitos', () => {
  assert.equal(numerosPorExtenso('volume em vinte e cinco'), 'volume em 25')
  assert.equal(numerosPorExtenso('timer de cinco minutos'), 'timer de 5 minutos')
  assert.equal(numerosPorExtenso('às três e meia'), 'as 3:30')
  assert.equal(numerosPorExtenso('cento e vinte e três'), '123')
  assert.equal(numerosPorExtenso('um minuto'), '1 minuto')
  assert.equal(numerosPorExtenso('abre um programa'), 'abre um programa')
})

test('hora falada', () => {
  const agora = new Date(2026, 9, 30, 10, 0)
  assert.equal(quandoFalado('ligar para a mae as 15', agora)?.getHours(), 15)
  assert.equal(quandoFalado('as 9', agora)?.getDate(), 31) // 9h já passou: amanhã
  assert.equal(quandoFalado('amanha as 8 e 30', agora)?.getMinutes(), 30)
  assert.equal(quandoFalado('as 3 da tarde', agora)?.getHours(), 15)
})

test('pedidos do dia a dia sem IA', () => {
  const agora = new Date(2026, 9, 30, 10, 0)
  assert.deepEqual(entender('volume em cinquenta'), { tipo: 'ferramenta', nome: 'volume', args: { acao: 'definir', valor: 50 } })
  assert.deepEqual(entender('aumenta o volume'), { tipo: 'ferramenta', nome: 'volume', args: { acao: 'aumentar', valor: 10 } })
  assert.deepEqual(entender('abre o spotify'), { tipo: 'ferramenta', nome: 'abrir_app', args: { nome: 'spotify' } })
  assert.deepEqual(entender('fecha o discord'), { tipo: 'ferramenta', nome: 'fechar_app', args: { nome: 'discord' } })
  assert.deepEqual(entender('próxima música'), { tipo: 'ferramenta', nome: 'midia', args: { acao: 'proxima' } })
  assert.deepEqual(entender('timer de dez minutos para o macarrão'), { tipo: 'ferramenta', nome: 'criar_timer', args: { minutos: 10, texto: 'macarrao' } })
  const l = entender('me lembra de ligar para a mãe às quinze e trinta', agora)
  assert.equal(l.tipo, 'ferramenta')
  assert.ok(l.tipo === 'ferramenta' && l.args.texto === 'ligar para a mae')
  assert.ok(l.tipo === 'ferramenta' && new Date(String(l.args.quando_iso)).getMinutes() === 30)
  assert.deepEqual(entender('procura o contrato do aluguel nos meus arquivos'), { tipo: 'ferramenta', nome: 'buscar_nos_meus_arquivos', args: { pergunta: 'contrato do aluguel' } })
  assert.deepEqual(entender('sim'), { tipo: 'confirmar' })
  assert.equal(entender('tchau').tipo, 'encerrar')
  assert.match((entender('que horas são', agora) as { texto: string }).texto, /10:00/)
  assert.equal(entender('como está o clima').tipo, 'fala')
})

test('ferramentas no formato do Ollama', () => {
  const f = ferramentasOllama(TOOL_DECLARATIONS)
  const vol = f.find((x) => x.function.name === 'volume')!
  assert.deepEqual((vol.function.parameters as { type: string }).type, 'object')
  assert.equal(((vol.function.parameters as { properties: Record<string, { type: string }> }).properties.acao).type, 'string')
  assert.ok(!f.some((x) => x.function.name === 'buscar_na_internet'), 'sem internet, nada de busca')
})
