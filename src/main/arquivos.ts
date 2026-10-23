// Arquivos nas pastas pessoais: listar, abrir, mover, renomear, criar pasta, mandar para a lixeira e desfazer.
// Nada é sobrescrito, nada sai das pastas pessoais, e apagar sempre vai para a Lixeira.

import { app, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { resolverCaminho, caminhoAmigavel, type ChavePasta } from './logica/caminhos'

type Desfazer = { tipo: 'mover'; de: string; para: string } | { tipo: 'criar_pasta'; caminho: string }
const historico: Desfazer[] = []

export function raizes(): Record<ChavePasta, string> {
  return {
    desktop: app.getPath('desktop'),
    documents: app.getPath('documents'),
    downloads: app.getPath('downloads'),
    pictures: app.getPath('pictures'),
    music: app.getPath('music'),
    videos: app.getPath('videos')
  }
}

function resolver(entrada: string): string {
  const r = resolverCaminho(entrada, raizes(), path)
  if (!r.ok) throw new Error(r.erro)
  return r.absoluto
}

const amigavel = (abs: string): string => caminhoAmigavel(abs, raizes(), path)

export function listar(pasta: string, filtro = ''): { itens: { nome: string; pasta: boolean; tamanho: number; modificado: number }[]; total: number; titulo: string } {
  const abs = resolver(pasta)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`A pasta ${amigavel(abs)} não existe.`)
  const f = filtro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const itens = readdirSync(abs, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && d.name.toLowerCase() !== 'desktop.ini')
    .filter((d) => !f || d.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(f))
    .map((d) => {
      let tamanho = 0, modificado = 0
      try { const s = statSync(path.join(abs, d.name)); tamanho = s.size; modificado = s.mtimeMs } catch { /* sem acesso */ }
      return { nome: d.name, pasta: d.isDirectory(), tamanho, modificado }
    })
    .sort((a, b) => b.modificado - a.modificado)
  return { itens: itens.slice(0, 40), total: itens.length, titulo: amigavel(abs) }
}

// Programas e scripts não são abertos por voz: um nome mal entendido não pode virar um instalador rodando
const EXECUTAVEIS = new Set(['.exe', '.bat', '.cmd', '.com', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.msi', '.msp', '.scr', '.pif', '.cpl', '.hta', '.jar', '.lnk', '.reg', '.inf', '.appx', '.msix'])

export async function abrir(caminho: string): Promise<string> {
  const abs = resolver(caminho)
  if (!existsSync(abs)) throw new Error(`Não achei ${amigavel(abs)}.`)
  if (EXECUTAVEIS.has(path.extname(abs).toLowerCase())) throw new Error(`Por segurança, não abro programas nem scripts (${path.extname(abs)}). Para programas, use a lista de apps permitidos.`)
  const erro = await shell.openPath(abs)
  if (erro) throw new Error(`O Windows não conseguiu abrir: ${erro}`)
  return amigavel(abs)
}

/** Move ou renomeia. Se o destino for uma pasta existente, o arquivo vai para dentro dela. */
export function mover(origem: string, destino: string): { de: string; para: string } {
  const de = resolver(origem)
  if (!existsSync(de)) throw new Error(`Não achei ${amigavel(de)}.`)
  if (Object.values(raizes()).some((r) => path.resolve(r) === de)) throw new Error('Não movo as pastas pessoais inteiras.')
  let para = resolver(destino)
  if (existsSync(para) && statSync(para).isDirectory()) para = path.join(para, path.basename(de))
  // "mover contrato.pdf para documentos/contratos": destino sem extensão vira pasta, não novo nome
  else if (!existsSync(para) && statSync(de).isFile() && path.extname(de) && !path.extname(para)) para = path.join(para, path.basename(de))
  if (para === de) throw new Error('Origem e destino são o mesmo lugar.')
  if (para.startsWith(de + path.sep)) throw new Error('Não dá para mover uma pasta para dentro dela mesma.')
  if (existsSync(para)) throw new Error(`Já existe ${amigavel(para)}. Não sobrescrevo arquivos.`)
  mkdirSync(path.dirname(para), { recursive: true })
  try {
    renameSync(de, para)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EXDEV') throw new Error('Não consigo mover entre discos diferentes. Esse precisa ser feito à mão.')
    if ((e as NodeJS.ErrnoException).code === 'EBUSY' || (e as NodeJS.ErrnoException).code === 'EPERM') throw new Error('O arquivo está em uso por outro programa. Feche e tente de novo.')
    throw e
  }
  historico.push({ tipo: 'mover', de, para })
  return { de: amigavel(de), para: amigavel(para) }
}

export function criarPasta(caminho: string): string {
  const abs = resolver(caminho)
  if (existsSync(abs)) throw new Error(`${amigavel(abs)} já existe.`)
  mkdirSync(abs, { recursive: true })
  historico.push({ tipo: 'criar_pasta', caminho: abs })
  return amigavel(abs)
}

export async function paraLixeira(caminho: string): Promise<string> {
  const abs = resolver(caminho)
  if (!existsSync(abs)) throw new Error(`Não achei ${amigavel(abs)}.`)
  if (Object.values(raizes()).some((r) => path.resolve(r) === abs)) throw new Error('Não apago as pastas pessoais inteiras.')
  await shell.trashItem(abs)
  return amigavel(abs)
}

export function existe(caminho: string): { ok: boolean; amigavel: string; pasta: boolean } {
  const abs = resolver(caminho)
  return { ok: existsSync(abs), amigavel: amigavel(abs), pasta: existsSync(abs) && statSync(abs).isDirectory() }
}

/** Desfaz o último mover/renomear/criar pasta desta sessão. */
export function desfazer(): string {
  const ultimo = historico.pop()
  if (!ultimo) throw new Error('Não tenho nada para desfazer. O que foi para a Lixeira se restaura por ela.')
  if (ultimo.tipo === 'mover') {
    if (!existsSync(ultimo.para)) throw new Error(`${amigavel(ultimo.para)} não está mais lá.`)
    if (existsSync(ultimo.de)) throw new Error(`Já existe algo em ${amigavel(ultimo.de)}.`)
    mkdirSync(path.dirname(ultimo.de), { recursive: true })
    renameSync(ultimo.para, ultimo.de)
    return `${amigavel(ultimo.de)} voltou para o lugar.`
  }
  try { rmdirSync(ultimo.caminho) } catch { throw new Error(`A pasta ${amigavel(ultimo.caminho)} não está vazia; não apaguei.`) }
  return `Pasta ${amigavel(ultimo.caminho)} removida.`
}
