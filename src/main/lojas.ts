// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// A parte de venda: raio-X da loja (pesquisa na internet + as fotos que você tirou lá), a prévia do
// site (feita pelo Claude Code, seguindo a base de design) e os PDFs de proposta e contrato.

import { BrowserWindow, nativeImage, shell } from 'electron'
import { GoogleGenAI } from '@google/genai'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { carregarConfig, resourcesDir } from './config'
import { empresa, lerClientes, pastaDoCliente, regras, salvarCliente, anotarNoDiario } from './negocio'
import { garantirProjeto, gitNa, pedirTarefa } from './tarefas'
import { PACOTES, prazoPara, type Cliente, type Pacote } from './logica/negocio'
import { RAIO_X_VAZIO, lerRaioX, paletaDaImagem, promptPesquisa, promptSintese, raioXEmTexto, type RaioXLoja } from './logica/raioxloja'
import { htmlContrato, htmlProposta } from './logica/documentos'

const MODELO = 'gemini-2.5-flash'
const IMAGENS = /\.(jpe?g|png|webp)$/i

export function baseDeDesign(): string {
  try { return readFileSync(join(resourcesDir(), 'negocio', 'base-design.md'), 'utf8') } catch { return '' }
}

export function lerRaioXSalvo(c: Cliente): RaioXLoja | null {
  try { return { ...RAIO_X_VAZIO, ...JSON.parse(readFileSync(join(pastaDoCliente(c.id), 'raio-x.json'), 'utf8')) } } catch { return null }
}

/** As fotos da pasta "fotos" do cliente (as que você tirou na loja) e o logo, se tiver. */
function fotosDoCliente(c: Cliente): { fotos: string[]; logo: string } {
  const pasta = join(pastaDoCliente(c.id), 'fotos')
  if (!existsSync(pasta)) return { fotos: [], logo: '' }
  const todas = readdirSync(pasta).filter((f) => IMAGENS.test(f)).map((f) => join(pasta, f))
  const logo = todas.find((f) => /logo/i.test(f)) ?? ''
  return { fotos: todas.filter((f) => f !== logo).slice(0, 6), logo }
}

const mime = (f: string): string => (/\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const textoDe = (r: any): string => ((typeof r.text === 'function' ? r.text() : r.text) ?? '').trim()

/** Faz o raio-X (leva uns 30 a 60 segundos) e guarda raio-x.json e raio-x.md na pasta do cliente. */
export async function fazerRaioX(c: Cliente): Promise<RaioXLoja> {
  const chave = carregarConfig().apiKey
  if (!chave) throw new Error('Falta a chave do Gemini.')
  const ai = new GoogleGenAI({ apiKey: chave })
  // 1. Pesquisa pública na internet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r1: any = await ai.models.generateContent({
    model: MODELO,
    contents: promptPesquisa(c.nome, c.contato.cidade || empresa().cidade, c.contato.instagram, c.site),
    config: { tools: [{ googleSearch: {} }], temperature: 0.2 }
  })
  const pesquisa = textoDe(r1)
  const fontes = ((r1.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as { web?: { uri?: string; title?: string } }[])
    .flatMap((x) => (x.web?.uri ? [{ titulo: x.web.title ?? '', url: x.web.uri }] : []))
  // 2. Cores do logo e fotos da loja
  const { fotos, logo } = fotosDoCliente(c)
  let cores: string[] = []
  if (logo) {
    try { cores = paletaDaImagem(new Uint8Array(nativeImage.createFromPath(logo).resize({ width: 64 }).toBitmap())) } catch { /* logo estranho */ }
  }
  const partes = [
    { text: promptSintese(c.nome, pesquisa, cores, fotos.length > 0, baseDeDesign()) },
    ...fotos.map((f) => ({ inlineData: { mimeType: mime(f), data: nativeImage.createFromPath(f).resize({ width: 1024 }).toJPEG(80).toString('base64') } }))
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r2: any = await ai.models.generateContent({ model: MODELO, contents: [{ role: 'user', parts: partes }], config: { responseMimeType: 'application/json', temperature: 0.4 } })
  const raio = lerRaioX(textoDe(r2), fontes)
  if (!raio.identidade.cores.length && cores.length) raio.identidade.cores = cores
  const pasta = pastaDoCliente(c.id)
  writeFileSync(join(pasta, 'raio-x.json'), JSON.stringify(raio, null, 2), 'utf8')
  writeFileSync(join(pasta, 'raio-x.md'), raioXEmTexto(c.nome, raio), 'utf8')
  if (raio.segmento && !c.segmento) c.segmento = raio.segmento
  if (!raio.presenca.site || c.site) { /* mantém */ } else c.site = raio.presenca.site
  if (c.etapa === 'prospectado') c.etapa = 'raio_x'
  salvarCliente(c, 'Raio-X da loja feito.')
  anotarNoDiario(`Fiz o raio-X da ${c.nome}.`)
  return raio
}

// ---------- Prévia ----------

const projetoDaPrevia = (c: Cliente): string => `site-${c.id}`.slice(0, 40)
const pastaDaPrevia = (c: Cliente): string => join(pastaDoCliente(c.id), 'site')

/** Monta o repositório da prévia (briefing, base de design e fotos) e pede o site ao Claude Code. */
export async function pedirPrevia(c: Cliente): Promise<string> {
  const raio = lerRaioXSalvo(c)
  if (!raio) throw new Error(`Faça o raio-X da ${c.nome} antes da prévia.`)
  const pasta = pastaDaPrevia(c)
  const img = join(pasta, 'img')
  mkdirSync(img, { recursive: true })
  const { fotos, logo } = fotosDoCliente(c)
  for (const f of [...fotos, ...(logo ? [logo] : [])]) copyFileSync(f, join(img, f.split(/[\\/]/).pop()!))
  const e = empresa()
  const zap = (c.contato.whatsapp || c.contato.telefone).replace(/\D/g, '')
  writeFileSync(join(pasta, 'BRIEF.md'), [
    raioXEmTexto(c.nome, raio), '',
    '## Dados para o site', '',
    `- WhatsApp da loja: ${zap ? `+55${zap.replace(/^55/, '')}` : 'ainda não sei (use um número de exemplo e deixe um comentário no HTML)'}`,
    `- Endereço: ${c.contato.endereco || 'ainda não sei'}`,
    `- Instagram: ${c.contato.instagram || raio.presenca.instagram || 'ainda não sei'}`,
    `- Pacote: ${raio.pacote}`,
    `- Crédito no rodapé: "site por ${e.nome}"${e.site ? ` com link para ${e.site}` : ''}`,
    `- Fotos da loja em img/: ${readdirSync(img).join(', ') || 'nenhuma (use blocos de cor e ícones, sem banco de imagem)'}`
  ].join('\n'), 'utf8')
  writeFileSync(join(pasta, 'BASE.md'), baseDeDesign(), 'utf8')
  if (!existsSync(join(pasta, '.git'))) {
    await gitNa(pasta, ['init', '-q'])
    await gitNa(pasta, ['add', '-A'])
    await gitNa(pasta, ['-c', 'user.name=F.R.I.D.A.Y', '-c', 'user.email=friday@local', 'commit', '-q', '-m', `Briefing da ${c.nome}`])
  } else {
    await gitNa(pasta, ['add', '-A'])
    await gitNa(pasta, ['-c', 'user.name=F.R.I.D.A.Y', '-c', 'user.email=friday@local', 'commit', '-q', '--allow-empty', '-m', 'Briefing atualizado'])
  }
  garantirProjeto(projetoDaPrevia(c), pasta)
  const r = await pedirTarefa(projetoDaPrevia(c), `Crie a prévia do site da loja ${c.nome}: leia BRIEF.md (o raio-X da loja e os dados) e siga à risca BASE.md (a base de design). Faça um site estático em index.html, estilo.css e script.js, em português do Brasil, pensado primeiro para o celular, usando as fotos de img/ e o efeito-assinatura do briefing. Sem frameworks pesados; GSAP pelo CDN é permitido. No fim, confira o checklist do BASE.md.`)
  if (!r.ok) throw new Error(r.motivo)
  if (c.etapa === 'raio_x' || c.etapa === 'prospectado') c.etapa = 'previa'
  salvarCliente(c, `Prévia pedida (tarefa ${r.tarefa.id}).`)
  anotarNoDiario(`Pedi a prévia do site da ${c.nome} ao Claude Code (tarefa ${r.tarefa.id}).`)
  return `Pedi a prévia ao Claude Code (tarefa ${r.tarefa.id}${r.posicao > 1 ? `, posição ${r.posicao} na fila` : ''}). Aviso quando ficar pronta; para ver, diga "mostra a prévia da ${c.nome}".`
}

/** Abre a última prévia pronta no navegador (troca a pasta para a branch dela). */
export async function verPrevia(c: Cliente): Promise<string> {
  const pasta = pastaDaPrevia(c)
  if (!existsSync(join(pasta, '.git'))) throw new Error(`Ainda não tem prévia da ${c.nome}.`)
  const branches = (await gitNa(pasta, ['branch', '--list', '--sort=-committerdate', '--format=%(refname:short)', 'friday/*'])).split(/\s+/).filter(Boolean)
  if (!branches.length) throw new Error('A prévia ainda não ficou pronta.')
  await gitNa(pasta, ['checkout', '-q', branches[0]])
  const index = join(pasta, 'index.html')
  if (!existsSync(index)) throw new Error('A prévia ficou sem index.html; peça de novo.')
  const erro = await shell.openPath(index)
  if (erro) throw new Error(erro)
  return `Abri a prévia da ${c.nome} no navegador.`
}

// ---------- Proposta e contrato ----------

async function paraPdf(html: string, destino: string): Promise<void> {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } })
    writeFileSync(destino, pdf)
  } finally {
    w.destroy()
  }
}

export function pacoteDoCliente(c: Cliente): Pacote {
  const raio = lerRaioXSalvo(c)
  return PACOTES.find((p) => p.id === (c.pacote || raio?.pacote || 'site'))!
}

/** Gera proposta ou contrato em PDF na pasta do cliente e abre. */
export async function gerarDocumento(c: Cliente, tipo: 'proposta' | 'contrato'): Promise<string> {
  const p = pacoteDoCliente(c)
  const hoje = new Date()
  const prazo = c.prazo ? new Date(c.prazo) : prazoPara(p, lerClientes(), hoje, regras())
  const valor = c.valor || p.base
  const dados = { cliente: c, pacote: p, valor, mensalidade: c.mensalidade || (tipo === 'proposta' ? 150 : 0), prazo, raioX: lerRaioXSalvo(c), empresa: empresa(), regras: regras(), previa: '', hoje }
  const pasta = join(pastaDoCliente(c.id), 'documentos')
  mkdirSync(pasta, { recursive: true })
  const arquivo = join(pasta, `${tipo}-${c.id}-${hoje.toISOString().slice(0, 10)}.pdf`)
  await paraPdf(tipo === 'proposta' ? htmlProposta(dados) : htmlContrato(dados), arquivo)
  salvarCliente(c, `${tipo === 'proposta' ? 'Proposta' : 'Contrato'} gerado.`)
  anotarNoDiario(`Gerei ${tipo === 'proposta' ? 'a proposta' : 'o contrato'} da ${c.nome}.`)
  void shell.openPath(arquivo)
  return arquivo
}

export const nomeDoArquivo = (f: string): string => f.split(/[\\/]/).pop() ?? f
export const ehImagem = (f: string): boolean => IMAGENS.test(extname(f))
