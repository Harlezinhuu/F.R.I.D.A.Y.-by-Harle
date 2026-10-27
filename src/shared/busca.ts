// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Busca na internet com o Google (pelo próprio Gemini): notícias, resultados de jogos, preços,
// horários, lançamentos, qualquer coisa atual. Devolve a resposta curta e de onde ela veio.
// Usada pela FRIDAY do PC e do celular (mesma chave do Gemini, sem custo extra de serviço).

import { GoogleGenAI } from '@google/genai'

export interface ResultadoBusca { texto: string; fontes: { titulo: string; url: string }[] }

const MODELO = 'gemini-2.5-flash'

export async function buscarNaInternet(chave: string, pergunta: string): Promise<ResultadoBusca> {
  if (!chave) throw new Error('Falta a chave do Gemini.')
  const p = pergunta.trim()
  if (!p) throw new Error('Faltou dizer o que buscar.')
  const ai = new GoogleGenAI({ apiKey: chave })
  const hoje = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await ai.models.generateContent({
    model: MODELO,
    contents: p,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: `Pesquise na internet e responda em português do Brasil, curto e factual (no máximo 6 frases), com números, nomes e datas exatos. Se as fontes discordarem, diga. Agora é ${hoje} (horário de Brasília).`
    }
  })
  const texto: string = (typeof r.text === 'function' ? r.text() : r.text) ?? ''
  const pedacos: { web?: { uri?: string; title?: string } }[] = r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const vistos = new Set<string>()
  const fontes = pedacos.flatMap((c) => {
    const titulo = c.web?.title ?? '', url = c.web?.uri ?? ''
    if (!url || vistos.has(titulo)) return []
    vistos.add(titulo)
    return [{ titulo, url }]
  }).slice(0, 4)
  if (!texto.trim()) throw new Error('A busca não trouxe resposta.')
  return { texto: texto.trim(), fontes }
}

/** Texto para a FRIDAY: a resposta e os sites de onde veio (para ela citar em poucas palavras). */
export const paraFala = (r: ResultadoBusca): string =>
  `${r.texto}${r.fontes.length ? ` (Fontes: ${r.fontes.map((f) => f.titulo).join(', ')}.)` : ''}`
