// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// "Ela usa o Windows por você", a parte que não depende do Windows: em quais janelas ela pode mexer,
// quais teclas pode apertar, como achar o item pedido e como descrever a janela para a IA.

export interface Item { i: number; tipo: string; nome: string; valor: string; senha: boolean; ativo: boolean; clica: boolean }

/** Programas em que ela nunca mexe, mesmo que estejam na lista: terminais, sistema, senhas, instaladores. */
const NUNCA = /^(cmd|powershell|powershell_ise|pwsh|windowsterminal|wt|conhost|openconsole|bash|wsl|regedit|mmc|taskmgr|consent|credentialuibroker|logonui|lockapp|sechealthui|securityhealthsystray|systemsettings|keepass\w*|bitwarden|1password|lastpass|dashlane|nordpass|mstsc|anydesk|teamviewer|msiexec|setup|installer|friday|electron)$/i

/** Navegadores: neles o título da janela é o da aba, então dá para saber em que página está. */
const NAVEGADORES = /^(chrome|msedge|firefox|opera|brave|vivaldi|iexplore)$/i

/** Páginas de banco, pagamento, compra ou login (pelo título da aba). */
const PAGINA_PROIBIDA = /(?<![\p{L}\d])(banco|bank|banking|internet banking|ita[uú]|bradesco|nubank|santander|caixa econ[oô]mica|c6 bank|banco inter|sicredi|sicoob|picpay|mercado pago|paypal|pix|pagamento|pagar|payment|checkout|carrinho|cart|cart[aã]o de cr[eé]dito|fatura|boleto|login|entrar|sign in|log in|senha|password|minha conta)(?![\p{L}\d])/iu

const semExe = (p: string): string => p.trim().toLowerCase().replace(/\.exe$/, '')

/** Pode mexer na janela da frente? `permitidos` = processos da lista de programas (apps.json). */
export function podeControlar(processo: string, titulo: string, permitidos: string[]): { ok: true } | { ok: false; motivo: string } {
  const proc = semExe(processo)
  if (!proc) return { ok: false, motivo: 'Não tem nenhuma janela na frente. Abra o programa e deixe ele na frente.' }
  if (NUNCA.test(proc)) {
    return proc === 'friday' || proc === 'electron'
      ? { ok: false, motivo: 'A janela da frente é a minha. Clique no programa que você quer que eu use e me peça de novo.' }
      : { ok: false, motivo: 'Nesse programa eu não mexo (terminal, sistema, senhas ou acesso remoto). Essa parte é com você.' }
  }
  if (!permitidos.map(semExe).includes(proc)) {
    return { ok: false, motivo: `O ${processo} não está na lista de programas que eu controlo. Para liberar, coloque ele em "Editar programas permitidos" (no ícone da bandeja).` }
  }
  if (NAVEGADORES.test(proc) && PAGINA_PROIBIDA.test(titulo)) return { ok: false, motivo: 'Essa tela parece de banco, pagamento, compra ou login. Nela eu não mexo; essa parte é com você.' }
  return { ok: true }
}

/** Teclas que ela pode apertar (nenhuma fecha programa, abre terminal ou apaga arquivo). Valor = SendKeys. */
export const TECLAS: Record<string, string> = {
  enter: '{ENTER}', tab: '{TAB}', shift_tab: '+{TAB}', esc: '{ESC}', espaco: ' ', apagar: '{BACKSPACE}',
  seta_cima: '{UP}', seta_baixo: '{DOWN}', seta_esquerda: '{LEFT}', seta_direita: '{RIGHT}',
  pagina_cima: '{PGUP}', pagina_baixo: '{PGDN}', inicio: '{HOME}', fim: '{END}', f5: '{F5}',
  ctrl_s: '^s', ctrl_c: '^c', ctrl_v: '^v', ctrl_a: '^a', ctrl_z: '^z', ctrl_y: '^y', ctrl_f: '^f',
  ctrl_t: '^t', ctrl_l: '^l', ctrl_n: '^n', ctrl_w: '^w', ctrl_tab: '^{TAB}', ctrl_mais: '^{ADD}', ctrl_menos: '^{SUBTRACT}'
}
export const NOMES_TECLAS = Object.keys(TECLAS)

/** "ctrl+s", "Ctrl S", "page down", "seta pra baixo" → nome da lista (ou null). */
export function nomeDaTecla(pedido: string): string | null {
  const t = pedido.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(pra|para|a|o)\b/g, ' ').replace(/[+\s-]+/g, '_').replace(/^_|_$/g, '')
  if (TECLAS[t]) return t
  const apelidos: Record<string, string> = {
    return: 'enter', confirma: 'enter', escape: 'esc', espaco_branco: 'espaco', space: 'espaco', backspace: 'apagar',
    cima: 'seta_cima', baixo: 'seta_baixo', esquerda: 'seta_esquerda', direita: 'seta_direita',
    page_up: 'pagina_cima', page_down: 'pagina_baixo', pgup: 'pagina_cima', pgdn: 'pagina_baixo', home: 'inicio', end: 'fim',
    atualizar: 'f5', recarregar: 'f5', salvar: 'ctrl_s', copiar: 'ctrl_c', colar: 'ctrl_v', selecionar_tudo: 'ctrl_a', desfazer: 'ctrl_z', refazer: 'ctrl_y',
    procurar: 'ctrl_f', nova_aba: 'ctrl_t', fechar_aba: 'ctrl_w', proxima_aba: 'ctrl_tab', zoom_mais: 'ctrl_mais', zoom_menos: 'ctrl_menos'
  }
  return apelidos[t] ?? apelidos[t.replace(/^seta_/, '')] ?? null
}

const sem = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** O item pedido: pelo número da lista ou pelo texto (igual primeiro, depois o que contém; prefere o que dá para clicar). */
export function acharItem(itens: Item[], indice: number | null, texto: string): Item | null {
  if (indice !== null && Number.isFinite(indice)) return itens.find((e) => e.i === indice) ?? null
  const t = sem(texto)
  if (!t) return null
  const ordem = (lista: Item[]) => lista.sort((a, b) => Number(b.clica && b.ativo) - Number(a.clica && a.ativo))
  const iguais = ordem(itens.filter((e) => sem(e.nome) === t))
  if (iguais.length) return iguais[0]
  return ordem(itens.filter((e) => sem(e.nome).includes(t)))[0] ?? null
}

/** A janela em texto para a IA: uma linha por item. */
export function descreverJanela(itens: Item[], limite = 120): string {
  return itens.slice(0, limite).map((e) => {
    const campo = e.tipo === 'Edit' || e.tipo === 'ComboBox'
    const marcas = [campo ? 'campo' : e.clica ? '' : 'texto', e.senha ? 'SENHA, não mexa' : '', e.ativo ? '' : 'desativado'].filter(Boolean).join(', ')
    return `#${e.i} ${e.tipo}${marcas ? ` (${marcas})` : ''}: ${e.nome || '(sem nome)'}${e.valor ? ` = "${e.valor}"` : ''}`
  }).join('\n')
}

/** Limite de passos por pedido (cada clique, texto ou tecla conta um). */
export const MAX_PASSOS = 15
