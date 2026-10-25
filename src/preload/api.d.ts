// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import type { FridayConfig, Lembrete, TarefaResumo, ToolResult } from '../shared/types'

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
}

declare global {
  interface Window {
    friday: FridayApi
  }
}
