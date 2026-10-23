// Cérebro do HUD: liga microfone, palavra de ativação, Gemini Live, ferramentas e interface.
//
// Fluxo: repouso no canto da tela → ouve "Friday" no seu PC → abre a conversa com o Gemini
// e expande o HUD → conversa → silêncio ou "pode descansar" → volta para o canto.

import { Hud } from './hud/hud'
import { sons } from './hud/sons'
import { Microfone, Alto, pcm16Base64 } from './voz/audio'
import { SessaoLive, type ChamadaFerramenta } from './voz/live'
import { PalavraAtivacao } from './voz/ativacao'

const LIMIAR_FALA = 0.02 // nível RMS a partir do qual consideramos que alguém está falando
const BLOCOS_PRE_ROLL = 20 // 20 blocos de 40 ms: o áudio logo antes da ativação também vai para a IA
const BLOCOS_GATILHO_SEM_MODELO = 8 // sem modelo de ativação: fala contínua de ~320 ms abre a conversa
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function iniciar(): Promise<void> {
  const hud = new Hud()
  const cfg = await window.friday.config()
  const mic = new Microfone()
  const alto = new Alto()
  const ativacao = new PalavraAtivacao()

  let conversando = false
  let conectando = false
  let silenciada = false
  let micOk = false
  let modoSemAtivacao = false
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

  let alertaPendente = false
  let turnosDesdeAlerta = 0
  let encerrarAoTerminar = false
  let tentativasReconexao = 0

  const atividade = () => { ultimaAtividade = performance.now() }

  const live = new SessaoLive(cfg, {
    aoAudio(b64) {
      if (primeiroAudioDoTurno) {
        primeiroAudioDoTurno = false
        turnoUsuarioFechado = true
        if (fimFalaUsuario) { hud.latencia(performance.now() - fimFalaUsuario); fimFalaUsuario = 0 }
      }
      alto.enfileirar(b64)
      hud.setEstado('falando')
      atividade()
    },
    aoTextoUsuario(t) {
      if (turnoUsuarioFechado) { textoUsuario = ''; turnoUsuarioFechado = false }
      textoUsuario += t
      hud.legenda('VOCÊ', textoUsuario.trim())
      atividade()
    },
    aoTextoFriday(t) {
      textoFriday += t
      hud.legenda('FRIDAY', textoFriday.trim())
    },
    aoInterrompido() {
      // Você falou por cima: ela para na hora
      alto.limpar()
      textoFriday = ''
      primeiroAudioDoTurno = true
      if (!alertaPendente) hud.setEstado('ouvindo')
    },
    aoFimDoTurno() {
      primeiroAudioDoTurno = true
      textoFriday = ''
      if (alertaPendente && ++turnosDesdeAlerta >= 2) limparAlerta()
    },
    aoFerramentas(chamadas) { void executarFerramentas(chamadas) },
    aoAvisoDeFim() { void reconectar(true) },
    aoFechar(inesperado, motivo) {
      if (!inesperado || !conversando || conectando) return
      console.warn('[friday] conexão caiu:', motivo)
      void reconectar(false)
    }
  })

  // ---------- Conversa ----------

  async function iniciarConversa(): Promise<void> {
    if (conversando || silenciada || !micOk) return
    if (!cfg.apiKey) {
      sons.erro()
      hud.cartao({ tipo: 'aviso', titulo: 'FALTA CONFIGURAR', texto: 'Coloque sua GEMINI_API_KEY no arquivo .env e reinicie a FRIDAY.' }, 10000)
      return
    }
    if (!navigator.onLine) { sons.offline(); hud.setEstado('offline'); return }

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
      await live.conectar()
    } catch (e) {
      console.error('[friday] não conectou', e)
      conectando = false
      conversando = false
      sons.offline()
      hud.setEstado('offline')
      hud.legenda('SISTEMA', 'Não consegui conectar ao Gemini. Confira a internet e a chave da API.')
      await esperar(4000)
      if (!conversando && !silenciada) { hud.setEstado(micOk ? 'repouso' : 'semMic'); hud.compactar() }
      return
    }
    conectando = false
    for (const b of filaConexao) live.enviarAudio(b)
    filaConexao = []
    atividade()
  }

  function encerrarConversa(despedida: boolean): void {
    if (!conversando) return
    conversando = false
    conectando = false
    filaConexao = []
    live.fechar()
    limparAlerta()
    encerrarAoTerminar = false
    if (despedida) sons.despedida()
    hud.setEstado(silenciada ? 'silenciada' : micOk ? 'repouso' : 'semMic')
    hud.compactar()
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
      await live.conectar()
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

  // ---------- Ferramentas ----------

  async function executarFerramentas(chamadas: ChamadaFerramenta[]): Promise<void> {
    hud.setEstado('pensando')
    sons.entendi()
    atividade()
    const respostas: { id?: string; name?: string; response: Record<string, unknown> }[] = []

    for (const c of chamadas) {
      const nome = c.name ?? ''
      const args = c.args ?? {}
      let resposta: Record<string, unknown>

      if (nome === 'mostrar_painel') {
        hud.painel(String(args.painel ?? 'tudo') as 'sistema' | 'modulos' | 'tudo' | 'fechar')
        resposta = { ok: true, resultado: 'Pronto.' }
      } else if (nome === 'encerrar_conversa') {
        encerrarAoTerminar = true
        resposta = { ok: true, resultado: 'A conversa será encerrada depois da sua despedida.' }
      } else {
        const r = await window.friday.ferramenta(nome, args)
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
        if (r.ok) { sons.feito(); hud.registrarAcao(r.mensagem) } else if (!r.precisaConfirmacao) sons.erro()
        resposta = { ok: r.ok, resultado: r.mensagem, ...(r.precisaConfirmacao ? { precisa_confirmacao: true } : {}) }
      }
      respostas.push({ id: c.id, name: nome, response: resposta })
    }
    live.responderFerramentas(respostas)
    atividade()
  }

  // ---------- Microfone ----------

  mic.aoBloco = (amostras, rms) => {
    nivelMic = rms
    if (silenciada) return

    if (!conversando) {
      preRoll.push(amostras)
      if (preRoll.length > BLOCOS_PRE_ROLL) preRoll.shift()
      if (ativacao.pronto) {
        ativacao.alimentar(amostras)
      } else if (modoSemAtivacao) {
        blocosFalaSeguidos = rms > LIMIAR_FALA * 1.5 ? blocosFalaSeguidos + 1 : 0
        if (blocosFalaSeguidos >= BLOCOS_GATILHO_SEM_MODELO) { blocosFalaSeguidos = 0; void iniciarConversa() }
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

  // ---------- Ciclo do HUD ----------

  setInterval(() => {
    const agora = performance.now()
    hud.nucleo.setNivel(alto.tocando ? alto.nivel() : nivelMic)
    if (!conversando || conectando) return

    if (hud.estadoAtual === 'falando' && !alto.tocando) hud.setEstado(alertaPendente ? 'alerta' : 'ouvindo')
    if (hud.estadoAtual === 'pensando' && fimFalaUsuario && agora - fimFalaUsuario > 8000) { fimFalaUsuario = 0; hud.setEstado('ouvindo') }
    if (encerrarAoTerminar && !alto.tocando && agora - ultimaAtividade > 1500) { encerrarConversa(true); return }
    if (!alto.tocando && !alertaPendente && agora - ultimaAtividade > cfg.silencioSegundos * 1000) encerrarConversa(false)
  }, 100)

  // ---------- Eventos do sistema ----------

  window.friday.aoSilenciar((v) => {
    silenciada = v
    if (v) {
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

  window.friday.aoLembrete((l) => {
    sons.alerta()
    hud.cartao({ tipo: 'lembrete', texto: l.texto, quandoIso: l.quandoIso, disparou: true }, 30000)
  })

  window.addEventListener('offline', () => {
    if (silenciada) return
    sons.offline()
    hud.setEstado('offline')
  })
  window.addEventListener('online', () => {
    if (hud.estadoAtual !== 'offline') return
    sons.reconectou()
    hud.setEstado(conversando ? 'ouvindo' : micOk ? 'repouso' : 'semMic')
  })

  // ---------- Partida ----------

  await ligarMicrofone()

  ativacao.aoDetectar = () => void iniciarConversa()
  const semModelo = () => {
    modoSemAtivacao = true
    hud.cartao({
      tipo: 'aviso',
      titulo: 'SEM PALAVRA DE ATIVAÇÃO',
      texto: 'Rode "npm run modelo" para ela só acordar com "Friday". Por enquanto, ela acorda quando ouve alguém falar.'
    }, 15000)
  }
  if (cfg.modeloAtivacaoUrl) {
    ativacao.carregar(cfg.modeloAtivacaoUrl).catch((e) => { console.error('[friday] palavra de ativação', e); semModelo() })
  } else {
    semModelo()
  }
}

void iniciar()
