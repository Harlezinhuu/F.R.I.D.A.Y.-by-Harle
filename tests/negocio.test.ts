// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Negócio de sites para lojas: regras de preço e prazo, lembretes, autonomia, raio-X e documentos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PACOTES, acharPacote, avaliarPreco, minimoDoPacote, novoCliente, pagamentosDoFechamento, prazoPara, proximasAcoes, resumoDoFunil, slugDoCliente, temCapacidade, type Cliente } from '../src/main/logica/negocio.ts'
import { NIVEIS, acharPendencia, novaPendencia, podeSozinha, resumoDasPendencias, vencidas } from '../src/main/logica/autonomia.ts'
import { lerRaioX, paletaDaImagem, raioXEmTexto } from '../src/main/logica/raioxloja.ts'
import { htmlContrato, htmlProposta } from '../src/main/logica/documentos.ts'

const dia = (n: number, base = Date.parse('2026-11-04T12:00:00')) => new Date(base + n * 86_400_000)
const cliente = (extra: Partial<Cliente> = {}): Cliente => ({ ...novoCliente('Padaria do João', dia(0)), ...extra })

test('pacotes e preço: dentro da faixa ela fecha sozinha, abaixo do mínimo não', () => {
  const site = acharPacote('site institucional')!
  assert.equal(site.id, 'site')
  assert.equal(acharPacote('loja virtual na nuvemshop')!.id, 'loja')
  assert.equal(acharPacote('uma página só, tipo vitrine')!.id, 'vitrine')
  assert.equal(minimoDoPacote(site), 1350)
  assert.equal(avaliarPreco(site, 1500).sozinha, true)
  assert.equal(avaliarPreco(site, 1400).sozinha, true)
  const baixo = avaliarPreco(site, 1200)
  assert.equal(baixo.sozinha, false)
  assert.match(baixo.motivo, /abaixo do mínimo de R\$ 1350/)
  assert.equal(slugDoCliente('Açaí da Praça & Cia'), 'acai-da-praca-cia')
})

test('prazo pela capacidade: fila cheia empurra a entrega, sempre em dia útil', () => {
  const p = PACOTES[1]
  const hoje = dia(0)
  const livre = prazoPara(p, [], hoje)
  const ocupado = Array.from({ length: 6 }, (_, i) => cliente({ id: `c${i}`, etapa: 'construcao' }))
  const cheio = prazoPara(p, ocupado, hoje)
  assert.ok(cheio > livre)
  assert.ok(![0, 6].includes(livre.getDay()) && ![0, 6].includes(cheio.getDay()))
  assert.equal(temCapacidade(ocupado.slice(0, 4)), true)
  assert.equal(temCapacidade(ocupado), false)
  const pg = pagamentosDoFechamento(1500, hoje, livre)
  assert.deepEqual(pg.map((x) => x.valor), [750, 750])
  assert.ok(pg.every((x) => !x.aprovado && !x.pago))
})

test('lembretes: material, proposta, pagamento, depoimento, indicação e nota', () => {
  const material = proximasAcoes(cliente({ etapa: 'construcao', materialPedidoEm: dia(0).toISOString() }), dia(4))
  assert.equal(material[0].tipo, 'cobrar_material')
  assert.match(material[0].mensagem!, /só falta o material/)
  assert.equal(proximasAcoes(cliente({ etapa: 'construcao', materialPedidoEm: dia(0).toISOString(), ultimoLembreteEm: dia(3).toISOString() }), dia(4)).length, 0, 'no máximo um lembrete a cada 2 dias')
  assert.equal(proximasAcoes(cliente({ etapa: 'proposta', propostaEnviadaEm: dia(0).toISOString() }), dia(3.5))[0].tipo, 'lembrar_proposta')
  const vencido = proximasAcoes(cliente({ etapa: 'construcao', pagamentos: [{ descricao: 'Entrada (50%)', valor: 750, vencimento: '2026-11-01', pago: false, aprovado: true }] }), dia(0))
  assert.equal(vencido[0].tipo, 'cobrar_pagamento')
  const entregue = cliente({ etapa: 'manutencao', entregueEm: dia(0).toISOString(), pagamentos: [{ descricao: 'Restante', valor: 750, vencimento: '2026-11-04', pago: true, aprovado: true }] })
  assert.deepEqual(proximasAcoes(entregue, dia(31)).map((a) => a.tipo).sort(), ['emitir_nota', 'pedir_depoimento', 'pedir_indicacao'])
  assert.match(resumoDoFunil([entregue, cliente({ id: 'b', etapa: 'proposta' })], dia(0)), /2 clientes: 1 proposta enviada, 1 em manutenção/)
})

test('autonomia: livre, regras, pergunta com plano seguro e "sempre" que nunca vence', () => {
  assert.equal(podeSozinha('cobrar_material'), true)
  assert.equal(podeSozinha('cobrar_pagamento'), false)
  assert.equal(NIVEIS.assinar, 'sempre')
  const agora = dia(0)
  const indicacao = novaPendencia('pedir_indicacao', 'Pedir indicação para a Padaria', agora, { planoSeguro: 'Mando a mensagem padrão' })
  const cobranca = novaPendencia('cobrar_pagamento', 'Cobrar a entrada de R$ 750 da Padaria', agora)
  assert.equal(cobranca.prazo, '')
  assert.equal(vencidas([indicacao, cobranca], dia(0.5)).length, 0)
  assert.deepEqual(vencidas([indicacao, cobranca], dia(2)).map((p) => p.acao), ['pedir_indicacao'])
  assert.equal(acharPendencia([indicacao, cobranca], 'a cobrança da padaria')?.acao, 'cobrar_pagamento')
  assert.equal(acharPendencia([indicacao, cobranca], '2')?.acao, 'cobrar_pagamento')
  assert.match(resumoDasPendencias([indicacao, cobranca]), /2 coisas esperando por você: 1\) Pedir indicação.*se você não responder, mando a mensagem padrão/)
})

test('raio-X: lê a resposta da IA mesmo com cerca de código e acha as cores do logo', () => {
  const r = lerRaioX('```json\n{"resumo":"Padaria de bairro querida.","pacote":"vitrine","identidade":{"cores":["#8B4513","azul"],"fontes":["Fraunces","DM Sans"]},"elogios":["pão quentinho"],"perguntas":["Tem entrega?"]}\n```', [{ titulo: 'g1', url: 'https://g1.globo.com' }])
  assert.equal(r.pacote, 'vitrine')
  assert.deepEqual(r.identidade.cores, ['#8B4513'])
  assert.equal(r.fontes.length, 1)
  assert.equal(lerRaioX('isso não é json').pacote, 'site')
  assert.match(raioXEmTexto('Padaria', r), /## O que os clientes elogiam\n\n- pão quentinho/)
  // 2 pixels vermelhos, 1 azul, 1 branco (ignorado), em BGRA
  const px = new Uint8Array([0, 0, 200, 255, 0, 0, 205, 255, 200, 0, 0, 255, 255, 255, 255, 255])
  const cores = paletaDaImagem(px)
  assert.equal(cores.length, 2)
  assert.match(cores[0], /^#c[89a-f]0000$/)
})

test('proposta e contrato: valores, prazo, entrada e nada de HTML do cliente sem escapar', () => {
  const c = cliente({ nome: 'Pet <b>Feliz</b>' })
  c.contato.responsavel = 'Maria Souza'
  const dados = { cliente: c, pacote: PACOTES[1], valor: 1800, mensalidade: 150, prazo: dia(14), raioX: null, empresa: { nome: 'Harle', responsavel: 'Ahmad Mourad', documento: '', cidade: 'São Paulo', whatsapp: '', email: '', site: '', pix: 'chave@exemplo.com' }, regras: { descontoMaximo: 0.1, sitesPorMes: 5, entrada: 50, rodadas: 2 }, previa: '', hoje: dia(0) }
  const p = htmlProposta(dados)
  assert.match(p, /R\$ 1\.800,00/)
  assert.match(p, /50% para começar \(R\$ 900,00\)/)
  assert.match(p, /R\$ 150,00 por mês/)
  assert.ok(!p.includes('<b>Feliz</b>') && p.includes('&lt;b&gt;Feliz'))
  const k = htmlContrato(dados)
  assert.match(k, /chave chave@exemplo\.com/)
  assert.match(k, /CPF\/CNPJ ____________________/)
  assert.match(k, /comarca de São Paulo/)
  assert.match(k, /Manutenção \(opcional\)/)
})

// ---------- Prospecção e vigia dos sites ----------

import { caiu, consultaOverpass, lerLojas, mensagemDeAbordagem, mensagemDoRelatorio, resumoDoMonitor, voltou } from '../src/main/logica/prospeccao.ts'

test('prospecção: só lojas sem site e sem franquia, as mais fáceis de contatar primeiro', () => {
  assert.match(consultaOverpass(-23.5, -46.6, 3, 'padarias'), /"shop"~"\^\(bakery\|confectionery\|pastry\)\$"\]\[name\]\(around:3000,-23\.5,-46\.6\)/)
  const r = lerLojas({ elements: [
    { type: 'node', id: 1, lat: -23.5, lon: -46.6, tags: { name: 'Padaria Sol', shop: 'bakery', phone: '+55 11 99999-0000', opening_hours: 'Mo-Sa 06:00-20:00' } },
    { type: 'node', id: 2, lat: -23.5, lon: -46.6, tags: { name: 'Pet Amigo', shop: 'pet', website: 'https://petamigo.com.br' } },
    { type: 'node', id: 3, lat: -23.5, lon: -46.6, tags: { name: 'Rede Grande', shop: 'bakery', brand: 'Rede' } },
    { type: 'way', id: 4, center: { lat: -23.51, lon: -46.6 }, tags: { name: 'Moda Bela', shop: 'clothes' } },
    { type: 'node', id: 5, lat: -23.5, lon: -46.6, tags: { name: 'Já Vista', shop: 'florist' } }
  ] }, -23.5, -46.6, ['node/5'])
  assert.deepEqual(r.map((l) => l.nome), ['Padaria Sol', 'Moda Bela'])
  assert.equal(r[0].segmento, 'padaria')
  assert.equal(r[1].distanciaKm, 1.1)
  assert.match(mensagemDeAbordagem(r[0], 'Ahmad', 'São Paulo'), /Sou o Ahmad e faço sites para lojas aqui de São Paulo\. Vi que a Padaria Sol ainda não tem site/)
})

test('vigia dos sites: queda só com duas falhas seguidas, volta e resumo do mês', () => {
  const ok = (t: number) => ({ t, ok: true, ms: 400 }), ruim = (t: number) => ({ t, ok: false, ms: 15000 })
  assert.equal(caiu([ok(1), ruim(2)]), false)
  assert.equal(caiu([ok(1), ruim(2), ruim(3)]), true)
  assert.equal(caiu([ok(1), ruim(2), ruim(3), ruim(4)]), false, 'avisa uma vez só')
  assert.equal(voltou([ruim(2), ruim(3), ok(4)]), true)
  const r = resumoDoMonitor([ok(10), ok(20), ruim(30), ok(40), { t: 50, ok: true, ms: 800 }], 0, 100)
  assert.deepEqual(r, { checagens: 5, noAr: 80, msMedio: 500, quedas: 1 })
  assert.match(mensagemDoRelatorio('Padaria Sol', 'outubro', r, 'Ahmad'), /relatório de outubro do site da Padaria Sol: ficou no ar 80% do tempo, respondendo em 0,5 segundo em média/)
})
