// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Execução das ferramentas que a IA pede. Cada uma devolve uma mensagem curta para a IA
// e, quando faz sentido, um cartão para o HUD mostrar.

import { shell, type BrowserWindow } from 'electron'
import type { ItemDiagnostico, ToolResult } from '../shared/types'
import { carregarApps, encontrarApp, abrir, fechar } from './apps'
import { lerVolume, definirVolume, definirMudo, teclaMidia } from './winctl'
import { statusSistema } from './system'
import { criarLembrete, listarLembretes, cancelarLembretes, lembretesDeHoje } from './reminders'
import { ehRepeticao, descreverRepeticao, type Repeticao } from './logica/recorrencia'
import { validarPassos, resumirPassos } from './logica/rotinas'
import { lerRotinas, encontrarRotina, salvarRotina, apagarRotina } from './rotinas'
import * as arquivos from './arquivos'
import { capturarTela } from './captura'
import { buscarClima } from './clima'
import { carregarConfig, carregarFish } from './config'

let janela: () => BrowserWindow | null = () => null
/** O processo principal informa a janela do HUD (para esconder durante o print). */
export function configurarFerramentas(opcoes: { janela: () => BrowserWindow | null }): void {
  janela = opcoes.janela
}

const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

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
    const repetir: Repeticao = ehRepeticao(a.repetir) ? a.repetir : 'nunca'
    const l = criarLembrete(texto, str(a.quando_iso), repetir)
    const quando = repetir === 'nunca' ? fmtData(l.quandoIso) : `${descreverRepeticao(repetir)} às ${fmtHora(l.quandoIso)} (o primeiro em ${fmtData(l.quandoIso)})`
    return { ok: true, mensagem: `Lembrete criado: ${quando}.`, card: { tipo: 'lembrete', texto: l.texto, quandoIso: l.quandoIso, repetir } }
  },

  async criar_timer(a) {
    const minutos = num(a.minutos) ?? 0
    const segundos = num(a.segundos) ?? 0
    const total = Math.round(minutos * 60 + segundos)
    if (total < 5 || total > 24 * 3600) return falha('O timer precisa ter entre 5 segundos e 24 horas.')
    const texto = str(a.texto) || 'Timer'
    const l = criarLembrete(texto, new Date(Date.now() + total * 1000).toISOString(), 'nunca', true)
    const dur = total >= 60 ? `${Math.floor(total / 60)} min${total % 60 ? ` e ${total % 60} s` : ''}` : `${total} s`
    return { ok: true, mensagem: `Timer de ${dur} ligado. Toca às ${fmtHora(l.quandoIso)}.`, card: { tipo: 'lembrete', texto: `${texto} · ${dur}`, quandoIso: l.quandoIso } }
  },

  async listar_lembretes() {
    const lista = listarLembretes()
    if (!lista.length) return { ok: true, mensagem: 'Nenhum lembrete pendente.' }
    const desc = (r?: string) => (r && ehRepeticao(r) && r !== 'nunca' ? ` (${descreverRepeticao(r)})` : '')
    return { ok: true, mensagem: lista.slice(0, 15).map((l) => `${fmtData(l.quandoIso)}: ${l.texto}${l.timer ? ' (timer)' : ''}${desc(l.repetir)}`).join('; '), dados: lista }
  },

  async cancelar_lembrete(a) {
    const soTimers = a.timer === true
    const cancelados = cancelarLembretes(str(a.texto), soTimers)
    if (!cancelados.length) return falha(str(a.texto) ? `Não achei lembrete com "${str(a.texto)}".` : 'Diga qual lembrete cancelar.')
    return { ok: true, mensagem: `Cancelado: ${cancelados.map((l) => l.texto).join(', ')}.`, card: { tipo: 'aviso', titulo: 'LEMBRETE CANCELADO', texto: cancelados.map((l) => l.texto).join(' · ') } }
  },

  // ---------- Rotinas ----------

  async criar_rotina(a) {
    const nome = str(a.nome)
    if (!nome || nome.length > 40) return falha('A rotina precisa de um nome curto.')
    const v = validarPassos(a.passos)
    if (!v.ok) return falha(v.erro)
    const resumo = resumirPassos(v.passos)
    if (v.perigosa && a.confirmado !== true) {
      return {
        ok: false,
        precisaConfirmacao: true,
        mensagem: `Precisa de confirmação: a rotina "${nome}" fecha programas (${resumo}). Pergunte antes de salvar.`,
        dados: { pergunta: `Salvar a rotina "${nome}"? Ela fecha programas sem perguntar de novo.` }
      }
    }
    const { substituiu } = salvarRotina(nome, v.passos)
    return { ok: true, mensagem: `Rotina "${nome}" ${substituiu ? 'atualizada' : 'criada'}: ${resumo}. Para usar, é só dizer "${nome}".`, card: { tipo: 'rotina', nome, passos: resumo } }
  },

  async listar_rotinas() {
    const lista = lerRotinas()
    if (!lista.length) return { ok: true, mensagem: 'Nenhuma rotina criada ainda.' }
    return { ok: true, mensagem: lista.map((r) => `${r.nome}: ${resumirPassos(r.passos)}`).join('; '), dados: lista.map((r) => r.nome) }
  },

  async apagar_rotina(a) {
    const r = apagarRotina(str(a.nome))
    if (!r) return falha(`Não achei a rotina "${str(a.nome)}".`)
    return { ok: true, mensagem: `Rotina "${r.nome}" apagada.`, card: { tipo: 'aviso', titulo: 'ROTINA APAGADA', texto: r.nome } }
  },

  /** Usado pelo HUD para rodar uma rotina passo a passo. */
  async obter_rotina(a) {
    const r = encontrarRotina(str(a.nome))
    if (!r) return falha(`Não achei a rotina "${str(a.nome)}". Rotinas: ${lerRotinas().map((x) => x.nome).join(', ') || 'nenhuma'}.`)
    return { ok: true, mensagem: r.nome, dados: r }
  },

  // ---------- Tela e arquivos ----------

  async capturar_tela() {
    const p = await capturarTela(janela())
    return { ok: true, mensagem: `Print salvo em ${p.nomeAmigavel}.`, card: { tipo: 'print', caminho: p.nomeAmigavel, miniatura: p.miniatura } }
  },

  async listar_arquivos(a) {
    const r = arquivos.listar(str(a.pasta) || 'downloads', str(a.filtro))
    const nomes = r.itens.slice(0, 25).map((i) => (i.pasta ? `${i.nome}/` : i.nome))
    const extra = r.total > nomes.length ? ` (mostrando ${nomes.length} de ${r.total}, os mais recentes primeiro)` : ''
    return {
      ok: true,
      mensagem: r.total ? `${r.titulo}: ${nomes.join(', ')}${extra}.` : `${r.titulo} está vazia${str(a.filtro) ? ' para esse filtro' : ''}.`,
      card: { tipo: 'arquivos', titulo: r.titulo, itens: r.itens.slice(0, 8).map((i) => ({ nome: i.nome, pasta: i.pasta })), total: r.total }
    }
  },

  async abrir_arquivo(a) {
    const nome = await arquivos.abrir(str(a.caminho))
    return { ok: true, mensagem: `${nome} aberto.`, card: { tipo: 'aviso', titulo: 'ABERTO', texto: nome } }
  },

  async mover_arquivo(a) {
    const r = arquivos.mover(str(a.origem), str(a.destino))
    return { ok: true, mensagem: `Movido de ${r.de} para ${r.para}. Dá para desfazer.`, card: { tipo: 'aviso', titulo: 'MOVIDO', texto: `${r.de} → ${r.para}` } }
  },

  async criar_pasta(a) {
    const nome = arquivos.criarPasta(str(a.caminho))
    return { ok: true, mensagem: `Pasta ${nome} criada.`, card: { tipo: 'aviso', titulo: 'PASTA CRIADA', texto: nome } }
  },

  async apagar_arquivo(a) {
    const alvo = arquivos.existe(str(a.caminho))
    if (!alvo.ok) return falha(`Não achei ${alvo.amigavel}.`)
    if (a.confirmado !== true) {
      return {
        ok: false,
        precisaConfirmacao: true,
        mensagem: `Precisa de confirmação: mandar ${alvo.amigavel} para a Lixeira. Pergunte antes.`,
        dados: { pergunta: `Mandar ${alvo.pasta ? 'a pasta' : ''} ${alvo.amigavel} para a Lixeira?` }
      }
    }
    const nome = await arquivos.paraLixeira(str(a.caminho))
    return { ok: true, mensagem: `${nome} foi para a Lixeira.`, card: { tipo: 'aviso', titulo: 'NA LIXEIRA', texto: nome } }
  },

  async desfazer() {
    const msg = arquivos.desfazer()
    return { ok: true, mensagem: msg, card: { tipo: 'aviso', titulo: 'DESFEITO', texto: msg } }
  },

  // ---------- Clima, saudação e diagnóstico ----------

  async clima(a) {
    const c = await buscarClima(str(a.cidade) || undefined, carregarConfig().cidade)
    return {
      ok: true,
      mensagem: `${c.cidade}: ${c.temperatura} graus, ${c.descricao}, sensação de ${c.sensacao}. Mínima ${c.minima}, máxima ${c.maxima}, ${c.chuva}% de chance de chuva.`,
      card: { tipo: 'clima', ...c },
      dados: c
    }
  },

  /** Dados da saudação ao abrir: clima e lembretes de hoje. */
  async saudacao_dados() {
    let clima = null
    try { clima = await buscarClima(undefined, carregarConfig().cidade) } catch { /* sem clima, segue */ }
    return { ok: true, mensagem: '', dados: { clima, lembretes: lembretesDeHoje().map((l) => ({ texto: l.texto, hora: fmtHora(l.quandoIso) })) } }
  },

  async diagnostico_sistema() {
    const itens: ItemDiagnostico[] = []
    const cfg = carregarConfig()
    itens.push({ nome: 'Cérebro (Gemini)', ok: !!cfg.apiKey, detalhe: cfg.apiKey ? `chave configurada · ${cfg.modelo}` : 'falta a GEMINI_API_KEY no .env' })
    if (cfg.vozProvedor === 'fish' || carregarFish().apiKey) {
      const f = carregarFish()
      itens.push({ nome: 'Voz (Fish Audio)', ok: !!(f.apiKey && f.vozId), detalhe: f.apiKey ? (f.vozId ? `voz ${f.vozId.slice(0, 8)}… · ${f.modelo}` : 'falta o FISH_VOZ_ID') : 'falta a FISH_API_KEY' })
    } else {
      itens.push({ nome: 'Voz (Gemini)', ok: true, detalhe: `voz ${cfg.voz}` })
    }
    try {
      const v = await lerVolume()
      itens.push({ nome: 'Controle do Windows', ok: true, detalhe: `volume em ${v.nivel}%${v.mudo ? ', no mudo' : ''}` })
    } catch (e) {
      itens.push({ nome: 'Controle do Windows', ok: false, detalhe: (e as Error).message })
    }
    const s = await statusSistema()
    itens.push({ nome: 'Placa de vídeo', ok: s.gpu !== null, detalhe: s.gpu !== null ? `GPU em ${s.gpu}%` : 'nvidia-smi não respondeu' })
    itens.push({ nome: 'Programas permitidos', ok: carregarApps().length > 0, detalhe: `${carregarApps().length} na lista` })
    const internet = await new Promise<boolean>((resolve) => {
      fetch('https://generativelanguage.googleapis.com/', { method: 'HEAD', signal: AbortSignal.timeout(4000) }).then(() => resolve(true), () => resolve(false))
    })
    itens.push({ nome: 'Internet', ok: internet, detalhe: internet ? 'servidores do Google alcançáveis' : 'sem resposta do Google' })
    itens.push({ nome: 'Lembretes', ok: true, detalhe: `${listarLembretes().length} pendentes · ${lerRotinas().length} rotinas` })
    return { ok: true, mensagem: '', dados: itens }
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
