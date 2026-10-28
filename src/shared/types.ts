// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Tipos compartilhados entre o processo principal (main) e o HUD (renderer).

export interface FridayConfig {
  apiKey: string
  modelo: string
  voz: string
  nome: string
  silencioSegundos: number
  /** Silêncio (ms) que conta como fim da sua fala */
  silencioFimFalaMs: number
  /** De onde vem a voz da FRIDAY: a própria voz do Gemini ou o Fish Audio */
  vozProvedor: 'gemini' | 'fish'
  /** Camada de efeito de "voz de IA" por cima da voz */
  efeitoVoz: boolean
  /** Cidade para o clima; vazio = localização aproximada pelo IP */
  cidade: string
  /** Fotos e resumos da Wikipédia enquanto ela fala */
  cenas: boolean
  /** Saudação ao abrir (no máximo uma a cada 4 horas) */
  saudacao: boolean
  /** URL do modelo de palavra de ativação, ou null se ainda não foi baixado */
  modeloAtivacaoUrl: string | null
  /** Arquivos do reconhecimento de mãos (MediaPipe), ou null se ainda não foram baixados */
  maos: { modeloUrl: string; wasmUrl: string } | null
}

/** Cartões contextuais que o HUD sabe desenhar. */
export type Card =
  | { tipo: 'sistema'; cpu: number; ram: number; ramTotalGb: number; gpu: number | null; vramUsadaGb: number | null; vramTotalGb: number | null }
  | { tipo: 'app'; acao: 'aberto' | 'fechado'; nome: string }
  | { tipo: 'volume'; nivel: number; mudo: boolean }
  | { tipo: 'midia'; acao: string }
  | { tipo: 'pesquisa'; consulta: string }
  | { tipo: 'lembrete'; texto: string; quandoIso: string; disparou?: boolean; atrasado?: boolean; repetir?: string }
  | { tipo: 'aviso'; titulo: string; texto: string }
  | { tipo: 'clima'; cidade: string; temperatura: number; sensacao: number; descricao: string; icone: string; minima: number; maxima: number; chuva: number }
  | { tipo: 'arquivos'; titulo: string; itens: { nome: string; pasta: boolean }[]; total: number }
  | { tipo: 'print'; caminho: string; miniatura: string }
  | { tipo: 'rotina'; nome: string; passos: string }
  | { tipo: 'foco'; minutos: number }
  | { tipo: 'diagnostico'; itens: ItemDiagnostico[] }
  | { tipo: 'memoria'; titulo: string; itens: string[] }
  | { tipo: 'cena'; titulo: string; descricao: string; imagem: string | null }
  | { tipo: 'tarefa'; id: number; projeto: string; pedido: string; estado: string; detalhe: string }
  | { tipo: 'pareamento'; svg: string; codigo: string; ips: string[]; nome: string }

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
  /** 'nunca' | 'diario' | 'dias_uteis' | 'semanal' | 'mensal' */
  repetir?: string
  timer?: boolean
}

export interface TarefaResumo {
  id: number
  projeto: string
  pedido: string
  estado: string
  branch: string
  arquivos: string[]
  resumo: string
  andamento: string
  terminadaEm?: string
}

export interface ItemDiagnostico {
  nome: string
  ok: boolean
  detalhe: string
}

/** Peça simples montada pela IA para objetos que não existem prontos. */
export interface PecaPrimitiva {
  peca: string
  forma: 'caixa' | 'esfera' | 'cilindro' | 'cone' | 'toro' | 'capsula'
  posicao: [number, number, number]
  tamanho: [number, number, number]
  rotacao: [number, number, number]
}

/** Modelo 3D que o processo principal buscou (NASA, Wikimedia, PubChem, RCSB, seus arquivos ou a IA). */
export interface DadosModelo3D {
  formato: 'glb' | 'gltf' | 'stl' | 'obj' | 'sdf' | 'pdb' | 'primitivas'
  nome: string
  fonte: string
  detalhes: string[]
  credito?: string
  /** Binário em base64 (glb, stl) */
  base64?: string
  /** Texto (gltf, obj, sdf, pdb) */
  texto?: string
  primitivas?: PecaPrimitiva[]
  /** O arquivo usa o eixo Z para cima (comum em STL de impressão 3D) */
  zParaCima?: boolean
  unidade?: string
}
