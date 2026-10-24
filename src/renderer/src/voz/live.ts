// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Conexão de voz em tempo real com o Gemini Live: áudio entra, áudio sai, e a IA chama ferramentas.

import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'
import { TOOL_DECLARATIONS, systemPrompt } from '../../../shared/tools'
import type { FridayConfig } from '../../../shared/types'

export interface ChamadaFerramenta {
  id?: string
  name?: string
  args?: Record<string, unknown>
}

export interface EventosLive {
  aoAudio(b64: string): void
  aoTextoUsuario(texto: string): void
  aoTextoFriday(texto: string): void
  aoInterrompido(): void
  aoFimDoTurno(): void
  aoFerramentas(chamadas: ChamadaFerramenta[]): void
  aoAvisoDeFim(): void
  aoFechar(inesperado: boolean, motivo: string): void
}

export class SessaoLive {
  private ai: GoogleGenAI
  private sessao: Session | null = null
  private geracao = 0
  /** Ajustes de rapidez (fim de fala mais cedo, pouco raciocínio). Desligam sozinhos se o modelo recusar. */
  private usarAjustesRapidos = true
  aberta = false

  constructor(private cfg: FridayConfig, private ev: EventosLive) {
    this.ai = new GoogleGenAI({ apiKey: cfg.apiKey })
  }

  async conectar(memoria = ''): Promise<void> {
    const minha = ++this.geracao
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt(this.cfg.nome, new Date(), memoria),
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.cfg.voz } } },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} }
    }
    if (this.usarAjustesRapidos) {
      // Fim da fala detectado mais cedo: responde mais rápido quando você para de falar
      config.realtimeInputConfig = {
        automaticActivityDetection: { endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH', silenceDurationMs: this.cfg.silencioFimFalaMs }
      }
      // Pensar antes de responder atrasa a voz; nos modelos 2.5 o raciocínio é desligado (os 3.x já vêm no mínimo)
      if (/gemini-2\.5/.test(this.cfg.modelo)) config.thinkingConfig = { thinkingBudget: 0 }
    }
    const abertaEm = performance.now()
    const sessao = await this.ai.live.connect({
      model: this.cfg.modelo,
      config,
      callbacks: {
        onmessage: (m: LiveServerMessage) => { if (minha === this.geracao) this.mensagem(m) },
        onerror: (e: ErrorEvent) => console.error('[live] erro', e.message),
        onclose: (e: CloseEvent) => {
          // Fechamentos de conexões antigas (já substituídas) são ignorados
          if (minha !== this.geracao) return
          // Recusou a configuração logo de cara: tenta de novo sem ela
          if (this.usarAjustesRapidos && performance.now() - abertaEm < 5000 && /think|config|invalid|unknown|1007/i.test(`${e.reason} ${e.code}`)) {
            console.warn('[live] modelo recusou os ajustes de rapidez; seguindo sem eles:', e.reason || e.code)
            this.usarAjustesRapidos = false
          }
          const inesperado = true
          this.aberta = false
          this.sessao = null
          this.ev.aoFechar(inesperado, e.reason || `código ${e.code}`)
        }
      }
    })
    if (minha !== this.geracao) { sessao.close(); throw new Error('Conexão substituída.') }
    this.sessao = sessao
    this.aberta = true
  }

  private mensagem(m: LiveServerMessage): void {
    const sc = m.serverContent
    if (sc?.interrupted) this.ev.aoInterrompido()
    if (sc?.inputTranscription?.text) this.ev.aoTextoUsuario(sc.inputTranscription.text)
    if (sc?.outputTranscription?.text) this.ev.aoTextoFriday(sc.outputTranscription.text)
    for (const parte of sc?.modelTurn?.parts ?? []) {
      if (parte.inlineData?.data) this.ev.aoAudio(parte.inlineData.data)
    }
    if (sc?.turnComplete) this.ev.aoFimDoTurno()
    if (m.toolCall?.functionCalls?.length) this.ev.aoFerramentas(m.toolCall.functionCalls as ChamadaFerramenta[])
    if (m.goAway) this.ev.aoAvisoDeFim()
  }

  enviarAudio(b64: string): void {
    if (!this.aberta || !this.sessao) return
    this.sessao.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } })
  }

  responderFerramentas(respostas: { id?: string; name?: string; response: Record<string, unknown> }[]): void {
    if (!this.aberta || !this.sessao) return
    this.sessao.sendToolResponse({ functionResponses: respostas })
  }

  fechar(): void {
    this.geracao++
    this.aberta = false
    try { this.sessao?.close() } catch { /* já fechada */ }
    this.sessao = null
  }
}
