import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Indice, arquivoSecreto, fatiar, ocultarSegredos, partesDoOffice, raiz, termos, textoDeXml, trecho } from '../src/main/logica/cerebro.ts'

test('termos: sem acento, sem palavras comuns, plural vira singular', () => {
  assert.deepEqual(termos('As sub-redes e as máscaras do endereçamento IP'), ['sub', 'rede', 'mascara', 'enderecamento', 'ip'])
  assert.equal(raiz('configuracoes'), 'configuracao')
  assert.equal(raiz('computadores'), 'computador')
  assert.equal(raiz('jornais'), 'jornal')
  assert.equal(raiz('2026'), '2026')
})

test('fatiar respeita parágrafos e corta textos enormes', () => {
  const p = fatiar('Primeiro parágrafo.\n\nSegundo parágrafo.', 900)
  assert.deepEqual(p, ['Primeiro parágrafo.\n\nSegundo parágrafo.'])
  const grande = Array.from({ length: 300 }, (_, i) => `Frase número ${i} sobre redes.`).join(' ')
  const pedacos = fatiar(grande, 900)
  assert.ok(pedacos.length > 5)
  assert.ok(pedacos.every((x) => x.length <= 1000))
  assert.deepEqual(fatiar('   '), [])
})

test('segredos nunca entram', () => {
  assert.equal(arquivoSecreto('.env'), true)
  assert.equal(arquivoSecreto('.env.local'), true)
  assert.equal(arquivoSecreto('friday.keystore'), true)
  assert.equal(arquivoSecreto('id_rsa'), true)
  assert.equal(arquivoSecreto('senhas.txt'), true)
  assert.equal(arquivoSecreto('redes.pdf'), false)
  const t = ocultarSegredos('GEMINI_API_KEY=AIzaSyA1234567890abcdefghijklmnopqrstuv e token: ghp_abcdefghijklmnopqrstuvwxyz0123456789 fim')
  assert.ok(!t.includes('AIzaSy') && !t.includes('ghp_'))
  assert.match(ocultarSegredos('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'), /\[chave privada oculta\]/)
  assert.equal(ocultarSegredos('senha: hunter2abc'), 'senha: [oculto]')
})

test('texto do Word e do PowerPoint', () => {
  const docx = '<w:document><w:body><w:p><w:r><w:t>Aula de </w:t></w:r><w:r><w:t>Redes</w:t></w:r></w:p><w:p><w:r><w:t>Máscara &amp; CIDR</w:t></w:r></w:p></w:body></w:document>'
  assert.equal(textoDeXml(docx), 'Aula de Redes\nMáscara & CIDR')
  assert.deepEqual(partesDoOffice('.pptx', ['ppt/slides/slide10.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide1.xml', 'ppt/presentation.xml']), ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide10.xml'])
  assert.deepEqual(partesDoOffice('.docx', ['word/document.xml', 'word/styles.xml']), ['word/document.xml'])
})

test('busca acha pelo assunto com as palavras relacionadas', () => {
  const i = new Indice()
  i.adicionar('C:/Docs/aula3.pdf', 'aula3.pdf', fatiar('Endereçamento IPv4. Para dividir uma rede usamos a máscara e a notação CIDR, como /24 e /26. Subnetting permite separar departamentos.'))
  i.adicionar('C:/Docs/receita.txt', 'receita.txt', ['Bolo de cenoura: três cenouras, ovos, farinha e açúcar. Asse por 40 minutos.'])
  i.adicionar('C:/Docs/contrato-aluguel.docx', 'contrato-aluguel.docx', ['O locatário pagará o aluguel até o dia 5. Multa de cancelamento de três meses.'])
  i.adicionar('C:/Projetos/bot/README.md', 'README.md', ['Harle Bot: comandos de música, moderação e fila de reprodução.'])

  // "sub-rede" não aparece no PDF, mas as relacionadas que a FRIDAY manda sim
  const r = i.buscar('aquele pdf de redes que fala de sub-rede', ['subnet', 'subnetting', 'máscara', 'CIDR', 'endereçamento IP'])
  assert.equal(r[0].arquivo, 'C:/Docs/aula3.pdf')
  assert.match(r[0].trechos[0], /CIDR/)

  // O nome do arquivo conta
  assert.equal(i.buscar('contrato do aluguel')[0].arquivo, 'C:/Docs/contrato-aluguel.docx')
  assert.equal(i.buscar('fila de música do bot')[0].arquivo, 'C:/Projetos/bot/README.md')
  assert.deepEqual(i.buscar('o de que'), [])
  assert.equal(i.total, 4)
})

test('trecho mostra a parte onde as palavras aparecem', () => {
  const longo = `${'blá '.repeat(200)}aqui fala de máscara e CIDR para sub-redes ${'blá '.repeat(200)}`
  const t = trecho(longo, termos('máscara CIDR'))
  assert.match(t, /máscara e CIDR/)
  assert.ok(t.length < 300)
})
