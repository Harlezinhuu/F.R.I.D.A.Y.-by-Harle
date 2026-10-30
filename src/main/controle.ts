// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ela usa o Windows por você: lê a janela aberta (botões, campos e textos, numerados), vê a tela,
// clica, digita, aperta teclas e rola, passo a passo, como no controle da tela do celular.
//
// Limites (no código, não só na instrução):
// - só nos programas da sua lista (apps.json); terminal, Registro, Gerenciador de Tarefas, cofres de
//   senha, acesso remoto e telas de segurança do Windows nunca;
// - no navegador, páginas de banco, pagamento, compra ou login: não mexe;
// - nunca digita nem clica em campo de senha;
// - botões de pagar, comprar, enviar, apagar ou confirmar pedem a sua confirmação antes;
// - no máximo 15 passos seguidos; depois ela pergunta se pode continuar.

import { desktopCapturer, screen, type BrowserWindow } from 'electron'
import { carregarApps } from './apps'
import { clicarItem, digitarItem, janelaAtiva, lerJanela, rolarJanela, teclaJanela, type ItemJanela } from './winctl'
import { botaoSensivel } from '../../mobile/src/celular-logica'
import { acharItem, descreverJanela, MAX_PASSOS, nomeDaTecla, NOMES_TECLAS, podeControlar, TECLAS } from './logica/controle'

type Resultado = { ok: boolean; mensagem: string; precisaConfirmacao?: boolean; dados?: unknown }

let ultima: { titulo: string; itens: ItemJanela[] } | null = null
let passos = 0
let ultimoPasso = 0

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function conferir(): Promise<{ ok: true; processo: string } | { ok: false; motivo: string }> {
  let j: { titulo: string; processo: string }
  try {
    j = await janelaAtiva()
  } catch (e) {
    return { ok: false, motivo: `Não consegui ver a janela: ${(e as Error).message}` }
  }
  const permitidos = carregarApps().map((a) => a.processo ?? '').filter(Boolean)
  const p = podeControlar(j.processo, j.titulo, permitidos)
  return p.ok ? { ok: true, processo: j.processo } : p
}

/** Conta um passo (clique, texto, tecla, rolagem). Depois de 90 s parado, a conta recomeça. */
function contarPasso(): string | null {
  if (Date.now() - ultimoPasso > 90_000) passos = 0
  if (passos >= MAX_PASSOS) return `Já fiz ${MAX_PASSOS} passos seguidos. Pergunte se ele quer que você continue; se ele disser que sim, chame ver_janela com continuar=true.`
  passos++
  ultimoPasso = Date.now()
  return null
}

/** Foto da tela (sem o HUD na frente), pequena, para ela ver o que a lista de itens não diz. */
async function fotoDaTela(win: BrowserWindow | null): Promise<string> {
  const d = screen.getPrimaryDisplay()
  const escala = Math.min(1, 1280 / d.size.width)
  win?.setOpacity(0)
  await esperar(150)
  try {
    const fontes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * escala), height: Math.round(d.size.height * escala) } })
    const f = fontes.find((x) => x.display_id === String(d.id)) ?? fontes[0]
    return f && !f.thumbnail.isEmpty() ? f.thumbnail.toJPEG(60).toString('base64') : ''
  } finally {
    win?.setOpacity(1)
  }
}

/** Lê a janela da frente (e tira a foto da tela, que o HUD manda para a IA ver). */
export async function verJanela(win: BrowserWindow | null, continuar = false, comFoto = true): Promise<Resultado> {
  const c = await conferir()
  if (!c.ok) return { ok: false, mensagem: c.motivo }
  if (continuar) passos = 0
  ultima = await lerJanela()
  const imagem = comFoto ? await fotoDaTela(win).catch(() => '') : ''
  const itens = descreverJanela(ultima.itens)
  return {
    ok: true,
    mensagem: `Janela: ${ultima.titulo || c.processo} (${c.processo}).\n${itens || '(este programa não mostra os itens; use a imagem da tela e as teclas)'}${imagem ? '\nA imagem da tela foi enviada junto.' : ''}`,
    ...(imagem ? { dados: { imagem } } : {})
  }
}

/** Depois de agir: espera a janela reagir e lê de novo, para ela ver o resultado. */
async function depois(ms: number): Promise<string> {
  await esperar(ms)
  const c = await conferir()
  if (!c.ok) { ultima = null; return `\n(Agora a janela da frente é outra: ${c.motivo})` }
  try {
    ultima = await lerJanela()
    return `\nJanela agora: ${ultima.titulo}\n${descreverJanela(ultima.itens, 80)}`
  } catch {
    return ''
  }
}

export async function clicar(indice: number | null, texto: string, confirmado: boolean): Promise<Resultado> {
  const c = await conferir()
  if (!c.ok) return { ok: false, mensagem: c.motivo }
  if (!ultima) return { ok: false, mensagem: 'Leia a janela primeiro com ver_janela.' }
  const alvo = acharItem(ultima.itens, indice, texto)
  if (!alvo) return { ok: false, mensagem: 'Não achei esse item. Leia a janela de novo com ver_janela.' }
  if (alvo.senha) return { ok: false, mensagem: 'Esse é um campo de senha. Nele eu não mexo; essa parte é com ele.' }
  if (!alvo.ativo) return { ok: false, mensagem: `"${alvo.nome}" está desativado agora.` }
  if (botaoSensivel(alvo.nome) && !confirmado) {
    return { ok: false, precisaConfirmacao: true, mensagem: `Precisa de confirmação: clicar em "${alvo.nome}". Pergunte em uma frase e, se ele confirmar, chame de novo com confirmado=true.`, dados: { pergunta: `Clicar em "${alvo.nome}"?` } }
  }
  const limite = contarPasso()
  if (limite) return { ok: false, mensagem: limite }
  await clicarItem(alvo.i)
  return { ok: true, mensagem: `Cliquei em "${alvo.nome || `#${alvo.i}`}".${await depois(700)}` }
}

export async function digitar(indice: number | null, texto: string): Promise<Resultado> {
  const c = await conferir()
  if (!c.ok) return { ok: false, mensagem: c.motivo }
  if (!texto) return { ok: false, mensagem: 'Faltou o texto.' }
  if (indice !== null) {
    const alvo = ultima?.itens.find((e) => e.i === indice)
    if (!alvo) return { ok: false, mensagem: 'Esse número não está na janela. Leia de novo com ver_janela.' }
    if (alvo.senha) return { ok: false, mensagem: 'Esse é um campo de senha. Senha eu não digito; essa parte é com ele.' }
  }
  const limite = contarPasso()
  if (limite) return { ok: false, mensagem: limite }
  // Sem número, escreve onde o cursor está (o Windows recusa se for campo de senha)
  await digitarItem(indice ?? 0, texto.slice(0, 2000))
  return { ok: true, mensagem: `Escrevi.${await depois(500)}` }
}

export async function tecla(pedido: string): Promise<Resultado> {
  const c = await conferir()
  if (!c.ok) return { ok: false, mensagem: c.motivo }
  const nome = nomeDaTecla(pedido)
  if (!nome) return { ok: false, mensagem: `Essa tecla eu não aperto. Posso: ${NOMES_TECLAS.join(', ')}.` }
  const limite = contarPasso()
  if (limite) return { ok: false, mensagem: limite }
  await teclaJanela(TECLAS[nome])
  return { ok: true, mensagem: `Apertei ${nome.replace(/_/g, '+')}.${await depois(600)}` }
}

export async function rolar(baixo: boolean): Promise<Resultado> {
  const c = await conferir()
  if (!c.ok) return { ok: false, mensagem: c.motivo }
  const limite = contarPasso()
  if (limite) return { ok: false, mensagem: limite }
  await rolarJanela(baixo)
  return { ok: true, mensagem: `Rolei para ${baixo ? 'baixo' : 'cima'}.${await depois(500)}` }
}
