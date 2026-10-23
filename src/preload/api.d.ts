import type { FridayConfig, Lembrete, ToolResult } from '../shared/types'

/** O que o HUD consegue pedir ao processo principal. */
export interface FridayApi {
  config(): Promise<FridayConfig>
  ferramenta(nome: string, args: Record<string, unknown>): Promise<ToolResult>
  avisarSilencio(valor: boolean): void
  aoSilenciar(cb: (silenciada: boolean) => void): void
  aoLembrete(cb: (l: Lembrete) => void): void
}

declare global {
  interface Window {
    friday: FridayApi
  }
}
