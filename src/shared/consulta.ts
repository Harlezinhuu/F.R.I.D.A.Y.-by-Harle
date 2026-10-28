// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Agente de consultas pelo WhatsApp: a FRIDAY conversa com o robô (ou a atendente) do plano de
// saúde ou da clínica para marcar o que você pediu, e para tudo para te perguntar antes de escolher
// horário, confirmar ou passar um dado que você não liberou.
//
// Este arquivo é o "cérebro", igual no PC e no celular. As "mãos" (abrir a conversa, ler, enviar,
// tocar em botões) mudam: no PC é o WhatsApp Web dentro da FRIDAY; no celular, o próprio WhatsApp.
// As travas de segurança são código, não só instrução: valem mesmo se o modelo errar.

export interface Lugar {
  /** Como você chama ("São Cristóvão", "Clínica do Dr. Paulo") */
  nome: string
  /** Número do WhatsApp com DDI e DDD, só dígitos (5511...) */
  whatsapp: string
  /** Dados que ela pode informar se pedirem ("carteirinha 123; nome completo Ahmad Mourad") */
  dados: string
}

export type Quem = 'eles' | 'eu' | 'dono'
export interface Linha { quem: Quem; texto: string; quando: number; botoes?: string[] }

/** Mensagem que chegou na conversa, como as mãos leram. `id` é estável entre leituras. */
export interface Recebida { id: string; texto: string; quando: number; botoes?: string[] }
/** O que as mãos veem na conversa agora. `janela` = lista de opções aberta na tela (só no PC). */
export interface Leitura { mensagens: Recebida[]; janela?: string }

export type Situacao = 'conversando' | 'esperando_voce' | 'pronto' | 'falhou' | 'cancelado'
export interface EventoAgenda { titulo: string; inicioIso: string; fimIso: string; local: string }

export interface EstadoConsulta {
  id: string
  dono: string
  pedido: string
  preferencias: string
  observacoes: string
  lugar: Lugar
  situacao: Situacao
  historico: Linha[]
  vistos: string[]
  pergunta: { texto: string; opcoes: string[] } | null
  /** Resumo final (marcado) ou o motivo (falhou) */
  resumo: string
  evento: EventoAgenda | null
  enviadas: number
  /** A primeira mensagem já foi enviada */
  aberta: boolean
  criadaEm: number
  atualizadaEm: number
}

export interface Maos {
  /** Abre a conversa com o lugar (sem enviar nada). */
  abrir(lugar: Lugar): Promise<void>
  ler(): Promise<Leitura>
  enviar(texto: string): Promise<void>
  tocar(rotulo: string): Promise<void>
  /** Terminou: solta o que estiver segurando (janela, vigia de notificações). */
  fechar(): void
  /** Limites desta ponta, para o modelo saber (ex.: no celular os botões não aparecem). */
  limites?: string
}

/** Recebe as instruções e a conversa; devolve o JSON da decisão (texto). */
export type Decisor = (sistema: string, conversa: string) => Promise<string>

export type Decisao =
  | { acao: 'enviar'; texto: string; escolhaDoDono: string }
  | { acao: 'tocar'; botao: string; escolhaDoDono: string }
  | { acao: 'perguntar'; texto: string; opcoes: string[] }
  | { acao: 'esperar' }
  | { acao: 'pronto'; texto: string; evento: EventoAgenda | null }
  | { acao: 'desistir'; texto: string }

export const LIMITE_ENVIOS = 40
const MAX_HISTORICO = 90

// ---------- Texto ----------

export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}:/\s-]/gu, ' ').replace(/\s+/g, ' ').trim()

const curto = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/** Número de WhatsApp só com dígitos, com o 55 do Brasil quando faltar. */
export function numeroWhats(entrada: string): string {
  let d = entrada.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d
}

const RE_DATA = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g
const RE_HORA = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)(?!\d)/gi

/** Quantos horários e datas diferentes aparecem no texto (dois ou mais = uma lista para escolher). */
export function contarHorarios(texto: string): number {
  const achados = new Set([...(texto.match(RE_DATA) ?? []), ...(texto.match(RE_HORA) ?? []).map((h) => h.toLowerCase())])
  return achados.size
}

/** Sequências de 6 dígitos ou mais (CPF, carteirinha, telefone), ignorando datas e horas. */
export function numerosSensiveis(texto: string): string[] {
  const sem = texto.replace(RE_DATA, ' ').replace(RE_HORA, ' ')
  return (sem.match(/\d(?:[\d.\-/ ]*\d)?/g) ?? []).map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 6)
}

/** Parece número de cartão (13 a 19 dígitos seguidos, com ou sem espaços). */
export const pareceCartao = (texto: string): boolean => numerosSensiveis(texto).some((n) => n.length >= 13 && n.length <= 19) || /\bcvv\b|\bcodigo de seguranca\b/.test(normalizar(texto))

const PEDE_CONFIRMACAO = /confirm|deseja (agendar|marcar|prosseguir)|(posso|podemos) (agendar|marcar|confirmar|reservar)|reserv|esta correto|(digite|responda) sim/
const AFIRMATIVO = /^(sim|s|ok|okay|confirmo|confirmar|confirmado|confirma|pode|isso|certo|correto|claro|perfeito|1)\b/

// ---------- Decisão ----------

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Lê o JSON que o modelo devolveu. Formato estranho vira erro (o agente tenta de novo). */
export function lerDecisao(bruto: string): Decisao {
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const inicio = limpo.indexOf('{'), fim = limpo.lastIndexOf('}')
  if (inicio < 0 || fim < inicio) throw new Error('decisão sem JSON')
  const o = JSON.parse(limpo.slice(inicio, fim + 1)) as Record<string, unknown>
  const acao = texto(o.acao)
  const escolhaDoDono = texto(o.escolha_do_dono)
  switch (acao) {
    case 'enviar': return { acao, texto: texto(o.texto).replace(/\s*\n+\s*/g, ' ').slice(0, 600), escolhaDoDono }
    case 'tocar': return { acao, botao: texto(o.botao) || texto(o.texto), escolhaDoDono }
    case 'perguntar': return { acao, texto: texto(o.texto) || 'Preciso de uma decisão sua para continuar.', opcoes: (Array.isArray(o.opcoes) ? o.opcoes : []).map(texto).filter(Boolean).slice(0, 4) }
    case 'esperar': return { acao }
    case 'pronto': {
      const e = (o.evento ?? {}) as Record<string, unknown>
      const ini = new Date(texto(e.inicio_iso))
      let evento: EventoAgenda | null = null
      if (!Number.isNaN(ini.getTime())) {
        const f = new Date(texto(e.fim_iso))
        evento = {
          titulo: texto(e.titulo) || 'Consulta',
          inicioIso: texto(e.inicio_iso),
          fimIso: Number.isNaN(f.getTime()) || f <= ini ? '' : texto(e.fim_iso),
          local: texto(e.local)
        }
      }
      return { acao, texto: texto(o.texto) || 'Marcado.', evento }
    }
    case 'desistir': return { acao, texto: texto(o.texto) || 'Não consegui marcar por aqui.' }
    default: throw new Error(`ação desconhecida: ${acao || '(vazia)'}`)
  }
}

const perguntar = (t: string, opcoes: string[] = []): Decisao => ({ acao: 'perguntar', texto: t, opcoes })

/**
 * As travas: o que o modelo decidiu passa por aqui antes de virar mensagem.
 * Escolher horário, confirmar ou mandar um número que você não liberou vira uma pergunta para você.
 */
export function proteger(d: Decisao, e: EstadoConsulta): Decisao {
  if (d.acao !== 'enviar' && d.acao !== 'tocar') return d
  const saida = d.acao === 'enviar' ? d.texto : d.botao
  if (!saida.trim()) return { acao: 'esperar' }
  if (e.enviadas >= LIMITE_ENVIOS) return { acao: 'desistir', texto: 'A conversa ficou longa demais sem chegar num horário. Melhor você seguir por lá.' }

  if (pareceCartao(saida)) return perguntar('Eles pediram dados de pagamento. Essa parte é com você. Quer que eu pare por aqui?', ['Parar', 'Continuar sem pagar'])

  const h = e.historico
  let iUltimaDeles = -1
  for (let i = h.length - 1; i >= 0; i--) if (h[i].quem === 'eles') { iUltimaDeles = i; break }
  const ultimaDeles = iUltimaDeles >= 0 ? h[iUltimaDeles] : null
  const falasDoDono = h.filter((l) => l.quem === 'dono').map((l) => l.texto)
  const donoDepois = h.slice(iUltimaDeles + 1).some((l) => l.quem === 'dono')

  // Números: só os que você liberou, disse ou que eles mesmos mandaram
  const liberados = [e.lugar.dados, e.pedido, e.preferencias, e.observacoes, ...falasDoDono, ...h.filter((l) => l.quem === 'eles').map((l) => l.texto)]
    .flatMap(numerosSensiveis)
  const naoLiberado = numerosSensiveis(saida).find((n) => !liberados.includes(n))
  if (naoLiberado) return perguntar(`Eles pediram um dado que você não me passou. Posso mandar "${curto(saida, 80)}"?`, ['Pode mandar', 'Não'])

  // Escolha só com a palavra do dono (as falas dele, não as preferências do começo)
  const n = normalizar(d.escolhaDoDono)
  const escolhaValida = n.length > 0 && falasDoDono.some((f) => { const x = normalizar(f); return x.includes(n) || n.includes(x) })

  if (ultimaDeles) {
    const pedeConfirmacao = PEDE_CONFIRMACAO.test(normalizar(ultimaDeles.texto))
    if (pedeConfirmacao && AFIRMATIVO.test(normalizar(saida)) && !(escolhaValida || donoDepois)) {
      return perguntar(`Eles pediram para confirmar: ${curto(ultimaDeles.texto, 220)} Confirmo?`, ['Confirma', 'Não'])
    }
    const ehEscolha = d.acao === 'tocar' || /^\s*\d{1,2}\s*[).-]?\s*$/.test(saida) || contarHorarios(saida) > 0 ||
      (ultimaDeles.botoes ?? []).some((b) => normalizar(b) === normalizar(saida))
    if (contarHorarios(ultimaDeles.texto) >= 2 && ehEscolha && !(escolhaValida || donoDepois)) {
      return perguntar(`Eles ofereceram: ${curto(ultimaDeles.texto, 260)} Qual você prefere?`)
    }
  }

  // Mandando a mesma coisa sem parar: travou num menu
  const minhas = h.filter((l) => l.quem === 'eu').slice(-2).map((l) => normalizar(l.texto))
  if (minhas.length === 2 && minhas.every((m) => m === normalizar(d.acao === 'tocar' ? `▸ ${saida}` : saida))) {
    return perguntar('Travei: eles não aceitam a minha resposta. Quer tentar você pelo WhatsApp ou que eu peça um atendente?', ['Peça um atendente', 'Eu continuo'])
  }
  return d
}

// ---------- Prompt ----------

export function instrucoesAgente(e: EstadoConsulta, limites = ''): string {
  const dono = e.dono || 'o dono'
  return [
    `Você é a FRIDAY, assistente pessoal de ${dono}, conversando pelo WhatsApp com "${e.lugar.nome}" para marcar o que ele pediu. Do outro lado pode estar um robô de atendimento (com menus) ou uma pessoa.`,
    'Decida o PRÓXIMO passo e responda só com um objeto JSON.',
    'Ações:',
    '- enviar: manda "texto" no WhatsApp. Curto, educado, em português, como um paciente escreveria. Em menus numerados, responda só com o número ou o texto exato da opção.',
    '- tocar: toca no botão "botao" (texto exato) de uma mensagem com botões ou de uma lista aberta na tela.',
    `- perguntar: para tudo e pergunta a ${dono}. "texto" é falado em voz alta: até 2 frases, direto, com as opções resumidas; "opcoes" com até 4 escolhas curtas.`,
    '- esperar: eles ainda vão mandar algo (pediram para aguardar, estão transferindo, mandaram só parte da resposta).',
    '- pronto: ELES confirmaram o agendamento. "texto" é o resumo falado (o quê, com quem, dia, hora, onde) e "evento" traz os dados para a agenda.',
    '- desistir: não dá para marcar por aqui ("texto" é o motivo, curto).',
    'Regras:',
    `1. Antes de escolher dia, horário, médico ou unidade, e antes de confirmar um agendamento, pergunte a ${dono}. A exceção é quando uma fala DONO já escolhe exatamente essa opção: aí preencha "escolha_do_dono" copiando as palavras dele.`,
    `2. Só informe dados pessoais que estão em "Dados liberados" ou que ${dono} disse numa fala DONO. Qualquer outro (CPF, data de nascimento, endereço, e-mail, foto de documento): pergunte.`,
    '3. Nunca passe dados de cartão ou banco, não aceite cobranças e não faça pagamentos.',
    `4. Se perguntarem se você é uma pessoa, ou quem está falando, diga a verdade: é a assistente virtual de ${dono}, marcando por ele.`,
    '5. Não invente nada. Se não entender o menu, mande "menu"; se o robô não ajudar depois de algumas tentativas, peça "atendente".',
    '6. Nunca cancele nem remarque nada que não foi pedido.',
    '7. Sem nenhuma mensagem ainda na conversa, comece com um "Olá" curto dizendo o que quer marcar.',
    `8. Se ${dono} mandar parar ou disser que continua sozinho, use desistir.`,
    ...(limites ? [`Sobre esta conversa: ${limites}`] : []),
    'Formato: {"acao": "enviar|tocar|perguntar|esperar|pronto|desistir", "texto": "", "botao": "", "opcoes": [], "escolha_do_dono": "", "evento": {"titulo": "", "inicio_iso": "AAAA-MM-DDTHH:MM:00", "fim_iso": "", "local": ""}}'
  ].join('\n')
}

const hora = (t: number): string => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function montarConversa(e: EstadoConsulta, agora: number, janela = ''): string {
  const linhas = e.historico.map((l) => {
    const quem = l.quem === 'eu' ? 'VOCÊ' : l.quem === 'eles' ? 'ELES' : 'DONO (falou só para você)'
    return `[${hora(l.quando)}] ${quem}: ${l.texto}${l.botoes?.length ? `  [botões: ${l.botoes.join(' | ')}]` : ''}`
  })
  return [
    `Pedido: ${e.pedido}`,
    `Preferências: ${e.preferencias || 'nenhuma'}`,
    ...(e.observacoes ? [`Observações: ${e.observacoes}`] : []),
    `Dados liberados: ${e.lugar.dados || 'nenhum'}`,
    `Agora: ${new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })} (Brasília)`,
    '',
    'Conversa (mais antiga primeiro):',
    ...(linhas.length ? linhas : ['(nada ainda)']),
    ...(janela ? ['', `Lista aberta na tela agora (toque numa opção e depois em Enviar):\n${curto(janela, 700)}`] : []),
    '',
    'Qual o próximo passo?'
  ].join('\n')
}

// ---------- Estado ----------

export function novaConsulta(p: { dono: string; pedido: string; preferencias: string; observacoes: string; lugar: Lugar }, agora = Date.now()): EstadoConsulta {
  return {
    id: `c${agora.toString(36)}`,
    dono: p.dono,
    pedido: p.pedido,
    preferencias: p.preferencias,
    observacoes: p.observacoes,
    lugar: p.lugar,
    situacao: 'conversando',
    historico: [],
    vistos: [],
    pergunta: null,
    resumo: '',
    evento: null,
    enviadas: 0,
    aberta: false,
    criadaEm: agora,
    atualizadaEm: agora
  }
}

export const emAndamento = (e: EstadoConsulta | null): boolean => !!e && (e.situacao === 'conversando' || e.situacao === 'esperando_voce')

/** Uma frase sobre como está a consulta (para "como está a consulta?"). */
export function descrever(e: EstadoConsulta | null): string {
  if (!e) return 'Nenhuma consulta sendo marcada.'
  const ultima = [...e.historico].reverse().find((l) => l.quem === 'eles')
  switch (e.situacao) {
    case 'esperando_voce': return `Estou esperando você: ${e.pergunta?.texto ?? ''}${e.pergunta?.opcoes.length ? ` Opções: ${e.pergunta.opcoes.join('; ')}.` : ''}`
    case 'conversando': return `Conversando com ${e.lugar.nome} sobre: ${e.pedido}. ${ultima ? `A última mensagem deles: "${curto(ultima.texto, 160)}"` : 'Ainda sem resposta deles.'}`
    case 'pronto': return /^marcad/i.test(e.resumo) ? e.resumo : `Marcado: ${e.resumo}`
    case 'cancelado': return `A última consulta (${e.pedido}) foi cancelada por você.`
    default: return `A última tentativa (${e.pedido}) não deu certo: ${e.resumo}`
  }
}

// ---------- O agente ----------

export interface EventosAgente {
  aoMudar(e: EstadoConsulta): void
  aoPerguntar(e: EstadoConsulta): void
  aoTerminar(e: EstadoConsulta): void
  log?(texto: string): void
}

export interface OpcoesAgente {
  /** De quanto em quanto tempo olha a conversa */
  intervaloMs?: number
  /** Espera eles pararem de mandar antes de decidir (robôs mandam várias bolhas seguidas) */
  silencioMs?: number
  /** Sem resposta deles por este tempo: desiste */
  semRespostaMs?: number
  /** Esperando a sua resposta por este tempo: desiste */
  esperaDonoMs?: number
  dormir?: (ms: number) => Promise<void>
  agora?: () => number
}

export class AgenteConsulta {
  estado: EstadoConsulta
  private maos: Maos
  private decidir: Decisor
  private ev: EventosAgente
  private intervaloMs: number
  private silencioMs: number
  private semRespostaMs: number
  private esperaDonoMs: number
  private dormir: (ms: number) => Promise<void>
  private agora: () => number
  private ativo = false
  private precisaDecidir = false
  private falhas = 0
  private janela = ''
  private vistos: Set<string>

  constructor(estado: EstadoConsulta, maos: Maos, decidir: Decisor, ev: EventosAgente, o: OpcoesAgente = {}) {
    this.estado = estado
    this.maos = maos
    this.decidir = decidir
    this.ev = ev
    this.intervaloMs = o.intervaloMs ?? 2500
    this.silencioMs = o.silencioMs ?? 3500
    this.semRespostaMs = o.semRespostaMs ?? 3 * 3600_000
    this.esperaDonoMs = o.esperaDonoMs ?? 12 * 3600_000
    this.dormir = o.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.agora = o.agora ?? Date.now
    this.vistos = new Set(estado.vistos)
  }

  get rodando(): boolean { return this.ativo }

  /** Abre a conversa e fica nela até marcar, desistir ou você cancelar. */
  async rodar(): Promise<void> {
    if (this.ativo) return
    this.ativo = true
    try {
      await this.maos.abrir(this.estado.lugar)
      if (!this.estado.aberta) {
        // O que já estava na conversa antes não conta
        for (const r of (await this.maos.ler()).mensagens) this.vistos.add(r.id)
        this.precisaDecidir = true
      } else {
        // Retomando (a FRIDAY reabriu): se a última fala não foi minha, decide de novo
        const ultima = this.estado.historico[this.estado.historico.length - 1]
        this.precisaDecidir = this.estado.situacao === 'conversando' && !!ultima && ultima.quem !== 'eu'
      }
      this.mudou()
      while (this.ativo && emAndamento(this.estado)) {
        await this.passo()
        if (!this.ativo || !emAndamento(this.estado)) break
        await this.dormir(this.intervaloMs)
      }
    } catch (e) {
      if (this.ativo) this.terminar('falhou', `Não consegui continuar no WhatsApp: ${(e as Error).message}`)
    } finally {
      this.ativo = false
      try { this.maos.fechar() } catch { /* já fechado */ }
    }
  }

  /** Um giro: lê o que chegou e, se for a vez dela, decide e age. */
  async passo(): Promise<void> {
    const agora = this.agora()
    const leitura = await this.maos.ler()
    this.janela = leitura.janela ?? ''
    const novas = leitura.mensagens.filter((r) => !this.vistos.has(r.id))
    for (const r of novas) {
      this.vistos.add(r.id)
      if (!r.texto.trim() && !r.botoes?.length) continue
      this.estado.historico.push({ quem: 'eles', texto: r.texto.trim().slice(0, 1500), quando: r.quando || agora, ...(r.botoes?.length ? { botoes: r.botoes.slice(0, 10) } : {}) })
    }
    if (novas.length) { this.precisaDecidir = true; this.ultimaChegada = agora; this.mudou() }

    if (this.estado.situacao === 'esperando_voce') {
      if (agora - this.estado.atualizadaEm > this.esperaDonoMs) this.terminar('falhou', 'Fiquei esperando a sua resposta e a conversa esfriou.')
      return
    }
    if (this.precisaDecidir) {
      if (agora - this.ultimaChegada >= this.silencioMs) await this.decidirAgora()
      return
    }
    const ultimaAtividade = Math.max(this.estado.criadaEm, ...this.estado.historico.map((l) => l.quando))
    if (agora - ultimaAtividade > this.semRespostaMs) this.terminar('falhou', `${this.estado.lugar.nome} parou de responder.`)
  }

  private ultimaChegada = 0

  private async decidirAgora(): Promise<void> {
    this.precisaDecidir = false
    let d: Decisao
    try {
      const bruto = await this.decidir(instrucoesAgente(this.estado, this.maos.limites), montarConversa(this.estado, this.agora(), this.janela))
      d = proteger(lerDecisao(bruto), this.estado)
      this.falhas = 0
    } catch (e) {
      this.ev.log?.(`decisão falhou: ${(e as Error).message}`)
      if (++this.falhas >= 3) this.terminar('falhou', 'Não consegui entender a conversa com eles.')
      else this.precisaDecidir = true
      return
    }
    // Sem a primeira mensagem, "esperar" não faz sentido
    if (d.acao === 'esperar' && !this.estado.aberta) {
      if (++this.falhas >= 3) this.terminar('falhou', 'Não consegui começar a conversa.')
      else this.precisaDecidir = true
      return
    }
    this.ev.log?.(`decidiu: ${d.acao}`)
    await this.aplicar(d)
  }

  private async aplicar(d: Decisao): Promise<void> {
    const e = this.estado
    switch (d.acao) {
      case 'enviar':
        await this.maos.enviar(d.texto)
        e.historico.push({ quem: 'eu', texto: d.texto, quando: this.agora() })
        e.enviadas++
        e.aberta = true
        this.mudou()
        return
      case 'tocar':
        try {
          await this.maos.tocar(d.botao)
        } catch (erro) {
          // Botão sumiu ou não existe: ela fica sabendo e decide de novo
          e.historico.push({ quem: 'eu', texto: `(não consegui tocar em "${d.botao}": ${(erro as Error).message})`, quando: this.agora() })
          if (++this.falhas >= 3) { this.terminar('falhou', 'Não consegui usar os botões da conversa.'); return }
          this.precisaDecidir = true
          this.ultimaChegada = this.agora()
          this.mudou()
          return
        }
        e.historico.push({ quem: 'eu', texto: `▸ ${d.botao}`, quando: this.agora() })
        e.enviadas++
        e.aberta = true
        // Tocar pode abrir uma lista na tela (sem mensagem nova): olha de novo daqui a pouco
        this.precisaDecidir = true
        this.ultimaChegada = this.agora()
        this.mudou()
        return
      case 'perguntar':
        e.situacao = 'esperando_voce'
        e.pergunta = { texto: d.texto, opcoes: d.opcoes }
        this.mudou()
        this.ev.aoPerguntar(e)
        return
      case 'esperar':
        return
      case 'pronto':
        e.evento = d.evento
        this.terminar('pronto', d.texto)
        return
      case 'desistir':
        this.terminar('falhou', d.texto)
    }
  }

  /** A sua resposta (ou uma instrução nova) chegou. */
  responder(texto: string): void {
    const t = texto.trim()
    if (!t || !emAndamento(this.estado)) return
    this.estado.historico.push({ quem: 'dono', texto: t.slice(0, 600), quando: this.agora() })
    this.estado.situacao = 'conversando'
    this.estado.pergunta = null
    this.precisaDecidir = true
    this.ultimaChegada = 0
    this.mudou()
  }

  cancelar(): void {
    if (!emAndamento(this.estado)) return
    this.terminar('cancelado', 'Cancelado por você.')
  }

  private terminar(s: Situacao, resumo: string): void {
    this.estado.situacao = s
    this.estado.resumo = resumo
    this.estado.pergunta = null
    this.ativo = false
    this.mudou()
    this.ev.aoTerminar(this.estado)
  }

  private mudou(): void {
    const e = this.estado
    e.vistos = [...this.vistos].slice(-300)
    if (e.historico.length > MAX_HISTORICO) e.historico = [...e.historico.slice(0, 4), ...e.historico.slice(-(MAX_HISTORICO - 4))]
    e.atualizadaEm = this.agora()
    this.ev.aoMudar(e)
  }
}
