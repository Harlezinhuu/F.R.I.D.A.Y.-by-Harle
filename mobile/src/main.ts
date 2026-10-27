// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// App do celular, direção "Órbita": um mundo 3D só (a fita de Möbius) atrás de quatro telas:
// voz, chat, conversas e ajustes.

import { App } from '@capacitor/app'
import { Mundo, type Tela } from './mundo'
import { ModoVoz } from './voz'
import { responder } from './chat'
import { markdown } from './markdown'
import { lerMemoria } from './ferramentas'
import { Celular, nativo, type Permissao } from './celular'
import {
  apagarConversa, apagarTodas, lerAjustes, lerConversa, listarConversas, novaConversa, salvarAjustes, salvarConversa, salvarLista, tituloDe,
  type Ajustes, type Conversa, type Mensagem,
  lerAvisos, salvarAvisos, type Avisos
} from './armazem'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const VERSAO = '0.4.0'
const VOZES = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Callirrhoe', 'Autonoe', 'Charon', 'Puck']

let ajustes: Ajustes = await lerAjustes()
const mundo = new Mundo($('mundo'))
mundo.setGiroscopio(ajustes.giroscopio)

function avisar(texto: string): void {
  const el = $('aviso')
  el.textContent = texto
  el.hidden = false
  clearTimeout(Number(el.dataset.t))
  el.dataset.t = String(window.setTimeout(() => { el.hidden = true }, 3200))
}

// ---------- Telas ----------

const TELAS: Record<Tela, string> = { voz: 'telaVoz', chat: 'telaChat', conversas: 'telaConversas', ajustes: 'telaAjustes' }
let telaAtual: Tela = 'voz'
let telaAntesDosAjustes: Tela = 'voz'

function ir(t: Tela): void {
  if (t === 'ajustes' && telaAtual !== 'ajustes') telaAntesDosAjustes = telaAtual
  telaAtual = t
  document.body.dataset.tela = t
  mundo.setTela(t)
  for (const [nome, id] of Object.entries(TELAS)) {
    const el = $(id)
    const ativa = nome === t
    el.classList.toggle('ativa', ativa)
    el.inert = !ativa
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.dock button')) {
    if (b.dataset.ir === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current')
  }
  if (t === 'chat') requestAnimationFrame(rolarFim)
  if (t === 'conversas') void mostrarConversas()
  if (t === 'ajustes') void mostrarAjustes()
}
for (const b of document.querySelectorAll<HTMLElement>('[data-ir]')) b.addEventListener('click', () => ir(b.dataset.ir as Tela))

// ---------- Voz ----------

const voz = new ModoVoz(mundo, $('telaVoz'), () => ajustes)

/** O botão invisível de "tocar na fita" fica exatamente em cima da fita. */
function posicionarFita(): void {
  const a = mundo.areaDaFita(), b = $('fita')
  Object.assign(b.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` })
}
new ResizeObserver(posicionarFita).observe(document.body)
posicionarFita()

function saudacao(): void {
  const h = new Date().getHours()
  const ola = h < 5 ? 'BOA NOITE' : h < 12 ? 'BOM DIA' : h < 18 ? 'BOA TARDE' : 'BOA NOITE'
  $('saudacaoKicker').textContent = ajustes.nome ? `${ola}, ${ajustes.nome.toUpperCase()}` : ola
}
saudacao()

const COR_ESTADO: Record<string, string> = { ouvindo: '#5FE1F2', falando: '#B7ADFF', pensando: '#B7ADFF', offline: '#FF7A8A', semMic: '#F2C14E', repouso: '#5FE1F2' }
voz.aoEstado = (e, rotulo) => {
  $('estadoTxt').textContent = rotulo
  $('pilulaTxt').textContent = e === 'repouso' ? 'PRONTA' : rotulo
  $('pilula').style.color = COR_ESTADO[e] ?? '#5FE1F2'
}
voz.aoLegenda = (quem, texto) => {
  if (quem === 'VOCÊ') $('legVoce').textContent = texto
  else { $('legEla').textContent = texto; if (quem === 'SISTEMA') $('legVoce').textContent = '' }
}

let inicioConversa = 0, relogioConversa = 0, relogioOndas = 0
function conversando(sim: boolean): void {
  document.body.classList.toggle('conversando', sim)
  clearInterval(relogioConversa); clearInterval(relogioOndas)
  if (!sim) return
  inicioConversa = Date.now()
  relogioConversa = window.setInterval(() => {
    const s = Math.floor((Date.now() - inicioConversa) / 1000)
    $('cronometro').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }, 500)
  // As barrinhas seguem o nível do áudio de verdade
  const barras = [...$('ondas').children] as HTMLElement[]
  relogioOndas = window.setInterval(() => {
    const n = mundo.nivelAtual()
    barras.forEach((b, i) => { b.style.height = `${8 + Math.min(26, n * 220 * (0.5 + Math.abs(Math.sin(Date.now() / 140 + i * 1.7))))}px` })
  }, 90)
}
voz.aoFim = () => { conversando(false); $('cartaoAcao').hidden = true; void mostrarConversas() }

let cartaoTempo = 0
voz.aoAcao = (rotulo, titulo, detalhe) => {
  $('acaoRotulo').textContent = rotulo
  $('acaoTitulo').textContent = titulo
  $('acaoDetalhe').textContent = detalhe
  const c = $('cartaoAcao')
  c.hidden = true
  void c.offsetWidth
  c.hidden = false
  clearTimeout(cartaoTempo)
  cartaoTempo = window.setTimeout(() => { c.hidden = true }, 7000)
}
voz.aoProjecao = (ativa) => {
  $('proj').hidden = !ativa
  document.body.classList.toggle('projetando', ativa)
  if (ativa) {
    $('projNome').textContent = mundo.projecao.nome
    // A projeção aparece na tela de voz (pedida pelo chat também)
    if (telaAtual !== 'voz') ir('voz')
  }
}

async function alternarConversa(): Promise<void> {
  if (voz.ativo) { await voz.parar(); return }
  if (!ajustes.chave) { ir('ajustes'); return }
  $('legVoce').textContent = ''
  $('legEla').textContent = ''
  conversando(true)
  try {
    await voz.iniciar()
  } catch (e) {
    conversando(false)
    avisar((e as Error).message)
  }
}
$('fita').addEventListener('click', () => { if (!voz.arrastou) void alternarConversa() })
$('encerrar').addEventListener('click', () => void voz.parar())

// ---------- Chat ----------

let conversa: Conversa = novaConversa()
let respondendo: AbortController | null = null
const vazio = $('vazio')

function rolarFim(): void { const m = $('mensagens'); m.scrollTop = m.scrollHeight; profundidade() }

function elementoMensagem(m: Mensagem): HTMLElement {
  const el = document.createElement('div')
  el.className = `msg ${m.papel}`
  if (m.voz) { const v = document.createElement('span'); v.className = 'por-voz'; v.textContent = 'POR VOZ'; el.append(v) }
  if (m.papel === 'model') { const corpo = document.createElement('div'); corpo.innerHTML = markdown(m.texto); el.append(corpo) }
  else el.append(document.createTextNode(m.texto))
  return el
}

/** Mensagens antigas recuam para o fundo conforme sobem: a conversa tem profundidade. */
function profundidade(): void {
  const lista = $('mensagens')
  const topo = lista.getBoundingClientRect().top
  for (const el of lista.children as HTMLCollectionOf<HTMLElement>) {
    if (!el.classList.contains('msg')) continue
    const y = el.getBoundingClientRect().top - topo
    const k = Math.max(0, Math.min(1, 1 - y / 150))
    el.style.transform = k ? `perspective(700px) rotateX(${k * 20}deg) scale(${1 - k * 0.08})` : ''
    el.style.opacity = k ? String(1 - k * 0.55) : ''
  }
}
$('mensagens').addEventListener('scroll', () => requestAnimationFrame(profundidade), { passive: true })

function mostrarConversa(): void {
  $('mensagens').replaceChildren(...(conversa.mensagens.length ? conversa.mensagens.map(elementoMensagem) : [vazio]))
  $('chatTitulo').textContent = conversa.titulo
  $('chatEstado').textContent = 'FRIDAY'
  rolarFim()
}

async function enviar(texto: string): Promise<void> {
  texto = texto.trim()
  if (!texto || respondendo) return
  if (!ajustes.chave) { ir('ajustes'); return }
  conversa.mensagens.push({ papel: 'user', texto, hora: new Date().toISOString() })
  if (conversa.titulo === 'Nova conversa') conversa.titulo = tituloDe(texto)
  mostrarConversa()
  const resposta = document.createElement('div')
  resposta.className = 'msg model digitando'
  $('mensagens').append(resposta)
  rolarFim()
  respondendo = new AbortController()
  mundo.setEstado('pensando')
  $('chatEstado').textContent = 'FRIDAY ESTÁ ESCREVENDO'
  $<HTMLButtonElement>('enviar').disabled = true
  try {
    const final = await responder(ajustes.chave, ajustes.nome, conversa.mensagens, voz.contexto, (parcial) => {
      resposta.innerHTML = markdown(parcial)
      mundo.setEstado('falando')
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
    if (!voz.ativo) mundo.setEstado('repouso')
    $('chatEstado').textContent = 'FRIDAY'
    $<HTMLButtonElement>('enviar').disabled = false
    conversa.atualizadaEm = new Date().toISOString()
    if (conversa.mensagens.length) await salvarConversa(conversa)
  }
}

const entrada = $<HTMLTextAreaElement>('entrada')
entrada.addEventListener('input', () => { entrada.style.height = 'auto'; entrada.style.height = `${Math.min(130, entrada.scrollHeight)}px` })
$('composer').addEventListener('submit', (e) => { e.preventDefault(); const t = entrada.value; entrada.value = ''; entrada.style.height = ''; void enviar(t) })
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sugestao]')) b.addEventListener('click', () => void enviar(b.dataset.sugestao ?? ''))
function comecarNova(): void { respondendo?.abort(); conversa = novaConversa(); mostrarConversa(); ir('chat'); entrada.focus() }
$('novaConversa').addEventListener('click', comecarNova)
$('novaDeConversas').addEventListener('click', comecarNova)

// ---------- Conversas: carrossel 3D + lista ----------

let todas: Conversa[] = []
let indiceCarrossel = 0
const ICONE_VOZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c2.5-6 5.5-6 9 0s6.5 6 9 0"/></svg>'
const ICONE_TEXTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>'
const ICONE_LIXO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>'
const ehVoz = (c: Conversa) => c.mensagens.some((m) => m.voz)
const quando = (iso: string): string => {
  const d = new Date(iso), hoje = new Date()
  const dias = Math.floor((new Date(hoje.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return dias === 0 ? `HOJE · ${hora}` : dias === 1 ? `ONTEM · ${hora}` : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase()
}
const semTitulo = (t: string) => t.replace(/^🎙\s*/, '')

async function abrirConversa(id: string): Promise<void> {
  const c = await lerConversa(id)
  if (!c) return
  conversa = c
  mostrarConversa()
  ir('chat')
}

function desenharCarrossel(): void {
  const recentes = todas.slice(0, 5)
  const car = $('carrossel')
  if (!recentes.length) { car.replaceChildren(); $('pontos').replaceChildren(); return }
  indiceCarrossel = Math.max(0, Math.min(recentes.length - 1, indiceCarrossel))
  car.replaceChildren(...recentes.map((c, i) => {
    const d = i - indiceCarrossel
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `cc${d === 0 ? ' centro' : ''}`
    const ultima = [...c.mensagens].reverse().find((m) => m.papel === 'model')?.texto ?? ''
    b.innerHTML = `<span class="quando"></span><b></b><p></p><small></small>`
    const q = b.querySelector('.quando')!
    q.textContent = `${quando(c.atualizadaEm)} · ${ehVoz(c) ? 'VOZ' : 'TEXTO'}`
    q.insertAdjacentHTML('beforeend', ehVoz(c) ? ICONE_VOZ : ICONE_TEXTO)
    b.querySelector('b')!.textContent = semTitulo(c.titulo)
    b.querySelector('p')!.textContent = ultima.replace(/[*`#_>]/g, '').slice(0, 120)
    b.querySelector('small')!.textContent = `${c.mensagens.length} mensagens`
    b.setAttribute('aria-label', `${semTitulo(c.titulo)}, ${quando(c.atualizadaEm)}`)
    const lado = Math.sign(d), dist = Math.abs(d)
    b.style.transform = d === 0 ? 'translateZ(40px)' : `translateX(${lado * (130 + (dist - 1) * 60)}px) rotateY(${-lado * 38}deg) translateZ(${-60 - dist * 40}px)`
    b.style.opacity = d === 0 ? '1' : dist === 1 ? '.55' : '0'
    b.style.zIndex = String(10 - dist)
    b.tabIndex = dist > 1 ? -1 : 0
    b.addEventListener('click', () => { if (d === 0) void abrirConversa(c.id); else { indiceCarrossel = i; desenharCarrossel() } })
    return b
  }))
  $('pontos').replaceChildren(...recentes.map((_, i) => { const p = document.createElement('i'); if (i === indiceCarrossel) p.className = 'ativo'; return p }))
}

// Arrastar para o lado gira o carrossel
let arrasteX: number | null = null
$('carrossel').addEventListener('pointerdown', (e) => { arrasteX = e.clientX })
$('carrossel').addEventListener('pointerup', (e) => {
  if (arrasteX === null) return
  const dx = e.clientX - arrasteX
  arrasteX = null
  if (Math.abs(dx) > 40) { indiceCarrossel += dx < 0 ? 1 : -1; desenharCarrossel() }
})

function desenharGrupos(): void {
  const busca = normalizar($<HTMLInputElement>('busca').value)
  const lista = busca ? todas.filter((c) => normalizar(`${c.titulo} ${c.mensagens.map((m) => m.texto).join(' ')}`).includes(busca)) : todas
  const grupos = new Map<string, Conversa[]>()
  const hoje = new Date(new Date().toDateString()).getTime()
  for (const c of lista) {
    const dias = Math.floor((hoje - new Date(new Date(c.atualizadaEm).toDateString()).getTime()) / 86_400_000)
    const g = dias <= 0 ? 'HOJE' : dias === 1 ? 'ONTEM' : dias < 7 ? 'ESTA SEMANA' : 'ANTES'
    grupos.set(g, [...(grupos.get(g) ?? []), c])
  }
  if (!lista.length) {
    $('grupos').replaceChildren(Object.assign(document.createElement('p'), { className: 'nada', textContent: busca ? 'Nada encontrado.' : 'Suas conversas aparecem aqui.' }))
    return
  }
  $('grupos').replaceChildren(...[...grupos.entries()].flatMap(([nome, cs]) => {
    const h = document.createElement('h2')
    h.textContent = nome
    return [h, ...cs.map((c) => {
      const linha = document.createElement('div')
      linha.className = 'item'
      const abrir = document.createElement('button')
      abrir.type = 'button'
      abrir.className = 'item'
      abrir.style.padding = '0'
      abrir.innerHTML = `<span class="ic${ehVoz(c) ? ' voz' : ''}">${ehVoz(c) ? ICONE_VOZ : ICONE_TEXTO}</span><span class="txt"><span></span><small></small></span>`
      abrir.querySelector('.txt span')!.textContent = semTitulo(c.titulo)
      abrir.querySelector('.txt small')!.textContent = `${quando(c.atualizadaEm).toLowerCase()} · ${ehVoz(c) ? 'por voz' : 'texto'}`
      abrir.addEventListener('click', () => void abrirConversa(c.id))
      const apagar = document.createElement('button')
      apagar.type = 'button'
      apagar.className = 'apagar'
      apagar.setAttribute('aria-label', `Apagar ${semTitulo(c.titulo)}`)
      apagar.innerHTML = ICONE_LIXO
      apagar.addEventListener('click', async () => {
        await apagarConversa(c.id)
        if (c.id === conversa.id) { conversa = novaConversa(); mostrarConversa() }
        void mostrarConversas()
      })
      linha.style.padding = '0'
      linha.append(abrir, apagar)
      return linha
    })]
  }))
}
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
$('busca').addEventListener('input', desenharGrupos)

async function mostrarConversas(): Promise<void> {
  todas = await listarConversas()
  desenharCarrossel()
  desenharGrupos()
}

// ---------- Ajustes ----------

async function guardar(): Promise<void> {
  await salvarAjustes(ajustes)
  mundo.setGiroscopio(ajustes.giroscopio)
  saudacao()
}

function mostrarVozes(): void {
  $('vozes').replaceChildren(...VOZES.map((v) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-checked', String(ajustes.voz === v))
    b.textContent = v
    b.addEventListener('click', () => { ajustes.voz = v; void guardar(); mostrarVozes() })
    return b
  }))
}

async function mostrarAjustes(): Promise<void> {
  mostrarVozes()
  $<HTMLInputElement>('ajEfeito').checked = ajustes.efeitoVoz
  $<HTMLInputElement>('ajGiro').checked = ajustes.giroscopio
  $<HTMLInputElement>('ajVibrar').checked = ajustes.vibrar
  $<HTMLInputElement>('ajNome').value = ajustes.nome
  $<HTMLInputElement>('ajCidade').value = ajustes.cidade
  $('chaveMascara').textContent = ajustes.chave ? `•••• •••• ${ajustes.chave.slice(-4).toUpperCase()}` : 'não configurada'
  $('avisoChave').hidden = !!ajustes.chave
  $('editarChave').hidden = !!ajustes.chave
  $('heroiNome').textContent = ajustes.nome || 'FRIDAY'
  $('versao').textContent = `v${VERSAO}`
  void mostrarControle()
  void mostrarAvisos()
  const fatos = await lerMemoria()
  $('memoriaResumo').textContent = fatos.length ? `${fatos.length} ${fatos.length === 1 ? 'coisa' : 'coisas'} que ela sabe sobre você` : 'Nada ainda'
}

$('ajEfeito').addEventListener('change', (e) => { ajustes.efeitoVoz = (e.target as HTMLInputElement).checked; void guardar(); avisar('Vale a partir da próxima conversa por voz.') })
$('ajGiro').addEventListener('change', (e) => { ajustes.giroscopio = (e.target as HTMLInputElement).checked; void guardar() })
$('ajVibrar').addEventListener('change', (e) => { ajustes.vibrar = (e.target as HTMLInputElement).checked; void guardar() })
$('ajNome').addEventListener('change', (e) => { ajustes.nome = (e.target as HTMLInputElement).value.trim(); void guardar(); $('heroiNome').textContent = ajustes.nome || 'FRIDAY' })
$('ajCidade').addEventListener('change', (e) => { ajustes.cidade = (e.target as HTMLInputElement).value.trim(); void guardar() })
$('trocarChave').addEventListener('click', () => { $('editarChave').hidden = false; $<HTMLInputElement>('ajChave').focus() })
$('salvarChave').addEventListener('click', async () => {
  const chave = $<HTMLInputElement>('ajChave').value.trim()
  if (chave.length < 20) { avisar('Essa chave parece incompleta.'); return }
  ajustes.chave = chave
  await guardar()
  $<HTMLInputElement>('ajChave').value = ''
  await mostrarAjustes()
  avisar('Chave salva. Pode conversar!')
})
$('voltarAjustes').addEventListener('click', () => ir(telaAntesDosAjustes))

// Controle do celular: permissões, acessibilidade e assistente padrão
const PERMISSOES: Permissao[] = ['contatos', 'telefone', 'sms', 'agenda']
async function mostrarControle(): Promise<void> {
  const secao = $('controle')
  if (!nativo()) { secao.hidden = true; return }
  secao.hidden = false
  try {
    const p = await Celular.checkPermissions()
    const ok = PERMISSOES.filter((x) => p[x] === 'granted').length
    $('ctlPermissoes').textContent = ok === PERMISSOES.length ? 'Todas liberadas' : `${ok} de ${PERMISSOES.length} liberadas`
    $('ctlLiberar').hidden = ok === PERMISSOES.length
    const { ativa } = await Celular.acessibilidade()
    $('ctlTela').textContent = ativa ? 'Ativo: ela lê a tela e toca nos botões' : 'Desligado'
    $('ctlAtivarTela').textContent = ativa ? 'Ajustar' : 'Ativar'
    $('ctlRestrito').hidden = ativa
    const { ativo } = await Celular.ehAssistentePadrao()
    $('ctlAssistente').textContent = ativo ? 'Ativo: segure o botão de ligar' : 'Segure o botão de ligar para chamar a FRIDAY'
    $('ctlDefinir').textContent = ativo ? 'Trocar' : 'Definir'
  } catch { /* sem o código nativo (versão antiga do app) */ }
}
$('ctlLiberar').addEventListener('click', async () => {
  try { await Celular.requestPermissions({ permissions: PERMISSOES }) } catch { /* negou */ }
  void mostrarControle()
})
$('ctlAtivarTela').addEventListener('click', () => {
  avisar('Ative "FRIDAY: controle da tela" e confirme.')
  void Celular.abrirAcessibilidade()
})
$('ctlInfoApp').addEventListener('click', () => void Celular.infoDoApp())
$('ctlDefinir').addEventListener('click', () => {
  avisar('Em "App assistente digital", escolha FRIDAY.')
  void Celular.definirAssistente()
})

// Avisos por voz: ligações e mensagens dos contatos importantes
let avisos: Avisos | null = null
async function guardarAvisos(): Promise<void> { if (avisos) await salvarAvisos(avisos) }

function desenharImportantes(): void {
  const lista = avisos?.importantes ?? []
  $('avImportantes').replaceChildren(...(lista.length ? lista.map((nome) => {
    const li = document.createElement('li')
    li.append(document.createTextNode(nome))
    const x = document.createElement('button')
    x.type = 'button'
    x.setAttribute('aria-label', `Tirar ${nome} dos importantes`)
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
    x.addEventListener('click', () => { if (!avisos) return; avisos.importantes = avisos.importantes.filter((n) => n !== nome); void guardarAvisos(); desenharImportantes() })
    li.append(x)
    return li
  }) : [Object.assign(document.createElement('li'), { className: 'vazio', textContent: 'Nenhum ainda. Ou diga: "a Mãe é importante".' })]))
}

async function mostrarAvisos(): Promise<void> {
  const secao = $('avisos')
  if (!nativo()) { secao.hidden = true; return }
  secao.hidden = false
  avisos = await lerAvisos()
  $<HTMLInputElement>('avLigacoes').checked = avisos.ligacoes
  $<HTMLInputElement>('avSoImportantes').checked = avisos.soImportantes
  $<HTMLInputElement>('avMensagens').checked = avisos.mensagens
  $<HTMLInputElement>('avLerTexto').checked = avisos.lerTexto
  $<HTMLInputElement>('avTratamento').value = avisos.tratamento
  desenharImportantes()
  try {
    const { ativo } = await Celular.avisosAtivos()
    $('avAcesso').textContent = ativo ? 'Ativo: ela ouve as ligações e mensagens' : 'Desligado'
    $('avAtivar').textContent = ativo ? 'Ajustar' : 'Ativar'
    // Sugestões com os nomes dos contatos (só se já tiver permissão)
    if ((await Celular.checkPermissions()).contatos === 'granted' && !$('avSugestoes').childElementCount) {
      const { contatos } = await Celular.contatos()
      $('avSugestoes').replaceChildren(...contatos.slice(0, 800).map((c) => Object.assign(document.createElement('option'), { value: c.nome })))
    }
  } catch { /* versão antiga do app, sem o código nativo */ }
}
const opcaoAviso = (id: string, campo: 'ligacoes' | 'soImportantes' | 'mensagens' | 'lerTexto') =>
  $(id).addEventListener('change', (e) => { if (!avisos) return; avisos[campo] = (e.target as HTMLInputElement).checked; void guardarAvisos() })
opcaoAviso('avLigacoes', 'ligacoes')
opcaoAviso('avSoImportantes', 'soImportantes')
opcaoAviso('avMensagens', 'mensagens')
opcaoAviso('avLerTexto', 'lerTexto')
$('avTratamento').addEventListener('change', (e) => { if (!avisos) return; avisos.tratamento = (e.target as HTMLInputElement).value.trim(); void guardarAvisos() })
$('avAdicionar').addEventListener('click', () => {
  const campo = $<HTMLInputElement>('avNovo')
  const nome = campo.value.trim()
  if (!avisos || !nome) return
  if (!avisos.importantes.includes(nome)) avisos.importantes.push(nome)
  campo.value = ''
  void guardarAvisos()
  desenharImportantes()
})
$('avAtivar').addEventListener('click', () => {
  avisar('Ative "FRIDAY: avisos por voz" e confirme.')
  void Celular.abrirAvisos()
})
$('avTestar').addEventListener('click', () => {
  const t = avisos?.tratamento.trim()
  void Celular.testarAviso({ texto: `${t ? `${t}, ` : ''}${avisos?.importantes[0] ?? 'a Mãe'} está te ligando.` })
})

async function mostrarMemoria(): Promise<void> {
  const fatos = await lerMemoria()
  $('memoria').replaceChildren(...(fatos.length ? fatos.slice().reverse().map((f) => {
    const li = document.createElement('li')
    const s = document.createElement('span'); s.textContent = f.texto
    const x = document.createElement('button')
    x.type = 'button'
    x.setAttribute('aria-label', `Esquecer: ${f.texto}`)
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
    x.addEventListener('click', async () => { await salvarLista('memoria', (await lerMemoria()).filter((g) => g.id !== f.id)); void mostrarMemoria(); void mostrarAjustes() })
    li.append(s, x)
    return li
  }) : [Object.assign(document.createElement('li'), { textContent: 'Nada ainda. Ela aprende conforme vocês conversam.' })]))
}
$('abrirMemoria').addEventListener('click', async () => { await mostrarMemoria(); $('folhaMemoria').hidden = false })
$('fecharMemoria').addEventListener('click', () => { $('folhaMemoria').hidden = true })
$('apagarHistorico').addEventListener('click', async () => {
  if (!confirm('Apagar todas as conversas deste celular?')) return
  await apagarTodas()
  conversa = novaConversa()
  mostrarConversa()
  avisar('Conversas apagadas.')
})

// ---------- Botão voltar do Android ----------

void App.addListener('backButton', () => {
  if (!$('folhaMemoria').hidden) { $('folhaMemoria').hidden = true; return }
  if (voz.ativo) { void voz.parar(); return }
  if (telaAtual === 'ajustes') { ir(telaAntesDosAjustes); return }
  if (telaAtual !== 'voz') { ir('voz'); return }
  if (mundo.projecao.ativa) { mundo.projecao.comando('fechar'); return }
  void App.minimizeApp()
})
// Saiu do app no meio da conversa: ela continua ouvindo (para mexer em outros apps), com a
// notificação fixa "FRIDAY está ouvindo" e o botão Encerrar; o silêncio encerra sozinho.
void App.addListener('resume', () => { if (telaAtual === 'ajustes') { void mostrarControle(); void mostrarAvisos() } })

// ---------- Assistente padrão ----------

/** Segurar o botão de ligar (ou de início) abre a FRIDAY já ouvindo. */
async function chamadaPeloAssistente(): Promise<void> {
  if (!ajustes.chave) { ir('ajustes'); return }
  if (telaAtual !== 'voz') ir('voz')
  if (!voz.ativo) await alternarConversa()
}
if (nativo()) {
  void Celular.addListener('assistente', () => void chamadaPeloAssistente())
  void Celular.addListener('encerrarVoz', () => { if (voz.ativo) void voz.parar() })
  // Ligação ou mensagem importante com a conversa aberta: aparece na tela em vez de falar por cima
  void Celular.addListener('aviso', (d) => voz.aoAcao('AVISO', d.texto, ''))
}

// ---------- Início ----------

mostrarConversa()
ir(ajustes.chave ? 'voz' : 'ajustes')
if (nativo()) void Celular.abertura().then((a) => { if (a.assistente) void chamadaPeloAssistente() }).catch(() => {})
