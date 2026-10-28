// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Consultas pelo WhatsApp no celular: o mesmo agente do PC (src/shared/consulta.ts) com as mãos
// do próprio celular. Ela lê as respostas pelas notificações do WhatsApp (funciona até com a tela
// bloqueada), responde pelo botão "Responder" da notificação e, quando precisa, abre a conversa e
// toca em Enviar com o controle da tela. Os lugares e a consulta ficam só neste celular.

import { LocalNotifications } from '@capacitor/local-notifications'
import { Preferences } from '@capacitor/preferences'
import { AgenteConsulta, descrever, emAndamento, normalizar, novaConsulta, numeroWhats, type EstadoConsulta, type Leitura, type Lugar, type Maos } from '../../src/shared/consulta'
import { criarDecisor } from '../../src/shared/consulta-gemini'
import { lerAjustes, lerLista, salvarLista } from './armazem'
import { Celular, garantir } from './celular'

const PACOTE = 'dev.harle.friday'
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A FRIDAY precisa de você ('pergunta') ou terminou ('fim'). Quem decide como avisar é a tela (main.ts). */
export const avisos: { aoAvisar: (tipo: 'pergunta' | 'fim', texto: string, ok: boolean) => void } = { aoAvisar: () => {} }

// ---------- Lugares ----------

export const lugares = (): Promise<Lugar[]> => lerLista<Lugar>('consulta_lugares')

export async function acharLugar(nome: string): Promise<Lugar | { varios: string[] } | null> {
  const ls = await lugares()
  const p = normalizar(nome)
  if (!p) return ls[0] ?? null
  const exato = ls.find((l) => normalizar(l.nome) === p)
  if (exato) return exato
  const parecidos = ls.filter((l) => { const n = normalizar(l.nome); return n.includes(p) || p.includes(n) })
  if (parecidos.length > 1) return { varios: parecidos.map((l) => l.nome) }
  return parecidos[0] ?? null
}

/** Salva o lugar. Também salva o número nos contatos, para o WhatsApp mostrar esse nome nas notificações. */
export async function salvarLugar(nome: string, whatsapp: string, dados: string): Promise<{ lugar: Lugar; contato: boolean }> {
  const n = nome.trim()
  if (!n) throw new Error('Faltou o nome do lugar.')
  const ls = await lugares()
  const antigo = ls.find((l) => normalizar(l.nome) === normalizar(n))
  const numero = numeroWhats(whatsapp)
  if (!antigo && numero.length < 12) throw new Error('Faltou o número do WhatsApp com DDD (ex.: 11 2029-7200).')
  const l: Lugar = { nome: n, whatsapp: numero.length >= 12 ? numero : antigo!.whatsapp, dados: dados.trim() || antigo?.dados || '' }
  await salvarLista('consulta_lugares', [...ls.filter((x) => x !== antigo), l])
  let contato = false
  if (!antigo || numero.length >= 12) {
    try {
      await garantir('contatos')
      await Celular.salvarContato({ nome: l.nome, numero: `+${l.whatsapp}` })
      contato = true
    } catch { /* sem permissão: o nome nas notificações pode ser outro */ }
  }
  return { lugar: l, contato }
}

export async function removerLugar(nome: string): Promise<string | null> {
  const l = await acharLugar(nome)
  if (!l || 'varios' in l) return null
  await salvarLista('consulta_lugares', (await lugares()).filter((x) => normalizar(x.nome) !== normalizar(l.nome)))
  return l.nome
}

// ---------- Mãos do celular ----------

const mesmoNome = (a: string, b: string): boolean => {
  const x = normalizar(a), y = normalizar(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}

const voltarParaFriday = (): Promise<void> => Celular.abrirApp({ pacote: PACOTE }).catch(() => {})

function maosDoCelular(): Maos {
  let lugar: Lugar = { nome: '', whatsapp: '', dados: '' }
  return {
    async abrir(l) {
      lugar = l
      if (!(await Celular.avisosAtivos()).ativo) throw new Error('preciso do acesso às notificações para ler as respostas (Ajustes > Avisos por voz > Ativar)')
      await Celular.vigiarConversa({ nome: l.nome })
    },
    async ler(): Promise<Leitura> {
      const r = await Celular.mensagensRecentes({})
      return {
        mensagens: r.mensagens
          .filter((m) => m.app.startsWith('WhatsApp') && !m.grupo && mesmoNome(m.remetente, lugar.nome))
          .map((m) => ({ id: `${m.quando}|${m.texto}`, texto: m.texto, quando: m.quando }))
      }
    },
    async enviar(texto) {
      // 1) Pelo "Responder" da notificação: nem precisa abrir o WhatsApp
      try {
        await Celular.responderMensagem({ remetente: lugar.nome, texto })
        return
      } catch { /* ainda não tem notificação deles para responder */ }
      // 2) Abre a conversa, toca em Enviar e volta para a FRIDAY
      const r = await Celular.whatsapp({ numero: lugar.whatsapp, texto, enviar: true })
      await esperar(1200)
      await voltarParaFriday()
      if (!r.enviado) throw new Error('a mensagem ficou escrita no WhatsApp sem enviar: ligue o controle da tela (Ajustes > Controle do celular)')
    },
    async tocar(rotulo) {
      if (!(await Celular.acessibilidade()).ativa) throw new Error('para tocar em botões preciso do controle da tela ligado')
      await Celular.whatsapp({ numero: lugar.whatsapp, texto: '', enviar: false })
      await esperar(2500)
      try {
        await Celular.tocar({ texto: rotulo })
        await esperar(1200)
      } finally {
        await voltarParaFriday()
      }
    },
    fechar() { void Celular.vigiarConversa({ nome: '' }).catch(() => {}) },
    limites: 'No celular você lê as mensagens deles pelas notificações: botões e listas não aparecem. Responda com o número ou o texto da opção; use tocar só se a mensagem pedir para tocar num botão, com o texto exato dele.'
  }
}

// ---------- A consulta ----------

let agente: AgenteConsulta | null = null
/** Pergunta que a FRIDAY do PC mandou (consulta marcada pelo PC) */
let perguntaDoPc = ''

async function lerAtual(): Promise<EstadoConsulta | null> {
  const { value } = await Preferences.get({ key: 'consulta_atual' })
  try { return value ? (JSON.parse(value) as EstadoConsulta) : null } catch { return null }
}
const guardar = (e: EstadoConsulta): void => { void Preferences.set({ key: 'consulta_atual', value: JSON.stringify(e) }) }

export const consultaAtual = async (): Promise<EstadoConsulta | null> => agente?.estado ?? lerAtual()

export function definirPerguntaDoPc(texto: string): void { perguntaDoPc = texto }

/** Entra no começo de cada conversa por voz: o que está esperando a resposta dele. */
export async function perguntaParaPrompt(): Promise<string> {
  const e = await consultaAtual()
  const partes: string[] = []
  if (e?.situacao === 'esperando_voce' && e.pergunta) {
    partes.push(`Consulta pelo WhatsApp esperando a resposta dele (${e.lugar.nome}, ${e.pedido}): ${e.pergunta.texto}${e.pergunta.opcoes.length ? ` Opções: ${e.pergunta.opcoes.join('; ')}.` : ''} Quando ele responder, chame responder_consulta.`)
  }
  if (perguntaDoPc) partes.push(`A FRIDAY do PC está marcando uma consulta e perguntou: ${perguntaDoPc} Quando ele responder, chame pc_responder_consulta.`)
  return partes.join('\n')
}

async function quandoMarcou(e: EstadoConsulta): Promise<string> {
  const ev = e.evento
  if (!ev) return ''
  const inicio = new Date(ev.inicioIso)
  if (Number.isNaN(inicio.getTime())) return ''
  const fim = ev.fimIso ? new Date(ev.fimIso) : new Date(inicio.getTime() + 3600_000)
  try {
    await garantir('agenda')
    await Celular.criarEvento({ titulo: ev.titulo, inicio: inicio.getTime(), fim: fim.getTime(), local: ev.local, descricao: e.resumo, diaInteiro: false })
    return ' Já pus na agenda.'
  } catch {
    return ' Não consegui pôr na agenda (falta a permissão).'
  }
}

async function ligar(estado: EstadoConsulta): Promise<void> {
  const aj = await lerAjustes()
  agente = new AgenteConsulta(estado, maosDoCelular(), criarDecisor(aj.chave), {
    aoMudar: guardar,
    aoPerguntar(e) {
      void LocalNotifications.schedule({ notifications: [{ id: 7700 + (Date.now() % 100), title: 'FRIDAY · consulta: sua vez', body: e.pergunta?.texto ?? '' }] }).catch(() => {})
      avisos.aoAvisar('pergunta', `${e.pergunta?.texto ?? ''}${e.pergunta?.opcoes.length ? ` (${e.pergunta.opcoes.join(' / ')})` : ''}`, true)
    },
    aoTerminar(e) {
      if (e.situacao === 'cancelado') return
      void (async () => {
        const extra = e.situacao === 'pronto' ? await quandoMarcou(e) : ''
        const texto = e.situacao === 'pronto' ? `${descrever(e)}${extra}` : `Não deu para marcar com ${e.lugar.nome}: ${e.resumo}`
        void LocalNotifications.schedule({ notifications: [{ id: 7800 + (Date.now() % 100), title: e.situacao === 'pronto' ? 'FRIDAY · consulta marcada' : 'FRIDAY · consulta', body: texto }] }).catch(() => {})
        avisos.aoAvisar('fim', texto, e.situacao === 'pronto')
      })()
    },
    log: (t) => console.log(`[consulta] ${t}`)
  })
  const este = agente
  void este.rodar().finally(() => { if (agente === este && !emAndamento(este.estado)) agente = null })
}

export async function iniciarConsulta(p: { pedido: string; preferencias: string; observacoes: string; lugar: Lugar }): Promise<void> {
  if (emAndamento(await consultaAtual())) throw new Error(`Já estou marcando outra. ${descrever(await consultaAtual())}`)
  const aj = await lerAjustes()
  if (!aj.chave) throw new Error('Falta a chave do Gemini nos Ajustes.')
  const e = novaConsulta({ dono: aj.nome, ...p })
  guardar(e)
  await ligar(e)
}

export async function responderConsulta(texto: string): Promise<{ ok: boolean; mensagem: string }> {
  const e = await consultaAtual()
  if (!e || !emAndamento(e)) return { ok: false, mensagem: 'Não tem consulta sendo marcada aqui no celular.' }
  if (!agente) await ligar(e)
  agente?.responder(texto)
  return { ok: true, mensagem: `Passei para a conversa com ${e.lugar.nome}. Continuo por lá e te aviso.` }
}

export async function cancelarConsulta(): Promise<string> {
  const e = await consultaAtual()
  if (!e || !emAndamento(e)) return 'Não tem consulta sendo marcada aqui no celular.'
  if (agente) agente.cancelar()
  else { e.situacao = 'cancelado'; e.resumo = 'Cancelado por você.'; guardar(e) }
  return `Parei. A conversa com ${e.lugar.nome} fica no WhatsApp do jeito que está, para você continuar.`
}

export const andamento = async (): Promise<string> => descrever(await consultaAtual())

/** O app abriu de novo com uma consulta pela metade (de menos de um dia): continua dali. */
export async function retomarConsulta(): Promise<void> {
  if (agente) return
  const e = await lerAtual()
  if (!e || !emAndamento(e) || Date.now() - e.atualizadaEm > 24 * 3600_000) return
  await ligar(e)
}
