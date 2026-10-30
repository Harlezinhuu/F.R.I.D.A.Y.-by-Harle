import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerPlano, nomeDoArquivo, numerarFontes, paginaHtml, promptRelatorio, relatorioCompleto, resumoFalado } from '../src/main/logica/pesquisa.ts'
import { markdown } from '../mobile/src/markdown.ts'

test('lê o plano (com cercas) e aguenta plano estragado', () => {
  const p = lerPlano('```json\n{"titulo":"Cursos de Node","perguntas":[{"pergunta":"Quais os melhores?","busca":"best node course 2026"},{"pergunta":"Quanto custam?"}]}\n```', 'node')
  assert.equal(p.titulo, 'Cursos de Node')
  assert.deepEqual(p.perguntas[1], { pergunta: 'Quanto custam?', busca: 'Quanto custam?' })
  assert.deepEqual(lerPlano('não sei', 'cursos de Node'), { titulo: 'cursos de Node', perguntas: [{ pergunta: 'cursos de Node', busca: 'cursos de Node' }] })
})

test('fontes numeradas sem repetir', () => {
  const partes = [
    { pergunta: 'a', texto: 'x', fontes: [{ titulo: 'alura.com.br', url: 'https://a' }, { titulo: 'rocketseat.com.br', url: 'https://b' }] },
    { pergunta: 'b', texto: 'y', fontes: [{ titulo: 'alura.com.br', url: 'https://a2' }, { titulo: 'udemy.com', url: 'https://c' }] }
  ]
  const { fontes, numero } = numerarFontes(partes)
  assert.deepEqual(fontes.map((f) => f.titulo), ['alura.com.br', 'rocketseat.com.br', 'udemy.com'])
  assert.equal(numero({ titulo: 'udemy.com', url: '' }), 3)
  const prompt = promptRelatorio('cursos de Node', '', partes, [{ nome: 'anotacoes.md', pasta: '~/Documents', trecho: 'quero aprender Node' }], 'hoje')
  assert.match(prompt, /Fontes desta parte: \[1\] alura\.com\.br; \[3\] udemy\.com/)
  assert.match(prompt, /## Dos seus arquivos/)
  assert.match(prompt, /anotacoes\.md/)
})

test('resumo falado tira as referências e corta nas frases', () => {
  const md = '## Resumo\nO melhor custo-benefício é a Rocketseat [2]. A Alura tem mais variedade [1, 3]. Terceira frase. Quarta frase.\n\n## O que encontrei\nblá'
  assert.equal(resumoFalado(md), 'O melhor custo-benefício é a Rocketseat . A Alura tem mais variedade . Terceira frase.'.replace(/ \./g, '.'))
})

test('relatório completo e página segura', () => {
  const md = relatorioCompleto('Cursos de Node', '## Resumo\nVá de Rocketseat [1].\n<script>alert(1)</script>', [{ titulo: 'rocketseat.com.br', url: 'https://rocketseat.com.br' }], '30 de outubro de 2026')
  assert.match(md, /## Fontes\n1\. \[rocketseat\.com\.br\]\(https:\/\/rocketseat\.com\.br\)/)
  const html = paginaHtml('Cursos de Node', md, markdown)
  assert.ok(!html.includes('<script>alert'), 'HTML da IA não pode virar código')
  assert.match(html, /<a class="ref" href="#f1">\[1\]<\/a>/)
  assert.match(html, /<ol class="fontes"><li id="f1">/)
  assert.equal(nomeDoArquivo('Cursos de Node.js: o guia!', new Date(2026, 9, 30)), '2026-10-30 Cursos de Node js o guia')
})
