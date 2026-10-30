// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Textos da mesa holográfica: desenhados num canvas e virados textura (cartões, letreiros no tampo e
// placas que sempre olham para a câmera).

import * as THREE from 'three'
import type { CartaoMesa } from '../../../shared/mesa'

export interface EstiloTexto {
  tamanho: number
  cor: string
  fonte: string
  espacamento?: number
  contorno?: boolean
  fundo?: string
  borda?: string
  alinhar?: 'left' | 'center' | 'right'
}

const fonteCss = (e: EstiloTexto, peso = 500) => `${peso} ${e.tamanho}px "${e.fonte}", "Segoe UI", sans-serif`

function textura(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Mede e desenha linhas de texto num canvas do tamanho certo. */
function desenhar(linhas: string[], e: EstiloTexto): HTMLCanvasElement {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = fonteCss(e)
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${e.espacamento ?? 0}px`
  const pad = Math.round(e.tamanho * 0.45)
  const alturaLinha = Math.round(e.tamanho * 1.25)
  const largura = Math.ceil(Math.max(...linhas.map((l, i) => { ctx.font = fonteCss({ ...e, tamanho: i ? e.tamanho * 0.72 : e.tamanho }); return ctx.measureText(l).width }), 1)) + pad * 2
  c.width = Math.min(4096, largura)
  c.height = alturaLinha * linhas.length + pad * 2
  if (e.fundo) {
    ctx.fillStyle = e.fundo
    ctx.beginPath(); ctx.roundRect(1, 1, c.width - 2, c.height - 2, pad * 0.6); ctx.fill()
    if (e.borda) { ctx.strokeStyle = e.borda; ctx.lineWidth = 2; ctx.stroke() }
  }
  const alinhar = e.alinhar ?? 'center'
  const x = alinhar === 'left' ? pad : alinhar === 'right' ? c.width - pad : c.width / 2
  ctx.textAlign = alinhar
  ctx.textBaseline = 'middle'
  linhas.forEach((l, i) => {
    ctx.font = fonteCss({ ...e, tamanho: i ? e.tamanho * 0.72 : e.tamanho })
    if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${e.espacamento ?? 0}px`
    const y = pad + alturaLinha * (i + 0.5)
    ctx.shadowColor = e.cor
    ctx.shadowBlur = e.tamanho * 0.25
    if (e.contorno) { ctx.strokeStyle = e.cor; ctx.lineWidth = Math.max(2, e.tamanho * 0.035); ctx.strokeText(l, x, y) }
    else { ctx.fillStyle = i ? `${e.cor}` : e.cor; ctx.globalAlpha = i ? 0.75 : 1; ctx.fillText(l, x, y); ctx.globalAlpha = 1 }
  })
  return c
}

/** Texto deitado no tampo da mesa, com `largura` em unidades da cena. */
export function textoPlano(linhas: string[], e: EstiloTexto, largura: number): THREE.Mesh {
  const c = desenhar(linhas, e)
  const altura = (largura * c.height) / c.width
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(largura, altura).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: textura(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  )
  m.renderOrder = -1
  return m
}

/** Placa que sempre olha para a câmera, com `altura` em unidades da cena. */
export function painelTexto(linhas: string[], e: EstiloTexto, altura: number): THREE.Sprite {
  const c = desenhar(linhas, e)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura(c), transparent: true, depthWrite: false, depthTest: false }))
  s.scale.set((altura * c.width) / c.height, altura, 1)
  // Alinhada pela direita: a ponta da linha encosta na placa
  if (e.alinhar === 'right') s.center.set(1, 0.5)
  return s
}

const CORES_TIPO: Record<CartaoMesa['tipo'], string> = { projeto: '#5FE1F2', design: '#B7ADFF', relatorio: '#FFB547' }
const NOME_TIPO: Record<CartaoMesa['tipo'], string> = { projeto: 'PROJETO', design: 'DESIGN', relatorio: 'RELATÓRIO' }

/** Ícone desenhado do tipo: prédio (projeto), cubo (design), folha (relatório). */
function icone(ctx: CanvasRenderingContext2D, tipo: CartaoMesa['tipo'], x: number, y: number, s: number, cor: string): void {
  ctx.save()
  ctx.strokeStyle = cor
  ctx.lineWidth = 3
  ctx.shadowColor = cor
  ctx.shadowBlur = 12
  ctx.beginPath()
  if (tipo === 'projeto') {
    for (let i = 0; i < 5; i++) { const w = s * (1 - i * 0.12); ctx.rect(x - w / 2, y + s * 0.55 - (i + 1) * s * 0.2, w, s * 0.16) }
  } else if (tipo === 'design') {
    const a = s * 0.42
    ctx.moveTo(x, y - a); ctx.lineTo(x + a, y - a / 2); ctx.lineTo(x + a, y + a / 2); ctx.lineTo(x, y + a); ctx.lineTo(x - a, y + a / 2); ctx.lineTo(x - a, y - a / 2); ctx.closePath()
    ctx.moveTo(x - a, y - a / 2); ctx.lineTo(x, y); ctx.lineTo(x + a, y - a / 2); ctx.moveTo(x, y); ctx.lineTo(x, y + a)
  } else {
    ctx.rect(x - s * 0.32, y - s * 0.45, s * 0.64, s * 0.9)
    for (let i = 0; i < 4; i++) { ctx.moveTo(x - s * 0.2, y - s * 0.22 + i * s * 0.16); ctx.lineTo(x + s * 0.2, y - s * 0.22 + i * s * 0.16) }
  }
  ctx.stroke()
  ctx.restore()
}

/** O cartão: painel de vidro com o tipo, o título, a linha de baixo e a ficha. */
export function escreverCartao(c: CartaoMesa): THREE.CanvasTexture {
  const W = 680, H = 424
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const cor = CORES_TIPO[c.tipo]
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, 'rgba(10, 26, 54, .92)')
  g.addColorStop(1, 'rgba(14, 12, 40, .88)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 26); ctx.fill()
  ctx.strokeStyle = cor; ctx.lineWidth = 3; ctx.shadowColor = cor; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0
  // Faixa do tipo
  ctx.fillStyle = cor
  ctx.font = '500 22px "JetBrains Mono", monospace'
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '5px'
  ctx.fillText(NOME_TIPO[c.tipo], 36, 52)
  ctx.fillRect(36, 64, 60, 3)
  icone(ctx, c.tipo, W - 84, 74, 70, cor)
  // Título (quebra em até duas linhas)
  ctx.fillStyle = '#EAF6FF'
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '1px'
  let tam = 48
  ctx.font = `500 ${tam}px "Tektur", "Segoe UI", sans-serif`
  const palavras = c.titulo.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) { const t = atual ? `${atual} ${p}` : p; if (ctx.measureText(t).width > W - 200 && atual) { linhas.push(atual); atual = p } else atual = t }
  if (atual) linhas.push(atual)
  if (linhas.length > 2) { tam = 38; ctx.font = `500 ${tam}px "Tektur", "Segoe UI", sans-serif` }
  linhas.slice(0, 2).forEach((l, i) => ctx.fillText(i === 1 && linhas.length > 2 ? `${l}…` : l, 36, 136 + i * (tam + 8)))
  const yBase = 136 + Math.min(2, linhas.length) * (tam + 8)
  ctx.fillStyle = '#93A3C8'
  ctx.font = '400 22px "JetBrains Mono", monospace'
  ctx.fillText(c.sub.slice(0, 44), 36, yBase + 4)
  // Ficha
  ctx.strokeStyle = 'rgba(111, 184, 255, .25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(36, yBase + 30); ctx.lineTo(W - 36, yBase + 30); ctx.stroke()
  ctx.font = '400 21px "JetBrains Mono", monospace'
  c.ficha.slice(0, 4).forEach((l, i) => {
    const vermelho = /falhando/i.test(l)
    ctx.fillStyle = vermelho ? '#FF8A9A' : i === c.ficha.length - 1 && /toque duplo/i.test(l) ? cor : '#C9D6F2'
    ctx.fillText(l.slice(0, 50), 36, yBase + 66 + i * 32)
  })
  return textura(canvas)
}
