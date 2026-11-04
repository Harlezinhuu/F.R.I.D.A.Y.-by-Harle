// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Regras de autonomia: o que ela faz sozinha, o que pergunta (e faz a versão segura se você não
// responder a tempo) e o que sempre espera você. Dinheiro e assinatura nunca andam sem o "pode".

export type Nivel = 'livre' | 'regras' | 'pergunta' | 'sempre'

/** Cada tipo de ação e o nível dela. */
export const NIVEIS = {
  anotar: 'livre',
  analisar_loja: 'livre',
  montar_previa: 'livre',
  gerar_documento: 'livre',
  cobrar_material: 'livre',
  lembrar_proposta: 'livre',
  pedir_depoimento: 'livre',
  fechar_preco: 'regras',
  pedir_indicacao: 'pergunta',
  mandar_relatorio: 'pergunta',
  mensagem_prospect: 'sempre',
  cobrar_pagamento: 'sempre',
  aprovar_cobranca: 'sempre',
  assinar: 'sempre',
  apagar: 'sempre'
} as const satisfies Record<string, Nivel>

export type TipoDeAcao = keyof typeof NIVEIS

export interface Pendencia {
  id: string
  acao: TipoDeAcao
  /** O que ela quer fazer, numa frase */
  texto: string
  cliente?: string
  /** Mensagem pronta (quando a ação é mandar algo) */
  mensagem?: string
  /** Para "pergunta": o que ela faz sozinha se você não responder até `prazo` */
  planoSeguro?: string
  criadaEm: string
  /** Até quando espera (ISO); vazio = espera sempre */
  prazo: string
  estado: 'aguardando' | 'aprovada' | 'recusada' | 'plano_seguro'
  resolvidaEm?: string
}

/** Quanto ela espera antes de seguir com o plano seguro. */
export const ESPERA_PADRAO_H = 24

export function novaPendencia(acao: TipoDeAcao, texto: string, agora = new Date(), extra: Partial<Pendencia> = {}): Pendencia {
  const nivel = NIVEIS[acao]
  const espera = nivel === 'pergunta' ? ESPERA_PADRAO_H * 3600_000 : 0
  return {
    id: `${acao}-${agora.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    acao, texto, criadaEm: agora.toISOString(), prazo: espera ? new Date(agora.getTime() + espera).toISOString() : '', estado: 'aguardando', ...extra
  }
}

/** Ela pode fazer isso agora, sem perguntar? */
export const podeSozinha = (acao: TipoDeAcao): boolean => NIVEIS[acao] === 'livre'

/**
 * As pendências que venceram e têm plano seguro: viram "plano_seguro" (ela segue com a versão
 * segura). Ações de nível "sempre" nunca vencem: o silêncio nunca vira "sim".
 */
export function vencidas(ps: Pendencia[], agora = new Date()): Pendencia[] {
  return ps.filter((p) => p.estado === 'aguardando' && NIVEIS[p.acao] === 'pergunta' && p.prazo && Date.parse(p.prazo) <= agora.getTime() && !!p.planoSeguro)
}

/** Acha a pendência pelo que ele falou ("aprova a cobrança da padaria", "a primeira"). */
export function acharPendencia(ps: Pendencia[], alvo: string): Pendencia | null {
  const abertas = ps.filter((p) => p.estado === 'aguardando')
  if (!abertas.length) return null
  const t = alvo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const n = Number(t.replace(/\D/g, ''))
  if (/^(a )?(primeira|1)$/.test(t) || !t) return abertas[0]
  if (Number.isInteger(n) && n >= 1 && n <= abertas.length && /^\D*\d+\D*$/.test(t) && t.length < 6) return abertas[n - 1]
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const palavras = t.split(/\s+/).filter((p) => p.length > 2)
  let melhor: Pendencia | null = null, nota = 0
  for (const p of abertas) {
    const alvoP = norm(`${p.texto} ${p.cliente ?? ''} ${p.acao.replace('_', ' ')}`)
    // Compara pelo começo da palavra ("cobrança" acha "cobrar")
    const s = palavras.filter((w) => alvoP.includes(w.slice(0, Math.max(4, w.length - 3)))).length
    if (s > nota) { nota = s; melhor = p }
  }
  return melhor
}

/** Resumo falado das pendências abertas. */
export function resumoDasPendencias(ps: Pendencia[]): string {
  const abertas = ps.filter((p) => p.estado === 'aguardando')
  if (!abertas.length) return 'Nada esperando por você.'
  return `${abertas.length} ${abertas.length === 1 ? 'coisa esperando' : 'coisas esperando'} por você: ${abertas.slice(0, 6).map((p, i) => `${i + 1}) ${p.texto}${NIVEIS[p.acao] === 'pergunta' && p.planoSeguro ? ` (se você não responder, ${p.planoSeguro.toLowerCase()})` : ''}`).join('; ')}.`
}
