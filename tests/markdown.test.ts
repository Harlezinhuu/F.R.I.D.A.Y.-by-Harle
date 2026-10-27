// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdown } from '../mobile/src/markdown.ts'

test('markdown: negrito, itálico, código e listas', () => {
  assert.equal(markdown('**forte** e *leve* com `x = 1`'), '<p><strong>forte</strong> e <em>leve</em> com <code>x = 1</code></p>')
  assert.equal(markdown('- um\n- dois\n\n1. a\n2. b'), '<ul><li>um</li><li>dois</li></ul><ol><li>a</li><li>b</li></ol>')
  assert.equal(markdown('```\nconst a = 1\n```'), '<pre><code>const a = 1</code></pre>')
  assert.equal(markdown('## Título'), '<h4>Título</h4>')
})

test('markdown: nada vira HTML de verdade', () => {
  const r = markdown('<img src=x onerror=alert(1)> <script>alert(1)</script>')
  assert.ok(!r.includes('<img') && !r.includes('<script'))
  assert.ok(r.includes('&lt;img'))
})

test('markdown: só links https', () => {
  assert.equal(markdown('[site](https://exemplo.com)'), '<p><a href="https://exemplo.com" target="_blank" rel="noopener">site</a></p>')
  assert.ok(!markdown('[x](javascript:alert(1))').includes('<a'))
  assert.ok(!markdown('[x](http://inseguro.com)').includes('<a'))
  assert.ok(!markdown('[x](https://a.com" onclick="y)').includes('onclick="'))
})
