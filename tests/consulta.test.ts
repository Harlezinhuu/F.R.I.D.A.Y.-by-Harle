import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AgenteConsulta, contarHorarios, descrever, lerDecisao, montarConversa, novaConsulta, numeroWhats, numerosSensiveis, pareceCartao, proteger,
  type Decisao, type EstadoConsulta, type Linha, type Maos, type Recebida
} from '../src/shared/consulta.ts'

const lugar = { nome: 'São Cristóvão', whatsapp: '5511999990000', dados: 'carteirinha 4455667788; nome completo Ahmad Mourad' }
const base = (historico: Linha[] = []): EstadoConsulta => ({ ...novaConsulta({ dono: 'Harle', pedido: 'consulta de ortopedia', preferencias: 'semana que vem à tarde', observacoes: '', lugar }, 0), historico, aberta: true })
const eles = (texto: string, botoes?: string[]): Linha => ({ quem: 'eles', texto, quando: 1, ...(botoes ? { botoes } : {}) })
const dono = (texto: string): Linha => ({ quem: 'dono', texto, quando: 2 })
const enviar = (texto: string, escolhaDoDono = ''): Decisao => ({ acao: 'enviar', texto, escolhaDoDono })

test('conta horários e datas de uma lista', () => {
  assert.equal(contarHorarios('Temos 1) 30/10 às 14:00 2) 31/10 às 9h30'), 4)
  assert.equal(contarHorarios('Digite 1 para agendar'), 0)
  assert.equal(contarHorarios('às 14h'), 1)
})

test('números sensíveis ignoram datas e horas', () => {
  assert.deepEqual(numerosSensiveis('CPF 123.456.789-00'), ['12345678900'])
  assert.deepEqual(numerosSensiveis('dia 30/10/2026 às 14:00, opção 2'), [])
  assert.equal(pareceCartao('4111 1111 1111 1111'), true)
  assert.equal(pareceCartao('carteirinha 4455667788'), false)
})

test('número de WhatsApp ganha o 55', () => {
  assert.equal(numeroWhats('(11) 2029-7200'), '551120297200')
  assert.equal(numeroWhats('+55 11 98888-7777'), '5511988887777')
})

test('lê a decisão mesmo com cercas de código', () => {
  assert.deepEqual(lerDecisao('```json\n{"acao":"enviar","texto":"1"}\n```'), { acao: 'enviar', texto: '1', escolhaDoDono: '' })
  const p = lerDecisao('{"acao":"pronto","texto":"Marcado","evento":{"titulo":"Ortopedia","inicio_iso":"2026-10-30T14:00:00","local":"Mooca"}}')
  assert.equal(p.acao, 'pronto')
  assert.equal(p.acao === 'pronto' && p.evento?.inicioIso, '2026-10-30T14:00:00')
  assert.throws(() => lerDecisao('{"acao":"pular"}'))
  assert.throws(() => lerDecisao('sem json'))
})

test('trava: não escolhe horário sem o dono', () => {
  const e = base([eles('Horários: 1) 30/10 14:00 2) 31/10 09:00')])
  assert.equal(proteger(enviar('1'), e).acao, 'perguntar')
  assert.equal(proteger({ acao: 'tocar', botao: '30/10 14:00', escolhaDoDono: '' }, e).acao, 'perguntar')
  // Pedir outras opções não é escolher
  assert.equal(proteger(enviar('Teria algo na quinta à tarde?'), e).acao, 'enviar')
  // Depois que o dono respondeu, pode
  assert.equal(proteger(enviar('1'), base([eles('Horários: 1) 30/10 14:00 2) 31/10 09:00'), dono('a primeira')])).acao, 'enviar')
})

test('trava: só confirma com a escolha do dono', () => {
  const pedido = [eles('Horários: 1) 30/10 14:00 2) 31/10 09:00'), dono('30 às 14h'), { quem: 'eu', texto: '1', quando: 3 } as Linha, eles('Confirma consulta dia 30/10 às 14:00? Responda SIM')]
  assert.equal(proteger(enviar('Sim'), base(pedido)).acao, 'perguntar')
  assert.equal(proteger(enviar('Sim', 'inventada pelo modelo'), base(pedido)).acao, 'perguntar')
  assert.equal(proteger(enviar('Sim', '30 às 14h'), base(pedido)).acao, 'enviar')
})

test('trava: dados que você não liberou viram pergunta', () => {
  const e = base([eles('Informe seu CPF')])
  assert.equal(proteger(enviar('123.456.789-00'), e).acao, 'perguntar')
  assert.equal(proteger(enviar('4455667788'), base([eles('Informe a carteirinha')])).acao, 'enviar')
  assert.equal(proteger(enviar('12345678900'), base([eles('Informe seu CPF'), dono('meu CPF é 123.456.789-00')])).acao, 'enviar')
  assert.equal(proteger(enviar('4111 1111 1111 1111'), base([eles('Pagamento')])).acao, 'perguntar')
})

test('trava: mandar a mesma coisa três vezes vira pergunta', () => {
  const e = base([{ quem: 'eu', texto: 'menu', quando: 1 }, eles('Opção inválida'), { quem: 'eu', texto: 'menu', quando: 2 }, eles('Opção inválida')])
  assert.equal(proteger(enviar('menu'), e).acao, 'perguntar')
})

test('a conversa no prompt marca quem é quem', () => {
  const t = montarConversa(base([eles('Olá', ['Agendar', 'Exames']), dono('quinta')]), Date.UTC(2026, 9, 28, 15))
  assert.match(t, /ELES: Olá {2}\[botões: Agendar \| Exames\]/)
  assert.match(t, /DONO \(falou só para você\): quinta/)
  assert.match(t, /Dados liberados: carteirinha/)
})

/** Um robô de plano de saúde de mentira, com menu, lista de horários e confirmação. */
class Robo implements Maos {
  msgs: Recebida[] = [{ id: 'antiga', texto: 'Mensagem de ontem', quando: 1 }]
  saiu: string[] = []
  private n = 0
  async abrir(): Promise<void> {}
  async ler() { return { mensagens: [...this.msgs] } }
  async enviar(t: string): Promise<void> { this.saiu.push(t); this.reagir(t) }
  async tocar(r: string): Promise<void> { this.saiu.push(`▸${r}`); this.reagir(r) }
  fechar(): void {}
  private diz(texto: string): void { this.msgs.push({ id: `m${++this.n}`, texto, quando: 1000 + this.n }) }
  private reagir(t: string): void {
    if (/^ol/i.test(t)) this.diz('Olá! Sou a assistente virtual. 1 - Agendar consulta 2 - Exames')
    else if (t === 'Ortopedia') this.diz('Horários: 1) 30/10 14:00 2) 31/10 09:00')
    else if (t === '1' && this.saiu.includes('Ortopedia')) this.diz('Confirma consulta dia 30/10 às 14:00 com Dr. Silva? Responda SIM')
    else if (t === '1') this.diz('Qual especialidade?')
    else if (/^sim$/i.test(t)) this.diz('Agendado! Protocolo 99887766. Unidade Mooca.')
  }
}

test('agente marca do começo ao fim, parando para perguntar', async () => {
  const robo = new Robo()
  const roteiro: Decisao[] = [
    enviar('Olá! Gostaria de agendar uma consulta de ortopedia.'),
    enviar('1'),
    enviar('Ortopedia'),
    enviar('1'), // tenta escolher sozinho: a trava pergunta
    enviar('1', '30 às 14h'),
    enviar('SIM', '30 às 14h'),
    { acao: 'pronto', texto: 'Marcado: ortopedia com Dr. Silva, 30/10 às 14h, unidade Mooca.', evento: null }
  ]
  const conversas: string[] = []
  const decidir = async (_s: string, c: string) => {
    conversas.push(c)
    const d = roteiro.shift()
    assert.ok(d, 'o agente decidiu mais vezes que o roteiro')
    const j: Record<string, unknown> = { ...d }
    if ('escolhaDoDono' in d) j.escolha_do_dono = d.escolhaDoDono
    return JSON.stringify(j)
  }
  let relogio = 0
  const perguntas: string[] = []
  let fim: EstadoConsulta | null = null
  const agente: AgenteConsulta = new AgenteConsulta(base(), robo, decidir, {
    aoMudar() {},
    aoPerguntar(e) { perguntas.push(e.pergunta?.texto ?? ''); setTimeout(() => agente.responder('o de quinta, 30 às 14h'), 0) },
    aoTerminar(e) { fim = e }
  }, { agora: () => (relogio += 5000), dormir: () => new Promise((r) => setImmediate(r)) })
  agente.estado.aberta = false
  await agente.rodar()

  assert.deepEqual(robo.saiu, ['Olá! Gostaria de agendar uma consulta de ortopedia.', '1', 'Ortopedia', '1', 'SIM'])
  assert.equal(perguntas.length, 1)
  assert.match(perguntas[0], /Eles ofereceram: Horários/)
  assert.equal(fim!.situacao, 'pronto')
  assert.equal(roteiro.length, 0)
  // A mensagem de ontem não entrou na conversa
  assert.ok(conversas.every((c) => !c.includes('Mensagem de ontem')))
  assert.match(descrever(fim), /^Marcado: ortopedia/)
})

test('agente desiste depois de três decisões ilegíveis', async () => {
  const robo = new Robo()
  let fim: EstadoConsulta | null = null
  const agente = new AgenteConsulta(base(), robo, async () => 'não é json', { aoMudar() {}, aoPerguntar() {}, aoTerminar(e) { fim = e } },
    { agora: (() => { let t = 0; return () => (t += 5000) })(), dormir: () => Promise.resolve() })
  agente.estado.aberta = false
  await agente.rodar()
  assert.equal(fim!.situacao, 'falhou')
  assert.equal(robo.saiu.length, 0)
})

test('cancelar para o agente', async () => {
  const robo = new Robo()
  let fim: EstadoConsulta | null = null
  const agente: AgenteConsulta = new AgenteConsulta(base(), robo, async () => '{"acao":"perguntar","texto":"Qual unidade?"}', {
    aoMudar() {}, aoPerguntar() { setTimeout(() => agente.cancelar(), 0) }, aoTerminar(e) { fim = e }
  }, { agora: (() => { let t = 0; return () => (t += 5000) })(), dormir: () => new Promise((r) => setImmediate(r)) })
  agente.estado.aberta = false
  await agente.rodar()
  assert.equal(fim!.situacao, 'cancelado')
})
