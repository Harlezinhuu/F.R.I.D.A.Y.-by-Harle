// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Elo entre o PC e o celular: tudo que passa pela rede vai lacrado com AES-256-GCM, com a chave
// tirada do segredo trocado no pareamento (QR Code ou código de 8 dígitos). Cada mensagem leva a
// hora e um número único, então uma mensagem copiada da rede não serve para ser repetida depois.
// O mesmo formato é implementado em Java no app do celular (Elo.java).

export const PORTA_ELO = 47923
const VALIDADE_MS = 120_000

const sutil = (): SubtleCrypto => globalThis.crypto.subtle

function paraBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s)
}
function deBase64(s: string): Uint8Array {
  const bin = atob(s)
  const b = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i)
  return b
}

/** Chave AES do segredo do pareamento (o mesmo cálculo do lado Java). */
export async function chaveElo(segredo: string): Promise<CryptoKey> {
  const bruta = await sutil().digest('SHA-256', new TextEncoder().encode(`friday-elo|${segredo}`))
  return sutil().importKey('raw', bruta, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Chave temporária do pareamento por código (só os dígitos contam). */
export const chaveDoCodigo = (codigo: string): Promise<CryptoKey> => chaveElo(`parear|${codigo.replace(/\D/g, '')}`)

export async function lacrar(chave: CryptoKey, dados: unknown): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const nonce = paraBase64(globalThis.crypto.getRandomValues(new Uint8Array(12)))
  const claro = new TextEncoder().encode(JSON.stringify({ t: Date.now(), n: nonce, d: dados }))
  const cifrado = new Uint8Array(await sutil().encrypt({ name: 'AES-GCM', iv }, chave, claro))
  const tudo = new Uint8Array(iv.length + cifrado.length)
  tudo.set(iv)
  tudo.set(cifrado, iv.length)
  return paraBase64(tudo)
}

/**
 * Abre um envelope. Falha se a chave não bate, se a mensagem é velha (mais de 2 minutos de diferença)
 * ou se esse número único já foi visto (repetição).
 */
export async function abrir<T = unknown>(chave: CryptoKey, envelope: string, vistos?: Map<string, number>): Promise<T> {
  const tudo = deBase64(envelope.trim())
  if (tudo.length < 12 + 16) throw new Error('envelope curto')
  const claro = await sutil().decrypt({ name: 'AES-GCM', iv: tudo.slice(0, 12) }, chave, tudo.slice(12))
  const m = JSON.parse(new TextDecoder().decode(claro)) as { t: number; n: string; d: T }
  const agora = Date.now()
  if (!Number.isFinite(m.t) || Math.abs(agora - m.t) > VALIDADE_MS) throw new Error('mensagem fora da hora')
  if (vistos) {
    for (const [n, t] of vistos) if (agora - t > VALIDADE_MS * 2) vistos.delete(n)
    if (vistos.has(m.n)) throw new Error('mensagem repetida')
    vistos.set(m.n, agora)
  }
  return m.d
}

// ---------- Pareamento ----------

export interface Pareamento {
  /** Nome do PC */
  nome: string
  porta: number
  /** Segredo do elo (base64url, 32 bytes) */
  segredo: string
  /** Endereços do PC: rede de casa e Tailscale */
  ips: string[]
  /** Placas de rede, para ligar o PC pela rede (Wake-on-LAN) */
  macs: string[]
}

const limpar = (s: string) => s.replace(/[|,\s]+/g, ' ').trim()

/** Texto do QR Code: FRIDAY1|nome|porta|segredo|ip,ip|mac,mac */
export function textoDoPareamento(p: Pareamento): string {
  return ['FRIDAY1', limpar(p.nome).replace(/ /g, '-'), String(p.porta), p.segredo, p.ips.join(','), p.macs.join(',')].join('|')
}

export function lerPareamento(texto: string): Pareamento | null {
  const partes = texto.trim().split('|')
  if (partes.length < 5 || partes[0] !== 'FRIDAY1') return null
  const porta = Number(partes[2])
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535 || partes[3].length < 20) return null
  const ips = partes[4].split(',').filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
  if (!ips.length) return null
  const macs = (partes[5] ?? '').split(',').filter((m) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(m))
  return { nome: partes[1] || 'PC', porta, segredo: partes[3], ips, macs }
}

/** Código de pareamento de 8 dígitos ("4829-1735"). */
export function novoCodigo(): string {
  const n = globalThis.crypto.getRandomValues(new Uint32Array(2))
  const d = String(n[0] % 10000).padStart(4, '0') + String(n[1] % 10000).padStart(4, '0')
  return `${d.slice(0, 4)}-${d.slice(4)}`
}

/** Segredo novo do elo (base64url). */
export function novoSegredo(): string {
  return paraBase64(globalThis.crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------- Mensagens ----------

/** O que o celular pede ao PC. */
export type PedidoElo =
  | { acao: 'ola'; aparelho: string }
  | { acao: 'ping' }
  | { acao: 'aviso'; texto: string; ligacao?: boolean }
  | { acao: 'ferramenta'; nome: string; args: Record<string, unknown> }
  | { acao: 'memoria'; fatos: unknown[]; esquecidos: string[] }
  | { acao: 'contexto'; texto: string }
  | { acao: 'contexto_pc' }
  | { acao: 'escutar' }
  /** Endereço de casa para ligar o PC de fora (Wake-on-LAN pela internet) */
  | { acao: 'casa' }
  /** O celular que fica em casa ouvindo "Friday" (central do quarto) está no ar: o PC fica só nas mãos */
  | { acao: 'central'; ativa: boolean; aparelho: string }
  | { acao: 'parear'; aparelho: string }
  /** HUD em realidade aumentada: o celular está com a câmera no monitor (true renova; false encerra) */
  | { acao: 'ar'; ligar: boolean }
  /** Versão de um design salva na oficina de hologramas do celular (.glb em base64): entra na biblioteca do PC */
  | { acao: 'design'; nome: string; glb: string }
  /** Mesa holográfica no celular: os cartões do PC, o prédio de um projeto, ou abrir um relatório no PC */
  | { acao: 'mesa'; pedido: 'cartoes' | 'predio' | 'relatorio'; projeto?: string; id?: string }
  /** Um design da biblioteca do PC (.glb em base64), para editar no celular */
  | { acao: 'design_baixar'; nome: string }

/** O que o PC manda para o celular pela escuta. */
export type EventoParaCelular =
  | { tipo: 'projetar'; args: Record<string, unknown>; nome: string }
  | { tipo: 'link'; url: string }
  | { tipo: 'texto'; texto: string }
  /** A FRIDAY do PC precisa de você e você não está no PC (ex.: pergunta da consulta) */
  | { tipo: 'aviso'; texto: string; consulta?: 'pergunta' | 'fim' }
  /** Consulta marcada no PC: entra na agenda do celular */
  | { tipo: 'evento'; titulo: string; inicioIso: string; fimIso: string; local: string; descricao: string }
