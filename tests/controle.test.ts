import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharItem, descreverJanela, nomeDaTecla, podeControlar, TECLAS, type Item } from '../src/main/logica/controle.ts'

const LISTA = ['Spotify.exe', 'chrome.exe', 'Code.exe', 'notepad.exe', 'cmd.exe']

test('só mexe nos programas da lista', () => {
  assert.equal(podeControlar('Spotify', 'Spotify Premium', LISTA).ok, true)
  assert.equal(podeControlar('notepad', 'Sem título - Bloco de Notas', LISTA).ok, true)
  const fora = podeControlar('WhatsApp', 'WhatsApp', LISTA)
  assert.equal(fora.ok, false)
  assert.match(!fora.ok ? fora.motivo : '', /lista de programas/)
  assert.equal(podeControlar('', '', LISTA).ok, false)
})

test('terminal, sistema, senhas e a própria FRIDAY nunca, nem se estiverem na lista', () => {
  for (const p of ['cmd', 'powershell', 'WindowsTerminal', 'regedit', 'Taskmgr', 'KeePassXC', 'Bitwarden', 'mstsc', 'AnyDesk']) {
    assert.equal(podeControlar(p, 'qualquer', [...LISTA, `${p}.exe`]).ok, false, p)
  }
  const propria = podeControlar('FRIDAY', 'FRIDAY', ['FRIDAY.exe'])
  assert.match(!propria.ok ? propria.motivo : '', /é a minha/)
})

test('no navegador, banco, pagamento e login ficam com ele', () => {
  for (const t of ['Itaú - Internet Banking - Google Chrome', 'Nubank - Google Chrome', 'Checkout - Loja - Google Chrome', 'Pagamento via Pix', 'Entrar - Contas do Google', 'Cartão de crédito | Fatura']) {
    assert.equal(podeControlar('chrome', t, LISTA).ok, false, t)
  }
  for (const t of ['YouTube - Google Chrome', 'Caixa de entrada - Gmail', 'Banana nanica receita - Google Chrome', 'Entrada de dados', 'Cartografia']) {
    assert.equal(podeControlar('chrome', t, LISTA).ok, true, t)
  }
  // Fora do navegador o título é de arquivo, não de página: "login.ts" no VS Code pode
  assert.equal(podeControlar('Code', 'login.ts - meu-app - Visual Studio Code', LISTA).ok, true)
})

test('teclas: só as permitidas, com os jeitos de falar', () => {
  assert.equal(nomeDaTecla('enter'), 'enter')
  assert.equal(nomeDaTecla('Ctrl+S'), 'ctrl_s')
  assert.equal(nomeDaTecla('ctrl s'), 'ctrl_s')
  assert.equal(nomeDaTecla('page down'), 'pagina_baixo')
  assert.equal(nomeDaTecla('seta pra baixo'), 'seta_baixo')
  assert.equal(nomeDaTecla('salvar'), 'ctrl_s')
  assert.equal(nomeDaTecla('nova aba'), 'ctrl_t')
  for (const proibida of ['alt+f4', 'win+r', 'delete', 'ctrl+alt+del', 'ctrl+shift+esc', 'win']) assert.equal(nomeDaTecla(proibida), null, proibida)
  // Nenhuma tecla da lista usa Alt (%) nem a tecla Windows
  for (const v of Object.values(TECLAS)) assert.doesNotMatch(v, /%|\{LWIN\}|\{DEL/)
})

const itens: Item[] = [
  { i: 1, tipo: 'Text', nome: 'Pesquisar', valor: '', senha: false, ativo: true, clica: false },
  { i: 2, tipo: 'Edit', nome: 'Pesquisar', valor: 'lo-fi', senha: false, ativo: true, clica: true },
  { i: 3, tipo: 'Button', nome: 'Playlist de Estudo', valor: '', senha: false, ativo: true, clica: true },
  { i: 4, tipo: 'Edit', nome: 'Senha', valor: '', senha: true, ativo: true, clica: true },
  { i: 5, tipo: 'Button', nome: 'Próxima', valor: '', senha: false, ativo: false, clica: true }
]

test('acha o item pelo número ou pelo texto, preferindo o que dá para clicar', () => {
  assert.equal(acharItem(itens, 3, '')?.nome, 'Playlist de Estudo')
  assert.equal(acharItem(itens, 9, '')?.nome, undefined)
  assert.equal(acharItem(itens, null, 'pesquisar')?.i, 2)
  assert.equal(acharItem(itens, null, 'estudo')?.i, 3)
  assert.equal(acharItem(itens, null, 'proxima')?.i, 5)
  assert.equal(acharItem(itens, null, ''), null)
})

test('descreve a janela marcando campo, senha e desativado', () => {
  const d = descreverJanela(itens)
  assert.match(d, /#2 Edit \(campo\): Pesquisar = "lo-fi"/)
  assert.match(d, /#4 Edit \(campo, SENHA, não mexa\): Senha/)
  assert.match(d, /#5 Button \(desativado\): Próxima/)
  assert.match(d, /#1 Text \(texto\): Pesquisar/)
})
