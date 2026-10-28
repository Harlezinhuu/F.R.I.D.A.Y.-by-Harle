// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Scripts que rodam DENTRO da página do WhatsApp Web (como texto, para o empacotador não mexer).
// Usam só o que o WhatsApp Web mostra na tela: as mesmas bolhas, botões e caixa de texto que você vê.
// Testados numa página que imita o WhatsApp Web (tests/consulta-web.test.ts não precisa de Electron).

/** 'logado' | 'qr' | 'carregando' */
export const SITUACAO = `(() => {
  if (document.querySelector('#pane-side, [data-testid="chat-list"], div[aria-label="Lista de conversas"], div[aria-label="Chat list"]')) return 'logado'
  if (document.querySelector('canvas')) return 'qr'
  return 'carregando'
})()`

/** 'sim' (dá para escrever) | 'leitura' | 'invalido' (número sem WhatsApp) | 'nao' (ainda abrindo) */
export const CONVERSA_ABERTA = `(() => {
  const main = document.querySelector('#main')
  if (!main) {
    const d = document.querySelector('[role="dialog"], [data-animate-modal-popup="true"]')
    if (d && /inv[aá]lid|invalid|n[aã]o est[aá] no whatsapp|isn.t on whatsapp/i.test(d.innerText || '')) return 'invalido'
    return 'nao'
  }
  return main.querySelector('footer [contenteditable="true"]') ? 'sim' : 'leitura'
})()`

/** As mensagens recebidas na conversa aberta (as suas ficam de fora) e a lista aberta na tela, se tiver. */
export const LER = `(() => {
  const main = document.querySelector('#main')
  if (!main) return null
  const hora = /^\\d{1,2}:\\d{2}(\\s?[AP]M)?$/i
  const mensagens = []
  const bolhas = [...main.querySelectorAll('.message-in, .message-out')].slice(-60)
  bolhas.forEach((el, i) => {
    if (el.classList.contains('message-out')) return
    const caixa = el.closest('[data-id]') || el.querySelector('[data-id]')
    const c = el.querySelector('[data-pre-plain-text]')
    const meta = c ? (c.getAttribute('data-pre-plain-text') || '') : ''
    const corpo = c ? c.querySelector('.selectable-text') : null
    let texto = ((corpo && corpo.innerText) || '').trim()
    const botoes = [...new Set([...el.querySelectorAll('[role="button"], button')]
      .map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim())
      .filter((t) => t && t.length <= 60 && t !== texto && !hora.test(t)))]
    if (!texto) {
      texto = (el.innerText || '').split('\\n').map((l) => l.trim())
        .filter((l) => l && !hora.test(l) && !botoes.includes(l)).join('\\n').trim()
    }
    const m = meta.match(/\\[(\\d{1,2}):(\\d{2}), (\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})\\]/)
    const quando = m ? new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]).getTime() : 0
    const id = (caixa && caixa.getAttribute('data-id')) || (meta + '|' + texto + '|' + i)
    mensagens.push({ id, texto, quando, botoes })
  })
  const d = document.querySelector('[role="dialog"]')
  return { mensagens, janela: d ? (d.innerText || '').trim().slice(0, 800) : '' }
})()`

/** Escreve na caixa da conversa e toca em Enviar. Função: chame com o texto. */
export const ENVIAR = `(async (t) => {
  const caixa = document.querySelector('#main footer div[contenteditable="true"]')
  if (!caixa) return 'sem-caixa'
  caixa.focus()
  document.execCommand('selectAll', false, null)
  document.execCommand('insertText', false, t)
  await new Promise((r) => setTimeout(r, 400))
  if (!(caixa.innerText || '').trim()) return 'nao-escreveu'
  const icone = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]')
  const botao = (icone && icone.closest('button, [role="button"]')) ||
    document.querySelector('#main footer button[aria-label="Enviar"], #main footer button[aria-label="Send"]')
  if (!botao) return 'sem-botao'
  botao.click()
  return 'ok'
})`

/** Só toca em Enviar (o texto já está na caixa). */
export const CLICAR_ENVIAR = `(() => {
  const caixa = document.querySelector('#main footer div[contenteditable="true"]')
  if (!caixa || !(caixa.innerText || '').trim()) return 'nao-escreveu'
  const icone = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]')
  const botao = (icone && icone.closest('button, [role="button"]')) ||
    document.querySelector('#main footer button[aria-label="Enviar"], #main footer button[aria-label="Send"]')
  if (!botao) return 'sem-botao'
  botao.click()
  return 'ok'
})()`

/** Só põe o foco na caixa (para o plano B de digitação). */
export const FOCAR = `(() => { const c = document.querySelector('#main footer div[contenteditable="true"]'); if (c) c.focus(); return !!c })()`

/** A mensagem saiu? (caixa vazia e a última bolha sua começa igual). Função: chame com o texto. */
export const SAIU = `((t) => {
  const caixa = document.querySelector('#main footer div[contenteditable="true"]')
  if (caixa && (caixa.innerText || '').trim()) return false
  const minhas = [...document.querySelectorAll('#main .message-out')]
  const ultima = minhas[minhas.length - 1]
  if (!ultima) return false
  const n = (s) => (s || '').replace(/\\s+/g, ' ').trim()
  return n(ultima.innerText).startsWith(n(t).slice(0, 24))
})`

/** Toca num botão de uma das últimas mensagens recebidas ou da lista aberta. Função: chame com o rótulo. */
export const TOCAR = `((r) => {
  const n = (s) => (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ' ').trim()
  const alvo = n(r)
  if (!alvo) return false
  const d = document.querySelector('[role="dialog"]')
  const raizes = d ? [d] : [...document.querySelectorAll('#main .message-in')].slice(-3).reverse()
  for (const raiz of raizes) {
    const cands = [...raiz.querySelectorAll('[role="button"], button, [role="radio"], [role="option"], [role="listitem"], li, label')]
    const texto = (e) => n(e.innerText || e.getAttribute('aria-label'))
    const el = cands.find((e) => texto(e) === alvo) || (alvo.length >= 3 ? cands.find((e) => texto(e).includes(alvo)) : null)
    if (el) { el.click(); return true }
  }
  return false
})`
