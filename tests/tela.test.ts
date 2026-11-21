// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Olhar a tela: o que ela pode ver e o contexto da janela da frente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextoDaJanela, podeOlhar } from '../src/main/logica/controle.ts'

test('olhar a tela: qualquer programa, menos senhas, banco e ela mesma', () => {
  assert.equal(podeOlhar('WindowsTerminal', 'npm run dev').ok, true, 'terminal pode (para explicar erro)')
  assert.equal(podeOlhar('Code', 'app.ts - friday - Visual Studio Code').ok, true)
  assert.equal(podeOlhar('chrome', 'Stack Overflow - Google Chrome').ok, true)
  assert.equal(podeOlhar('KeePassXC', 'Banco de senhas').ok, false)
  assert.equal(podeOlhar('chrome', 'Nubank - Login - Google Chrome').ok, false)
  assert.equal(podeOlhar('msedge', 'Pagamento - Microsoft Edge').ok, false)
  assert.equal(podeOlhar('electron', 'F.R.I.D.A.Y').ok, false)
})

test('contexto da janela: arquivo e projeto do VS Code, página do navegador', () => {
  assert.equal(contextoDaJanela('Code', '● tools.ts - f.r.i.d.a.y - Visual Studio Code'), 'No Visual Studio Code: arquivo tools.ts, projeto f.r.i.d.a.y.')
  assert.equal(contextoDaJanela('chrome', 'Erro TS2304 - Stack Overflow - Google Chrome'), 'No navegador, na página "Erro TS2304 - Stack Overflow".')
  assert.equal(contextoDaJanela('Spotify', 'Spotify Premium'), 'Programa Spotify, janela "Spotify Premium".')
})
