// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Pesquisa profunda, a parte que não depende do Windows: os pedidos ao Gemini (planejar, pesquisar
// cada parte, escrever o relatório), ler as respostas, numerar as fontes e montar a página.

export interface Pergunta { pergunta: string; busca: string }
export interface Plano { titulo: string; perguntas: Pergunta[] }
export interface Fonte { titulo: string; url: string }
export interface Parte { pergunta: string; texto: string; fontes: Fonte[] }
export interface Local { nome: string; pasta: string; trecho: string }

const limpar = (s: unknown): string => (typeof s === 'string' ? s.trim() : '')

export function promptPlano(tema: string, foco: string, hoje: string): string {
  return [
    `Você vai planejar uma pesquisa profunda sobre: "${tema}".`,
    ...(foco ? [`O que ele quer saber em especial: ${foco}.`] : []),
    `Hoje é ${hoje}.`,
    'Quebre em 4 a 6 perguntas que, respondidas juntas, cobrem o tema de verdade (o que é, opções, prós e contras, números atuais, riscos, o que decidir).',
    'Para cada pergunta, escreva também a busca no Google que melhor responde (curta, em português ou inglês, o que der melhores resultados).',
    'Responda só com JSON: {"titulo": "título curto do relatório", "perguntas": [{"pergunta": "...", "busca": "..."}]}'
  ].join('\n')
}

/** Lê o plano que o modelo devolveu (com ou sem cercas de código). */
export function lerPlano(bruto: string, tema: string): Plano {
  const t = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const ini = t.indexOf('{'), fim = t.lastIndexOf('}')
  let o: Record<string, unknown> = {}
  try { o = JSON.parse(t.slice(ini, fim + 1)) } catch { /* plano estragado: usa o tema direto */ }
  const perguntas = (Array.isArray(o.perguntas) ? o.perguntas : [])
    .map((p) => ({ pergunta: limpar((p as Record<string, unknown>)?.pergunta), busca: limpar((p as Record<string, unknown>)?.busca) }))
    .filter((p) => p.pergunta)
    .map((p) => ({ pergunta: p.pergunta.slice(0, 300), busca: (p.busca || p.pergunta).slice(0, 200) }))
    .slice(0, 6)
  return { titulo: limpar(o.titulo).slice(0, 90) || tema.slice(0, 90), perguntas: perguntas.length ? perguntas : [{ pergunta: tema, busca: tema }] }
}

export function promptParte(p: Pergunta, tema: string, hoje: string): string {
  return [
    `Pesquisa sobre "${tema}". Responda esta parte, pesquisando na internet: ${p.pergunta}`,
    `Sugestão de busca: ${p.busca}`,
    `Hoje é ${hoje}. Responda em português do Brasil, detalhado mas sem enrolação (até 12 frases), com números, nomes, preços e datas exatos e de quando é cada informação.`,
    'Se as fontes discordarem, diga onde e por quê. Não invente nada que as fontes não digam.'
  ].join('\n')
}

/** Junta as fontes de todas as partes, sem repetir, e numera (1, 2, 3...). */
export function numerarFontes(partes: Parte[]): { fontes: Fonte[]; numero: (f: Fonte) => number } {
  const fontes: Fonte[] = []
  const indice = new Map<string, number>()
  for (const p of partes) {
    for (const f of p.fontes) {
      const chave = f.titulo || f.url
      if (!indice.has(chave)) { fontes.push(f); indice.set(chave, fontes.length) }
    }
  }
  return { fontes, numero: (f) => indice.get(f.titulo || f.url) ?? 0 }
}

export function promptRelatorio(tema: string, foco: string, partes: Parte[], locais: Local[], hoje: string): string {
  const { numero } = numerarFontes(partes)
  const blocos = partes.map((p, i) =>
    `### Parte ${i + 1}: ${p.pergunta}\n${p.texto}\nFontes desta parte: ${p.fontes.map((f) => `[${numero(f)}] ${f.titulo}`).join('; ') || 'nenhuma'}`)
  const meus = locais.length
    ? ['', 'Trechos dos arquivos DELE (do computador dele) que podem ter a ver:', ...locais.map((l) => `- ${l.nome} (${l.pasta}): "${l.trecho}"`)]
    : []
  return [
    `Escreva o relatório final da pesquisa sobre "${tema}"${foco ? ` (foco: ${foco})` : ''}, em português do Brasil, em Markdown.`,
    `Hoje é ${hoje}.`,
    'Estrutura:',
    '## Resumo — 3 a 5 frases com a resposta direta, como você diria em voz alta.',
    '## O que encontrei — uma seção ### por assunto, com os fatos e os números, citando as fontes como [1], [2] logo depois de cada afirmação.',
    ...(locais.length ? ['## Dos seus arquivos — o que os arquivos dele já diziam sobre isso e como se compara com o que achou agora (cite o nome do arquivo). Se nada tiver a ver, diga em uma frase.'] : []),
    '## Onde as fontes discordam — só se discordarem; diga o quanto você confia em cada conclusão (alta, média, baixa) e por quê.',
    '## Próximos passos — 2 a 4 sugestões práticas.',
    'Regras: use só o que está abaixo; não invente fontes nem números; não escreva a lista de fontes no fim (eu coloco); sem tabelas.',
    '',
    'Material da pesquisa:',
    ...blocos,
    ...meus
  ].join('\n')
}

/** As primeiras frases do "Resumo", para ela falar quando entregar. */
export function resumoFalado(md: string, maxFrases = 3): string {
  const m = md.match(/##\s*Resumo\s*\n+([\s\S]*?)(\n##\s|$)/i)
  const texto = (m ? m[1] : md).replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim()
  const frases = texto.match(/[^.!?]+[.!?]+/g) ?? [texto]
  return frases.slice(0, maxFrases).map((f) => f.trim()).join(' ').slice(0, 600)
}

export function nomeDoArquivo(titulo: string, quando: Date): string {
  const data = `${quando.getFullYear()}-${String(quando.getMonth() + 1).padStart(2, '0')}-${String(quando.getDate()).padStart(2, '0')}`
  const nome = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'pesquisa'
  return `${data} ${nome}`
}

/** O relatório completo em Markdown, com a lista de fontes no fim. */
export function relatorioCompleto(titulo: string, corpo: string, fontes: Fonte[], hoje: string): string {
  return [
    `# ${titulo}`,
    `*Pesquisa da FRIDAY · ${hoje}*`,
    '',
    corpo.trim().replace(/^#\s.*\n/, ''),
    '',
    '## Fontes',
    ...fontes.map((f, i) => `${i + 1}. [${f.titulo || 'fonte'}](${f.url})`)
  ].join('\n')
}

/** Página para ler no navegador (o conversor desce os títulos: # vira h3, ## h4, ### h5). `markdown` é o conversor seguro do app (nada da IA vira código). */
export function paginaHtml(titulo: string, md: string, markdown: (md: string) => string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Referências [1] viram links para a fonte, lá embaixo
  const corpo = markdown(md).replace(/\[(\d{1,3})\]/g, '<a class="ref" href="#f$1">[$1]</a>')
    .replace(/<ol>((?:(?!<\/ol>)[\s\S])*)<\/ol>(?![\s\S]*<ol>)/, (_t, itens: string) => {
      let n = 0
      return `<ol class="fontes">${itens.replace(/<li>/g, () => `<li id="f${++n}">`)}</ol>`
    })
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>
:root{--fundo:#05070f;--texto:#e7ecf7;--apagado:#8c97b3;--ciano:#6fb8ff;--borda:#1c2440}
body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.65 system-ui,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 20px 80px}
h3{font-size:30px;line-height:1.2;margin:0 0 6px}h4{margin:36px 0 10px;padding-top:12px;border-top:1px solid var(--borda);color:var(--ciano);font-size:20px}
h5{font-size:17px;margin:22px 0 6px}em{color:var(--apagado)}a{color:var(--ciano)}a.ref{text-decoration:none;font-size:.8em;vertical-align:super}
code{background:#0e1428;padding:1px 5px;border-radius:4px}ol.fontes{font-size:14px;color:var(--apagado)}li{margin:4px 0}
</style></head><body><main>${corpo}</main></body></html>`
}
