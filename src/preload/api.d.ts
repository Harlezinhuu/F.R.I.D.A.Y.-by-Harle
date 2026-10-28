// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import type { Card, FridayConfig, Lembrete, TarefaResumo, ToolResult } from '../shared/types'

/** O que o HUD consegue pedir ao processo principal. */
export interface FridayApi {
  config(): Promise<FridayConfig>
  /** Grava uma linha no friday.log */
  log(nivel: string, texto: string): void
  ferramenta(nome: string, args: Record<string, unknown>): Promise<ToolResult>
  avisarSilencio(valor: boolean): void
  aoSilenciar(cb: (silenciada: boolean) => void): void
  aoLembrete(cb: (l: Lembrete, atrasado: boolean) => void): void
  aoTarefa(cb: (t: TarefaResumo) => void): void
  /** Aviso que chega depois que uma ação em segundo plano termina */
  aoAviso(cb: (texto: string, ok: boolean) => void): void
  /** Fala uma frase pelo Fish Audio; resolve quando todo o áudio foi recebido */
  fishFalar(id: number, texto: string): Promise<{ ok: boolean; erro?: string }>
  fishCancelar(): void
  aoFishAudio(cb: (id: number, b64: string, taxa: number) => void): void
  /** Cartão mandado pelo processo principal (pareamento, ação pedida pelo celular) */
  aoCartao(cb: (card: Card, ms: number) => void): void
  /** Ligação ou mensagem que chegou no celular, para o PC falar */
  aoEloAviso(cb: (texto: string, ligacao: boolean) => void): void
  /** Ferramenta do HUD pedida pelo celular */
  aoEloFerramenta(cb: (id: number, nome: string, args: Record<string, unknown>) => void): void
  eloResponder(id: number, r: { ok: boolean; mensagem: string; precisaConfirmacao?: boolean }): void
  /** Uma troca da conversa, para o celular continuar dali */
  contexto(texto: string): void
  /** O agente de consultas pelo WhatsApp precisa de você (pergunta), terminou, ou pede o QR */
  aoConsulta(cb: (e: { tipo: 'pergunta' | 'fim' | 'qr'; texto: string; ok?: boolean }) => void): void
  /** A central do quarto (o celular em casa ouvindo "Friday") entrou ou saiu do ar */
  aoCentral(cb: (ativa: boolean, aparelho: string) => void): void
}

declare global {
  interface Window {
    friday: FridayApi
  }
}
