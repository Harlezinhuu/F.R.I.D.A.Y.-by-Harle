// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// App do celular: voz (como o modo de voz do ChatGPT), chat com histórico e ajustes.

import { App } from '@capacitor/app'
import { ModoVoz } from './voz'
import { responder } from './chat'
import { markdown } from './markdown'
import { lerMemoria } from './ferramentas'
import {
  apagarConversa, apagarTodas, lerAjustes, lerConversa, listarConversas, novaConversa, salvarAjustes, salvarConversa, salvarLista, tituloDe,
  type Ajustes, type Conversa, type Mensagem
} from './armazem'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const VERSAO = '0.1.0'

let ajustes: Ajustes = await lerAjustes()

// ---------- Abas ----------

type Aba = 'voz' | 'chat' | 'ajustes'
const TELAS: Record<Aba, string> = { voz: 'telaVoz', chat: 'telaChat', ajustes: 'telaAjustes' }
function abrirAba(a: Aba): void {
  document.body.dataset.tela = a
  for (const [aba, id] of Object.entries(TELAS)) $(id).hidden = aba !== a
  for (const b of document.querySelectorAll<HTMLButtonElement>('.abas button')) {
    if (b.dataset.aba === a) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current')
  }
  if (a === 'chat') rolarFim()
  if (a === 'ajustes') void mostrarAjustes()
}
for (const b of document.querySelectorAll<HTMLButtonElement>('.abas button')) b.addEventListener('click', () => abrirAba(b.dataset.aba as Aba))

function status(texto: string, cor = '#5BE3A8'): void {
  $('estadoTxt').textContent = texto
  const p = $('ponto')
  p.style.background = cor
  p.style.boxShadow = `0 0 8px ${cor}`
}

// ---------- Voz ----------

const voz = new ModoVoz($('nucleo'), () => ajustes)
const CORES: Record<string, string> = { ouvindo: '#6FB8FF', falando: '#36D6EE', pensando: '#8E7CFF', offline: '#E5566B', semMic: '#F2C14E' }
voz.aoEstado = (e, rotulo) => {
  $('rotulo').textContent = rotulo
  status(e === 'repouso' ? 'PRONTA' : rotulo, CORES[e] ?? '#5BE3A8')
}
voz.aoLegenda = (quem, texto) => { $('legQuem').textContent = quem; $('legTexto').textContent = texto }
voz.aoFim = () => { document.body.classList.remove('conversando'); void atualizarListaConversas() }
voz.aoProjecao = (ativa) => {
  $('proj').hidden = !ativa
  if (ativa) {
    $('projNome').textContent = voz.nucleo.projecao.nome
    $('projFonte').textContent = 'PROJEÇÃO'
    // A projeção aparece na tela de voz (pedida pelo chat também)
    if (document.body.dataset.tela !== 'voz') abrirAba('voz')
  }
}

$('falar').addEventListener('click', async () => {
  if (voz.ativo) { await voz.parar(); return }
  if (!ajustes.chave) { abrirAba('ajustes'); return }
  document.body.classList.add('conversando')
  $('legQuem').textContent = ''
  $('legTexto').textContent = ''
  try {
    await voz.iniciar()
  } catch (e) {
    document.body.classList.remove('conversando')
    $('legQuem').textContent = 'SISTEMA'
    $('legTexto').textContent = (e as Error).message
  }
})

// ---------- Chat ----------

let conversa: Conversa = novaConversa()
let respondendo: AbortController | null = null

function rolarFim(): void { const m = $('mensagens'); m.scrollTop = m.scrollHeight }

function elementoMensagem(m: Mensagem): HTMLElement {
  const el = document.createElement('div')
  el.className = `msg ${m.papel}`
  if (m.voz) { const v = document.createElement('span'); v.className = 'voz'; v.textContent = 'POR VOZ'; el.append(v) }
  if (m.imagem) { const img = document.createElement('img'); img.src = m.imagem; img.alt = 'Foto enviada'; el.append(img) }
  if (m.papel === 'model') {
    const corpo = document.createElement('div')
    corpo.innerHTML = markdown(m.texto)
    el.append(corpo)
  } else el.append(document.createTextNode(m.texto))
  return el
}

const vazio = $('vazio')
function mostrarConversa(): void {
  const lista = $('mensagens')
  lista.replaceChildren(...(conversa.mensagens.length ? conversa.mensagens.map(elementoMensagem) : [vazio]))
  $('chatTitulo').textContent = conversa.titulo
  rolarFim()
}

async function enviar(texto: string): Promise<void> {
  texto = texto.trim()
  if (!texto || respondendo) return
  if (!ajustes.chave) { abrirAba('ajustes'); return }
  const m: Mensagem = { papel: 'user', texto, hora: new Date().toISOString() }
  conversa.mensagens.push(m)
  if (conversa.titulo === 'Nova conversa') conversa.titulo = tituloDe(texto)
  mostrarConversa()
  const resposta = document.createElement('div')
  resposta.className = 'msg model digitando'
  $('mensagens').append(resposta)
  rolarFim()
  respondendo = new AbortController()
  ;($('enviar') as HTMLButtonElement).disabled = true
  try {
    const final = await responder(ajustes.chave, ajustes.nome, conversa.mensagens, voz.contexto, (parcial) => {
      resposta.innerHTML = markdown(parcial)
      rolarFim()
    }, respondendo.signal)
    resposta.classList.remove('digitando')
    conversa.mensagens.push({ papel: 'model', texto: final || '…', hora: new Date().toISOString() })
  } catch (e) {
    resposta.className = 'msg erro'
    const msg = (e as Error).message || ''
    resposta.textContent = /API key|PERMISSION|401|403/i.test(msg) ? 'A chave do Gemini não foi aceita. Confira nos Ajustes.' : /fetch|network|Failed/i.test(msg) ? 'Sem conexão com a internet.' : `Algo deu errado: ${msg.slice(0, 160)}`
  } finally {
    respondendo = null
    ;($('enviar') as HTMLButtonElement).disabled = false
    conversa.atualizadaEm = new Date().toISOString()
    if (conversa.mensagens.length) await salvarConversa(conversa)
  }
}

const entrada = $<HTMLTextAreaElement>('entrada')
entrada.addEventListener('input', () => { entrada.style.height = 'auto'; entrada.style.height = `${Math.min(140, entrada.scrollHeight)}px` })
$('composer').addEventListener('submit', (e) => { e.preventDefault(); const t = entrada.value; entrada.value = ''; entrada.style.height = ''; void enviar(t) })
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sugestao]')) b.addEventListener('click', () => void enviar(b.dataset.sugestao ?? ''))

$('novaConversa').addEventListener('click', () => { respondendo?.abort(); conversa = novaConversa(); mostrarConversa(); entrada.focus() })

// Histórico (gaveta)
async function atualizarListaConversas(): Promise<void> {
  const lista = await listarConversas()
  $('listaConversas').replaceChildren(...(lista.length ? lista.map((c) => {
    const li = document.createElement('li')
    if (c.id === conversa.id) li.className = 'atual'
    const abrir = document.createElement('button')
    abrir.className = 'abrir'
    abrir.type = 'button'
    const t = document.createElement('span'); t.textContent = c.titulo
    const d = document.createElement('small'); d.textContent = new Date(c.atualizadaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    abrir.append(t, d)
    abrir.addEventListener('click', async () => { const c2 = await lerConversa(c.id); if (c2) { conversa = c2; mostrarConversa() } fecharGaveta() })
    const apagar = document.createElement('button')
    apagar.className = 'apagar'
    apagar.type = 'button'
    apagar.setAttribute('aria-label', `Apagar ${c.titulo}`)
    apagar.textContent = '×'
    apagar.addEventListener('click', async () => { await apagarConversa(c.id); if (c.id === conversa.id) { conversa = novaConversa(); mostrarConversa() } void atualizarListaConversas() })
    li.append(abrir, apagar)
    return li
  }) : [Object.assign(document.createElement('li'), { textContent: 'Nenhuma conversa ainda.', className: 'dica' })]))
}
const fecharGaveta = () => { $('gaveta').hidden = true }
$('abrirConversas').addEventListener('click', async () => { await atualizarListaConversas(); $('gaveta').hidden = false })
$('gavetaFundo').addEventListener('click', fecharGaveta)

// ---------- Ajustes ----------

async function mostrarAjustes(): Promise<void> {
  $<HTMLInputElement>('ajChave').value = ajustes.chave
  $<HTMLInputElement>('ajNome').value = ajustes.nome
  $<HTMLSelectElement>('ajVoz').value = ajustes.voz
  $<HTMLInputElement>('ajCidade').value = ajustes.cidade
  $<HTMLInputElement>('ajEfeito').checked = ajustes.efeitoVoz
  $('avisoChave').hidden = !!ajustes.chave
  $('versao').textContent = `v${VERSAO}`
  const fatos = await lerMemoria()
  $('memoria').replaceChildren(...(fatos.length ? fatos.slice().reverse().map((f) => {
    const li = document.createElement('li')
    const s = document.createElement('span'); s.textContent = f.texto
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', `Esquecer: ${f.texto}`)
    x.addEventListener('click', async () => { await salvarLista('memoria', (await lerMemoria()).filter((g) => g.id !== f.id)); void mostrarAjustes() })
    li.append(s, x)
    return li
  }) : [Object.assign(document.createElement('li'), { textContent: 'Nada ainda. Ela aprende conforme vocês conversam.', className: 'nada' })]))
}

$('verChave').addEventListener('click', () => { const i = $<HTMLInputElement>('ajChave'); i.type = i.type === 'password' ? 'text' : 'password' })
$('salvar').addEventListener('click', async () => {
  ajustes = {
    chave: $<HTMLInputElement>('ajChave').value.trim(),
    nome: $<HTMLInputElement>('ajNome').value.trim(),
    voz: $<HTMLSelectElement>('ajVoz').value,
    cidade: $<HTMLInputElement>('ajCidade').value.trim(),
    efeitoVoz: $<HTMLInputElement>('ajEfeito').checked
  }
  await salvarAjustes(ajustes)
  $('salvo').hidden = false
  $('avisoChave').hidden = !!ajustes.chave
  setTimeout(() => { $('salvo').hidden = true }, 2500)
})
$('apagarHistorico').addEventListener('click', async () => {
  if (!confirm('Apagar todas as conversas deste celular?')) return
  await apagarTodas()
  conversa = novaConversa()
  mostrarConversa()
})

// ---------- Botão voltar do Android ----------

void App.addListener('backButton', () => {
  if (!$('gaveta').hidden) return fecharGaveta()
  if (document.body.dataset.tela !== 'voz') return abrirAba('voz')
  if (voz.ativo) { void voz.parar(); return }
  void App.minimizeApp()
})
// Saiu do app: encerra a conversa por voz (o microfone não fica ligado escondido)
void App.addListener('pause', () => { if (voz.ativo) void voz.parar() })

// ---------- Início ----------

mostrarConversa()
if (!ajustes.chave) abrirAba('ajustes')
