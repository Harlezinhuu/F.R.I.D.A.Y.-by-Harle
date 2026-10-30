// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Cérebro reserva (sem internet), a parte que não depende do Windows:
// - números falados ("vinte e cinco") viram dígitos, porque o reconhecedor offline escreve por extenso;
// - regras para os pedidos do dia a dia, para quando nem a IA local (Ollama) estiver instalada;
// - as ferramentas no formato que o Ollama entende.

import type { ToolDeclaration } from '../../shared/tools'

// ---------- Números por extenso ----------

const UNIDADES: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, meia: 30 }
const DEZENAS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 }
const CENTENAS: Record<string, number> = { cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500 }

const semAcento = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "volume em vinte e cinco" → "volume em 25"; "meia" só vira 30 depois de uma hora ("três e meia"). */
export function numerosPorExtenso(texto: string): string {
  const palavras = semAcento(texto.toLowerCase()).split(/\s+/).filter(Boolean)
  const saida: string[] = []
  let i = 0
  while (i < palavras.length) {
    let valor = -1, j = i
    const ler = (p: string | undefined): number | null => {
      if (p === undefined) return null
      if (p in CENTENAS) return CENTENAS[p]
      if (p in DEZENAS) return DEZENAS[p]
      if (p in UNIDADES && p !== 'meia' && p !== 'um' && p !== 'uma') return UNIDADES[p]
      return null
    }
    const primeiro = ler(palavras[j]) ?? ((palavras[j] === 'um' || palavras[j] === 'uma') && /^(minuto|segundo|hora|lembrete|timer)/.test(palavras[j + 1] ?? '') ? 1 : null)
    if (primeiro !== null) {
      valor = primeiro
      j++
      // "vinte e cinco", "cento e vinte e três"
      while (palavras[j] === 'e' && j + 1 < palavras.length) {
        const prox = ler(palavras[j + 1]) ?? (palavras[j + 1] === 'um' || palavras[j + 1] === 'uma' ? 1 : palavras[j + 1] === 'meia' && valor <= 23 ? -30 : null)
        if (prox === null) break
        if (prox === -30) { saida.push(`${valor}:30`); valor = -2; j += 2; break }
        if (prox >= valor) break
        valor += prox
        j += 2
      }
      if (valor >= 0) saida.push(String(valor))
      i = j
      continue
    }
    saida.push(palavras[i])
    i++
  }
  return saida.join(' ')
}

// ---------- Regras (sem IA) ----------

export type Entendido =
  | { tipo: 'ferramenta'; nome: string; args: Record<string, unknown> }
  | { tipo: 'fala'; texto: string }
  | { tipo: 'encerrar'; texto: string }
  | { tipo: 'confirmar' }
  | { tipo: 'negar' }

const fmtHora = (d: Date): string => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Data e hora de "às 15", "às 15:30", "amanhã às 8" (no horário local). */
export function quandoFalado(texto: string, agora: Date): Date | null {
  const m = texto.match(/\b(?:as|a)\s+(\d{1,2})(?::(\d{2})|\s*h(?:oras?)?(?:\s*e)?\s*(\d{1,2})?|\s+e\s+(\d{1,2}))?/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? m[3] ?? m[4] ?? 0)
  if (h > 23 || min > 59) return null
  if (/\b(da tarde|da noite)\b/.test(texto) && h < 12) h += 12
  const d = new Date(agora)
  d.setSeconds(0, 0)
  d.setHours(h, min)
  if (/\bamanha\b/.test(texto)) d.setDate(d.getDate() + 1)
  else if (d.getTime() <= agora.getTime()) d.setDate(d.getDate() + 1)
  return d
}

/** Entende o pedido sem IA. `agora` entra para os testes. */
export function entender(falado: string, agora = new Date()): Entendido {
  const t = numerosPorExtenso(falado).replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return { tipo: 'fala', texto: '' }
  if (/^(sim|pode|pode sim|confirmo|confirma|isso|claro|manda)\b/.test(t)) return { tipo: 'confirmar' }
  if (/^(nao|cancela|deixa|esquece)\b/.test(t)) return { tipo: 'negar' }
  if (/^(tchau|pode descansar|e so isso|obrigad[oa]|valeu|ate mais|boa noite)\b/.test(t)) return { tipo: 'encerrar', texto: 'Até mais.' }

  if (/\bque horas\b|\bhoras sao\b/.test(t)) return { tipo: 'fala', texto: `São ${fmtHora(agora)}.` }
  if (/\bque dia\b|\bdata de hoje\b|\bdia e hoje\b/.test(t)) return { tipo: 'fala', texto: `Hoje é ${agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}.` }

  // Volume
  const vol = t.match(/\bvolume\b.*?\b(\d{1,3})\b/)
  if (vol) return { tipo: 'ferramenta', nome: 'volume', args: { acao: 'definir', valor: Math.min(100, Number(vol[1])) } }
  if (/\b(aumenta|sobe|aumentar|subir)\b.*\b(volume|som)\b|\bmais alto\b/.test(t)) return { tipo: 'ferramenta', nome: 'volume', args: { acao: 'aumentar', valor: 10 } }
  if (/\b(diminui|abaixa|baixa|diminuir|abaixar)\b.*\b(volume|som)\b|\bmais baixo\b/.test(t)) return { tipo: 'ferramenta', nome: 'volume', args: { acao: 'diminuir', valor: 10 } }
  if (/\b(tira|tirar) o mudo\b|\bdesmuta\b/.test(t)) return { tipo: 'ferramenta', nome: 'volume', args: { acao: 'tirar_mudo' } }
  if (/\b(muta|mudo|silencia o som)\b/.test(t)) return { tipo: 'ferramenta', nome: 'volume', args: { acao: 'mudo' } }

  // Música
  if (/\b(proxima|pula)\b/.test(t)) return { tipo: 'ferramenta', nome: 'midia', args: { acao: 'proxima' } }
  if (/\b(anterior|volta a musica)\b/.test(t)) return { tipo: 'ferramenta', nome: 'midia', args: { acao: 'anterior' } }
  if (/\b(pausa|pause|para a musica|continua a musica|despausa|toca a musica|play)\b/.test(t)) return { tipo: 'ferramenta', nome: 'midia', args: { acao: 'tocar_pausar' } }

  // Timer e lembretes
  const timer = t.match(/\b(?:timer|temporizador|cronometro)\b.*?\b(\d+)\s*(minutos?|segundos?|horas?)/) ?? t.match(/\bdaqui a (\d+)\s*(minutos?|segundos?|horas?)/)
  if (timer) {
    const n = Number(timer[1]), unidade = timer[2]
    const sobre = t.match(/\b(?:para|pro|pra|de) (o |a )?([a-z ]{3,30})$/)?.[2]?.trim()
    const args: Record<string, unknown> = unidade.startsWith('seg') ? { segundos: n } : { minutos: unidade.startsWith('hora') ? n * 60 : n }
    if (/\blembr/.test(t)) {
      const texto = t.replace(/.*\blembr[ae]\s*(me\s*)?(de|que)?\s*/, '').replace(/\s*daqui a .*$/, '').trim()
      if (texto) args.texto = texto
    } else if (sobre && !/^\d/.test(sobre)) args.texto = sobre
    return { tipo: 'ferramenta', nome: 'criar_timer', args }
  }
  const lembrete = t.match(/\blembr[ae]\s*(?:me\s*)?(?:de|que)?\s*(.+)/)
  if (lembrete) {
    const quando = quandoFalado(lembrete[1], agora)
    const texto = lembrete[1].replace(/\b(amanha\s*)?(as|a)\s+\d{1,2}(:\d{2})?(\s*h(oras?)?)?(\s*(e\s*)?\d{1,2})?(\s*da (tarde|noite|manha))?/, '').replace(/\bamanha\b/, '').replace(/\s+/g, ' ').trim()
    if (!quando) return { tipo: 'fala', texto: 'A que horas? Diga, por exemplo, "me lembra de ligar para a mãe às 15".' }
    return { tipo: 'ferramenta', nome: 'criar_lembrete', args: { texto: texto || 'Lembrete', quando_iso: quando.toISOString() } }
  }
  if (/\b(quais|meus|tem) lembretes\b|\blista os lembretes\b/.test(t)) return { tipo: 'ferramenta', nome: 'listar_lembretes', args: {} }

  // PC
  if (/\bbloqueia\b.*\b(pc|computador|tela)\b|\bbloquear o (pc|computador)\b/.test(t)) return { tipo: 'ferramenta', nome: 'energia_pc', args: { acao: 'bloquear' } }
  if (/\b(desliga|desligar)\b.*\b(pc|computador)\b/.test(t)) return { tipo: 'ferramenta', nome: 'energia_pc', args: { acao: 'desligar' } }
  if (/\b(como (esta|ta)|status)\b.*\b(pc|computador|sistema)\b|\buso de (cpu|memoria|processador)\b/.test(t)) return { tipo: 'ferramenta', nome: 'status_sistema', args: {} }
  if (/\b(print|captura|tira um print)\b/.test(t)) return { tipo: 'ferramenta', nome: 'capturar_tela', args: {} }

  // Seus arquivos (segundo cérebro funciona sem internet)
  const procura = t.match(/\b(?:procura|acha|encontra|onde (?:esta|ta|fica))\s+(?:o |a |os |as |aquele |aquela )?(.+?)(?:\s+nos meus arquivos)?$/)
  if (procura) return { tipo: 'ferramenta', nome: 'buscar_nos_meus_arquivos', args: { pergunta: procura[1] } }

  // Programas
  const abre = t.match(/^(?:abre|abra|abrir|inicia|liga o|liga a)\s+(?:o |a )?(.+)$/)
  if (abre) return { tipo: 'ferramenta', nome: 'abrir_app', args: { nome: abre[1] } }
  const fecha = t.match(/^(?:fecha|feche|fechar)\s+(?:o |a )?(.+)$/)
  if (fecha) return { tipo: 'ferramenta', nome: 'fechar_app', args: { nome: fecha[1] } }

  return { tipo: 'fala', texto: 'Sem internet eu faço o básico: abrir e fechar programas, volume, música, lembretes, timers, status do PC e procurar nos seus arquivos.' }
}

// ---------- Ferramentas para o Ollama ----------

/** O que dá para fazer sem internet (tudo roda no próprio PC). */
export const FERRAMENTAS_RESERVA = [
  'abrir_app', 'fechar_app', 'listar_apps', 'volume', 'midia', 'status_sistema', 'criar_lembrete', 'criar_timer', 'listar_lembretes', 'cancelar_lembrete',
  'listar_arquivos', 'abrir_arquivo', 'buscar_nos_meus_arquivos', 'abrir_achado', 'capturar_tela', 'energia_pc', 'memorizar', 'o_que_sabe', 'listar_rotinas'
]

type Esquema = Record<string, unknown>
function minusculo(e: unknown): unknown {
  if (Array.isArray(e)) return e.map(minusculo)
  if (!e || typeof e !== 'object') return e
  const o: Esquema = {}
  for (const [k, v] of Object.entries(e as Esquema)) o[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : minusculo(v)
  return o
}

/** As ferramentas da FRIDAY no formato do Ollama (o mesmo da OpenAI). */
export function ferramentasOllama(declaracoes: ToolDeclaration[]): { type: 'function'; function: { name: string; description: string; parameters: unknown } }[] {
  return declaracoes.filter((d) => FERRAMENTAS_RESERVA.includes(d.name)).map((d) => ({
    type: 'function',
    function: { name: d.name, description: d.description, parameters: d.parameters ? minusculo(d.parameters) : { type: 'object', properties: {} } }
  }))
}

export function instrucoesReserva(nome: string, agora: Date): string {
  return [
    `Você é F.R.I.D.A.Y, a assistente de ${nome || 'o usuário'}, no MODO RESERVA: o PC está sem internet e você roda no próprio PC.`,
    'Fale em português do Brasil, curto (uma ou duas frases), sem markdown nem emoji: o texto vira voz.',
    'Use as ferramentas para agir no PC. Clima, notícias, pesquisa na internet e WhatsApp não funcionam agora: diga isso em uma frase.',
    'Fechar programas e desligar o PC pedem confirmação: pergunte e só chame com confirmado=true depois do "sim".',
    `Agora é ${agora.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}.`
  ].join('\n')
}
