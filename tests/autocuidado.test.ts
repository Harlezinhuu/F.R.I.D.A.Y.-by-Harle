// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Autocuidado: escolha do modelo substituto, erros que se repetem e o resumo da saúde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errosRepetidos, escolherModelo, melhoriasDoLog, modeloSumiu, normalizarErro, resumoDaSaude } from '../src/main/logica/autocuidado.ts'

test('modelo substituto: o mais novo e estável, de texto ou de voz', () => {
  const lista = [
    { name: 'models/gemini-2.5-flash', supportedActions: ['generateContent'] },
    { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] },
    { name: 'models/gemini-4.0-flash', supportedActions: ['generateContent', 'countTokens'] },
    { name: 'models/gemini-4.1-flash-preview-05-2027', supportedActions: ['generateContent'] },
    { name: 'models/gemini-4.0-flash-lite', supportedActions: ['generateContent'] },
    { name: 'models/gemini-3.8-live', supportedActions: ['bidiGenerateContent'] },
    { name: 'models/gemini-4.0-live', supportedActions: ['bidiGenerateContent'] },
    { name: 'models/gemini-10.0-live', supportedActions: ['generateContent'] }
  ]
  assert.equal(escolherModelo(lista, 'texto'), 'gemini-4.0-flash')
  assert.equal(escolherModelo(lista, 'voz'), 'gemini-4.0-live', 'precisa falar em tempo real (bidi)')
  assert.equal(escolherModelo(lista, 'texto', 'gemini-4.0-flash'), 'gemini-3.8-flash')
  assert.equal(escolherModelo([], 'voz'), null)
  assert.equal(modeloSumiu('[404] This model models/gemini-2.5-flash is no longer available to new users'), true)
  assert.equal(modeloSumiu('fetch failed: ECONNRESET'), false)
})

test('erros que se repetem nas últimas 24 h, sem o ruído de sempre', () => {
  const agora = Date.parse('2026-11-21T12:00:00Z')
  const l = (h: string, t: string) => `2026-11-21T${h}:00.000Z ${t}`
  const log = [
    l('10:00', '[error] [friday] erro na pesquisa: Cannot read properties of undefined (reading \'text\') em C:\\Users\\Harle\\FRIDAY\\out\\main\\index.js:123'),
    l('10:05', '[error] [friday] erro na pesquisa: Cannot read properties of undefined (reading \'text\') em C:\\Users\\Harle\\FRIDAY\\out\\main\\index.js:456'),
    l('11:00', '[error] [friday] erro na pesquisa: Cannot read properties of undefined (reading \'text\') em C:\\Users\\Harle\\FRIDAY\\out\\main\\index.js:789'),
    l('11:01', '[error] [friday] microfone NotFoundError: Requested device not found'),
    l('11:02', '[error] [friday] microfone NotFoundError: Requested device not found'),
    l('11:03', '[error] [friday] microfone NotFoundError: Requested device not found'),
    l('11:04', '[log] [friday] mic pico=0.2'),
    '2026-11-19T10:00:00.000Z [error] antigo demais', '2026-11-19T10:00:00.000Z [error] antigo demais', '2026-11-19T10:00:00.000Z [error] antigo demais'
  ].join('\n')
  const r = errosRepetidos(log, agora)
  assert.equal(r.length, 1)
  assert.equal(r[0].vezes, 3)
  assert.match(r[0].exemplo, /erro na pesquisa/)
  assert.equal(normalizarErro('2026-11-21T10:00:00.000Z falhou em https://x.com/a/123 id abcdef123456'), 'falhou em <link> id <id>')
})

test('resumo da saúde e melhorias do git', () => {
  assert.match(resumoDaSaude([{ nome: 'Voz', ok: true, detalhe: 'ok' }, { nome: 'Disco', ok: true, detalhe: 'ok' }]), /^Está tudo certo comigo: voz, disco\.$/)
  assert.equal(resumoDaSaude([{ nome: 'Disco', ok: false, detalhe: 'só 2 GB livres' }, { nome: 'Voz', ok: true, detalhe: '' }]), 'Uma coisa precisa de atenção: Disco: só 2 GB livres.')
  assert.deepEqual(melhoriasDoLog('a1b2c3d Corrige a voz\nb2c3d4e Merge branch x\nc3d4e5f Traz os modelos novos\n'), ['Corrige a voz'])
})
