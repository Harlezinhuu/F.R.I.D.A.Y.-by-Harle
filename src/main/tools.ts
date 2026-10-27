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
import { buscarClima, previsao } from './clima'
import { buscarNaInternet, paraFala } from '../shared/busca'
import { carregarConfig, carregarFish } from './config'
import { memorizar, listarFatos, esquecer, esquecerTudo, definirAprendizado, memoriaAtiva, memoriaParaPrompt } from './memoria'
import { buscarCena } from './cenas'
import { pedirTarefa, statusTarefas, cancelarTarefaAtual, lerProjetos } from './tarefas'
import * as visao from './visao'
import { buscarModelo, listarArquivos, pastaModelos, salvarImagem, type Fonte } from './modelos3d'
import { CAMADAS, lerCamadas, lerEstilo, type Vista } from './logica/visao'

/** Espera a promessa por até `ms`; se demorar mais, ela segue sozinha em segundo plano. */
async function noMaximo<T>(p: Promise<T>, ms: number): Promise<{ pronto: true; valor: T } | { pronto: false }> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const espera = new Promise<{ pronto: false }>((r) => { relogio = setTimeout(() => r({ pronto: false }), ms) })
  const pronto = p.then((valor) => ({ pronto: true as const, valor }))
  // Se falhar depois do prazo, quem chamou cuida do erro; aqui ele não fica solto
  pronto.catch(() => {})
  try {
    return await Promise.race([pronto, espera])
  } finally {
    clearTimeout(relogio)
  }
}

let janela: () => BrowserWindow | null = () => null
let avisoVisao: (texto: string, ok: boolean) => void = () => {}
/** O processo principal informa a janela do HUD (para esconder durante o print) e como avisar em segundo plano. */
export function configurarFerramentas(opcoes: { janela: () => BrowserWindow | null; avisar: (texto: string, ok: boolean) => void }): void {
  janela = opcoes.janela
  avisoVisao = opcoes.avisar
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

  // ---------- Memória ----------

  async memorizar(a) {
    const r = memorizar(a.fato, a.categoria)
    if (!r.ok) return falha(r.motivo)
    return r.novo
      ? { ok: true, mensagem: 'Guardado.', card: { tipo: 'aviso', titulo: 'APRENDI', texto: r.fato.texto } }
      : { ok: true, mensagem: 'Eu já sabia disso.' }
  },

  async o_que_sabe(a) {
    const fatos = listarFatos()
    const filtro = str(a.assunto).toLowerCase()
    const lista = filtro ? fatos.filter((f) => f.texto.toLowerCase().includes(filtro) || f.categoria === filtro) : fatos
    if (!lista.length) return { ok: true, mensagem: fatos.length ? `Não sei nada sobre "${filtro}".` : `Ainda não aprendi nada${memoriaAtiva() ? '' : ' (o aprendizado está desligado)'}.` }
    const recentes = [...lista].sort((x, y) => y.criadoEm.localeCompare(x.criadoEm))
    return {
      ok: true,
      mensagem: `Sei ${lista.length} ${lista.length === 1 ? 'coisa' : 'coisas'}: ${recentes.slice(0, 20).map((f) => f.texto).join('; ')}.`,
      card: { tipo: 'memoria', titulo: `O QUE SEI SOBRE VOCÊ · ${lista.length}`, itens: recentes.slice(0, 8).map((f) => f.texto) }
    }
  },

  async esquecer(a) {
    if (a.tudo === true) {
      if (a.confirmado !== true) {
        return { ok: false, precisaConfirmacao: true, mensagem: `Precisa de confirmação: apagar as ${listarFatos().length} coisas que sei sobre o usuário. Pergunte antes.`, dados: { pergunta: 'Esquecer tudo o que eu sei sobre você? Não tem volta.' } }
      }
      const n = esquecerTudo()
      return { ok: true, mensagem: `Esqueci tudo (${n} itens).`, card: { tipo: 'aviso', titulo: 'MEMÓRIA APAGADA', texto: `${n} itens` } }
    }
    const foram = esquecer(str(a.trecho))
    if (!foram.length) return falha(`Não achei nada sobre "${str(a.trecho)}" na memória.`)
    return { ok: true, mensagem: `Esqueci: ${foram.map((f) => f.texto).join('; ')}.`, card: { tipo: 'memoria', titulo: 'ESQUECI', itens: foram.map((f) => f.texto) } }
  },

  async aprendizado(a) {
    const ativo = a.ativo === true
    definirAprendizado(ativo)
    return { ok: true, mensagem: ativo ? 'Aprendizado ligado.' : 'Aprendizado desligado. O que já sei continua guardado.', card: { tipo: 'aviso', titulo: 'APRENDIZADO', texto: ativo ? 'ligado' : 'desligado' } }
  },

  /** Uso interno: o que sei, para o começo de cada conversa. */
  async memoria_para_prompt() {
    return { ok: true, mensagem: memoriaParaPrompt() }
  },

  // ---------- Cenas ----------

  /** Uso interno do HUD: foto e resumo da Wikipédia. */
  async buscar_cena(a) {
    const c = await buscarCena(str(a.termo))
    if (!c) return falha('Sem cena.')
    return { ok: true, mensagem: c.titulo, card: { tipo: 'cena', ...c } }
  },

  // ---------- Projeção 3D ----------

  /** Uso interno do HUD: busca o modelo (seus arquivos, NASA, Wikimedia, PubChem, RCSB ou IA). */
  async buscar_modelo(a) {
    const fontes: Fonte[] = ['auto', 'arquivo', 'biblioteca', 'nasa', 'wikimedia', 'molecula', 'proteina', 'ia']
    const fonte = (fontes as string[]).includes(str(a.fonte)) ? (str(a.fonte) as Fonte) : 'auto'
    const d = await buscarModelo({ termo: str(a.termo), termoIngles: str(a.termo_ingles), fonte })
    return { ok: true, mensagem: d.nome, dados: d }
  },

  async listar_modelos() {
    const nomes = listarArquivos()
    return {
      ok: true,
      mensagem: nomes.length
        ? `Seus modelos: ${nomes.join(', ')}.`
        : `Nenhum arquivo 3D seu ainda. Coloque arquivos .glb, .stl ou .obj na pasta ${pastaModelos()} e peça para projetar pelo nome.`,
      card: { tipo: 'arquivos', titulo: 'FRIDAY Modelos', itens: nomes.slice(0, 12).map((n) => ({ nome: n, pasta: false })), total: nomes.length }
    }
  },

  /** Uso interno do HUD: salva a foto da projeção. */
  async salvar_imagem(a) {
    const onde = salvarImagem(str(a.imagem), str(a.nome))
    return { ok: true, mensagem: `Imagem salva em ${onde}.` }
  },

  // ---------- Visão de Deus (God's Eye View) ----------

  async visao_deus(a) {
    const { chaves, desconhecidas } = lerCamadas(a.camadas)
    const estilo = lerEstilo(a.estilo)
    const mudancas: Partial<Vista> = {}
    if (chaves.length) mudancas.camadas = chaves
    if (estilo) mudancas.estilo = estilo
    let nomeLugar = ''
    if (str(a.lugar)) {
      const l = await visao.acharLugar(str(a.lugar))
      Object.assign(mudancas, { lat: l.lat, lon: l.lon, alt: l.alt })
      nomeLugar = l.nome
    } else if (!visao.aberta()) {
      Object.assign(mudancas, visao.vistaPlaneta())
      nomeLugar = 'o planeta'
    }
    const camadasTxt = chaves.map((c) => CAMADAS[c].nome).join(', ')
    const extra = desconhecidas.length ? ` Não tenho a camada ${desconhecidas.join(', ')}.` : ''
    const card = { tipo: 'aviso' as const, titulo: 'VISÃO DE DEUS', texto: [nomeLugar, camadasTxt].filter(Boolean).join(' · ') || 'atualizando' }

    // Primeira vez: instala em segundo plano e abre sozinha quando terminar
    if (!visao.instalada()) {
      const etapa = visao.emInstalacao()
      if (etapa) return { ok: true, mensagem: `A Visão de Deus ainda está sendo instalada (${etapa}). Ela abre sozinha quando terminar.`, card }
      const falta = await visao.requisitos()
      if (falta) return falha(falta)
      void visao.instalar().then((ok) => {
        if (!ok) return
        visao.abrir(mudancas).then(
          () => avisoVisao('Visão de Deus instalada e aberta.', true),
          (e) => avisoVisao(`A Visão de Deus instalou, mas não abriu: ${(e as Error).message}`, false)
        )
      })
      return { ok: true, mensagem: 'Instalando a Visão de Deus pela primeira vez. Leva alguns minutos; ela abre sozinha quando terminar.', card: { ...card, texto: 'instalando pela primeira vez' } }
    }

    const abrindo = visao.abrir(mudancas)
    const r = await noMaximo(abrindo, 8_000)
    if (!r.pronto) {
      // O servidor ainda está subindo: avisa se der errado depois
      abrindo.catch((e) => avisoVisao(`A Visão de Deus não abriu: ${(e as Error).message}`, false))
      return { ok: true, mensagem: `Abrindo a Visão de Deus${nomeLugar ? ` em ${nomeLugar}` : ''}. O globo leva alguns segundos para aparecer.${extra}`, card }
    }
    return {
      ok: true,
      mensagem: `Visão de Deus${nomeLugar ? ` em ${nomeLugar}` : ''}${camadasTxt ? ` com ${camadasTxt}` : ''}.${extra}`,
      card
    }
  },

  async fechar_visao_deus() {
    return visao.fechar() ? { ok: true, mensagem: 'Visão de Deus fechada.' } : falha('A Visão de Deus não está aberta.')
  },

  // ---------- Tarefas de programação ----------

  async listar_projetos() {
    const { projetos, avisos } = lerProjetos()
    if (!projetos.length) return { ok: true, mensagem: `Nenhum projeto configurado. ${avisos.join(' ')} Adicione pelo ícone da bandeja: Editar projetos de programação.` }
    return { ok: true, mensagem: `Projetos: ${projetos.map((p) => `${p.nome}${p.comandos.length ? ` (pode rodar ${p.comandos.join(', ')})` : ''}`).join('; ')}.` }
  },

  async tarefa_programacao(a) {
    const r = await pedirTarefa(str(a.projeto), str(a.pedido))
    if (!r.ok) return falha(r.motivo)
    const t = r.tarefa
    return {
      ok: true,
      mensagem: r.posicao > 1 ? `Tarefa ${t.id} na fila (posição ${r.posicao}). Aviso quando terminar.` : `Tarefa ${t.id} começou no projeto ${t.projeto}. Aviso quando terminar.`,
      card: { tipo: 'tarefa', id: t.id, projeto: t.projeto, pedido: t.pedido, estado: t.estado, detalhe: 'O resultado fica numa branch para você revisar.' }
    }
  },

  async status_tarefas() {
    const lista = statusTarefas()
    if (!lista.length) return { ok: true, mensagem: 'Nenhuma tarefa de programação ainda.' }
    const t = lista[0]
    const linha = (x: typeof t) => `Tarefa ${x.id} (${x.projeto}): ${x.estado}${x.andamento ? `, ${x.andamento}` : ''}${x.branch ? `, branch ${x.branch}` : ''}`
    return {
      ok: true,
      mensagem: lista.map(linha).join('; ') + (t.resumo ? `. Resumo da última: ${t.resumo.slice(0, 600)}` : ''),
      card: { tipo: 'tarefa', id: t.id, projeto: t.projeto, pedido: t.pedido, estado: t.estado, detalhe: t.andamento || t.branch || t.resumo.slice(0, 140) }
    }
  },

  async cancelar_tarefa() {
    const t = cancelarTarefaAtual()
    if (!t) return falha('Não tem tarefa rodando nem na fila.')
    return { ok: true, mensagem: `Cancelando a tarefa ${t.id}.`, card: { tipo: 'tarefa', id: t.id, projeto: t.projeto, pedido: t.pedido, estado: 'cancelada', detalhe: 'Nada foi guardado.' } }
  },

  // ---------- Clima, saudação e diagnóstico ----------

  async clima(a) {
    const lugar = str(a.lugar) || str(a.cidade)
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(str(a.data)) ? str(a.data) : undefined
    const dias = Math.min(16, Math.max(1, num(a.dias) ?? 1))
    const c = await previsao(lugar || undefined, carregarConfig().cidade, dias, dia)
    return { ok: true, mensagem: c.texto, card: { tipo: 'clima', ...c.cartao }, dados: c.cartao }
  },

  // ---------- Internet ----------

  async buscar_na_internet(a) {
    const r = await buscarNaInternet(carregarConfig().apiKey, str(a.pergunta))
    return { ok: true, mensagem: paraFala(r), card: { tipo: 'pesquisa', consulta: str(a.pergunta) } }
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
    itens.push({ nome: 'Memória', ok: true, detalhe: `${listarFatos().length} itens · aprendizado ${memoriaAtiva() ? 'ligado' : 'desligado'}` })
    const proj = lerProjetos()
    const etapaVisao = visao.emInstalacao()
    itens.push({ nome: 'Visão de Deus', ok: true, detalhe: visao.instalada() ? (visao.aberta() ? 'aberta' : 'instalada') : etapaVisao ? `instalando: ${etapaVisao}` : 'ainda não instalada (instala na primeira vez que você pedir)' })
    itens.push({ nome: 'Tarefas de programação', ok: proj.avisos.length === 0, detalhe: proj.projetos.length ? `${proj.projetos.length} projetos${proj.avisos.length ? ` · ${proj.avisos[0]}` : ''}` : 'nenhum projeto configurado' })
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
