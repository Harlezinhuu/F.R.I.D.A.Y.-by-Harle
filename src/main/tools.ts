// Execução das ferramentas que a IA pede. Cada uma devolve uma mensagem curta para a IA
// e, quando faz sentido, um cartão para o HUD mostrar.

import { shell } from 'electron'
import type { ToolResult } from '../shared/types'
import { carregarApps, encontrarApp, abrir, fechar } from './apps'
import { lerVolume, definirVolume, definirMudo, teclaMidia } from './winctl'
import { statusSistema } from './system'
import { criarLembrete, listarLembretes } from './reminders'

type Args = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const falha = (mensagem: string): ToolResult => ({ ok: false, mensagem })

const FERRAMENTAS: Record<string, (a: Args) => Promise<ToolResult>> = {
  async listar_apps() {
    const nomes = carregarApps().map((a) => a.nome)
    return { ok: true, mensagem: `Programas disponíveis: ${nomes.join(', ')}.`, dados: nomes }
  },

  async abrir_app(a) {
    const app = encontrarApp(str(a.nome))
    if (!app) return falha(`Não tenho "${str(a.nome)}" na lista de programas. Ele pode ser adicionado no apps.json.`)
    await abrir(app)
    return { ok: true, mensagem: `${app.nome} aberto.`, card: { tipo: 'app', acao: 'aberto', nome: app.nome } }
  },

  async fechar_app(a) {
    const app = encontrarApp(str(a.nome))
    if (!app) return falha(`Não tenho "${str(a.nome)}" na lista de programas.`)
    if (!app.processo) return falha(`Por segurança, não fecho ${app.nome}.`)
    if (a.confirmado !== true) {
      return {
        ok: false,
        precisaConfirmacao: true,
        mensagem: `Precisa de confirmação: fechar ${app.nome} pode perder trabalho não salvo. Pergunte antes.`,
        dados: { pergunta: `Fechar ${app.nome}? O que não estiver salvo pode ser perdido.` }
      }
    }
    await fechar(app)
    return { ok: true, mensagem: `${app.nome} fechado.`, card: { tipo: 'app', acao: 'fechado', nome: app.nome } }
  },

  async volume(a) {
    const acao = str(a.acao)
    const valor = num(a.valor)
    const atual = await lerVolume()
    switch (acao) {
      case 'definir':
        if (valor === null) return falha('Faltou dizer o nível do volume.')
        await definirVolume(valor); await definirMudo(false); break
      case 'aumentar': await definirVolume(atual.nivel + (valor ?? 10)); await definirMudo(false); break
      case 'diminuir': await definirVolume(atual.nivel - (valor ?? 10)); break
      case 'mudo': await definirMudo(true); break
      case 'tirar_mudo': await definirMudo(false); break
      case 'consultar': break
      default: return falha('Ação de volume desconhecida.')
    }
    const novo = await lerVolume()
    return { ok: true, mensagem: novo.mudo ? 'Volume no mudo.' : `Volume em ${novo.nivel}%.`, card: { tipo: 'volume', nivel: novo.nivel, mudo: novo.mudo } }
  },

  async midia(a) {
    const acao = str(a.acao) as 'tocar_pausar' | 'proxima' | 'anterior'
    if (!['tocar_pausar', 'proxima', 'anterior'].includes(acao)) return falha('Ação de mídia desconhecida.')
    await teclaMidia(acao)
    const texto = { tocar_pausar: 'Tocar/pausar', proxima: 'Próxima faixa', anterior: 'Faixa anterior' }[acao]
    return { ok: true, mensagem: `${texto}.`, card: { tipo: 'midia', acao: texto } }
  },

  async pesquisar_web(a) {
    const consulta = str(a.consulta)
    if (!consulta) return falha('Faltou dizer o que pesquisar.')
    await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(consulta)}`)
    return { ok: true, mensagem: `Pesquisa aberta no navegador: ${consulta}.`, card: { tipo: 'pesquisa', consulta } }
  },

  async abrir_site(a) {
    let url: URL
    try { url = new URL(str(a.url)) } catch { return falha('Endereço inválido.') }
    if (url.protocol !== 'https:') return falha('Só abro sites com https.')
    await shell.openExternal(url.toString())
    return { ok: true, mensagem: `Site aberto: ${url.hostname}.`, card: { tipo: 'pesquisa', consulta: url.hostname } }
  },

  async status_sistema() {
    const s = await statusSistema()
    const gpu = s.gpu === null ? 'placa de vídeo sem leitura' : `GPU em ${s.gpu}%`
    return { ok: true, mensagem: `CPU em ${s.cpu}%, RAM em ${s.ram}%, ${gpu}.`, card: { tipo: 'sistema', ...s }, dados: s }
  },

  async criar_lembrete(a) {
    const texto = str(a.texto)
    if (!texto) return falha('Faltou o texto do lembrete.')
    const l = criarLembrete(texto, str(a.quando_iso))
    const quando = new Date(l.quandoIso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    return { ok: true, mensagem: `Lembrete criado para ${quando}.`, card: { tipo: 'lembrete', texto: l.texto, quandoIso: l.quandoIso } }
  },

  async listar_lembretes() {
    const lista = listarLembretes()
    if (!lista.length) return { ok: true, mensagem: 'Nenhum lembrete pendente.' }
    const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    return { ok: true, mensagem: lista.map((l) => `${fmt(l.quandoIso)}: ${l.texto}`).join('; '), dados: lista }
  }
}

export async function executarFerramenta(nome: string, args: Args = {}): Promise<ToolResult> {
  const f = FERRAMENTAS[nome]
  if (!f) return falha(`Ferramenta desconhecida: ${nome}.`)
  try {
    return await f(args ?? {})
  } catch (e) {
    return falha((e as Error).message || 'Algo deu errado ao executar a ação.')
  }
}
