// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// HUD em realidade aumentada: aponte a câmera para o monitor e os dados do PC aparecem flutuando em
// volta dele, em perspectiva, presos à tela. O PC mostra quatro marcas nos cantos enquanto o celular
// olha; daqui a gente acha as marcas em cada quadro e "cola" os painéis no plano do monitor.
// Tudo fica no celular: a imagem da câmera não sai daqui.

import { pedirPC } from './elo'
import { acharMarcas, binarizar, escolherCantos, homografia, matrix3d, paraCinza, paraTela, suavizar, type Ponto } from './ar-logica'
import type { DadosAr, RespostaAr } from '../../src/shared/ar'

/** Quantos px do painel valem uma altura da tela do PC (os painéis são desenhados nessa escala). */
const PX = 1000
const LARGURA_PROCESSADA = 720

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/**
 * Onde fica cada painel, no plano da tela do PC (altura da tela = 1; largura = aspecto).
 * Celular deitado: painéis dos lados do monitor. Em pé: em cima e embaixo, que é onde sobra espaço.
 */
const LAYOUT = (a: number, emPe: boolean): Record<string, [number, number, number, number]> => emPe
  ? {
      agora: [0, -0.78, a, -0.31],
      topo: [0, -0.25, a, -0.05],
      sistema: [0, 1.06, a * 0.48, 1.68],
      hoje: [a * 0.52, 1.06, a, 1.68]
    }
  : {
      topo: [0, -0.25, a, -0.05],
      sistema: [-0.68, 0, -0.06, 0.6],
      hoje: [a + 0.06, 0, a + 0.68, 0.5],
      agora: [a + 0.06, 0.56, a + 0.68, 1.14]
    }

function barra(rotulo: string, pct: number | null, extra = ''): string {
  if (pct === null) return ''
  const v = Math.max(0, Math.min(100, Math.round(pct)))
  const quente = v >= 85 ? ' quente' : ''
  return `<div class="ar-barra${quente}"><span>${rotulo}</span><b>${v}%</b><i style="--v:${v}%"></i>${extra ? `<small>${esc(extra)}</small>` : ''}</div>`
}

function conteudo(d: DadosAr): Record<string, string> {
  const s = d.sistema
  const itensAgora: string[] = []
  if (d.tarefa) itensAgora.push(`<li><span>PROGRAMAÇÃO · ${esc(d.tarefa.estado.toUpperCase())}</span>${esc(d.tarefa.projeto)}<small>${esc(d.tarefa.andamento)}</small></li>`)
  for (const p of d.pesquisas) itensAgora.push(`<li><span>PESQUISA</span>${esc(p.titulo)}<small>${esc(p.etapa)}</small></li>`)
  if (d.consulta) itensAgora.push(`<li><span>CONSULTA</span>${esc(d.consulta)}</li>`)
  if (d.rede?.desconhecidos.length) itensAgora.push(`<li class="alerta"><span>WI-FI · DESCONHECIDO</span>${esc(d.rede.desconhecidos.join(', '))}</li>`)
  return {
    topo: `<b class="ar-hora">${esc(d.hora)}</b><div class="ar-pc"><span>${esc(d.pc)}</span><small>ligado há ${esc(d.ligadoHa)}${d.programa ? ` · na frente: ${esc(d.programa)}` : ''}${d.rede ? ` · ${d.rede.ligados} no Wi-Fi` : ''}</small></div>`,
    sistema: `<h3>SISTEMA</h3>${s ? barra('CPU', s.cpu) + barra('RAM', s.ram, `de ${s.ramTotalGb} GB`) + barra('GPU', s.gpu) + barra('VRAM', s.vramUsadaGb !== null && s.vramTotalGb ? (s.vramUsadaGb / s.vramTotalGb) * 100 : null, s.vramTotalGb ? `${s.vramUsadaGb} de ${s.vramTotalGb} GB` : '') : '<p>Sem leitura agora.</p>'}`,
    hoje: `<h3>HOJE</h3>${d.lembretes.length ? `<ul>${d.lembretes.map((l) => `<li><span>${esc(l.hora)}</span>${esc(l.texto)}</li>`).join('')}</ul>` : '<p>Nada marcado para o resto do dia.</p>'}`,
    agora: `<h3>EM ANDAMENTO</h3>${itensAgora.length ? `<ul>${itensAgora.join('')}</ul>` : '<p>Nada rodando em segundo plano.</p>'}`
  }
}

export interface OpcoesAr { aoFechar(): void }

let aberto: (() => void) | null = null
export const arAberto = (): boolean => !!aberto

/** Abre o HUD em realidade aumentada. Devolve uma frase do resultado (para a voz). */
export async function abrirAr(o: OpcoesAr): Promise<{ ok: boolean; mensagem: string }> {
  if (aberto) return { ok: true, mensagem: 'O HUD em realidade aumentada já está aberto.' }

  // Primeiro o PC: sem ele não tem marca para achar
  let resposta: RespostaAr
  try {
    resposta = await pedirPC<RespostaAr>({ acao: 'ar', ligar: true }, 6000)
  } catch (e) {
    return { ok: false, mensagem: `O PC não respondeu (${(e as Error).message}). Ele precisa estar ligado, com a FRIDAY aberta.` }
  }
  let camera: MediaStream
  try {
    camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
  } catch {
    void pedirPC({ acao: 'ar', ligar: false }, 3000).catch(() => {})
    return { ok: false, mensagem: 'Preciso da câmera para ver o monitor. Libere a câmera para a FRIDAY nas permissões do Android.' }
  }

  const raiz = document.createElement('section')
  raiz.className = 'ar'
  raiz.setAttribute('aria-label', 'HUD do PC em realidade aumentada')
  raiz.innerHTML = `<video playsinline muted></video><div class="ar-camada"></div>
    <div class="ar-mira" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <p class="ar-dica" aria-live="polite">Aponte a câmera para a tela do PC</p>
    <button type="button" class="vidro icone ar-fechar" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`
  document.body.appendChild(raiz)
  const video = raiz.querySelector('video')!
  const camada = raiz.querySelector<HTMLElement>('.ar-camada')!
  const dica = raiz.querySelector<HTMLElement>('.ar-dica')!
  video.srcObject = camera
  await video.play().catch(() => {})

  const paineis: Record<string, HTMLElement> = {}
  const layout = () => LAYOUT(resposta.aspecto, raiz.clientHeight > raiz.clientWidth)
  const montar = () => {
    const html = conteudo(resposta.dados)
    for (const [nome, [x0, y0, x1, y1]] of Object.entries(layout())) {
      let el = paineis[nome]
      if (!el) {
        el = document.createElement('div')
        el.className = `ar-painel ar-${nome}`
        camada.appendChild(el)
        paineis[nome] = el
      }
      // O tamanho muda quando o celular vira (em pé, os painéis ficam em cima e embaixo)
      el.style.width = `${Math.round((x1 - x0) * PX)}px`
      el.style.height = `${Math.round((y1 - y0) * PX)}px`
      el.innerHTML = html[nome]
    }
  }
  montar()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  let cantos: Ponto[] | null = null
  let ultimaVista = 0
  let vivo = true
  let relogio = 0
  let pedido = 0

  const posicionar = () => {
    const a = resposta.aspecto
    const de = resposta.marcas.map(([u, v]) => ({ x: u * a, y: v }))
    const H = cantos ? homografia(de, cantos) : null
    const lay = layout()
    for (const [nome, el] of Object.entries(paineis)) {
      const [x0, y0, x1, y1] = lay[nome]
      const t = H ? matrix3d(H, (x1 - x0) * PX, (y1 - y0) * PX, x0, y0, x1, y1) : null
      if (t) { el.style.transform = t; el.classList.add('visivel') } else el.classList.remove('visivel')
    }
  }

  const quadro = () => {
    if (!vivo) return
    if (video.videoWidth) {
      const k = Math.min(1, LARGURA_PROCESSADA / video.videoWidth)
      const w = Math.round(video.videoWidth * k), h = Math.round(video.videoHeight * k)
      if (canvas.width !== w) { canvas.width = w; canvas.height = h }
      ctx.drawImage(video, 0, 0, w, h)
      const img = ctx.getImageData(0, 0, w, h)
      const achou = escolherCantos(acharMarcas(binarizar(paraCinza(img.data, w, h), w, h), w, h))
      const tela = { w: raiz.clientWidth, h: raiz.clientHeight }
      if (achou) {
        const pts = achou.cantos.map((p) => paraTela(p, k, { w: video.videoWidth, h: video.videoHeight }, tela))
        cantos = suavizar(cantos, pts)
        ultimaVista = performance.now()
        raiz.classList.add('preso')
        posicionar()
      } else if (performance.now() - ultimaVista > 900) {
        cantos = null
        raiz.classList.remove('preso')
        posicionar()
      }
    }
    relogio = window.setTimeout(quadro, 70)
  }
  quadro()

  // Dados novos a cada 2 s (e isso mantém as marcas acesas no PC)
  const atualizar = async () => {
    try {
      resposta = await pedirPC<RespostaAr>({ acao: 'ar', ligar: true }, 5000)
      montar()
      if (!raiz.classList.contains('preso')) dica.textContent = 'Aponte a câmera para a tela do PC'
    } catch {
      dica.textContent = 'O PC parou de responder. Confira se ele está ligado e na mesma rede.'
    }
  }
  pedido = window.setInterval(() => void atualizar(), 2000)

  const fechar = () => {
    if (!vivo) return
    vivo = false
    aberto = null
    clearTimeout(relogio)
    clearInterval(pedido)
    camera.getTracks().forEach((t) => t.stop())
    document.removeEventListener('visibilitychange', aoSumir)
    window.removeEventListener('resize', aoGirar)
    raiz.remove()
    void pedirPC({ acao: 'ar', ligar: false }, 3000).catch(() => {})
    o.aoFechar()
  }
  // App em segundo plano: desliga a câmera e as marcas
  const aoSumir = () => { if (document.hidden) fechar() }
  const aoGirar = () => { montar(); posicionar() }
  window.addEventListener('resize', aoGirar)
  document.addEventListener('visibilitychange', aoSumir)
  raiz.querySelector('.ar-fechar')!.addEventListener('click', fechar)
  aberto = fechar
  return { ok: true, mensagem: 'HUD do PC aberto na câmera. Peça para ele apontar o celular para o monitor; as marcas aparecem nos cantos da tela do PC.' }
}

export function fecharAr(): void { aberto?.() }
