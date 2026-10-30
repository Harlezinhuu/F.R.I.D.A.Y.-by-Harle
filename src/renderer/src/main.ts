// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Cérebro do HUD: liga microfone, palavra de ativação, Gemini Live, ferramentas e interface.
//
// Fluxo: repouso no canto da tela → ouve "Friday" no seu PC → abre a conversa com o Gemini
// e expande o HUD → conversa → silêncio ou "pode descansar" → volta para o canto.

import { Hud } from './hud/hud'
import { sons } from './hud/sons'
import { Microfone, Alto, pcm16Base64 } from './voz/audio'
import { SessaoLive, type ChamadaFerramenta } from './voz/live'
import { PalavraAtivacao } from './voz/ativacao'
import { OuvidoReserva } from './voz/reserva'
import { FalaFish } from './voz/fish'
import type { DadosModelo3D, ItemDiagnostico, Lembrete } from '../../shared/types'
import { FORMAS, acharForma, funcao, listaFormas } from './projetor/formas'
import { modeloDeDados } from './projetor/carregar'
import type { Modelo3D } from './projetor/tipos'
import type { AcaoProjecao } from './hud/projecao'
import { Maos } from './gestos/maos'
import type { Comando } from './gestos/gestos'
import { Rostos } from './rostos/rostos'
import { filtrarAmostras, podeUsar, quemEsta, reconhecer, type Cadastro, type Papel, type Reconhecimento } from '../../shared/rostos'

const LIMIAR_FALA = 0.02 // nível RMS a partir do qual consideramos que alguém está falando
const BLOCOS_PRE_ROLL = 20 // 20 blocos de 40 ms: o áudio logo antes da ativação também vai para a IA
const BLOCOS_GATILHO_SEM_MODELO = 8 // sem modelo de ativação: fala contínua de ~320 ms abre a conversa
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Tudo que aparece no console também vai para o friday.log
for (const nivel of ['log', 'warn', 'error'] as const) {
  const original = console[nivel].bind(console)
  console[nivel] = (...args: unknown[]) => {
    original(...args)
    try {
      window.friday.log(nivel, args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    } catch { /* ignora */ }
  }
}
window.addEventListener('error', (e) => console.error('[erro]', e.message, `${e.filename}:${e.lineno}`))
window.addEventListener('unhandledrejection', (e) => console.error('[promessa]', e.reason instanceof Error ? e.reason.message : String(e.reason)))

async function iniciar(): Promise<void> {
  const hud = new Hud()
  const cfg = await window.friday.config()
  console.log(`[friday] config: chave=${cfg.apiKey ? 'sim' : 'NÃO'} modelo=${cfg.modelo} voz=${cfg.vozProvedor} ativacao=${cfg.modeloAtivacaoUrl ? 'sim' : 'NÃO'}`)
  const mic = new Microfone()
  const alto = new Alto(cfg.efeitoVoz)
  // Com o Fish Audio, a voz do Gemini é descartada e o texto da resposta vira fala pelo Fish
  const fala = cfg.vozProvedor === 'fish' ? new FalaFish() : null
  const falandoAgora = () => alto.tocando || (fala?.ocupado ?? false)
  const ativacao = new PalavraAtivacao()
  // Modo reserva (sem internet): ouvido em português no PC, cérebro local (Ollama ou regras), voz do Windows
  const ouvidoReserva = new OuvidoReserva()
  let reservaAtiva = false
  let reservaPensando = false
  let reservaUltima = 0

  let conversando = false
  let conectando = false
  let silenciada = false
  let micOk = false
  let modoSemAtivacao = false
  /** A central do quarto (o celular em casa) está ouvindo "Friday" no lugar do PC */
  let centralNoAr = false
  let blocosFalaSeguidos = 0
  let nivelMic = 0

  let preRoll: Float32Array[] = []
  let filaConexao: string[] = []

  let ultimaAtividade = 0
  let ultimaFalaUsuario = 0
  let fimFalaUsuario = 0
  let usuarioFalando = false
  let primeiroAudioDoTurno = true
  let textoUsuario = ''
  let textoFriday = ''
  let turnoUsuarioFechado = false
  // Medição da demora de cada etapa da resposta
  let marcaFimFala = 0, marcaTexto = 0, marcaPedidoVoz = 0

  let memoriaDaConversa = ''

  // ---------- Reconhecimento facial (opcional: só liga quando alguém cadastra o rosto) ----------
  const rostos = cfg.rostos ? new Rostos(cfg.rostos.modelosUrl) : null
  let cadastroRostos: Cadastro = { soDono: false, pessoas: [] }
  /** Quem chamou nesta conversa (null = não reconhecido) */
  let pessoaAtual: Reconhecimento | null = null

  async function lerCadastroRostos(): Promise<void> {
    const r = await window.friday.ferramenta('rostos_dados', {}).catch(() => null)
    cadastroRostos = (r?.dados as Cadastro | undefined) ?? { soDono: false, pessoas: [] }
    // Com alguém cadastrado, os modelos já ficam carregados (o reconhecimento sai mais rápido)
    if (cadastroRostos.pessoas.length && rostos) void rostos.carregar().catch((e) => console.warn('[rostos] modelos não carregaram:', (e as Error).message))
  }
  const nomeDono = (): string => cadastroRostos.pessoas.find((p) => p.papel === 'dono')?.nome ?? cfg.nome
  /** Sem cadastro, todo mundo é o dono (como sempre foi). */
  const papelAtual = (): Papel | null => (cadastroRostos.pessoas.length ? pessoaAtual?.pessoa.papel ?? null : 'dono')

  /** Olha pela webcam por até 2,5 s e diz quem chamou. A câmera fecha logo depois. */
  async function quemChamou(): Promise<Reconhecimento | null> {
    if (!rostos || !cadastroRostos.pessoas.length) return null
    try {
      const inicio = performance.now()
      const amostras = await rostos.olhar(3, 2500)
      let melhor: Reconhecimento | null = null
      for (const a of amostras) {
        const r = reconhecer(a.descritor, cadastroRostos.pessoas, cfg.rostos?.limiar)
        if (r && (!melhor || r.semelhanca > melhor.semelhanca)) melhor = r
      }
      const vivo = Math.max(0, ...amostras.map((a) => Math.max(a.real, a.vivo)))
      console.log(`[rostos] ${amostras.length} quadros em ${Math.round(performance.now() - inicio)} ms: ${melhor ? `${melhor.pessoa.nome} (${melhor.semelhanca})` : 'ninguém conhecido'}, vivo ${vivo.toFixed(2)}`)
      // Foto ou tela na frente da câmera: não vale
      if (melhor && vivo < 0.3) { console.warn('[rostos] parece foto ou tela; tratando como visitante'); return null }
      // Reconhecimento firme vira amostra nova: ela acompanha a luz do quarto e o cabelo novo
      const firme = melhor ? amostras.find((a) => reconhecer(a.descritor, [melhor!.pessoa], 0.6)) : undefined
      if (melhor && firme && Math.random() < 0.3) void window.friday.ferramenta('rostos_aprender', { id: melhor.pessoa.id, descritor: firme.descritor }).then(() => lerCadastroRostos())
      return melhor
    } catch (e) {
      console.warn('[rostos] não deu para olhar:', (e as Error).message)
      return null
    }
  }

  /** Cadastro com a prévia da câmera no canto. */
  async function cadastrarRosto(a: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!rostos) return { ok: false, resultado: 'Os modelos do reconhecimento facial não estão instalados. Rode "npm run modelo" (ou "Atualizar a FRIDAY" no ícone da bandeja).' }
    const nome = String(a.nome ?? '').trim()
    if (!nome) return { ok: false, resultado: 'Pergunte o nome de quem vai ser cadastrado.' }
    const primeiro = !cadastroRostos.pessoas.length
    if (!primeiro && papelAtual() !== 'dono') return { ok: false, resultado: `Só ${nomeDono()} pode cadastrar rostos novos.` }
    if (a.confirmado !== true) {
      return { ok: false, precisa_confirmacao: true, resultado: `Precisa de consentimento: explique para ${nome} que você guarda só uma assinatura numérica do rosto (não é foto), só neste PC, para reconhecer quem chama, e que dá para apagar quando quiser ("apaga meu rosto").${primeiro ? ` ${nome} vai ser o dono: visitantes não reconhecidos não mexem em arquivos, memória nem desligam o PC.` : ''} Pergunte se concorda; se sim, chame de novo com confirmado=true e peça para olhar para a câmera por uns segundos.` }
    }
    maos.desligar()
    const caixa = document.getElementById('rostoCam') as HTMLElement
    const video = document.getElementById('rostoVideo') as HTMLVideoElement
    const status = document.getElementById('rostoStatus') as HTMLElement
    caixa.hidden = false
    status.textContent = 'OLHE PARA A CÂMERA'
    try {
      const amostras = await rostos.olhar(6, 9000, video, (n) => { status.textContent = `GUARDANDO · ${n}/6` })
      const boas = filtrarAmostras(amostras.filter((x) => x.confianca >= 0.7 && x.largura >= 90).map((x) => x.descritor), 3)
      if (boas.length < 3) return { ok: false, resultado: 'Não consegui ver o rosto direito. Peça para chegar mais perto, olhar para a câmera com a luz de frente e tentar de novo.' }
      // Esse rosto já é de outra pessoa?
      const ja = reconhecer(boas[0], cadastroRostos.pessoas.filter((p) => p.nome.toLowerCase() !== nome.toLowerCase()))
      if (ja) return { ok: false, resultado: `Esse rosto já está cadastrado como ${ja.pessoa.nome}.` }
      const papel = primeiro ? 'dono' : a.papel === 'dono' ? 'dono' : 'convidado'
      const r = await window.friday.ferramenta('rostos_salvar', { nome, papel, descritores: boas })
      await lerCadastroRostos()
      if (r.ok && primeiro) pessoaAtual = reconhecer(boas[0], cadastroRostos.pessoas)
      status.textContent = r.ok ? 'PRONTO' : 'NÃO DEU'
      r.ok ? sons.feito() : sons.erro()
      return { ok: r.ok, resultado: r.ok ? `${r.mensagem} A partir de agora eu reconheço ${nome} quando chamar.${primeiro ? ' Para cadastrar outras pessoas, peça com ela na frente da câmera.' : ''}` : r.mensagem }
    } catch (e) {
      return { ok: false, resultado: `Não consegui abrir a câmera: ${(e as Error).message}` }
    } finally {
      window.setTimeout(() => { caixa.hidden = true; video.srcObject = null }, 1200)
    }
  }

  async function gerirRostos(a: Record<string, unknown>): Promise<Record<string, unknown>> {
    await lerCadastroRostos()
    const acao = String(a.acao ?? 'listar')
    const ps = cadastroRostos.pessoas
    if (acao === 'listar') return { ok: true, resultado: ps.length ? `Cadastrados: ${ps.map((p) => `${p.nome} (${p.papel})`).join(', ')}.${cadastroRostos.soDono ? ' Só atendo o dono.' : ''}` : 'Ninguém cadastrado: o reconhecimento facial está desligado.' }
    if (acao === 'so_dono' || acao === 'todos') {
      if (papelAtual() !== 'dono') return { ok: false, resultado: `Só ${nomeDono()} pode mudar isso.` }
      if (!ps.length) return { ok: false, resultado: 'Primeiro cadastre o rosto do dono ("cadastra meu rosto").' }
      const r = await window.friday.ferramenta('rostos_so_dono', { ligar: acao === 'so_dono' })
      await lerCadastroRostos()
      return { ok: r.ok, resultado: r.mensagem }
    }
    // Apagar: o dono apaga qualquer um; cada pessoa apaga o próprio rosto
    const nome = String(a.nome ?? '').trim().toLowerCase()
    const alvo = nome ? ps.find((p) => p.nome.toLowerCase() === nome || p.nome.toLowerCase().startsWith(nome)) : pessoaAtual?.pessoa
    if (!alvo) return { ok: false, resultado: nome ? `Não achei ${a.nome} no cadastro.` : 'De quem? Não reconheci quem está falando.' }
    const ehEle = pessoaAtual?.pessoa.id === alvo.id
    if (papelAtual() !== 'dono' && !ehEle) return { ok: false, resultado: `Só ${nomeDono()} ou o próprio ${alvo.nome} podem apagar esse cadastro.` }
    if (alvo.papel === 'dono' && a.confirmado !== true) return { ok: false, precisa_confirmacao: true, resultado: 'Precisa de confirmação: apagar o rosto do dono apaga todos os cadastros e desliga o reconhecimento facial. Pergunte antes.' }
    const r = await window.friday.ferramenta('rostos_apagar', { id: alvo.id })
    await lerCadastroRostos()
    if (ehEle) pessoaAtual = null
    return { ok: r.ok, resultado: r.ok ? `${r.mensagem} A assinatura foi apagada deste PC.` : r.mensagem }
  }
  let vigiaFerramenta = 0
  let alertaPendente = false
  let turnosDesdeAlerta = 0
  let encerrarAoTerminar = false
  /** Quando a última conversa acabou (logo depois, não acorda de novo com o eco ou o fim da sua frase) */
  let fimDaConversa = 0
  let tentativasReconexao = 0

  const atividade = () => { ultimaAtividade = performance.now() }
  const estadoDeRepouso = () => (silenciada ? 'silenciada' : micOk ? 'repouso' : 'semMic') as 'silenciada' | 'repouso' | 'semMic'

  // ---------- Avisos falados (fora da conversa: lembretes, saudação, fim do foco) ----------
  let avisoFalando = false

  async function vozDoWindows(): Promise<SpeechSynthesisVoice | null> {
    let vozes = speechSynthesis.getVoices()
    if (!vozes.length) {
      await new Promise((r) => { speechSynthesis.addEventListener('voiceschanged', r, { once: true }); setTimeout(r, 1500) })
      vozes = speechSynthesis.getVoices()
    }
    return vozes.find((v) => v.lang === 'pt-BR') ?? vozes.find((v) => v.lang.toLowerCase().startsWith('pt')) ?? null
  }

  async function avisar(texto: string): Promise<void> {
    if (silenciada || conversando || hud.emFoco || !texto.trim()) return
    if (fala) { fala.adicionar(`${texto} `); fala.finalizar(); return }
    try {
      const u = new SpeechSynthesisUtterance(texto)
      u.lang = 'pt-BR'
      u.rate = 1.05
      const v = await vozDoWindows()
      if (v) u.voice = v
      u.onstart = () => { avisoFalando = true; hud.setEstado('falando') }
      u.onend = u.onerror = () => { avisoFalando = false; if (!conversando && hud.estadoAtual === 'falando') hud.setEstado(estadoDeRepouso()) }
      // A fila do próprio Windows mantém a ordem: um lembrete não corta a saudação
      speechSynthesis.speak(u)
    } catch (e) {
      console.warn('[friday] aviso falado', e)
    }
  }

  // ---------- Lembretes e modo foco ----------
  const avisosGuardados: { l: Lembrete; atrasado: boolean }[] = []

  function mostrarLembrete(l: Lembrete, atrasado: boolean): void {
    sons.alerta()
    hud.cartao({ tipo: 'lembrete', texto: l.texto, quandoIso: l.quandoIso, disparou: true, atrasado, repetir: l.repetir }, 30000)
    void avisar(l.timer ? `Tempo. ${l.texto}.` : atrasado ? `Lembrete atrasado: ${l.texto}.` : `Lembrete: ${l.texto}.`)
  }

  function soltarAvisos(): void {
    const lista = avisosGuardados.splice(0)
    lista.forEach((a, i) => setTimeout(() => mostrarLembrete(a.l, a.atrasado), 4500 + i * 6000))
  }

  /** Modo explicação: a tela acompanha a fala com palavras-chave, fotos e fatos. */
  function explicar(a: Record<string, unknown>): { ok: boolean; resultado: string } {
    if (hud.projecaoAtiva) return { ok: false, resultado: 'Tem uma projeção 3D na tela. Explique só falando.' }
    const lista = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max)
    const dados = {
      tema: String(a.tema ?? '').trim().slice(0, 80),
      palavras: lista(a.palavras, 20),
      alertas: lista(a.alertas, 20),
      imagens: lista(a.imagens, 4),
      fatos: lista(a.fatos, 3).map((f) => f.slice(0, 110)),
      veredito: String(a.veredito ?? '').trim().split(/\s+/)[0]?.slice(0, 14) ?? ''
    }
    hud.expandir()
    hud.nucleo.esconderCena(true)
    hud.explicacao.iniciar(dados)
    hud.registrarAcao(`Explicação: ${dados.tema || 'sem título'}`)
    // As fotos chegam em segundo plano; a fala não espera por elas
    for (const termo of dados.imagens) {
      void window.friday.ferramenta('buscar_cena', { termo })
        .then((r) => {
          const c = r.ok ? r.card : undefined
          hud.explicacao.imagemChegou(c && c.tipo === 'cena' && c.imagem ? { termo, titulo: c.titulo, descricao: c.descricao, imagem: c.imagem } : null)
        })
        .catch(() => hud.explicacao.imagemChegou(null))
    }
    return {
      ok: true,
      resultado: 'A explicação está na tela. Agora explique falando, com calma e ritmo de narração, em 5 a 9 frases, dizendo as palavras-chave na ordem em que as passou. Não comente a tela.'
    }
  }

  function iniciarFoco(minutos: number): number {
    const m = Math.round(Math.min(240, Math.max(1, Number.isFinite(minutos) && minutos > 0 ? minutos : 25)))
    hud.iniciarFoco(m, () => {
      sons.feito()
      const n = avisosGuardados.length
      const texto = n ? `Foco encerrado. Guardei ${n} ${n > 1 ? 'avisos' : 'aviso'} para você.` : 'Foco encerrado. Bom trabalho.'
      hud.cartao({ tipo: 'aviso', titulo: 'FOCO ENCERRADO', texto }, 8000)
      void avisar(texto)
      soltarAvisos()
    })
    return m
  }

  const live = new SessaoLive(cfg, {
    aoAudio(b64) {
      if (fala) { turnoUsuarioFechado = true; return }
      tocarVoz(b64, 24000)
    },
    aoTextoUsuario(t) {
      if (turnoUsuarioFechado) { textoUsuario = ''; turnoUsuarioFechado = false }
      textoUsuario += t
      hud.legenda('VOCÊ', textoUsuario.trim())
      hud.explicacao.usuarioFalou()
      atividade()
    },
    aoTextoFriday(t) {
      if (!textoFriday && !marcaTexto) marcaTexto = performance.now()
      fala?.adicionar(t)
      textoFriday += t
      hud.legenda('FRIDAY', textoFriday.trim())
      // No modo explicação, as palavras-chave aparecem quando o áudio chega nelas
      hud.explicacao.falou(t, alto.restante)
    },
    aoInterrompido() {
      // Você falou por cima: ela para na hora
      fala?.cancelar()
      alto.limpar()
      hud.explicacao.interrompido()
      textoFriday = ''
      primeiroAudioDoTurno = true
      marcaTexto = marcaPedidoVoz = 0
      if (!alertaPendente) hud.setEstado('ouvindo')
    },
    aoFimDoTurno() {
      // A troca vai para o elo: se você pegar o celular, ela continua dali
      if (textoFriday.trim()) window.friday.contexto(`${textoUsuario.trim() ? `Você: ${textoUsuario.trim()}\n` : ''}FRIDAY: ${textoFriday.trim()}`)
      fala?.finalizar()
      hud.explicacao.fimDoTurno(alto.restante)
      primeiroAudioDoTurno = true
      textoFriday = ''
      if (alertaPendente && ++turnosDesdeAlerta >= 2) limparAlerta()
    },
    aoFerramentas(chamadas) { void executarFerramentas(chamadas) },
    aoAtividade() { clearTimeout(vigiaFerramenta); vigiaFerramenta = 0 },
    aoAvisoDeFim() { void reconectar(true) },
    aoFechar(inesperado, motivo) {
      if (!inesperado || !conversando || conectando) return
      console.warn('[friday] conexão caiu:', motivo)
      void reconectar(false)
    }
  })

  function tocarVoz(b64: string, taxa: number): void {
    if (primeiroAudioDoTurno) {
      primeiroAudioDoTurno = false
      turnoUsuarioFechado = true
      const agora = performance.now()
      if (fimFalaUsuario) { hud.latencia(agora - fimFalaUsuario); marcaFimFala = fimFalaUsuario; fimFalaUsuario = 0 }
      if (marcaFimFala) {
        const ms = (t: number) => (t ? `${Math.round(t - marcaFimFala)} ms` : '—')
        console.log(`[tempo] depois que você parou de falar: texto em ${ms(marcaTexto)}, pedido à voz em ${ms(marcaPedidoVoz)}, primeiro som em ${ms(agora)} (voz ${cfg.vozProvedor})`)
      }
      marcaFimFala = marcaTexto = marcaPedidoVoz = 0
    }
    alto.enfileirar(b64, taxa)
    hud.setEstado('falando')
    atividade()
  }

  if (fala) {
    fala.aoPrimeiroPedido = () => { if (!marcaPedidoVoz) marcaPedidoVoz = performance.now() }
    fala.aoAudio = tocarVoz
    fala.aoErro = (msg) => {
      sons.erro()
      hud.cartao({ tipo: 'aviso', titulo: 'VOZ DO FISH AUDIO', texto: msg }, 10000)
    }
  }

  // ---------- Conversa ----------

  async function iniciarConversa(): Promise<void> {
    if (conversando || reservaAtiva || silenciada || !micOk) return
    // A própria voz dela (ou o fim da sua frase) logo depois de encerrar não abre outra conversa
    if (falandoAgora() || performance.now() - fimDaConversa < 1500) return
    if (!cfg.apiKey) {
      sons.erro()
      hud.cartao({ tipo: 'aviso', titulo: 'FALTA CONFIGURAR', texto: 'Coloque sua GEMINI_API_KEY no arquivo .env e reinicie a FRIDAY.' }, 10000)
      return
    }
    if (!navigator.onLine) { void iniciarReserva('Estou sem internet.'); return }

    // Um aviso falado em andamento para quando você chama
    try { speechSynthesis.cancel() } catch { /* sem voz do Windows */ }
    fala?.cancelar()
    alto.limpar()
    conversando = true
    conectando = true
    encerrarAoTerminar = false
    tentativasReconexao = 0
    primeiroAudioDoTurno = true
    textoUsuario = ''
    textoFriday = ''
    limparAlerta()
    sons.ativar()
    hud.expandir()
    hud.setEstado('ouvindo')
    atividade()
    filaConexao = preRoll.map(pcm16Base64)
    preRoll = []

    try {
      // Quem chamou (se o reconhecimento facial estiver ligado) e o que ela sabe sobre o dono
      const [memoria, quem] = await Promise.all([
        window.friday.ferramenta('memoria_para_prompt', {}).catch(() => ({ mensagem: '' })),
        quemChamou()
      ])
      pessoaAtual = quem
      if (cadastroRostos.pessoas.length) hud.identidade(quem ? quem.pessoa.nome : 'VISITANTE')
      if (cadastroRostos.soDono && papelAtual() !== 'dono') {
        // Modo "só o dono": quem não é o dono ouve um aviso e a conversa nem abre
        conectando = false
        sons.erro()
        hud.legenda('SISTEMA', `No momento, só atendo ${nomeDono()}.`)
        encerrarConversa(false)
        void avisar(`Desculpe, no momento só atendo ${nomeDono()}.`)
        return
      }
      // A memória do dono só entra quando é o dono falando
      memoriaDaConversa = [quemEsta(quem, cadastroRostos.pessoas.length > 0, nomeDono()), papelAtual() === 'dono' ? memoria.mensagem : ''].filter(Boolean).join('\n')
      console.log('[friday] conectando ao Gemini...')
      await live.conectar(memoriaDaConversa)
      console.log('[friday] conectado ao Gemini')
    } catch (e) {
      console.error('[friday] não conectou', e)
      conectando = false
      conversando = false
      // Sem Gemini (internet caiu, limite da chave): o cérebro reserva assume o básico
      void iniciarReserva('Não consegui falar com o Gemini.')
      return
    }
    conectando = false
    for (const b of filaConexao) live.enviarAudio(b)
    filaConexao = []
    atividade()
  }

  function encerrarConversa(despedida: boolean): void {
    if (!conversando) return
    fimDaConversa = performance.now()
    // Ouvido limpo: nada do que foi dito antes conta como um novo "Friday"
    ativacao.reiniciar()
    preRoll = []
    blocosFalaSeguidos = 0
    fala?.cancelar()
    conversando = false
    conectando = false
    filaConexao = []
    live.fechar()
    limparAlerta()
    encerrarAoTerminar = false
    if (despedida) sons.despedida()
    hud.setEstado(silenciada ? 'silenciada' : micOk ? 'repouso' : 'semMic')
    // Com uma projeção na tela, o HUD continua aberto até você pedir para fechar ou minimizar
    if (!hud.projecaoAtiva) hud.compactar()
  }

  async function reconectar(planejado: boolean): Promise<void> {
    if (!conversando) return
    live.fechar()
    tentativasReconexao++
    if (tentativasReconexao > 3) {
      sons.offline()
      hud.setEstado('offline')
      hud.legenda('SISTEMA', 'Perdi a conexão com o Gemini.')
      await esperar(3000)
      encerrarConversa(false)
      return
    }
    if (!planejado) { sons.offline(); hud.setEstado('offline') }
    conectando = true
    await esperar(planejado ? 0 : 800 * tentativasReconexao)
    try {
      await live.conectar(memoriaDaConversa)
      conectando = false
      tentativasReconexao = 0
      for (const b of filaConexao) live.enviarAudio(b)
      filaConexao = []
      if (!planejado) {
        sons.reconectou()
        hud.setEstado('ouvindo')
        hud.legenda('SISTEMA', 'Conexão restabelecida. Pode repetir o pedido.')
      }
    } catch {
      conectando = false
      void reconectar(false)
    }
  }

  function limparAlerta(): void {
    alertaPendente = false
    turnosDesdeAlerta = 0
    hud.confirmacao(null)
  }

  // ---------- Modo reserva (sem internet) ----------

  async function iniciarReserva(motivo: string): Promise<void> {
    if (reservaAtiva) return
    if (!cfg.reserva.ouvidoUrl) {
      sons.offline()
      hud.setEstado('offline')
      hud.legenda('SISTEMA', `${motivo} Para eu funcionar sem internet, rode "npm run modelo" uma vez (baixa o ouvido em português).`)
      await esperar(5000)
      if (!conversando && !reservaAtiva && !silenciada) { hud.setEstado(estadoDeRepouso()); hud.compactar() }
      return
    }
    reservaAtiva = true
    reservaPensando = true
    hud.expandir()
    hud.setEstado('pensando')
    hud.legenda('SISTEMA', `${motivo} Modo reserva: faço o básico aqui no PC.`)
    try {
      await ouvidoReserva.carregar(cfg.reserva.ouvidoUrl)
    } catch (e) {
      console.error('[friday] ouvido reserva', e)
      reservaAtiva = false
      reservaPensando = false
      sons.offline()
      hud.setEstado('offline')
      return
    }
    const est = await window.friday.reservaEstado().catch(() => ({ ok: false, modelo: '', motivo: '' }))
    hud.cartao({ tipo: 'aviso', titulo: 'MODO RESERVA', texto: est.ok ? `Sem internet: usando a IA local (${est.modelo}).` : 'Sem internet: entendo os pedidos básicos (programas, volume, música, lembretes, timers, arquivos).' }, 9000)
    sons.ativar()
    ouvidoReserva.reiniciar()
    reservaPensando = false
    reservaUltima = performance.now()
    hud.setEstado('ouvindo')
  }

  function encerrarModoReserva(despedida: boolean): void {
    if (!reservaAtiva) return
    reservaAtiva = false
    reservaPensando = false
    window.friday.reservaFim()
    ativacao.reiniciar()
    fimDaConversa = performance.now()
    if (despedida) sons.despedida()
    hud.setEstado(estadoDeRepouso())
    if (!hud.projecaoAtiva) hud.compactar()
  }

  function falarReserva(texto: string): Promise<void> {
    return new Promise((ok) => {
      if (!texto.trim()) { ok(); return }
      void vozDoWindows().then((v) => {
        const u = new SpeechSynthesisUtterance(texto)
        u.lang = 'pt-BR'
        u.rate = 1.05
        if (v) u.voice = v
        const fim = () => { clearTimeout(limite); ok() }
        const limite = setTimeout(fim, 25_000)
        u.onstart = () => hud.setEstado('falando')
        u.onend = u.onerror = fim
        speechSynthesis.speak(u)
      })
    })
  }

  ouvidoReserva.aoParcial = (t) => { if (reservaAtiva && !reservaPensando) { hud.legenda('VOCÊ', t); reservaUltima = performance.now() } }
  ouvidoReserva.aoFrase = (t) => { void tratarFraseReserva(t) }

  async function tratarFraseReserva(t: string): Promise<void> {
    if (!reservaAtiva || reservaPensando) return
    reservaPensando = true
    hud.legenda('VOCÊ', t)
    hud.setEstado('pensando')
    sons.entendi()
    let encerrar = false
    try {
      const r = await window.friday.reserva(t)
      for (const c of r.cartoes) hud.cartao(c)
      hud.legenda('FRIDAY', r.fala)
      await falarReserva(r.fala)
      encerrar = r.encerrar
    } catch (e) {
      console.warn('[friday] reserva', e)
      hud.legenda('SISTEMA', 'Não consegui fazer isso agora.')
    } finally {
      reservaPensando = false
      reservaUltima = performance.now()
      ouvidoReserva.reiniciar()
    }
    if (encerrar) encerrarModoReserva(true)
    else if (reservaAtiva) hud.setEstado('ouvindo')
  }

  // ---------- Ferramentas ----------

  /** Executa uma ferramenta (pedida pela conversa ou pelo celular pareado) e devolve a resposta para a IA. */
  async function executarUma(nome: string, args: Record<string, unknown>, remoto = false): Promise<Record<string, unknown>> {
    let resposta: Record<string, unknown>
    // Com o reconhecimento facial ligado, visitantes não mexem no que é só do dono (o celular pareado é do dono)
    if (!remoto && !podeUsar(nome, papelAtual())) {
      return { ok: false, resultado: `Isso só ${nomeDono() || 'o dono'} pode pedir. Diga isso com educação, sem detalhes.` }
    }

    if (nome === 'mostrar_painel') {
      hud.painel(String(args.painel ?? 'tudo') as 'sistema' | 'modulos' | 'tudo' | 'fechar')
      resposta = { ok: true, resultado: 'Pronto.' }
    } else if (nome === 'projetar') {
      resposta = await projetar(args)
    } else if (nome === 'controlar_projecao') {
      resposta = await controlarProjecao(args)
    } else if (nome === 'gestos') {
      resposta = await alternarGestos(args.ligar !== false)
    } else if (nome === 'minimizar') {
      // Volta ao modo compacto de quando abre: o HUD encolhe na hora e ela volta ao repouso depois de responder
      maos.desligar()
      hud.mira(null)
      hud.compactar()
      encerrarAoTerminar = true
      resposta = { ok: true, resultado: 'HUD minimizado. Responda só "Ok." ou uma palavra curta.' }
    } else if (nome === 'encerrar_conversa') {
      encerrarAoTerminar = true
      resposta = { ok: true, resultado: 'A conversa será encerrada depois da sua despedida.' }
    } else if (nome === 'modo_foco') {
      const m = iniciarFoco(Number(args.minutos))
      hud.cartao({ tipo: 'foco', minutos: m })
      sons.feito()
      hud.registrarAcao(`Foco de ${m} min`)
      encerrarAoTerminar = true
      resposta = { ok: true, resultado: `Modo foco de ${m} minutos ligado. Os lembretes ficam guardados até o fim. Despeça-se em uma frase curta.` }
    } else if (nome === 'encerrar_foco') {
      const estava = hud.emFoco
      hud.encerrarFoco()
      soltarAvisos()
      resposta = { ok: true, resultado: estava ? 'Modo foco encerrado.' : 'O modo foco não estava ligado.' }
    } else if (nome === 'diagnostico') {
      resposta = await diagnostico()
    } else if (nome === 'executar_rotina') {
      resposta = await executarRotina(String(args.nome ?? ''))
    } else if (nome === 'explicar') {
      resposta = explicar(args)
    } else if (nome === 'mandar_para_celular') {
      resposta = await mandarParaCelular(args)
    } else if (nome === 'cadastrar_rosto') {
      resposta = await cadastrarRosto(args)
    } else if (nome === 'rostos') {
      resposta = await gerirRostos(args)
    } else if (nome === 'mostrar_cena') {
      // Responde na hora para a fala não esperar; a foto aparece quando chegar
      const termo = String(args.termo ?? '').trim()
      if (cfg.cenas && termo && !hud.projecaoAtiva && !hud.explicacao.ativa) {
        void window.friday.ferramenta('buscar_cena', { termo }).then((r) => { if (r.ok && r.card && conversando) hud.cena(r.card) })
      }
      resposta = { ok: true, resultado: cfg.cenas ? 'Mostrando na tela. Continue a resposta normalmente.' : 'As cenas estão desligadas.' }
    } else {
      const inicio = performance.now()
      const r = await Promise.race([
        window.friday.ferramenta(nome, args),
        // Preparar o "ligar de fora" espera você aceitar o aviso do Windows
        esperar(nome === 'ligar_de_fora' ? 180_000 : nome === 'rodar_testes' ? 40_000 : /_janela$/.test(nome) ? 40_000 : nome === 'designs' ? 300_000 : 20000).then(() => ({ ok: false, mensagem: 'A ação demorou demais e foi interrompida.' }) as Awaited<ReturnType<typeof window.friday.ferramenta>>)
      ])
      console.log(`[ferramenta] ${nome} ${r.ok ? 'ok' : r.precisaConfirmacao ? 'pediu confirmação' : 'falhou'} em ${Math.round(performance.now() - inicio)} ms: ${r.mensagem.slice(0, 160)}`)
      if (r.precisaConfirmacao) {
        alertaPendente = true
        turnosDesdeAlerta = 0
        sons.alerta()
        hud.setEstado('alerta')
        hud.confirmacao((r.dados as { pergunta?: string } | undefined)?.pergunta ?? 'Confirma essa ação?')
      } else if (alertaPendente) {
        limparAlerta()
      }
      if (r.card) hud.cartao(r.card)
      // Ela usa o Windows por você: a foto da tela vai para a IA ver o que a lista de itens não diz
      const foto = nome === 'ver_janela' ? (r.dados as { imagem?: string } | undefined)?.imagem : undefined
      if (foto) live.enviarImagem(foto)
      // Guardar na memória acontece em silêncio, sem som de "feito"
      const silenciosa = nome === 'memorizar'
      if (r.ok) { if (!silenciosa) { sons.feito(); hud.registrarAcao(r.mensagem) } } else if (!r.precisaConfirmacao && !silenciosa) sons.erro()
      resposta = { ok: r.ok, resultado: r.mensagem, ...(r.precisaConfirmacao ? { precisa_confirmacao: true } : {}) }
    }
    return resposta
  }

  async function executarFerramentas(chamadas: ChamadaFerramenta[]): Promise<void> {
    hud.setEstado('pensando')
    sons.entendi()
    atividade()
    const respostas: { id?: string; name?: string; response: Record<string, unknown> }[] = []

    for (const c of chamadas) {
      const nome = c.name ?? ''
      respostas.push({ id: c.id, name: nome, response: await executarUma(nome, c.args ?? {}) })
    }
    live.responderFerramentas(respostas)
    // Se o Gemini ficar mudo depois da ação, dá um cutucão; se continuar mudo, avisa e volta a ouvir
    clearTimeout(vigiaFerramenta)
    vigiaFerramenta = window.setTimeout(() => {
      if (!conversando) return
      console.warn('[friday] o Gemini ficou mudo depois da ação; pedindo para continuar')
      live.cutucar()
      vigiaFerramenta = window.setTimeout(() => {
        if (!conversando) return
        console.warn('[friday] o Gemini continuou mudo depois da ação')
        const feitas = respostas.filter((r) => r.response.ok).length
        hud.legenda('SISTEMA', feitas ? 'Feito. Pode pedir a próxima.' : 'Não consegui concluir. Pode repetir?')
        hud.setEstado('ouvindo')
      }, 7000)
    }, 7000)
    atividade()
  }

  // ---------- Projeção 3D ----------

  function mostrarProjecao(m: Modelo3D): void {
    hud.projetar(m)
    sons.projetar()
    hud.registrarAcao(`Projeção: ${m.nome}`)
    console.log(`[projecao] ${m.nome} (${m.fonte}) · ${m.partes.length} partes`)
  }

  const descreverModelo = (m: Modelo3D): string =>
    `Projetando ${m.nome} (fonte: ${m.fonte}${m.credito ? `; ${m.credito}` : ''}). ${m.detalhes.join('; ')}.${m.partes.length > 1 ? ` Peças: ${m.partes.slice(0, 12).map((p) => p.nome).filter(Boolean).join(', ')}.` : ''} Comente em uma frase curta.`

  /** O que está projetado agora (para jogar a mesma projeção para o celular). */
  let ultimaProjecao: { args: Record<string, unknown>; nome: string } | null = null

  async function mandarParaCelular(a: Record<string, unknown>, soSeAberto = false): Promise<Record<string, unknown>> {
    const oQue = String(a.o_que ?? 'projecao')
    let evento: Record<string, unknown>
    if (oQue === 'projecao') {
      if (!hud.projecaoAtiva || !ultimaProjecao) return { ok: false, resultado: 'Não tem projeção na tela para mandar.' }
      evento = { tipo: 'projetar', args: ultimaProjecao.args, nome: ultimaProjecao.nome }
    } else if (oQue === 'link') {
      const url = String(a.url ?? '').trim()
      if (!/^https:\/\/\S+$/.test(url)) return { ok: false, resultado: 'Faltou um link https.' }
      evento = { tipo: 'link', url }
    } else {
      const texto = String(a.texto ?? '').trim()
      if (!texto) return { ok: false, resultado: 'Faltou o texto.' }
      evento = { tipo: 'texto', texto: texto.slice(0, 2000) }
    }
    const r = await window.friday.ferramenta('fila_celular', { evento, so_se_escutando: soSeAberto })
    if (r.ok && oQue === 'projecao') {
      // O holograma sai do PC: as partículas voltam para a fita enquanto ele aparece no celular
      hud.comandoProjecao('fechar')
      sons.despedida()
      hud.legenda('SISTEMA', 'Projeção enviada para o celular.')
    }
    return { ok: r.ok, resultado: r.mensagem }
  }

  async function projetar(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const oQue = String(args.o_que ?? '').trim()
    ultimaProjecao = { args: { ...args }, nome: oQue }
    const ingles = String(args.termo_ingles ?? '').trim()
    const fonte = String(args.fonte ?? 'auto')
    const formula = String(args.formula ?? '').trim()
    try {
      // Formas e funções são desenhadas aqui mesmo, na hora
      if (fonte === 'funcao' || (formula && fonte === 'auto')) {
        const m = funcao(formula || oQue)
        mostrarProjecao(m)
        return { ok: true, resultado: descreverModelo(m) }
      }
      if (fonte === 'forma' || fonte === 'auto') {
        const id = acharForma(oQue) ?? (ingles ? acharForma(ingles) : null)
        if (id) {
          const m = FORMAS[id].criar()
          mostrarProjecao(m)
          return { ok: true, resultado: descreverModelo(m) }
        }
        if (fonte === 'forma') return { ok: false, resultado: `Não tenho a forma "${oQue}". Formas disponíveis: ${listaFormas().join(', ')}.` }
      }
      // O resto vem de fora (seus arquivos, NASA, Wikimedia, PubChem, RCSB ou a IA)
      hud.legenda('SISTEMA', `Buscando o modelo de ${oQue}…`)
      const busca = (async () => {
        const r = await window.friday.ferramenta('buscar_modelo', { termo: oQue, termo_ingles: ingles, fonte })
        if (!r.ok) throw new Error(r.mensagem)
        const m = await modeloDeDados(r.dados as DadosModelo3D)
        if (!m.partes.length) throw new Error('O modelo veio vazio.')
        mostrarProjecao(m)
        return m
      })()
      const pronto = await Promise.race([busca, esperar(9000).then(() => null)])
      if (pronto) return { ok: true, resultado: descreverModelo(pronto) }
      busca.catch((e) => { sons.erro(); hud.legenda('SISTEMA', (e as Error).message); console.warn('[projecao] falhou depois:', (e as Error).message) })
      return { ok: true, resultado: 'O modelo ainda está sendo baixado e aparece em instantes. Diga isso em poucas palavras.' }
    } catch (e) {
      sons.erro()
      console.warn('[projecao] falhou:', (e as Error).message)
      return { ok: false, resultado: (e as Error).message }
    }
  }

  const ACOES: AcaoProjecao[] = ['girar', 'parar', 'esquerda', 'direita', 'virar', 'frente', 'cima', 'lado', 'aproximar', 'afastar', 'explodir', 'juntar', 'inverter', 'desinverter', 'cortar', 'tirar_corte', 'renderizar', 'so_linhas', 'particulas', 'medir', 'fechar']

  async function controlarProjecao(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const acao = String(args.acao ?? '')
    if (!hud.projecaoAtiva) return { ok: false, resultado: 'Não tem nenhuma projeção na tela.' }
    if (acao === 'salvar') {
      const r = await window.friday.ferramenta('salvar_imagem', { imagem: hud.nucleo.capturar(), nome: hud.nucleo.projecao.nome })
      r.ok ? sons.feito() : sons.erro()
      return { ok: r.ok, resultado: r.mensagem }
    }
    if (!ACOES.includes(acao as AcaoProjecao)) return { ok: false, resultado: `Ação desconhecida: ${acao}.` }
    const vezes = Math.min(4, Math.max(1, Math.round(Number(args.vezes) || 1)))
    let msg = ''
    for (let i = 0; i < (acao === 'aproximar' || acao === 'afastar' || acao === 'esquerda' || acao === 'direita' ? vezes : 1); i++) msg = hud.comandoProjecao(acao as AcaoProjecao)
    if (acao === 'renderizar') { sons.renderizar(); return { ok: true, resultado: `${msg} Diga apenas: "Modelo renderizado."` } }
    if (acao === 'fechar') { sons.despedida(); if (!conversando) window.setTimeout(() => { if (!conversando) hud.compactar() }, 2000) }
    else sons.entendi()
    return { ok: true, resultado: msg }
  }

  // ---------- Controle pelas mãos ----------

  const el = (id: string) => document.getElementById(id)!
  const maos = new Maos(el('cam'), el('camVideo') as HTMLVideoElement, el('camTela') as HTMLCanvasElement, el('camStatus'))
  let miraParte = -1, miraDesde = 0, ultimaMira = 0
  maos.aoDesligarSozinha = () => { hud.mira(null); hud.legenda('SISTEMA', 'Câmera desligada: nenhuma mão apareceu por um tempo.') }
  maos.aoComandos = (cmds: Comando[]) => {
    const p = hud.nucleo.projecao
    for (const c of cmds) {
      if (!hud.projecaoAtiva) continue
      switch (c.tipo) {
        case 'girar': p.girarPor(c.dx, c.dy); break
        case 'escalar': p.escalarPor(c.fator); break
        case 'explodir': if (!p.explodida) { hud.comandoProjecao('explodir'); sons.entendi() } break
        case 'juntar': if (p.explodida) { hud.comandoProjecao('juntar'); sons.entendi() } break
        case 'arremessar':
          // Com o app do celular aberto, o holograma vai para o celular; senão, sai da tela
          if (ultimaProjecao && (ultimaProjecao.args.fonte === 'forma' || ultimaProjecao.args.fonte === 'funcao' || acharForma(String(ultimaProjecao.args.o_que ?? '')) || ultimaProjecao.args.formula)) {
            void mandarParaCelular({ o_que: 'projecao' }, true).then((r) => { if (!r.ok) { hud.comandoProjecao('fechar'); sons.despedida() } })
            hud.mira(null)
            break
          }
          // Como o Tony jogando o holograma fora
          p.selecionar(-1)
          hud.comandoProjecao('fechar')
          sons.despedida()
          hud.mira(null)
          window.setTimeout(() => { if (!conversando && !hud.projecaoAtiva) hud.compactar() }, 2200)
          break
        case 'mira': {
          const pos = hud.mira(c.x, c.y)
          ultimaMira = performance.now()
          if (!pos) break
          // Parar a mira em cima de uma peça por quase um segundo seleciona a peça
          const i = p.parteEm(pos.x, pos.y)
          if (i !== miraParte) { miraParte = i; miraDesde = performance.now(); if (i >= 0) hud.marcarMira() }
          else if (i >= 0 && performance.now() - miraDesde > 900) {
            miraDesde = Infinity
            const nomeParte = p.selecionar(i)
            if (nomeParte) { sons.entendi(); hud.legenda('PEÇA', nomeParte) }
          }
          break
        }
      }
    }
  }
  // Sem apontar por um instante: a mira some
  setInterval(() => { if (ultimaMira && performance.now() - ultimaMira > 350) { ultimaMira = 0; miraParte = -1; hud.mira(null) } }, 120)

  async function alternarGestos(ligar: boolean): Promise<Record<string, unknown>> {
    if (!ligar) {
      maos.desligar()
      hud.mira(null)
      hud.nucleo.projecao.selecionar(-1)
      return { ok: true, resultado: 'Controle pelas mãos desligado e câmera fechada.' }
    }
    if (!cfg.maos) return { ok: false, resultado: 'Os arquivos do reconhecimento de mãos ainda não foram baixados. Rode o instalador de novo (ele roda "npm run modelo").' }
    try {
      await maos.ligar(cfg.maos.wasmUrl, cfg.maos.modeloUrl)
      sons.feito()
      return {
        ok: true,
        resultado: `Controle pelas mãos ligado; a imagem da câmera fica só no PC. ${hud.projecaoAtiva ? '' : 'Ainda não tem projeção na tela. '}` +
          'Gestos: mão fechada segura e gira; pinça subindo aproxima e descendo afasta; duas mãos fechadas afastando aumentam; abrir as duas mãos abertas explode e juntar monta; apontar e parar em cima de uma peça seleciona; um tapa rápido com a mão aberta joga o holograma fora. Explique em uma ou duas frases.'
      }
    } catch (e) {
      sons.erro()
      console.warn('[maos] não ligou:', (e as Error).message)
      return { ok: false, resultado: (e as Error).message }
    }
  }

  async function diagnostico(): Promise<Record<string, unknown>> {
    const r = await window.friday.ferramenta('diagnostico_sistema', {})
    const lat = hud.latenciaMedia()
    const itens: ItemDiagnostico[] = [
      { nome: 'Microfone', ok: micOk, detalhe: micOk ? mic.descricao.split('·')[0].replace(/"/g, '').trim() : 'desconectado' },
      { nome: 'Palavra de ativação', ok: ativacao.pronto, detalhe: ativacao.pronto ? 'ouvindo "Friday" no seu PC' : 'modo reserva: acorda com qualquer fala' },
      ...((r.dados as ItemDiagnostico[] | undefined) ?? []),
      { nome: 'Rapidez', ok: lat === 0 || lat < 2500, detalhe: lat ? `resposta média em ${(lat / 1000).toFixed(1).replace('.', ',')} s` : 'ainda sem medida nesta sessão' }
    ]
    hud.cartao({ tipo: 'diagnostico', itens }, 15000)
    const problemas = itens.filter((i) => !i.ok)
    problemas.length ? sons.alerta() : sons.feito()
    return {
      ok: true,
      resultado: problemas.length
        ? `${itens.length - problemas.length} de ${itens.length} itens em ordem. Problemas: ${problemas.map((p) => `${p.nome} (${p.detalhe})`).join('; ')}. Explique o que fazer em poucas palavras.`
        : `Tudo em ordem nos ${itens.length} itens${lat ? `, respondendo em média em ${(lat / 1000).toFixed(1)} segundos` : ''}.`
    }
  }

  async function executarRotina(nome: string): Promise<Record<string, unknown>> {
    const r = await window.friday.ferramenta('obter_rotina', { nome })
    if (!r.ok) { sons.erro(); return { ok: false, resultado: r.mensagem } }
    const rotina = r.dados as { nome: string; passos: { ferramenta: string; argumentos: Record<string, unknown> }[] }
    const falas: string[] = [], feitos: string[] = [], erros: string[] = []
    for (const p of rotina.passos) {
      atividade()
      if (p.ferramenta === 'dizer') { falas.push(String(p.argumentos.texto ?? '')); continue }
      if (p.ferramenta === 'esperar') { await esperar(Math.min(60, Number(p.argumentos.segundos) || 1) * 1000); continue }
      if (p.ferramenta === 'modo_foco') { feitos.push(`foco de ${iniciarFoco(Number(p.argumentos.minutos))} min`); continue }
      if (p.ferramenta === 'mostrar_painel') { hud.painel(String(p.argumentos.painel ?? 'tudo') as 'sistema' | 'modulos' | 'tudo' | 'fechar'); continue }
      // fechar_app já foi confirmado quando a rotina foi criada
      const res = await window.friday.ferramenta(p.ferramenta, p.ferramenta === 'fechar_app' ? { ...p.argumentos, confirmado: true } : p.argumentos)
      if (res.ok) { feitos.push(res.mensagem); hud.registrarAcao(res.mensagem) } else erros.push(res.mensagem)
    }
    hud.cartao({ tipo: 'rotina', nome: rotina.nome, passos: [...feitos, ...erros.map((e) => `falhou: ${e}`)].join(' · ') || 'feito' })
    erros.length ? sons.erro() : sons.feito()
    atividade()
    return {
      ok: erros.length === 0,
      resultado: `Rotina "${rotina.nome}": ${feitos.length} ${feitos.length === 1 ? 'passo feito' : 'passos feitos'}${erros.length ? `; ${erros.length} falharam: ${erros.join('; ')}` : ''}.`,
      ...(falas.length ? { dizer: falas.join(' ') } : {})
    }
  }

  // ---------- Microfone ----------

  mic.aoBloco = (amostras, rms) => {
    nivelMic = rms
    if (silenciada) return

    if (reservaAtiva) {
      // Enquanto ela pensa ou fala, não ouve (para não entender a própria voz)
      if (!reservaPensando && !speechSynthesis.speaking) ouvidoReserva.alimentar(amostras)
      return
    }

    if (!conversando) {
      preRoll.push(amostras)
      if (preRoll.length > BLOCOS_PRE_ROLL) preRoll.shift()
      if (ativacao.pronto) {
        ativacao.alimentar(amostras)
      } else if (modoSemAtivacao) {
        blocosFalaSeguidos = rms > LIMIAR_FALA * 1.5 ? blocosFalaSeguidos + 1 : 0
        if (blocosFalaSeguidos >= BLOCOS_GATILHO_SEM_MODELO) { blocosFalaSeguidos = 0; if (!centralNoAr) void iniciarConversa() }
      }
      return
    }

    const b64 = pcm16Base64(amostras)
    if (live.aberta) live.enviarAudio(b64)
    else if (conectando) filaConexao.push(b64)

    // Detecção local de fala: só para o visual e para medir a latência.
    // O eco da própria voz da FRIDAY não conta.
    if (alto.tocando) return
    const agora = performance.now()
    if (rms > LIMIAR_FALA) {
      usuarioFalando = true
      ultimaFalaUsuario = agora
      atividade()
      if (hud.estadoAtual !== 'alerta' && hud.estadoAtual !== 'offline') hud.setEstado('ouvindo')
    } else if (usuarioFalando && agora - ultimaFalaUsuario > 600) {
      usuarioFalando = false
      fimFalaUsuario = ultimaFalaUsuario
      if (hud.estadoAtual === 'ouvindo') hud.setEstado('pensando')
    }
  }

  mic.aoPerder = () => {
    micOk = false
    encerrarConversa(false)
    sons.semMic()
    hud.setEstado('semMic')
  }

  async function ligarMicrofone(): Promise<void> {
    try {
      await mic.iniciar()
      console.log(`[friday] microfone ligado: ${mic.descricao}`)
      const voltou = hud.estadoAtual === 'semMic'
      micOk = true
      if (voltou) { sons.reconectou(); hud.setEstado(silenciada ? 'silenciada' : 'repouso') }
    } catch (e) {
      console.error('[friday] microfone', e)
      micOk = false
      if (hud.estadoAtual !== 'semMic') { sons.semMic(); hud.setEstado('semMic') }
    }
  }
  navigator.mediaDevices.addEventListener('devicechange', () => { if (!micOk) void ligarMicrofone() })

  // Diagnóstico: pico do microfone a cada 3 s
  let picoMic = 0
  setInterval(() => { picoMic = Math.max(picoMic, nivelMic) }, 100)
  setInterval(() => {
    console.log(`[friday] mic pico=${picoMic.toFixed(3)} estado=${hud.estadoAtual} conversando=${conversando} ativacao=${ativacao.pronto ? 'pronta' : modoSemAtivacao ? 'sem modelo' : 'carregando'}`)
    picoMic = 0
  }, 3000)

  // ---------- Ciclo do HUD ----------

  setInterval(() => {
    const agora = performance.now()
    hud.nucleo.setNivel(alto.tocando ? alto.nivel() : nivelMic)
    // Aviso falado fora da conversa terminou: volta ao repouso
    if (!conversando && !reservaAtiva && hud.estadoAtual === 'falando' && !falandoAgora() && !avisoFalando) hud.setEstado(estadoDeRepouso())
    if (reservaAtiva && !reservaPensando && !speechSynthesis.speaking && agora - reservaUltima > 15_000) encerrarModoReserva(false)
    if (!conversando || conectando) return

    if (hud.estadoAtual === 'falando' && !falandoAgora()) hud.setEstado(alertaPendente ? 'alerta' : 'ouvindo')
    if (hud.estadoAtual === 'pensando' && fimFalaUsuario && agora - fimFalaUsuario > 8000) { fimFalaUsuario = 0; hud.setEstado('ouvindo') }
    if (encerrarAoTerminar && !falandoAgora() && agora - ultimaAtividade > 1500) { encerrarConversa(true); return }
    if (!falandoAgora() && !alertaPendente && agora - ultimaAtividade > cfg.silencioSegundos * 1000) encerrarConversa(false)
  }, 100)

  // ---------- Eventos do sistema ----------

  window.friday.aoSilenciar((v) => {
    silenciada = v
    if (v) {
      fala?.cancelar()
      alto.limpar()
      encerrarConversa(false)
      hud.cartoes.esconder()
      sons.silenciar()
      hud.setEstado('silenciada')
    } else {
      sons.voltar()
      hud.setEstado(micOk ? 'repouso' : 'semMic')
    }
  })

  window.friday.aoLembrete((l, atrasado) => {
    // No modo foco, só os timers tocam na hora; o resto espera o fim
    if (hud.emFoco && !l.timer) { avisosGuardados.push({ l, atrasado }); return }
    mostrarLembrete(l, atrasado)
  })

  // Tarefa de programação terminou em segundo plano
  window.friday.aoTarefa((t) => {
    if (!t.terminadaEm || !['pronta', 'sem mudanças', 'falhou'].includes(t.estado)) return
    t.estado === 'pronta' ? sons.feito() : sons.alerta()
    const primeira = (t.resumo.split(/(?<=[.!?])\s/)[0] ?? '').replace(/[`*#_]/g, '').slice(0, 220)
    hud.cartao({ tipo: 'tarefa', id: t.id, projeto: t.projeto, pedido: t.pedido, estado: t.estado, detalhe: t.branch ? `branch ${t.branch} · ${t.arquivos.length} arquivos` : primeira }, 20000)
    const fala = t.estado === 'pronta'
      ? `A tarefa ${t.id} do projeto ${t.projeto} está pronta. ${primeira}`
      : t.estado === 'sem mudanças' ? `A tarefa ${t.id} terminou sem mudar nenhum arquivo.` : `A tarefa ${t.id} falhou. ${primeira}`
    void avisar(fala)
  })

  // ---------- Elo com o celular ----------

  // Cartões mandados pelo processo principal (QR do pareamento, ações pedidas pelo celular)
  window.friday.aoCartao((card, ms) => hud.cartao(card, ms))

  // Ligação ou mensagem no celular enquanto você está no PC: quem avisa é o PC
  window.friday.aoEloAviso((texto, ligacao) => {
    sons.alerta()
    hud.cartao({ tipo: 'aviso', titulo: ligacao ? 'LIGAÇÃO NO CELULAR' : 'NO CELULAR', texto }, ligacao ? 20000 : 12000)
    void avisar(texto)
  })

  // Consulta pelo WhatsApp: ela pergunta (e já abre o microfone para a resposta) ou conta como terminou
  window.friday.aoConsulta((e) => {
    sons.alerta()
    const titulo = e.tipo === 'pergunta' ? 'CONSULTA · SUA VEZ' : e.tipo === 'qr' ? 'CONECTAR O WHATSAPP' : e.ok ? 'CONSULTA MARCADA' : 'CONSULTA'
    hud.cartao({ tipo: 'aviso', titulo, texto: e.texto }, e.tipo === 'pergunta' ? 60_000 : 20_000)
    if (conversando && live.aberta) {
      live.dizer(`(Aviso da consulta que você está marcando pelo WhatsApp. Fale isto para ele agora, em poucas palavras${e.tipo === 'pergunta' ? ', e quando ele responder chame responder_consulta' : ''}: ${e.texto})`)
      return
    }
    const vocativo = cfg.nome ? `${cfg.nome}, ` : ''
    void avisar(e.tipo === 'pergunta' ? `${vocativo}sobre a consulta: ${e.texto}` : e.texto)
    if (e.tipo !== 'pergunta' || hud.emFoco) return
    // Terminou de falar: abre a conversa para você responder sem precisar dizer "Friday"
    const inicio = performance.now()
    const vigia = window.setInterval(() => {
      if (conversando || performance.now() - inicio > 45_000) { clearInterval(vigia); return }
      if (performance.now() - inicio < 1500 || avisoFalando || falandoAgora() || speechSynthesis.speaking) return
      clearInterval(vigia)
      void iniciarConversa()
    }, 300)
  })

  // O celular pediu uma ação do HUD (projetar, rotina, foco...)
  window.friday.aoEloFerramenta((id, nome, args) => {
    void executarUma(nome, args, true)
      .then((r) => window.friday.eloResponder(id, { ok: r.ok === true, mensagem: String(r.resultado ?? ''), ...(r.precisa_confirmacao ? { precisaConfirmacao: true } : {}) }))
      .catch((e) => window.friday.eloResponder(id, { ok: false, mensagem: (e as Error).message }))
  })

  // Ação em segundo plano terminou (ex.: a Visão de Deus acabou de instalar)
  window.friday.aoAviso((texto, ok) => {
    ok ? sons.feito() : sons.alerta()
    hud.cartao({ tipo: 'aviso', titulo: ok ? 'PRONTO' : 'ATENÇÃO', texto }, 12000)
    // No meio de uma conversa, ela mesma conta (em vez de falar por cima com a voz do Windows)
    if (conversando && live.aberta) { live.dizer(`(Aviso em segundo plano. Conte isto para ele em poucas palavras: ${texto})`); return }
    void avisar(texto)
  })

  window.addEventListener('offline', () => {
    if (silenciada) return
    sons.offline()
    hud.setEstado('offline')
  })
  window.addEventListener('online', () => {
    if (reservaAtiva) hud.legenda('SISTEMA', 'A internet voltou. Na próxima vez que você me chamar, volto ao normal.')
    if (hud.estadoAtual !== 'offline') return
    sons.reconectou()
    hud.setEstado(conversando ? 'ouvindo' : micOk ? 'repouso' : 'semMic')
  })

  // ---------- Partida ----------

  await ligarMicrofone()
  void lerCadastroRostos()

  // Com a central do quarto no ar (o celular em casa), quem ouve "Friday" é ela: o PC fica só nas mãos
  window.friday.aoCentral((ativa, aparelho) => {
    centralNoAr = ativa
    console.log(ativa ? `[friday] ${aparelho} é a central: o PC não ouve "Friday"` : '[friday] a central saiu do ar: o PC volta a ouvir')
    hud.legenda('SISTEMA', ativa ? `Ouvindo pelo ${aparelho}.` : 'Voltei a ouvir aqui no PC.')
  })
  ativacao.aoDetectar = () => {
    if (centralNoAr) { console.log('[friday] ouvi "Friday", mas quem atende é a central'); return }
    console.log('[friday] ouvi "Friday"')
    void iniciarConversa()
  }
  ativacao.aoOuvir = (t) => console.log(`[friday] ativação ouviu: "${t}"`)
  const semModelo = () => {
    modoSemAtivacao = true
    hud.cartao({
      tipo: 'aviso',
      titulo: 'SEM PALAVRA DE ATIVAÇÃO',
      texto: cfg.modeloAtivacaoUrl
        ? 'O reconhecedor do "Friday" não carregou. Por enquanto, ela acorda quando ouve alguém falar.'
        : 'Rode "npm run modelo" para ela só acordar com "Friday". Por enquanto, ela acorda quando ouve alguém falar.'
    }, 15000)
  }
  // Saudação ao abrir: no máximo uma a cada 4 horas
  async function saudar(): Promise<void> {
    if (!cfg.saudacao || silenciada) return
    let ultima = 0
    try { ultima = Number(localStorage.getItem('friday.saudacao') || 0) } catch { /* sem armazenamento */ }
    if (Date.now() - ultima < 4 * 3600_000) return
    try { localStorage.setItem('friday.saudacao', String(Date.now())) } catch { /* ignora */ }
    const r = await window.friday.ferramenta('saudacao_dados', {})
    const d = r.dados as { clima: { cidade: string; temperatura: number; sensacao: number; descricao: string; icone: string; minima: number; maxima: number; chuva: number } | null; lembretes: { texto: string; hora: string }[] } | undefined
    const h = new Date().getHours()
    const ola = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
    const partes = [`${ola}${cfg.nome ? `, ${cfg.nome}` : ''}.`]
    if (d?.clima) partes.push(`Em ${d.clima.cidade.split(',')[0]}, ${d.clima.temperatura} graus e ${d.clima.descricao}${d.clima.chuva >= 50 ? `, com ${d.clima.chuva}% de chance de chuva` : ''}.`)
    const lem = d?.lembretes ?? []
    if (lem.length === 1) partes.push(`Hoje ainda tem: ${lem[0].texto}, às ${lem[0].hora}.`)
    else if (lem.length > 1) partes.push(`Hoje ainda tem ${lem.length} lembretes. O próximo é às ${lem[0].hora}: ${lem[0].texto}.`)
    const texto = partes.join(' ')
    if (d?.clima) hud.cartao({ tipo: 'clima', ...d.clima }, 12000)
    else hud.cartao({ tipo: 'aviso', titulo: ola.toUpperCase(), texto }, 10000)
    await avisar(texto)
  }
  setTimeout(() => { void saudar().catch((e) => console.warn('[friday] saudação', e)) }, 2500)

  if (cfg.modeloAtivacaoUrl) {
    const inicioModelo = performance.now()
    console.log('[friday] carregando palavra de ativação...')
    // Se o modelo não carregar em 30 s, segue sem ele em vez de ficar surda
    const desistir = setTimeout(() => { if (!ativacao.pronto) { console.error('[friday] palavra de ativação não carregou em 30 s'); semModelo() } }, 30000)
    ativacao.carregar(cfg.modeloAtivacaoUrl)
      .then(() => { clearTimeout(desistir); console.log(`[friday] palavra de ativação pronta em ${Math.round(performance.now() - inicioModelo)} ms`) })
      .catch((e) => { clearTimeout(desistir); console.error('[friday] palavra de ativação', e); semModelo() })
  } else {
    semModelo()
  }
}

void iniciar()
