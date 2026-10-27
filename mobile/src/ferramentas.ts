// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O que a FRIDAY consegue fazer no celular. As declarações são as mesmas do PC (mesmos nomes e
// parâmetros); o que muda é como cada uma é executada aqui.

import { LocalNotifications } from '@capacitor/local-notifications'
import { TOOL_DECLARATIONS, type ToolDeclaration } from '../../src/shared/tools'
import { checarFato, ehRepetido, encontrarPorTrecho, paraPrompt, CATEGORIAS, type Categoria, type Fato } from '../../src/main/logica/memoria'
import { descreverTempo } from '../../src/main/logica/clima'
import { lerAjustes, lerLista, salvarLista } from './armazem'

const NOMES = [
  'criar_lembrete', 'criar_timer', 'listar_lembretes', 'cancelar_lembrete', 'clima', 'pesquisar_web', 'abrir_site',
  'memorizar', 'o_que_sabe', 'esquecer', 'projetar', 'controlar_projecao', 'encerrar_conversa'
]

/** Ferramentas do celular (as do PC que fazem sentido aqui). */
export const FERRAMENTAS_CELULAR: ToolDeclaration[] = TOOL_DECLARATIONS.filter((t) => NOMES.includes(t.name))
  // No celular, projeção só de formas e funções (desenhadas na hora)
  .map((t) => t.name === 'projetar' ? { ...t, description: 'Projeta um holograma 3D na tela de voz: formas da ciência (Möbius, toro, DNA, átomo, tesseract, sistema solar, Lorenz, galáxia, buraco negro, sólidos, onda, sela) ou funções z = f(x, y, t).' } : t)

export function instrucoes(nome: string, memoria: string, extra = ''): string {
  const quem = nome ? `o ${nome}` : 'o usuário'
  const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  return [
    `Você é F.R.I.D.A.Y, a assistente pessoal de ${quem}, agora no celular dele (Android).`,
    'Fale sempre em português do Brasil. Personalidade: calma, rápida e eficiente, com humor seco e um toque de ironia. Nunca bajuladora.',
    'Vá direto ao ponto, sem "claro!" ou "com certeza!". Nunca diga que fez algo sem ter chamado a ferramenta e recebido sucesso.',
    'Lembretes viram notificações no celular. Quando o usuário contar algo duradouro sobre si, chame memorizar em silêncio.',
    'Se pedirem algo que só a FRIDAY do PC faz (abrir programas, arquivos do PC), diga que ainda não está ligada ao PC.',
    extra,
    `Agora é ${data} (horário de Brasília).`,
    ...(memoria ? ['', 'O que você já sabe sobre o usuário (use com naturalidade, sem recitar):', memoria] : [])
  ].filter(Boolean).join('\n')
}

export interface Resultado { ok: boolean; mensagem: string }
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

async function local(cidade: string): Promise<{ nome: string; lat: number; lon: number }> {
  if (cidade) {
    const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt&format=json`)).json()
    const x = r.results?.[0]
    if (!x) throw new Error(`Não achei a cidade "${cidade}".`)
    return { nome: x.name, lat: x.latitude, lon: x.longitude }
  }
  const pos = await new Promise<GeolocationPosition>((ok, erro) => navigator.geolocation.getCurrentPosition(ok, erro, { timeout: 8000, maximumAge: 30 * 60_000 }))
  return { nome: 'onde você está', lat: pos.coords.latitude, lon: pos.coords.longitude }
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
        const l = await local(str(a.cidade) || aj.cidade)
        const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto`)).json()
        return { ok: true, mensagem: `${l.nome}: ${Math.round(d.current.temperature_2m)} graus, ${descreverTempo(d.current.weather_code)}, sensação de ${Math.round(d.current.apparent_temperature)}. Mínima ${Math.round(d.daily.temperature_2m_min[0])}, máxima ${Math.round(d.daily.temperature_2m_max[0])}, ${d.daily.precipitation_probability_max[0] ?? 0}% de chance de chuva.` }
      }
      case 'pesquisar_web':
        window.open(`https://www.google.com/search?q=${encodeURIComponent(str(a.consulta))}`, '_blank')
        return { ok: true, mensagem: 'Pesquisa aberta no navegador.' }
      case 'abrir_site': {
        const url = str(a.url)
        if (!/^https:\/\/[^\s]+$/i.test(url)) return { ok: false, mensagem: 'Só abro endereços https.' }
        window.open(url, '_blank')
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
      default: return { ok: false, mensagem: `Isso eu ainda não faço no celular (${nome}).` }
    }
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message || 'Algo deu errado.' }
  }
}
