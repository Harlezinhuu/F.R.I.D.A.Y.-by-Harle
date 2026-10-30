// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// App do celular, direção "Órbita": um mundo 3D só (a fita de Möbius) atrás de quatro telas:
// voz, chat, conversas e ajustes.

import { App } from '@capacitor/app'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Mundo, type Tela } from './mundo'
import { ModoVoz } from './voz'
import { responder } from './chat'
import { markdown } from './markdown'
import { executar, lerMemoria } from './ferramentas'
import { Celular, explicarErro, garantir, nativo, type Permissao } from './celular'
import { desparear, escutarPC, lerElo, parearCom, parearPorCodigo, pararEscuta, pedirPC, sincronizarCasa, sincronizarMemoria } from './elo'
import { Explicacao } from '../../src/renderer/src/explicacao/explicacao'
import { abrirAr, arAberto, fecharAr } from './ar'
import { Oficina } from './oficina'
import type { EventoParaCelular } from '../../src/shared/elo'
import { avisos as avisosConsulta, definirPerguntaDoPc, retomarConsulta } from './consulta'
import {
  apagarConversa, apagarTodas, lerAjustes, lerConversa, listarConversas, novaConversa, salvarAjustes, salvarConversa, salvarLista, tituloDe,
  type Ajustes, type Conversa, type Mensagem,
  lerAvisos, salvarAvisos, type Avisos,
  lerCentral, salvarCentral, type Central
} from './armazem'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const VERSAO = '0.7.0'
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
// ---------- Modo explicação (as palavras de partículas do PC, agora no celular) ----------

const explicacao = new Explicacao($<HTMLCanvasElement>('palco'), () => {
  const r = $('fita').getBoundingClientRect()
  return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
})
voz.explicacao = explicacao
voz.buscarImagem = async (termo) => {
  for (const idioma of ['pt', 'en']) {
    try {
      const r = await fetch(`https://${idioma}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo.replace(/ /g, '_'))}?redirect=true`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) continue
      const d = (await r.json()) as { title?: string; extract?: string; type?: string; thumbnail?: { source?: string } }
      const img = d.thumbnail?.source
      if (!d.title || d.type === 'disambiguation' || !img || !img.startsWith('https://upload.wikimedia.org/')) continue
      return { titulo: d.title, descricao: (d.extract ?? '').split(/(?<=[.!?])\s/)[0]?.slice(0, 200) ?? '', imagem: img }
    } catch { /* tenta o próximo idioma */ }
  }
  return null
}

// ---------- Olhos: a câmera no modo de voz ----------

voz.aoOlhos = (video) => {
  const previa = $('olhosPrevia')
  previa.querySelector('video')?.remove()
  previa.hidden = !video
  $('olhos').setAttribute('aria-pressed', String(!!video))
  if (video) previa.prepend(video)
}
$('olhos').addEventListener('click', async () => {
  try {
    if (voz.olhosLigados) { await voz.olhos(false); return }
    if (!voz.ativo) await alternarConversa()
    if (voz.ativo) { await voz.olhos(true); avisar('Câmera ligada: mostre e pergunte "o que é isso?".') }
  } catch {
    avisar('Não consegui abrir a câmera. Libere a permissão da câmera para a FRIDAY.')
  }
})

// ---------- Arremessar o holograma para o PC ----------

voz.aoArremessar = async (args) => {
  if (!(await lerElo())) { avisar('Pareie com o PC (Ajustes › FRIDAY do PC) para jogar hologramas na tela grande.'); return }
  mundo.projecao.comando('fechar')
  voz.aoAcao('PARA O PC', mundo.projecao.nome || 'Projeção', 'Montando na tela grande…')
  try {
    const r = await pedirPC<{ ok: boolean; mensagem: string }>({ acao: 'ferramenta', nome: 'projetar', args }, 25_000)
    voz.aoAcao('NO PC', r.ok ? 'Projeção na tela grande' : 'O PC não conseguiu', r.ok ? '' : String(r.mensagem ?? '').slice(0, 90))
  } catch (e) {
    voz.aoAcao('PC FORA DO AR', 'Não alcancei o PC', (e as Error).message.slice(0, 90))
  }
}

// ---------- O que o PC manda (holograma, link, texto) ----------

function eventoDoPc(e: EventoParaCelular): void {
  if (e.tipo === 'projetar') {
    if (telaAtual !== 'voz') ir('voz')
    const r = voz.projetar(e.args)
    voz.aoAcao(r.ok ? 'DO PC' : 'DO PC', r.ok ? e.nome || 'Projeção' : 'Não deu para projetar aqui', r.ok ? 'Arraste para cima para devolver' : r.mensagem.slice(0, 90))
  } else if (e.tipo === 'link') {
    void Celular.abrirLink({ url: e.url }).catch(() => avisar('Não consegui abrir o link.'))
  } else if (e.tipo === 'texto') {
    voz.aoAcao('DO PC', e.texto.slice(0, 80), e.texto.length > 80 ? 'Copiado' : '')
    void navigator.clipboard?.writeText(e.texto).catch(() => {})
    avisar('O PC mandou um texto (copiado).')
  } else if (e.tipo === 'aviso') {
    // A FRIDAY do PC precisa de você e você está longe dele (ex.: a consulta que ela está marcando lá)
    if (e.consulta === 'pergunta') definirPerguntaDoPc(e.texto)
    else if (e.consulta === 'fim') definirPerguntaDoPc('')
    if (e.consulta) void avisoDeConsulta(e.consulta === 'pergunta' ? 'pergunta' : 'fim', e.texto, true, 'pc_responder_consulta')
    else avisoDoPc(e.texto)
  } else if (e.tipo === 'evento') {
    // Consulta marcada no PC: entra na agenda daqui
    void (async () => {
      try {
        await garantir('agenda')
        await Celular.criarEvento({ titulo: e.titulo, inicio: new Date(e.inicioIso).getTime(), fim: new Date(e.fimIso).getTime(), local: e.local, descricao: e.descricao, diaInteiro: false })
        avisar(`"${e.titulo}" na agenda.`)
      } catch {
        avisar('O PC marcou uma consulta, mas falta a permissão da agenda para eu anotar.')
      }
    })()
  }
}

/** Aviso qualquer da FRIDAY do PC (ex.: a pesquisa profunda ficou pronta): ela fala aqui. */
function avisoDoPc(texto: string): void {
  voz.aoAcao('DO PC', texto.slice(0, 90), '')
  if (voz.dizer(`(Aviso da FRIDAY do PC. Conte isto para ele agora, em poucas frases: ${texto})`)) return
  if (nativo()) void Celular.testarAviso({ texto }).catch(() => {})
  avisar(texto.slice(0, 120))
}

// ---------- Consultas pelo WhatsApp ----------

/** A consulta precisa de você (ou terminou): ela fala, na conversa aberta ou em voz alta, e mostra o cartão. */
async function avisoDeConsulta(tipo: 'pergunta' | 'fim', texto: string, ok: boolean, ferramenta = 'responder_consulta'): Promise<void> {
  voz.aoAcao(tipo === 'pergunta' ? 'CONSULTA · SUA VEZ' : ok ? 'CONSULTA MARCADA' : 'CONSULTA', texto.slice(0, 90), tipo === 'pergunta' ? 'Responda falando' : '')
  if (voz.dizer(`(Aviso da consulta pelo WhatsApp. Fale isto para ele agora, em poucas palavras${tipo === 'pergunta' ? `, e quando ele responder chame ${ferramenta}` : ''}: ${texto})`)) return
  const tratamento = (await lerAvisos()).tratamento || 'Senhor'
  const frase = tipo === 'pergunta' ? `${tratamento}, sobre a consulta: ${texto}` : texto
  if (nativo()) void Celular.testarAviso({ texto: frase }).catch(() => {})
  avisar(texto.slice(0, 120))
  // Com o app na frente, depois de falar ela já abre a conversa para você responder
  if (tipo === 'pergunta' && document.visibilityState === 'visible' && ajustes.chave) {
    window.setTimeout(() => { if (!voz.ativo && document.visibilityState === 'visible') void alternarConversa() }, 2500 + frase.length * 65)
  }
}
avisosConsulta.aoAvisar = (tipo, texto, ok) => void avisoDeConsulta(tipo, texto, ok)
if (nativo()) escutarPC(eventoDoPc)

voz.aoProjecao = (ativa) => {
  $('proj').hidden = !ativa
  document.body.classList.toggle('projetando', ativa)
  if (ativa) {
    $('projNome').textContent = mundo.projecao.nome
    // A projeção aparece na tela de voz (pedida pelo chat também)
    if (telaAtual !== 'voz') ir('voz')
  }
}

async function alternarConversa(central = false): Promise<void> {
  if (voz.ativo) { await voz.parar(); return }
  if (!ajustes.chave) { ir('ajustes'); return }
  $('legVoce').textContent = ''
  $('legEla').textContent = ''
  conversando(true)
  try {
    await voz.iniciar({ central })
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
  if (m.imagem?.startsWith('data:image/')) { const i = document.createElement('img'); i.className = 'foto-msg'; i.src = m.imagem; i.alt = 'Foto enviada'; el.append(i) }
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

// ---------- Foto no chat ("o que é isso?") ----------

let anexo: string | null = null
async function reduzirFoto(arquivo: File): Promise<string> {
  const bmp = await createImageBitmap(arquivo)
  const escala = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala)
  c.height = Math.round(bmp.height * escala)
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.82)
}
function mostrarAnexo(): void {
  $('anexo').hidden = !anexo
  if (anexo) $<HTMLImageElement>('anexoImg').src = anexo
}
$('foto').addEventListener('click', () => $<HTMLInputElement>('arquivoFoto').click())
$('arquivoFoto').addEventListener('change', async (e) => {
  const campo = e.target as HTMLInputElement
  const f = campo.files?.[0]
  campo.value = ''
  if (!f) return
  try { anexo = await reduzirFoto(f); mostrarAnexo(); entrada.focus() } catch { avisar('Não consegui abrir essa foto.') }
})
$('tirarAnexo').addEventListener('click', () => { anexo = null; mostrarAnexo() })

async function enviar(texto: string): Promise<void> {
  texto = texto.trim()
  if (!texto && anexo) texto = 'O que é isso?'
  if (!texto || respondendo) return
  if (!ajustes.chave) { ir('ajustes'); return }
  conversa.mensagens.push({ papel: 'user', texto, hora: new Date().toISOString(), ...(anexo ? { imagem: anexo } : {}) })
  anexo = null
  mostrarAnexo()
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
  void mostrarPc()
  void mostrarCentral()
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
  avisar('Em "Apps baixados" (ou "Serviços instalados"), ative "FRIDAY: controle da tela".')
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
  $<HTMLInputElement>('avResumo').checked = avisos.resumoManha
  $<HTMLInputElement>('avCarro').checked = avisos.modoCarro
  $<HTMLInputElement>('avCarroNome').value = avisos.carroNome
  $('avCarroCampo').hidden = !avisos.modoCarro
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
const opcaoAviso = (id: string, campo: 'ligacoes' | 'soImportantes' | 'mensagens' | 'lerTexto' | 'resumoManha') =>
  $(id).addEventListener('change', (e) => { if (!avisos) return; avisos[campo] = (e.target as HTMLInputElement).checked; void guardarAvisos() })
opcaoAviso('avLigacoes', 'ligacoes')
opcaoAviso('avSoImportantes', 'soImportantes')
opcaoAviso('avMensagens', 'mensagens')
opcaoAviso('avLerTexto', 'lerTexto')
opcaoAviso('avResumo', 'resumoManha')
$('avCarro').addEventListener('change', async (e) => {
  if (!avisos) return
  avisos.modoCarro = (e.target as HTMLInputElement).checked
  $('avCarroCampo').hidden = !avisos.modoCarro
  await guardarAvisos()
  if (avisos.modoCarro) {
    // Para saber quando o celular conecta no carro, o Android pede a permissão de Bluetooth
    try { await Celular.requestPermissions({ permissions: ['bluetooth'] }) } catch { /* Android antigo não pede */ }
    void Celular.religarAvisos().catch(() => {})
  }
})
$('avCarroNome').addEventListener('change', (e) => { if (!avisos) return; avisos.carroNome = (e.target as HTMLInputElement).value.trim(); void guardarAvisos() })
$('avTestarResumo').addEventListener('click', () => { avisar('Montando o resumo…'); void Celular.resumoAgora().catch(() => avisar('Não consegui montar o resumo.')) })
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

// FRIDAY do PC: pareamento, ligar o PC, memória
async function mostrarPc(): Promise<void> {
  if (!nativo()) { $('secaoPc').hidden = true; return }
  const elo = await lerElo()
  $('pcAcoes').hidden = !elo
  $('pcParear').textContent = elo ? 'Parear de novo' : 'Parear'
  if (!elo) { $('pcEstado').textContent = 'Não pareado'; return }
  $('pcEstado').textContent = `${elo.nome} · conferindo…`
  try {
    await pedirPC({ acao: 'ping' }, 2500)
    $('pcEstado').textContent = `${elo.nome} · conectado`
  } catch {
    $('pcEstado').textContent = `${elo.nome} · fora do alcance (desligado ou em outra rede)`
  }
}
$('pcParear').addEventListener('click', () => { $('folhaParear').hidden = false })
$('fecharParear').addEventListener('click', () => { $('folhaParear').hidden = true })
async function aposParear(nome: Promise<string>): Promise<void> {
  try {
    const n = await nome
    $('folhaParear').hidden = true
    avisar(`Pareado com ${n}. Agora vocês são uma FRIDAY só.`)
    escutarPC(eventoDoPc)
  } catch (e) {
    avisar((e as Error).message)
  }
  void mostrarPc()
}
$('lerQR').addEventListener('click', async () => {
  try {
    const { texto } = await Celular.lerQR()
    await aposParear(parearCom(texto))
  } catch (e) {
    avisar((e as Error).message)
  }
})
$('parearCodigo').addEventListener('click', () => void aposParear(parearPorCodigo($<HTMLInputElement>('pcIp').value, $<HTMLInputElement>('pcCodigo').value)))
$('pcAcordar').addEventListener('click', async () => {
  // Mesmo caminho do "liga o PC" falado: rede de casa, internet e o porteiro
  avisar('Mandando o sinal…')
  const r = await executar('acordar_pc', {}, voz.contexto)
  avisar(r.mensagem)
})
// HUD do PC em realidade aumentada (a câmera dos "olhos" desliga antes: a câmera é uma só)
async function abrirHudAr(): Promise<{ ok: boolean; mensagem: string }> {
  if (voz.olhosLigados) await voz.olhos(false)
  return abrirAr({ aoFechar: () => {} })
}
voz.aoAr = abrirHudAr

// Oficina de hologramas: editar um design com a mão, na câmera de trás
let oficina: Oficina | null = null
function aOficina(): Oficina {
  oficina ??= new Oficina({
    avisar,
    vibrar: () => { if (ajustes.vibrar) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}) },
    aoFechar: () => {}
  })
  return oficina
}
async function usarOficina(a: Record<string, unknown>): Promise<{ ok: boolean; mensagem: string }> {
  const acao = String(a.acao ?? 'abrir'), design = String(a.design ?? '').trim()
  try {
    if (acao === 'fechar') { oficina?.fechar(); return { ok: true, mensagem: 'Oficina fechada.' } }
    // A câmera é uma só: os "olhos" da conversa desligam
    if (voz.olhosLigados) await voz.olhos(false)
    const o = aOficina()
    if (acao === 'abrir' || !o.aberta || design) {
      const r = await o.abrir(design)
      if (acao === 'abrir' || /^Não achei/.test(r)) return { ok: !/^Não achei/.test(r), mensagem: `${r} Diga em uma frase e lembre: apontar e segurar seleciona, pinça arrasta, mão fechada gira, tapa joga fora.` }
    }
    if (acao === 'salvar') return { ok: true, mensagem: await o.salvar(String(a.nome ?? '').trim() || `${o.nome} v2`) }
    if (acao === 'resumo') return { ok: true, mensagem: o.resumo() }
    const r = o.comando({ acao, peca: String(a.peca ?? '').trim() || undefined, cor: String(a.cor ?? '').trim() || undefined })
    return { ok: !/^(Selecione|Não achei|Cor que|Nenhum|Ação)/.test(r), mensagem: r }
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message }
  }
}
voz.aoOficina = usarOficina
$('abrirOficina').addEventListener('click', async () => {
  const r = await usarOficina({ acao: 'abrir' })
  if (!r.ok) avisar(r.mensagem)
})
$('pcAr').addEventListener('click', async () => {
  const r = await abrirHudAr()
  if (!r.ok) avisar(r.mensagem)
})
$('pcSincronizar').addEventListener('click', async () => {
  const n = await sincronizarMemoria()
  avisar(n === null ? 'O PC não respondeu.' : `Memória sincronizada: ${n} coisas.`)
  void mostrarAjustes()
})
$('pcDesparear').addEventListener('click', async () => {
  if (!confirm('Desparear deste PC? Para voltar, é só parear de novo.')) return
  await desparear()
  pararEscuta()
  void mostrarPc()
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

// ---------- Central do quarto ----------

let central: Central | null = null

async function mostrarCentral(): Promise<void> {
  const secao = $('secaoCentral')
  if (!nativo()) { secao.hidden = true; return }
  secao.hidden = false
  central = await lerCentral()
  $<HTMLInputElement>('ceLigada').checked = central.ligada
  $<HTMLInputElement>('cePorteiro').checked = central.porteiro
  $<HTMLSelectElement>('ceSensibilidade').value = central.sensibilidade
  try {
    const e = await Celular.centralEstado()
    const quieta = e.silenciadaAte > Date.now()
    $('ceEstado').textContent = !e.rodando ? (central.ligada ? 'Ligada, mas parada: toque de novo para religar' : 'Desligada')
      : quieta ? `Quieta até ${new Date(e.silenciadaAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : e.estado === 'ouvindo' ? 'Ouvindo "Friday"' : e.estado === 'pausada' ? 'Conversando' : e.estado
    $('ceModelo').textContent = e.modelo ? 'Pronto' : 'Não baixado (40 MB, uma vez só)'
    $('ceBaixar').hidden = e.modelo
    $('ceSobre').textContent = e.sobreposicao ? 'Permitido' : 'Para ela aparecer sozinha quando você chamar'
    $('ceSobreBtn').hidden = e.sobreposicao
    $('ceBateria').textContent = e.bateriaLivre ? 'Liberada' : 'Para o Android não fechar a central'
    $('ceBateriaBtn').hidden = e.bateriaLivre
    $('ceRegistro').replaceChildren(...(e.registro.length ? e.registro : ['Nada ainda.']).slice().reverse().map((t) => Object.assign(document.createElement('li'), { textContent: t })))
  } catch { /* app antigo sem o código nativo */ }
}

async function baixarOuvido(): Promise<boolean> {
  const botao = $<HTMLButtonElement>('ceBaixar')
  botao.disabled = true
  const ouvinte = await Celular.addListener('centralProgresso', (d) => { $('ceModelo').textContent = d.pct >= 0 ? `Baixando… ${d.pct}%` : 'Baixando…' })
  try {
    await Celular.centralBaixarModelo()
    return true
  } catch (e) {
    avisar(explicarErro(e))
    return false
  } finally {
    void ouvinte.remove()
    botao.disabled = false
    void mostrarCentral()
  }
}

async function guardarCentral(): Promise<void> {
  if (central) await salvarCentral(central)
}

$('ceLigada').addEventListener('change', async (e) => {
  const caixa = e.target as HTMLInputElement
  if (!central) return
  if (!caixa.checked) {
    central.ligada = false
    await guardarCentral()
    await Celular.centralLigar({ ligar: false }).catch(() => {})
    setTimeout(() => void mostrarCentral(), 600)
    return
  }
  try {
    await garantir('microfone')
    if (!(await Celular.centralEstado()).modelo && !(await baixarOuvido())) { caixa.checked = false; return }
    central.ligada = true
    await guardarCentral()
    await Celular.centralLigar({ ligar: true })
    avisar('Central ligada: diga "Friday".')
    if (!(await lerElo())) avisar('Pareie este celular com o PC para ela mandar no PC e ser o porteiro.')
  } catch (erro) {
    caixa.checked = false
    central.ligada = false
    await guardarCentral()
    avisar(explicarErro(erro))
  }
  setTimeout(() => void mostrarCentral(), 800)
})
$('ceBaixar').addEventListener('click', () => void baixarOuvido())
$('ceSobreBtn').addEventListener('click', () => void Celular.abrirSobreposicao().catch(() => {}))
$('ceBateriaBtn').addEventListener('click', () => void Celular.abrirBateria().catch(() => {}))
$('cePorteiro').addEventListener('change', (e) => { if (!central) return; central.porteiro = (e.target as HTMLInputElement).checked; void guardarCentral() })
$('ceSensibilidade').addEventListener('change', (e) => { if (!central) return; central.sensibilidade = (e.target as HTMLSelectElement).value as Central['sensibilidade']; void guardarCentral() })
$('ceRegistro').parentElement?.addEventListener('toggle', () => void mostrarCentral())

// ---------- Botão voltar do Android ----------

void App.addListener('backButton', () => {
  if (arAberto()) { fecharAr(); return }
  if (oficina?.aberta) { oficina.fechar(); return }
  if (!$('folhaMemoria').hidden) { $('folhaMemoria').hidden = true; return }
  if (!$('folhaParear').hidden) { $('folhaParear').hidden = true; return }
  if (voz.ativo) { void voz.parar(); return }
  if (telaAtual === 'ajustes') { ir(telaAntesDosAjustes); return }
  if (telaAtual !== 'voz') { ir('voz'); return }
  if (mundo.projecao.ativa) { mundo.projecao.comando('fechar'); return }
  void App.minimizeApp()
})
// Saiu do app no meio da conversa: ela continua ouvindo (para mexer em outros apps), com a
// notificação fixa "FRIDAY está ouvindo" e o botão Encerrar; o silêncio encerra sozinho.
void App.addListener('resume', () => {
  if (telaAtual === 'ajustes') { void mostrarControle(); void mostrarAvisos(); void mostrarPc(); void mostrarCentral() }
  if (nativo()) escutarPC(eventoDoPc)
})
// Fora do app, a escuta do PC para (a não ser no meio de uma conversa por voz)
void App.addListener('pause', () => { if (!voz.ativo) pararEscuta() })

// ---------- Assistente padrão ----------

/** Segurar o botão de ligar (ou de início) abre a FRIDAY já ouvindo. */
async function chamadaPeloAssistente(central = false): Promise<void> {
  if (!ajustes.chave) { ir('ajustes'); return }
  if (telaAtual !== 'voz') ir('voz')
  if (!voz.ativo) await alternarConversa(central)
}
if (nativo()) {
  // Botão de assistente, ou a central do quarto ouviu "Friday"
  void Celular.addListener('assistente', (d) => void chamadaPeloAssistente(d?.central === true))
  void Celular.addListener('encerrarVoz', () => { if (voz.ativo) void voz.parar() })
  // Ligação ou mensagem importante com a conversa aberta: aparece na tela em vez de falar por cima
  void Celular.addListener('aviso', (d) => voz.aoAcao('AVISO', d.texto, ''))
  void Celular.addListener('carro', (d) => avisar(d.ativo ? 'Modo carro ligado.' : 'Modo carro desligado.'))
}

// ---------- Início ----------

mostrarConversa()
ir(ajustes.chave ? 'voz' : 'ajustes')
if (nativo()) void Celular.abertura().then((a) => { if (a.assistente) void chamadaPeloAssistente(a.central === true) }).catch(() => {})
// A memória do celular e a do PC se juntam toda vez que o app abre (e ele pega o endereço de casa)
void sincronizarMemoria()
void sincronizarCasa()
// Central do quarto: se ela devia estar ligada e não está (o Android fechou), religa
if (nativo()) {
  void lerCentral().then(async (c) => {
    if (c.ligada && !(await Celular.centralEstado()).rodando) await Celular.centralLigar({ ligar: true })
  }).catch(() => {})
}
// Uma consulta pela metade (o app fechou no meio) continua de onde parou
if (nativo()) void retomarConsulta().catch(() => {})
