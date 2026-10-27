// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Chat por texto (com fotos), como no ChatGPT: a resposta chega aos pedaços e a FRIDAY
// pode usar as mesmas ferramentas da voz (lembretes, clima, memória...).

import { GoogleGenAI } from '@google/genai'
import type { Mensagem } from './armazem'
import { FERRAMENTAS_CELULAR, executar, instrucoes, memoriaParaPrompt, type Contexto } from './ferramentas'

const MODELO = 'gemini-2.5-flash'
const HISTORICO = 40

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conteudo = { role: 'user' | 'model'; parts: any[] }

function paraConteudo(m: Mensagem): Conteudo {
  const parts: unknown[] = []
  if (m.imagem?.startsWith('data:image/')) {
    const [cab, dados] = m.imagem.split(',')
    parts.push({ inlineData: { mimeType: cab.slice(5, cab.indexOf(';')), data: dados } })
  }
  if (m.texto) parts.push({ text: m.texto })
  return { role: m.papel, parts }
}

/**
 * Manda a conversa e vai devolvendo o texto da resposta por `aoTexto`.
 * Se a FRIDAY chamar ferramentas, elas rodam e a resposta continua.
 */
export async function responder(chave: string, nome: string, historico: Mensagem[], ctx: Contexto, aoTexto: (parcial: string) => void, sinal?: AbortSignal): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: chave })
  const memoria = await memoriaParaPrompt()
  const contents: Conteudo[] = historico.slice(-HISTORICO).map(paraConteudo).filter((c) => c.parts.length)
  let texto = ''
  for (let rodada = 0; rodada < 5; rodada++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fluxo: AsyncIterable<any> = await ai.models.generateContentStream({
      model: MODELO,
      contents,
      config: {
        systemInstruction: instrucoes(nome, memoria, 'Aqui é o chat por texto: pode usar markdown (listas, negrito, blocos de código) quando ajudar. Respostas completas, mas sem enrolar.'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ functionDeclarations: FERRAMENTAS_CELULAR as any }],
        abortSignal: sinal
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chamadas: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partesModelo: any[] = []
    for await (const pedaco of fluxo) {
      if (sinal?.aborted) return texto
      const t = pedaco.text
      if (t) { texto += t; aoTexto(texto) }
      for (const p of pedaco.candidates?.[0]?.content?.parts ?? []) {
        partesModelo.push(p)
        if (p.functionCall) chamadas.push(p.functionCall)
      }
    }
    if (!chamadas.length) return texto
    // Roda as ferramentas e devolve o resultado para a FRIDAY continuar a resposta
    contents.push({ role: 'model', parts: partesModelo })
    const respostas = []
    for (const c of chamadas) {
      const r = await executar(c.name, c.args ?? {}, ctx)
      respostas.push({ functionResponse: { name: c.name, response: { ok: r.ok, resultado: r.mensagem } } })
    }
    contents.push({ role: 'user', parts: respostas })
    if (texto && !texto.endsWith('\n')) { texto += '\n\n'; aoTexto(texto) }
  }
  return texto
}
