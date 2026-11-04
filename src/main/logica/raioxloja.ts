// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Raio-X da loja: o que a FRIDAY descobre de uma loja antes de você oferecer o site (só o que a
// própria loja deixa público: Instagram, avaliações, site atual e concorrentes), mais as fotos
// que você tirar lá. Aqui ficam os pedidos para a IA, a leitura da resposta e as cores do logo.

export interface RaioXLoja {
  resumo: string
  segmento: string
  identidade: { cores: string[]; fontes: string[]; tom: string }
  produtos: string[]
  publico: string
  elogios: string[]
  reclamacoes: string[]
  presenca: { site: string; siteSituacao: string; instagram: string; google: string }
  concorrentes: string[]
  pacote: 'vitrine' | 'site' | 'loja'
  motivoPacote: string
  estrutura: string[]
  efeitoAssinatura: string
  perguntas: string[]
  fontes: { titulo: string; url: string }[]
}

export const RAIO_X_VAZIO: RaioXLoja = {
  resumo: '', segmento: '', identidade: { cores: [], fontes: [], tom: '' }, produtos: [], publico: '', elogios: [], reclamacoes: [],
  presenca: { site: '', siteSituacao: '', instagram: '', google: '' }, concorrentes: [], pacote: 'site', motivoPacote: '',
  estrutura: [], efeitoAssinatura: '', perguntas: [], fontes: []
}

/** Primeiro passo: pesquisar a loja na internet (com a busca do Google). */
export function promptPesquisa(nome: string, cidade: string, instagram: string, site: string): string {
  return [
    `Pesquise a loja "${nome}"${cidade ? ` em ${cidade}` : ''}${instagram ? ` (Instagram ${instagram})` : ''}${site ? ` (site ${site})` : ''}.`,
    'Quero só informação pública e verdadeira, em português, em tópicos curtos:',
    '1. O que a loja vende, os produtos principais e a faixa de preço, se aparecer.',
    '2. Presença online: se tem site (e se parece moderno, rápido, bom no celular), Instagram (seguidores, frequência de posts, estilo das fotos), perfil no Google (nota e quantas avaliações).',
    '3. O que os clientes mais elogiam e do que mais reclamam nas avaliações (com as palavras deles, sem nomes de pessoas).',
    '4. Horário, endereço e formas de contato (WhatsApp, telefone).',
    '5. Dois ou três concorrentes próximos do mesmo ramo e se eles têm site.',
    'Se não achar algo, diga "não encontrei". Não invente.'
  ].join('\n')
}

/** Segundo passo: transformar a pesquisa (e as fotos) no raio-X, seguindo a base de design. */
export function promptSintese(nome: string, pesquisa: string, coresDoLogo: string[], temFotos: boolean, baseDeDesign: string): string {
  return [
    `Você é a FRIDAY, assistente de um web designer que vende sites para lojas pequenas no Brasil. Monte o raio-X da loja "${nome}" para ele saber exatamente que site oferecer.`,
    '',
    'O que a pesquisa encontrou:',
    pesquisa || '(nada)',
    '',
    coresDoLogo.length ? `Cores tiradas do logo: ${coresDoLogo.join(', ')}.` : 'Sem logo.',
    temFotos ? 'As fotos anexadas foram tiradas na loja: use-as (vitrine, produtos, cores, clima).' : '',
    '',
    'Pacotes: vitrine (página única), site (até 5 páginas, catálogo, pedido pelo WhatsApp), loja (loja virtual com carrinho, para quem já vende bastante online ou quer vender para longe).',
    '',
    'Base de design a seguir:',
    baseDeDesign.slice(0, 6000),
    '',
    'Responda SÓ com um JSON com estas chaves (textos curtos, em português):',
    '{"resumo": "duas frases sobre a loja e a oportunidade", "segmento": "padaria, pet shop...", "identidade": {"cores": ["#hex", ...4 no máximo], "fontes": ["fonte de título", "fonte de texto"], "tom": "como a loja fala"},',
    '"produtos": ["..."], "publico": "...", "elogios": ["..."], "reclamacoes": ["..."], "presenca": {"site": "endereço ou vazio", "siteSituacao": "...", "instagram": "...", "google": "nota e avaliações"},',
    '"concorrentes": ["nome: tem site ou não"], "pacote": "vitrine|site|loja", "motivoPacote": "...", "estrutura": ["seção 1: o que vai nela", ...], "efeitoAssinatura": "uma ideia de efeito que tenha a ver com a loja", "perguntas": ["5 perguntas para o dono, só sobre o que não deu para descobrir"]}'
  ].filter((l) => l !== '').join('\n')
}

const lista = (v: unknown, max = 10): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : [])
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Lê o JSON da IA (com ou sem cerca de código), sempre devolvendo um raio-X completo. */
export function lerRaioX(resposta: string, fontes: { titulo: string; url: string }[] = []): RaioXLoja {
  const bruto = resposta.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const ini = bruto.indexOf('{'), fim = bruto.lastIndexOf('}')
  let d: Record<string, unknown> = {}
  try { d = JSON.parse(bruto.slice(ini, fim + 1)) } catch { /* resposta quebrada: devolve o vazio */ }
  const id = (d.identidade ?? {}) as Record<string, unknown>
  const pr = (d.presenca ?? {}) as Record<string, unknown>
  const pacote = ['vitrine', 'site', 'loja'].includes(String(d.pacote)) ? (d.pacote as RaioXLoja['pacote']) : 'site'
  return {
    resumo: texto(d.resumo), segmento: texto(d.segmento),
    identidade: { cores: lista(id.cores, 4).filter((c) => /^#[0-9a-f]{6}$/i.test(c)), fontes: lista(id.fontes, 2), tom: texto(id.tom) },
    produtos: lista(d.produtos, 12), publico: texto(d.publico), elogios: lista(d.elogios, 6), reclamacoes: lista(d.reclamacoes, 6),
    presenca: { site: texto(pr.site), siteSituacao: texto(pr.siteSituacao), instagram: texto(pr.instagram), google: texto(pr.google) },
    concorrentes: lista(d.concorrentes, 5), pacote, motivoPacote: texto(d.motivoPacote), estrutura: lista(d.estrutura, 12),
    efeitoAssinatura: texto(d.efeitoAssinatura), perguntas: lista(d.perguntas, 6), fontes: fontes.slice(0, 10)
  }
}

/** O raio-X como texto (raio-x.md na pasta do cliente, e o resumo que ela fala). */
export function raioXEmTexto(nome: string, r: RaioXLoja): string {
  const sec = (t: string, itens: string[]) => (itens.length ? `\n## ${t}\n\n${itens.map((i) => `- ${i}`).join('\n')}\n` : '')
  return [
    `# Raio-X: ${nome}`, '', r.resumo, '',
    `**Ramo:** ${r.segmento || '?'} · **Público:** ${r.publico || '?'}`,
    `**Identidade:** cores ${r.identidade.cores.join(', ') || '?'} · fontes ${r.identidade.fontes.join(' + ') || '?'} · tom ${r.identidade.tom || '?'}`,
    `**Hoje:** site ${r.presenca.site || 'não tem'}${r.presenca.siteSituacao ? ` (${r.presenca.siteSituacao})` : ''} · Instagram ${r.presenca.instagram || '?'} · Google ${r.presenca.google || '?'}`,
    sec('Produtos principais', r.produtos), sec('O que os clientes elogiam', r.elogios), sec('Do que reclamam (o site pode resolver)', r.reclamacoes),
    sec('Concorrentes', r.concorrentes),
    `\n## Recomendação\n\n**Pacote:** ${r.pacote} — ${r.motivoPacote}\n\n**Efeito-assinatura:** ${r.efeitoAssinatura}\n`,
    sec('Estrutura do site', r.estrutura), sec('Perguntar ao dono', r.perguntas),
    r.fontes.length ? `\n## Fontes\n\n${r.fontes.map((f) => `- [${f.titulo || f.url}](${f.url})`).join('\n')}\n` : ''
  ].join('\n')
}

/**
 * As cores principais de uma imagem (o logo), em BGRA como o Electron entrega: junta cores parecidas
 * em "baldes", ignora o quase-branco, o quase-preto e o transparente, e devolve as mais usadas.
 */
export function paletaDaImagem(bgra: Uint8Array, quantas = 4): string[] {
  const baldes = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const b = bgra[i], g = bgra[i + 1], r = bgra[i + 2], a = bgra[i + 3]
    if (a < 128) continue
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (min > 235 || max < 20) continue // fundo branco ou preto
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const x = baldes.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    x.n++; x.r += r; x.g += g; x.b += b
    baldes.set(k, x)
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return [...baldes.values()].sort((a, b) => b.n - a.n).slice(0, quantas).map((x) => `#${hex(x.r / x.n)}${hex(x.g / x.n)}${hex(x.b / x.n)}`)
}
