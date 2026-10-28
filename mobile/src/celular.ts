// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ponte com o código nativo da FRIDAY no Android (android-extra/java/.../CelularPlugin.java).

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { App, Contato, Tela } from './celular-logica'

export type Permissao = 'contatos' | 'telefone' | 'sms' | 'agenda' | 'bluetooth' | 'microfone'
type Estado = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

export interface MensagemRecente { app: string; remetente: string; grupo: string; texto: string; quando: number; responder: boolean }

export interface EstadoCentral {
  rodando: boolean
  estado: string
  /** O modelo da palavra "Friday" já foi baixado */
  modelo: boolean
  sobreposicao: boolean
  bateriaLivre: boolean
  silenciadaAte: number
  registro: string[]
}

export interface Evento { titulo: string; inicio: number; fim: number; diaInteiro: boolean; local: string }

interface CelularPlugin {
  checkPermissions(): Promise<Record<Permissao, Estado>>
  requestPermissions(o?: { permissions: Permissao[] }): Promise<Record<Permissao, Estado>>
  addListener(evento: 'assistente', cb: (d: { central?: boolean }) => void): Promise<PluginListenerHandle>
  addListener(evento: 'encerrarVoz', cb: () => void): Promise<PluginListenerHandle>
  addListener(evento: 'centralProgresso', cb: (d: { pct: number }) => void): Promise<PluginListenerHandle>
  addListener(evento: 'aviso', cb: (d: { texto: string }) => void): Promise<PluginListenerHandle>
  addListener(evento: 'carro', cb: (d: { ativo: boolean }) => void): Promise<PluginListenerHandle>

  eloPedir(o: { dados: Record<string, unknown>; limite?: number }): Promise<{ resposta: Record<string, unknown> }>
  eloParearCodigo(o: { ip: string; porta: number; codigo: string }): Promise<{ pareamento: string }>
  nomeDoAparelho(): Promise<{ nome: string }>
  lerQR(): Promise<{ texto: string }>
  acordarPC(o?: { casa?: string; porta?: number }): Promise<{ enviados: number }>
  mensagensRecentes(o: { soImportantes?: boolean }): Promise<{ mensagens: MensagemRecente[]; ativo: boolean }>
  responderMensagem(o: { remetente: string; texto: string }): Promise<{ para: string }>
  /** Agente de consultas: acompanha esta conversa do WhatsApp (nome vazio = para) */
  vigiarConversa(o: { nome: string }): Promise<void>
  resumoAgora(): Promise<void>
  resumoTexto(): Promise<{ texto: string }>
  modoCarro(): Promise<{ ativo: boolean }>
  religarAvisos(): Promise<void>

  avisosAtivos(): Promise<{ ativo: boolean }>
  abrirAvisos(): Promise<void>
  testarAviso(o: { texto: string }): Promise<void>

  abertura(): Promise<{ assistente: boolean; central?: boolean }>

  centralEstado(): Promise<EstadoCentral>
  centralLigar(o: { ligar: boolean }): Promise<void>
  centralBaixarModelo(): Promise<void>
  /** Solta o microfone da central; devolve o que foi dito logo depois do "Friday" (PCM 16 kHz, base64) */
  centralSoltar(): Promise<{ audio: string }>
  centralRetomar(o: { bloquear: boolean }): Promise<void>
  centralSilenciar(o: { minutos: number }): Promise<{ ate: number; rodando: boolean }>
  abrirSobreposicao(): Promise<void>
  abrirBateria(): Promise<void>
  porteiroAcordar(): Promise<{ porteiro: string; jaLigado: boolean }>
  ehAssistentePadrao(): Promise<{ ativo: boolean }>
  definirAssistente(): Promise<void>
  servicoVoz(o: { ligar: boolean }): Promise<void>

  apps(): Promise<{ apps: App[] }>
  abrirApp(o: { pacote: string }): Promise<void>
  lanterna(o: { ligar: boolean }): Promise<void>
  volume(o: { fluxo: string; nivel?: number; acao?: string }): Promise<{ nivel: number }>
  midia(o: { acao: string }): Promise<void>
  alarme(o: { hora: number; minuto: number; rotulo: string; dias: number[] }): Promise<void>
  bateria(): Promise<{ nivel: number; carregando: boolean }>
  ajuste(o: { qual: string }): Promise<void>
  brilho(o: { nivel: number }): Promise<void>
  naoPerturbe(o: { ligar: boolean }): Promise<void>
  rota(o: { destino: string; modo: string }): Promise<void>
  abrirLink(o: { url: string }): Promise<void>
  infoDoApp(): Promise<void>

  contatos(): Promise<{ contatos: Contato[] }>
  salvarContato(o: { nome: string; numero: string }): Promise<void>
  ligar(o: { numero: string }): Promise<void>
  sms(o: { numero: string; texto: string }): Promise<void>
  whatsapp(o: { numero: string; texto: string; enviar: boolean }): Promise<{ enviado: boolean }>
  criarEvento(o: { titulo: string; inicio: number; fim: number; local: string; descricao: string; diaInteiro: boolean }): Promise<{ id: number }>
  eventos(o: { de: number; ate: number }): Promise<{ eventos: Evento[] }>

  acessibilidade(): Promise<{ ativa: boolean }>
  abrirAcessibilidade(): Promise<void>
  lerTela(): Promise<Tela>
  tocar(o: { indice?: number; texto?: string }): Promise<{ rotulo: string }>
  escrever(o: { indice?: number; texto: string }): Promise<void>
  rolar(o: { direcao: string }): Promise<void>
  botao(o: { acao: string }): Promise<void>
}

export const Celular = registerPlugin<CelularPlugin>('FridayCelular')

/** Só dá para mexer no celular dentro do app Android (no navegador do PC, não). */
export const nativo = (): boolean => Capacitor.isNativePlatform()

const NOMES: Record<Permissao, string> = { contatos: 'contatos', telefone: 'ligações', sms: 'SMS', agenda: 'agenda', bluetooth: 'Bluetooth', microfone: 'microfone' }

/** Pede a permissão se ainda não tiver; falha com uma frase clara se ele negar. */
export async function garantir(p: Permissao): Promise<void> {
  const atual = await Celular.checkPermissions()
  if (atual[p] === 'granted') return
  const r = await Celular.requestPermissions({ permissions: [p] })
  if (r[p] !== 'granted') throw new Error(`Sem a permissão de ${NOMES[p]} eu não consigo. Libere em Ajustes > Controle do celular.`)
}

/** Erros do nativo viram frases para a FRIDAY falar. */
export function explicarErro(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (m.startsWith('PERMISSAO: ')) {
    const qual = m.slice(11)
    return qual in NOMES ? `Falta a permissão de ${NOMES[qual as Permissao]}.` : qual
  }
  if (m.startsWith('ACESSIBILIDADE: ')) return m.slice(16)
  if (m.startsWith('PROTEGIDO: ')) return m.slice(11)
  return m
}
