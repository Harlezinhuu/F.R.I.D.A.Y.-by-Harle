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
import { FalaFish } from './voz/fish'
import type { ItemDiagnostico, Lembrete } from '../../shared/types'

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
  // Medição da demora de cada etapa da resposta
  let marcaFimFala = 0, marcaTexto = 0, marcaPedidoVoz = 0

  let memoriaDaConversa = ''
  let vigiaFerramenta = 0
  let alertaPendente = false
  let turnosDesdeAlerta = 0
  let encerrarAoTerminar = false
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
      atividade()
    },
    aoTextoFriday(t) {
      if (!textoFriday && !marcaTexto) marcaTexto = performance.now()
      fala?.adicionar(t)
      textoFriday += t
      hud.legenda('FRIDAY', textoFriday.trim())
    },
    aoInterrompido() {
      // Você falou por cima: ela para na hora
      fala?.cancelar()
      alto.limpar()
      textoFriday = ''
      primeiroAudioDoTurno = true
      marcaTexto = marcaPedidoVoz = 0
      if (!alertaPendente) hud.setEstado('ouvindo')
    },
    aoFimDoTurno() {
      fala?.finalizar()
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
    if (conversando || silenciada || !micOk) return
    if (!cfg.apiKey) {
      sons.erro()
      hud.cartao({ tipo: 'aviso', titulo: 'FALTA CONFIGURAR', texto: 'Coloque sua GEMINI_API_KEY no arquivo .env e reinicie a FRIDAY.' }, 10000)
      return
    }
    if (!navigator.onLine) { sons.offline(); hud.setEstado('offline'); return }

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
      // O que ela sabe sobre você entra no começo de cada conversa
      memoriaDaConversa = (await window.friday.ferramenta('memoria_para_prompt', {}).catch(() => ({ mensagem: '' }))).mensagem
      console.log('[friday] conectando ao Gemini...')
      await live.conectar(memoriaDaConversa)
      console.log('[friday] conectado ao Gemini')
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
    fala?.cancelar()
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
      } else if (nome === 'mostrar_cena') {
        // Responde na hora para a fala não esperar; a foto aparece quando chegar
        const termo = String(args.termo ?? '').trim()
        if (cfg.cenas && termo) {
          void window.friday.ferramenta('buscar_cena', { termo }).then((r) => { if (r.ok && r.card && conversando) hud.cena(r.card) })
        }
        resposta = { ok: true, resultado: cfg.cenas ? 'Mostrando na tela. Continue a resposta normalmente.' : 'As cenas estão desligadas.' }
      } else {
        const inicio = performance.now()
        const r = await Promise.race([
          window.friday.ferramenta(nome, args),
          esperar(20000).then(() => ({ ok: false, mensagem: 'A ação demorou demais e foi interrompida.' }) as Awaited<ReturnType<typeof window.friday.ferramenta>>)
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
        // Guardar na memória acontece em silêncio, sem som de "feito"
        const silenciosa = nome === 'memorizar'
        if (r.ok) { if (!silenciosa) { sons.feito(); hud.registrarAcao(r.mensagem) } } else if (!r.precisaConfirmacao && !silenciosa) sons.erro()
        resposta = { ok: r.ok, resultado: r.mensagem, ...(r.precisaConfirmacao ? { precisa_confirmacao: true } : {}) }
      }
      respostas.push({ id: c.id, name: nome, response: resposta })
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
    if (!conversando && hud.estadoAtual === 'falando' && !falandoAgora() && !avisoFalando) hud.setEstado(estadoDeRepouso())
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

  ativacao.aoDetectar = () => { console.log('[friday] ouvi "Friday"'); void iniciarConversa() }
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
