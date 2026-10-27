// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O que a FRIDAY consegue fazer no celular. As declarações são as mesmas do PC (mesmos nomes e
// parâmetros); o que muda é como cada uma é executada aqui.

import { LocalNotifications } from '@capacitor/local-notifications'
import { TOOL_DECLARATIONS, type ToolDeclaration } from '../../src/shared/tools'
import { checarFato, ehRepetido, encontrarPorTrecho, paraPrompt, CATEGORIAS, type Categoria, type Fato } from '../../src/main/logica/memoria'
import { acharLocal, buscarPrevisao, resumir, type Local } from '../../src/shared/tempo'
import { buscarNaInternet, paraFala } from '../../src/shared/busca'
import { lerAjustes, lerAvisos, lerLista, salvarAvisos, salvarLista } from './armazem'
import { Celular, explicarErro, garantir, nativo } from './celular'
import {
  acharApp, acharContato, botaoSensivel, diasDoAlarme, horaMinuto, normalizar, numeroWhatsapp, pareceNumero, resumirTela,
  type App, type Contato, type Tela
} from './celular-logica'

const NOMES = [
  'criar_lembrete', 'criar_timer', 'listar_lembretes', 'cancelar_lembrete', 'clima', 'buscar_na_internet', 'pesquisar_web', 'abrir_site',
  'memorizar', 'o_que_sabe', 'esquecer', 'projetar', 'controlar_projecao', 'encerrar_conversa'
]

const S = (description: string, e?: string[]) => ({ type: 'STRING' as const, description, ...(e ? { enum: e } : {}) })
const N = (description: string) => ({ type: 'NUMBER' as const, description })
const B = (description: string) => ({ type: 'BOOLEAN' as const, description })
const CONFIRMADO = B('true só depois que o usuário confirmou em voz alta.')

/** Controle do próprio celular. */
const FERRAMENTAS_TELEFONE: ToolDeclaration[] = [
  { name: 'abrir_app', description: 'Abre um app instalado no celular pelo nome ("abre o Spotify", "abre o zap").', parameters: { type: 'OBJECT', properties: { nome: S('Nome do app como o usuário falou.') }, required: ['nome'] } },
  { name: 'lanterna', description: 'Liga ou desliga a lanterna.', parameters: { type: 'OBJECT', properties: { ligar: B('true liga, false desliga.') }, required: ['ligar'] } },
  {
    name: 'volume_celular',
    description: 'Muda o volume do celular: nível de 0 a 100, ou subir, descer, mudo e som.',
    parameters: { type: 'OBJECT', properties: { fluxo: S('Qual volume. Padrão: midia.', ['midia', 'toque', 'alarme', 'notificacao']), nivel: N('Nível de 0 a 100.'), acao: S('Ajuste relativo.', ['subir', 'descer', 'mudo', 'som']) } }
  },
  { name: 'midia', description: 'Controla a música ou vídeo que está tocando em qualquer app.', parameters: { type: 'OBJECT', properties: { acao: S('O que fazer.', ['tocar', 'pausar', 'alternar', 'proxima', 'anterior']) }, required: ['acao'] } },
  {
    name: 'alarme',
    description: 'Cria um alarme no relógio do celular ("me acorda às 6:30", "alarme 7h dias úteis").',
    parameters: { type: 'OBJECT', properties: { hora: S('Hora, ex.: "06:30" ou "19h".'), rotulo: S('Nome do alarme (opcional).'), dias: S('Repetição: vazio = uma vez, "dias úteis", "todo dia", "fim de semana" ou dias como "segunda e quarta".') }, required: ['hora'] }
  },
  { name: 'bateria', description: 'Diz quanto de bateria o celular tem e se está carregando.' },
  {
    name: 'ajustes_celular',
    description: 'Abre um ajuste do Android. Wi-Fi, Bluetooth e dados não podem ser ligados direto por apps: abra o painel e, com o controle da tela ativo, toque no botão certo.',
    parameters: { type: 'OBJECT', properties: { qual: S('Qual ajuste.', ['wifi', 'bluetooth', 'internet', 'dados_moveis', 'aviao', 'volume', 'nfc', 'brilho', 'localizacao', 'nao_perturbe', 'bateria', 'som', 'apps', 'acessibilidade', 'geral']) }, required: ['qual'] }
  },
  { name: 'brilho', description: 'Muda o brilho da tela de 0 a 100.', parameters: { type: 'OBJECT', properties: { nivel: N('Brilho de 0 a 100.') }, required: ['nivel'] } },
  { name: 'nao_perturbe', description: 'Liga ou desliga o modo Não perturbe.', parameters: { type: 'OBJECT', properties: { ligar: B('true liga, false desliga.') }, required: ['ligar'] } },
  { name: 'rota', description: 'Abre a navegação no Google Maps até um lugar.', parameters: { type: 'OBJECT', properties: { destino: S('Endereço ou lugar.'), modo: S('Como ir. Padrão: carro.', ['carro', 'a_pe', 'bicicleta', 'moto']) }, required: ['destino'] } },
  {
    name: 'ligar',
    description: 'Liga para um contato ou número. Antes, diga para quem vai ligar e espere ele confirmar; só então chame com confirmado=true.',
    parameters: { type: 'OBJECT', properties: { contato: S('Nome do contato ou número.'), confirmado: CONFIRMADO }, required: ['contato'] }
  },
  {
    name: 'enviar_mensagem',
    description: 'Manda SMS ou WhatsApp. Antes, leia para quem e o texto e espere ele confirmar; só então chame com confirmado=true.',
    parameters: { type: 'OBJECT', properties: { contato: S('Nome do contato ou número.'), texto: S('A mensagem, do jeito que vai sair.'), app: S('Por onde. Padrão: whatsapp.', ['whatsapp', 'sms']), confirmado: CONFIRMADO }, required: ['contato', 'texto'] }
  },
  { name: 'procurar_contato', description: 'Procura um contato e diz os números dele.', parameters: { type: 'OBJECT', properties: { nome: S('Nome ou parte do nome.') }, required: ['nome'] } },
  { name: 'salvar_contato', description: 'Salva um contato novo no celular.', parameters: { type: 'OBJECT', properties: { nome: S('Nome.'), numero: S('Telefone.') }, required: ['nome', 'numero'] } },
  {
    name: 'criar_evento',
    description: 'Cria um evento na agenda do celular (com aviso 15 minutos antes).',
    parameters: { type: 'OBJECT', properties: { titulo: S('Título.'), inicio_iso: S('Início em ISO 8601 no horário local, ex.: 2026-10-28T14:00:00.'), fim_iso: S('Fim em ISO 8601 (opcional; padrão: 1 hora depois).'), local: S('Local (opcional).'), descricao: S('Detalhes (opcional).'), dia_inteiro: B('Evento de dia inteiro.') }, required: ['titulo', 'inicio_iso'] }
  },
  {
    name: 'agenda',
    description: 'Lista os compromissos da agenda do celular num período ("o que tenho amanhã?").',
    parameters: { type: 'OBJECT', properties: { de_iso: S('Começo do período em ISO 8601 (padrão: agora).'), ate_iso: S('Fim do período em ISO 8601 (padrão: fim de amanhã).') } }
  },
  { name: 'ler_tela', description: 'Lê o que está na tela agora (qualquer app): cada item vem com um número (#) para tocar_tela e escrever_tela.' },
  {
    name: 'tocar_tela',
    description: 'Toca num item da tela pelo número (#) de ler_tela ou pelo texto. Botões de pagar, comprar, enviar, apagar ou confirmar pedem confirmado=true depois que ele confirmar.',
    parameters: { type: 'OBJECT', properties: { indice: N('Número do item (#).'), texto: S('Texto do botão, se não tiver o número.'), confirmado: CONFIRMADO } }
  },
  {
    name: 'escrever_tela',
    description: 'Escreve num campo de texto da tela (busca, mensagem, endereço). Nunca use para senhas ou códigos.',
    parameters: { type: 'OBJECT', properties: { texto: S('O que escrever.'), indice: N('Número do campo (#); vazio = campo em foco.') }, required: ['texto'] }
  },
  { name: 'rolar_tela', description: 'Rola a tela para baixo ou para cima.', parameters: { type: 'OBJECT', properties: { direcao: S('Para onde.', ['baixo', 'cima']) }, required: ['direcao'] } },
  {
    name: 'contato_importante',
    description: 'Contatos importantes: quando eles mandam mensagem, você avisa em voz alta ("a Mãe é importante", "tira o Pedro dos importantes", "quem é importante?").',
    parameters: { type: 'OBJECT', properties: { acao: S('O que fazer.', ['adicionar', 'remover', 'listar']), nome: S('Nome do contato.') }, required: ['acao'] }
  },
  {
    name: 'avisos_por_voz',
    description: 'Liga ou desliga os avisos falados: ligações chegando, mensagens dos importantes e ler o texto das mensagens.',
    parameters: { type: 'OBJECT', properties: { ligacoes: B('Avisar ligações.'), so_importantes: B('Ligações só dos importantes.'), mensagens: B('Avisar mensagens dos importantes.'), ler_texto: B('Ler o texto das mensagens.') } }
  },
  {
    name: 'botao_sistema',
    description: 'Aperta um botão do Android: voltar, início, apps recentes, notificações, ajustes rápidos, bloquear a tela ou tirar print.',
    parameters: { type: 'OBJECT', properties: { acao: S('Qual botão.', ['voltar', 'inicio', 'recentes', 'notificacoes', 'ajustes_rapidos', 'bloquear', 'print']) }, required: ['acao'] }
  }
]

/** Ferramentas do celular (as do PC que fazem sentido aqui, mais o controle do próprio celular). */
export const FERRAMENTAS_CELULAR: ToolDeclaration[] = [
  ...TOOL_DECLARATIONS.filter((t) => NOMES.includes(t.name))
    // No celular, projeção só de formas e funções (desenhadas na hora)
    .map((t) => t.name === 'projetar' ? { ...t, description: 'Projeta um holograma 3D na tela de voz: formas da ciência (Möbius, toro, DNA, átomo, tesseract, sistema solar, Lorenz, galáxia, buraco negro, sólidos, onda, sela) ou funções z = f(x, y, t).' } : t),
  ...FERRAMENTAS_TELEFONE
]

export function instrucoes(nome: string, memoria: string, extra = ''): string {
  const quem = nome ? `o ${nome}` : 'o usuário'
  const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  return [
    `Você é F.R.I.D.A.Y, a assistente pessoal de ${quem}, agora no celular dele (Android).`,
    'Fale sempre em português do Brasil. Personalidade: calma, rápida e eficiente, com humor seco e um toque de ironia. Nunca bajuladora.',
    'Vá direto ao ponto, sem "claro!" ou "com certeza!". Nunca diga que fez algo sem ter chamado a ferramenta e recebido sucesso.',
    'Lembretes viram notificações no celular. Quando o usuário contar algo duradouro sobre si, chame memorizar em silêncio.',
    'Você controla este celular pelas ferramentas: apps, lanterna, volume, música, alarmes, brilho, Não perturbe, rotas, ligações, mensagens, agenda, contatos e, com o controle da tela ativo, o que aparece em qualquer app.',
    'Para fazer algo dentro de um app: abrir_app e depois tocar_tela, escrever_tela e rolar_tela usando os números (#) da tela. Cada ação já devolve a tela nova; use ler_tela só se precisar. No máximo 15 passos por pedido; se travar, diga onde parou.',
    'Ligações, mensagens e botões de pagar, comprar, enviar ou apagar: diga em uma frase o que vai fazer, espere ele confirmar e só então chame com confirmado=true.',
    'Nunca escreva senhas, códigos de verificação ou dados de cartão. Apps de banco e pagamento são protegidos: se pedirem, diga que essa parte é com ele.',
    'Programas e arquivos do PC ainda não: o celular não está ligado ao PC.',
    extra,
    `Agora é ${data} (horário de Brasília).`,
    ...(memoria ? ['', 'O que você já sabe sobre o usuário (use com naturalidade, sem recitar):', memoria] : [])
  ].filter(Boolean).join('\n')
}

export interface Resultado { ok: boolean; mensagem: string; /** Ação que espera o "confirma" do usuário */ confirmar?: string }
export interface Contexto {
  projetar(args: Record<string, unknown>): Promise<Resultado>
  controlarProjecao(args: Record<string, unknown>): Promise<Resultado>
  encerrar(): void
}

// ---------- Memória ----------

export const lerMemoria = (): Promise<Fato[]> => lerLista<Fato>('memoria')
export async function memoriaParaPrompt(): Promise<string> { return paraPrompt(await lerMemoria()) }

// ---------- Lembretes (notificações do Android) ----------

interface Lembrete { id: number; texto: string; quandoIso: string; repetir: string; ids: number[] }

async function agendar(texto: string, quando: Date, repetir: string, titulo = 'Lembrete da FRIDAY'): Promise<Lembrete> {
  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted' && (await LocalNotifications.requestPermissions()).display !== 'granted') {
    throw new Error('As notificações estão bloqueadas. Libere nas configurações do Android para a FRIDAY.')
  }
  const base = Math.floor(Date.now() % 1_000_000_000)
  const h = quando.getHours(), m = quando.getMinutes()
  // weekday do Android: 1 = domingo ... 7 = sábado
  const agendas =
    repetir === 'diario' ? [{ on: { hour: h, minute: m } }]
      : repetir === 'dias_uteis' ? [2, 3, 4, 5, 6].map((weekday) => ({ on: { weekday, hour: h, minute: m } }))
        : repetir === 'semanal' ? [{ on: { weekday: quando.getDay() + 1, hour: h, minute: m } }]
          : repetir === 'mensal' ? [{ on: { day: quando.getDate(), hour: h, minute: m } }]
            : [{ at: quando, allowWhileIdle: true }]
  const ids = agendas.map((_, i) => base + i)
  await LocalNotifications.schedule({ notifications: agendas.map((schedule, i) => ({ id: ids[i], title: titulo, body: texto, schedule })) })
  const l: Lembrete = { id: base, texto, quandoIso: quando.toISOString(), repetir, ids }
  await salvarLista('lembretes', [...(await lerLista<Lembrete>('lembretes')), l])
  return l
}

async function lembretesAtivos(): Promise<Lembrete[]> {
  const lista = await lerLista<Lembrete>('lembretes')
  const agora = Date.now()
  const ativos = lista.filter((l) => l.repetir !== 'nunca' || new Date(l.quandoIso).getTime() > agora)
  if (ativos.length !== lista.length) await salvarLista('lembretes', ativos)
  return ativos
}

const fmtQuando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// ---------- Clima ----------

/** Onde o usuário está: GPS do celular, a cidade dos Ajustes ou, por último, o IP. */
async function aqui(cidade: string): Promise<Local> {
  if (cidade) return acharLocal(cidade)
  try {
    const pos = await new Promise<GeolocationPosition>((ok, erro) => navigator.geolocation.getCurrentPosition(ok, erro, { timeout: 8000, maximumAge: 30 * 60_000 }))
    return { nome: 'onde você está', regiao: '', pais: '', lat: pos.coords.latitude, lon: pos.coords.longitude }
  } catch {
    const d = await (await fetch('https://ipwho.is/?fields=success,city,region,country,latitude,longitude')).json()
    if (!d.success) throw new Error('Não descobri onde você está. Coloque a sua cidade nos Ajustes.')
    return { nome: d.city, regiao: d.region ?? '', pais: d.country ?? '', lat: d.latitude, lon: d.longitude }
  }
}

// ---------- Execução ----------

export async function executar(nome: string, a: Record<string, unknown>, ctx: Contexto): Promise<Resultado> {
  try {
    switch (nome) {
      case 'criar_lembrete': {
        const quando = new Date(str(a.quando_iso))
        if (Number.isNaN(quando.getTime())) return { ok: false, mensagem: 'Data do lembrete inválida.' }
        const repetir = str(a.repetir) || 'nunca'
        if (repetir === 'nunca' && quando.getTime() < Date.now()) return { ok: false, mensagem: 'Esse horário já passou.' }
        const l = await agendar(str(a.texto), quando, repetir)
        return { ok: true, mensagem: `Lembrete "${l.texto}" para ${fmtQuando(l.quandoIso)}${repetir !== 'nunca' ? ` (${repetir.replace('_', ' ')})` : ''}.` }
      }
      case 'criar_timer': {
        const s = (Number(a.minutos) || 0) * 60 + (Number(a.segundos) || 0)
        if (s < 1) return { ok: false, mensagem: 'Faltou a duração do timer.' }
        const texto = str(a.texto) || 'Timer'
        await agendar(`${texto}: o tempo acabou.`, new Date(Date.now() + s * 1000), 'nunca', 'Timer da FRIDAY')
        return { ok: true, mensagem: `Timer de ${s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`} ligado.` }
      }
      case 'listar_lembretes': {
        const ls = await lembretesAtivos()
        return { ok: true, mensagem: ls.length ? ls.map((l) => `${l.texto} (${fmtQuando(l.quandoIso)}${l.repetir !== 'nunca' ? `, ${l.repetir}` : ''})`).join('; ') : 'Nenhum lembrete pendente.' }
      }
      case 'cancelar_lembrete': {
        const ls = await lembretesAtivos()
        const t = str(a.texto).toLowerCase()
        const alvo = a.timer === true ? ls.filter((l) => l.texto.endsWith('o tempo acabou.')) : ls.filter((l) => t && l.texto.toLowerCase().includes(t))
        if (!alvo.length) return { ok: false, mensagem: 'Não achei esse lembrete.' }
        await LocalNotifications.cancel({ notifications: alvo.flatMap((l) => l.ids.map((id) => ({ id }))) })
        await salvarLista('lembretes', ls.filter((l) => !alvo.includes(l)))
        return { ok: true, mensagem: `Cancelei: ${alvo.map((l) => l.texto).join(', ')}.` }
      }
      case 'clima': {
        const aj = await lerAjustes()
        const lugar = str(a.lugar) || str(a.cidade)
        const local = lugar ? await acharLocal(lugar) : await aqui(aj.cidade)
        const dia = /^\d{4}-\d{2}-\d{2}$/.test(str(a.data)) ? str(a.data) : undefined
        const dias = dia ? Math.max(1, Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.now()) / 86_400_000) + 2) : Math.min(16, Math.max(1, Number(a.dias) || 1))
        return { ok: true, mensagem: resumir(await buscarPrevisao(local, dias), dia) }
      }
      case 'buscar_na_internet': {
        const aj = await lerAjustes()
        return { ok: true, mensagem: paraFala(await buscarNaInternet(aj.chave, str(a.pergunta))) }
      }
      case 'pesquisar_web':
        await abrirLink(`https://www.google.com/search?q=${encodeURIComponent(str(a.consulta))}`)
        return { ok: true, mensagem: 'Pesquisa aberta no navegador.' }
      case 'abrir_site': {
        const url = str(a.url)
        if (!/^https:\/\/[^\s]+$/i.test(url)) return { ok: false, mensagem: 'Só abro endereços https.' }
        await abrirLink(url)
        return { ok: true, mensagem: 'Site aberto.' }
      }
      case 'memorizar': {
        const c = checarFato(a.fato)
        if (!c.ok) return { ok: false, mensagem: c.motivo }
        const fatos = await lerMemoria()
        if (ehRepetido(c.texto, fatos)) return { ok: true, mensagem: 'Já sabia.' }
        const categoria = (CATEGORIAS as string[]).includes(str(a.categoria)) ? (str(a.categoria) as Categoria) : 'outro'
        await salvarLista('memoria', [...fatos, { id: crypto.randomUUID(), texto: c.texto, categoria, criadoEm: new Date().toISOString() }].slice(-300))
        return { ok: true, mensagem: 'Guardado.' }
      }
      case 'o_que_sabe': {
        const fatos = await lerMemoria()
        const filtro = str(a.assunto)
        const lista = filtro ? encontrarPorTrecho(filtro, fatos) : fatos
        return { ok: true, mensagem: lista.length ? lista.map((f) => f.texto).join('; ') : 'Ainda não sei nada sobre isso.' }
      }
      case 'esquecer': {
        const fatos = await lerMemoria()
        if (a.tudo === true) {
          if (a.confirmado !== true) return { ok: false, mensagem: `Precisa de confirmação: apagar as ${fatos.length} coisas que sei sobre ele. Pergunte antes.` }
          await salvarLista('memoria', [])
          return { ok: true, mensagem: 'Memória apagada.' }
        }
        const achados = encontrarPorTrecho(str(a.trecho), fatos)
        if (!achados.length) return { ok: false, mensagem: 'Não achei isso na memória.' }
        await salvarLista('memoria', fatos.filter((f) => !achados.includes(f)))
        return { ok: true, mensagem: `Esqueci: ${achados.map((f) => f.texto).join('; ')}.` }
      }
      case 'projetar': return await ctx.projetar(a)
      case 'controlar_projecao': return await ctx.controlarProjecao(a)
      case 'encerrar_conversa': ctx.encerrar(); return { ok: true, mensagem: 'A conversa será encerrada depois da despedida.' }
      default:
        if (FERRAMENTAS_TELEFONE.some((t) => t.name === nome)) return await telefone(nome, a)
        return { ok: false, mensagem: `Isso eu ainda não faço no celular (${nome}).` }
    }
  } catch (e) {
    return { ok: false, mensagem: explicarErro(e) || 'Algo deu errado.' }
  }
}

async function abrirLink(url: string): Promise<void> {
  if (nativo()) await Celular.abrirLink({ url })
  else window.open(url, '_blank')
}

// ---------- Controle do celular ----------

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms))
let cacheApps: { quando: number; apps: App[] } | null = null
let cacheContatos: { quando: number; contatos: Contato[] } | null = null
/** Última tela lida: os rótulos de cada # (para saber se o botão pede confirmação). */
let ultimaTela: Tela | null = null

async function listaDeApps(): Promise<App[]> {
  if (!cacheApps || Date.now() - cacheApps.quando > 5 * 60_000) cacheApps = { quando: Date.now(), apps: (await Celular.apps()).apps }
  return cacheApps.apps
}

async function listaDeContatos(): Promise<Contato[]> {
  await garantir('contatos')
  if (!cacheContatos || Date.now() - cacheContatos.quando > 5 * 60_000) cacheContatos = { quando: Date.now(), contatos: (await Celular.contatos()).contatos }
  return cacheContatos.contatos
}

/** Contato pelo nome falado (ou o próprio número). */
async function destino(pedido: string): Promise<{ nome: string; numero: string } | Resultado> {
  if (pareceNumero(pedido)) return { nome: pedido, numero: pedido }
  const r = acharContato(pedido, await listaDeContatos())
  if (!r) return { ok: false, mensagem: `Não achei "${pedido}" nos contatos.` }
  if ('varios' in r) return { ok: false, mensagem: `Tenho mais de um: ${r.varios.join(', ')}. Pergunte qual.` }
  return { nome: r.contato.nome, numero: r.numero.numero }
}

/** Depois de mexer na tela, espera ela assentar e devolve o que tem nela agora. */
async function telaDepois(ms: number): Promise<string> {
  if (!(await Celular.acessibilidade()).ativa) return ''
  await esperar(ms)
  try {
    ultimaTela = await Celular.lerTela()
    return `\n${resumirTela(ultimaTela, 70)}`
  } catch (e) {
    return `\n(${explicarErro(e)})`
  }
}

const MODOS: Record<string, string> = { carro: 'd', a_pe: 'w', bicicleta: 'b', moto: 'l' }
const fmtEvento = (d: Date) => d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

async function telefone(nome: string, a: Record<string, unknown>): Promise<Resultado> {
  if (!nativo()) return { ok: false, mensagem: 'Isso só funciona no app do celular.' }
  switch (nome) {
    case 'abrir_app': {
      const { app, sugestoes } = acharApp(str(a.nome), await listaDeApps())
      if (!app) return { ok: false, mensagem: `Não achei o app "${str(a.nome)}".${sugestoes.length ? ` Parecidos: ${sugestoes.join(', ')}.` : ''}` }
      await Celular.abrirApp({ pacote: app.pacote })
      return { ok: true, mensagem: `${app.nome} aberto.${await telaDepois(1600)}` }
    }
    case 'lanterna':
      await Celular.lanterna({ ligar: a.ligar !== false })
      return { ok: true, mensagem: a.ligar !== false ? 'Lanterna ligada.' : 'Lanterna desligada.' }
    case 'volume_celular': {
      const nivel = typeof a.nivel === 'number' ? Math.round(a.nivel) : undefined
      const r = await Celular.volume({ fluxo: str(a.fluxo) || 'midia', ...(nivel !== undefined ? { nivel } : { acao: str(a.acao) || 'subir' }) })
      return { ok: true, mensagem: `Volume em ${r.nivel}%.` }
    }
    case 'midia':
      await Celular.midia({ acao: str(a.acao) || 'alternar' })
      return { ok: true, mensagem: 'Feito.' }
    case 'alarme': {
      const hm = horaMinuto(str(a.hora))
      if (!hm) return { ok: false, mensagem: 'Não entendi a hora do alarme.' }
      const dias = diasDoAlarme(str(a.dias))
      await Celular.alarme({ ...hm, rotulo: str(a.rotulo) || 'FRIDAY', dias })
      return { ok: true, mensagem: `Alarme para ${String(hm.hora).padStart(2, '0')}:${String(hm.minuto).padStart(2, '0')}${dias.length ? ` (${str(a.dias)})` : ''}.` }
    }
    case 'bateria': {
      const b = await Celular.bateria()
      return { ok: true, mensagem: `Bateria em ${b.nivel}%${b.carregando ? ', carregando' : ''}.` }
    }
    case 'ajustes_celular':
      await Celular.ajuste({ qual: str(a.qual) })
      return { ok: true, mensagem: `Ajuste aberto.${await telaDepois(1200)}` }
    case 'brilho':
      try {
        await Celular.brilho({ nivel: Math.round(Number(a.nivel) || 50) })
      } catch (e) {
        return { ok: false, mensagem: explicarErro(e).replace(/^PERMISSAO: /, '') }
      }
      return { ok: true, mensagem: `Brilho em ${Math.round(Number(a.nivel) || 50)}%.` }
    case 'nao_perturbe':
      try {
        await Celular.naoPerturbe({ ligar: a.ligar !== false })
      } catch (e) {
        return { ok: false, mensagem: explicarErro(e).replace(/^PERMISSAO: /, '') }
      }
      return { ok: true, mensagem: a.ligar !== false ? 'Não perturbe ligado.' : 'Não perturbe desligado.' }
    case 'rota':
      await Celular.rota({ destino: str(a.destino), modo: MODOS[str(a.modo)] ?? 'd' })
      return { ok: true, mensagem: `Rota para ${str(a.destino)} aberta no Maps.` }

    case 'procurar_contato': {
      const p = str(a.nome)
      const r = acharContato(p, await listaDeContatos())
      if (!r) return { ok: false, mensagem: `Não achei "${p}" nos contatos.` }
      if ('varios' in r) return { ok: true, mensagem: `Achei: ${r.varios.join(', ')}.` }
      return { ok: true, mensagem: `${r.contato.nome}: ${r.contato.numeros.map((n) => `${n.numero} (${n.tipo})`).join(', ')}.` }
    }
    case 'salvar_contato':
      await garantir('contatos')
      await Celular.salvarContato({ nome: str(a.nome), numero: str(a.numero) })
      cacheContatos = null
      return { ok: true, mensagem: `Contato ${str(a.nome)} salvo.` }
    case 'ligar': {
      const d = await destino(str(a.contato))
      if ('ok' in d) return d
      if (a.confirmado !== true) return { ok: false, confirmar: `Ligar para ${d.nome}?`, mensagem: `Precisa de confirmação: ligar para ${d.nome} (${d.numero}). Pergunte em uma frase e, se ele confirmar, chame de novo com confirmado=true.` }
      await garantir('telefone')
      await Celular.ligar({ numero: d.numero })
      return { ok: true, mensagem: `Ligando para ${d.nome}.` }
    }
    case 'enviar_mensagem': {
      const texto = str(a.texto)
      if (!texto) return { ok: false, mensagem: 'Faltou o texto da mensagem.' }
      const d = await destino(str(a.contato))
      if ('ok' in d) return d
      const app = str(a.app) === 'sms' ? 'sms' : 'whatsapp'
      const por = app === 'sms' ? 'SMS' : 'WhatsApp'
      if (a.confirmado !== true) return { ok: false, confirmar: `${por} para ${d.nome}: "${texto}"`, mensagem: `Precisa de confirmação: ${por} para ${d.nome} dizendo "${texto}". Leia para ele e, se confirmar, chame de novo com confirmado=true.` }
      if (app === 'sms') {
        await garantir('sms')
        await Celular.sms({ numero: d.numero, texto })
        return { ok: true, mensagem: `SMS enviado para ${d.nome}.` }
      }
      const r = await Celular.whatsapp({ numero: numeroWhatsapp(d.numero), texto, enviar: true })
      return r.enviado
        ? { ok: true, mensagem: `WhatsApp enviado para ${d.nome}.` }
        : { ok: true, mensagem: `Deixei a mensagem pronta no WhatsApp para ${d.nome}; falta tocar em Enviar (ative o controle da tela para eu enviar sozinha).` }
    }
    case 'criar_evento': {
      await garantir('agenda')
      const inicio = new Date(str(a.inicio_iso))
      if (Number.isNaN(inicio.getTime())) return { ok: false, mensagem: 'Data do evento inválida.' }
      const diaInteiro = a.dia_inteiro === true
      const fimLido = new Date(str(a.fim_iso))
      const fim = Number.isNaN(fimLido.getTime()) || fimLido <= inicio ? new Date(inicio.getTime() + (diaInteiro ? 86_400_000 : 3_600_000)) : fimLido
      // Dia inteiro: o Android quer meia-noite em UTC
      const ini = diaInteiro ? Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()) : inicio.getTime()
      const fi = diaInteiro ? ini + Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000)) * 86_400_000 : fim.getTime()
      await Celular.criarEvento({ titulo: str(a.titulo) || 'Evento', inicio: ini, fim: fi, local: str(a.local), descricao: str(a.descricao), diaInteiro })
      return { ok: true, mensagem: `Evento "${str(a.titulo)}" na agenda: ${diaInteiro ? inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : fmtEvento(inicio)}.` }
    }
    case 'agenda': {
      await garantir('agenda')
      const de = new Date(str(a.de_iso))
      const ate = new Date(str(a.ate_iso))
      const inicio = Number.isNaN(de.getTime()) ? new Date() : de
      const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(23, 59, 59, 0)
      const fim = Number.isNaN(ate.getTime()) || ate <= inicio ? amanha : ate
      const { eventos } = await Celular.eventos({ de: inicio.getTime(), ate: fim.getTime() })
      if (!eventos.length) return { ok: true, mensagem: 'Nada na agenda nesse período.' }
      return { ok: true, mensagem: eventos.map((e) => `${e.titulo} (${e.diaInteiro ? new Date(e.inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' }) + ', dia inteiro' : fmtEvento(new Date(e.inicio))}${e.local ? `, ${e.local}` : ''})`).join('; ') }
    }

    case 'contato_importante': {
      const av = await lerAvisos()
      const acao = str(a.acao) || 'listar'
      if (acao === 'listar') return { ok: true, mensagem: av.importantes.length ? `Importantes: ${av.importantes.join(', ')}.` : 'Nenhum contato importante ainda.' }
      const pedido = str(a.nome)
      if (!pedido) return { ok: false, mensagem: 'Faltou o nome do contato.' }
      if (acao === 'remover') {
        const p = normalizar(pedido)
        const fica = av.importantes.filter((n) => { const x = normalizar(n); return !(x === p || x.startsWith(p + ' ') || p.startsWith(x + ' ')) })
        if (fica.length === av.importantes.length) return { ok: false, mensagem: `${pedido} não estava nos importantes.` }
        await salvarAvisos({ ...av, importantes: fica })
        return { ok: true, mensagem: `${pedido} saiu dos importantes.` }
      }
      // Usa o nome exato dos contatos, que é o que aparece nas notificações
      let nomeSalvo = pedido
      try {
        const r = acharContato(pedido, await listaDeContatos())
        if (r && 'varios' in r) return { ok: false, mensagem: `Tenho mais de um: ${r.varios.join(', ')}. Pergunte qual.` }
        if (r) nomeSalvo = r.contato.nome
      } catch { /* sem permissão de contatos: guarda como foi falado */ }
      if (!av.importantes.includes(nomeSalvo)) await salvarAvisos({ ...av, importantes: [...av.importantes, nomeSalvo] })
      const ativo = (await Celular.avisosAtivos()).ativo
      return { ok: true, mensagem: `${nomeSalvo} agora é importante: aviso quando mandar mensagem.${ativo ? '' : ' Falta liberar o acesso às notificações em Ajustes > Avisos por voz.'}` }
    }
    case 'avisos_por_voz': {
      const av = await lerAvisos()
      const novo = {
        ...av,
        ...(typeof a.ligacoes === 'boolean' ? { ligacoes: a.ligacoes } : {}),
        ...(typeof a.so_importantes === 'boolean' ? { soImportantes: a.so_importantes } : {}),
        ...(typeof a.mensagens === 'boolean' ? { mensagens: a.mensagens } : {}),
        ...(typeof a.ler_texto === 'boolean' ? { lerTexto: a.ler_texto } : {})
      }
      await salvarAvisos(novo)
      const partes = [novo.ligacoes ? `ligações${novo.soImportantes ? ' dos importantes' : ''}` : '', novo.mensagens ? `mensagens dos importantes${novo.lerTexto ? ' (lendo o texto)' : ''}` : ''].filter(Boolean)
      return { ok: true, mensagem: partes.length ? `Aviso por voz: ${partes.join(' e ')}.` : 'Avisos por voz desligados.' }
    }
    case 'ler_tela':
      ultimaTela = await Celular.lerTela()
      return { ok: true, mensagem: resumirTela(ultimaTela) }
    case 'tocar_tela': {
      const indice = typeof a.indice === 'number' ? Math.round(a.indice) : undefined
      const rotulo = indice !== undefined ? ultimaTela?.elementos.find((e) => e.i === indice)?.texto ?? '' : str(a.texto)
      if (indice === undefined && !rotulo) return { ok: false, mensagem: 'Diga o número (#) ou o texto do item.' }
      if (botaoSensivel(rotulo) && a.confirmado !== true) {
        return { ok: false, confirmar: `Tocar em "${rotulo}"?`, mensagem: `Precisa de confirmação: tocar em "${rotulo}". Pergunte em uma frase e, se ele confirmar, chame de novo com confirmado=true.` }
      }
      const r = await Celular.tocar(indice !== undefined ? { indice } : { texto: rotulo })
      return { ok: true, mensagem: `Toquei em "${r.rotulo || rotulo}".${await telaDepois(900)}` }
    }
    case 'escrever_tela': {
      const indice = typeof a.indice === 'number' ? Math.round(a.indice) : undefined
      if (indice !== undefined && ultimaTela?.elementos.find((e) => e.i === indice)?.senha) return { ok: false, mensagem: 'Esse campo é de senha. Não digito senhas.' }
      await Celular.escrever({ ...(indice !== undefined ? { indice } : {}), texto: str(a.texto) })
      return { ok: true, mensagem: `Escrevi.${await telaDepois(700)}` }
    }
    case 'rolar_tela':
      await Celular.rolar({ direcao: str(a.direcao) === 'cima' ? 'cima' : 'baixo' })
      return { ok: true, mensagem: `Rolei.${await telaDepois(600)}` }
    case 'botao_sistema':
      await Celular.botao({ acao: str(a.acao) || 'voltar' })
      return { ok: true, mensagem: `Feito.${['voltar', 'inicio', 'recentes', 'notificacoes', 'ajustes_rapidos'].includes(str(a.acao)) ? await telaDepois(800) : ''}` }
  }
  return { ok: false, mensagem: `Isso eu ainda não faço no celular (${nome}).` }
}
