// Tipos compartilhados entre o processo principal (main) e o HUD (renderer).

export interface FridayConfig {
  apiKey: string
  modelo: string
  voz: string
  nome: string
  silencioSegundos: number
  /** URL do modelo de palavra de ativação, ou null se ainda não foi baixado */
  modeloAtivacaoUrl: string | null
}

/** Cartões contextuais que o HUD sabe desenhar. */
export type Card =
  | { tipo: 'sistema'; cpu: number; ram: number; ramTotalGb: number; gpu: number | null; vramUsadaGb: number | null; vramTotalGb: number | null }
  | { tipo: 'app'; acao: 'aberto' | 'fechado'; nome: string }
  | { tipo: 'volume'; nivel: number; mudo: boolean }
  | { tipo: 'midia'; acao: string }
  | { tipo: 'pesquisa'; consulta: string }
  | { tipo: 'lembrete'; texto: string; quandoIso: string; disparou?: boolean }
  | { tipo: 'aviso'; titulo: string; texto: string }

export interface ToolResult {
  ok: boolean
  /** Texto curto que volta para a IA explicar o resultado */
  mensagem: string
  /** Ação perigosa que ainda precisa de confirmação por voz */
  precisaConfirmacao?: boolean
  card?: Card
  dados?: unknown
}

export interface Lembrete {
  id: string
  texto: string
  quandoIso: string
}
