// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O "cérebro" do agente de consultas: cada decisão é um pedido curto ao Gemini (mesma chave da FRIDAY).

import { GoogleGenAI } from '@google/genai'
import type { Decisor } from './consulta'

export function criarDecisor(chave: string, modelo = 'gemini-2.5-flash'): Decisor {
  if (!chave) throw new Error('Falta a chave do Gemini.')
  const ai = new GoogleGenAI({ apiKey: chave })
  return async (sistema, conversa) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await ai.models.generateContent({
      model: modelo,
      contents: conversa,
      config: { systemInstruction: sistema, responseMimeType: 'application/json', temperature: 0.2 }
    })
    const t: string = (typeof r.text === 'function' ? r.text() : r.text) ?? ''
    if (!t.trim()) throw new Error('o Gemini não respondeu')
    return t
  }
}
