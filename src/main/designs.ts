// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Importar designs: você escolhe os arquivos (modelos .glb, .gltf, .stl, .obj ou um pacote .zip) e eles
// entram na sua biblioteca em Documentos/FRIDAY Modelos, com um nome e apelidos para pedir por voz
// ("projeta o reator"). A lista fica em designs.json, na mesma pasta, e dá para editar à mão.
// O arquivo original fica onde estava: a FRIDAY trabalha com uma cópia.

import { app, BrowserWindow, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { lerZip } from './logica/cerebro'
import {
  acharDesign, caminhoDoZip, dependenciasDoGltf, ehModelo, modeloPrincipal, nomeDoArquivo, nomeLivre, nomeSeguro,
  type Design
} from './logica/designs'

const MAX_ARQUIVO = 80 * 1024 * 1024
const MAX_PACOTE = 250 * 1024 * 1024

export const pastaModelos = (): string => join(app.getPath('documents'), 'FRIDAY Modelos')
const arquivoLista = (): string => join(pastaModelos(), 'designs.json')

export function lerDesigns(): Design[] {
  try {
    const l = JSON.parse(readFileSync(arquivoLista(), 'utf8')) as Design[]
    // Só os que ainda existem na pasta
    return Array.isArray(l) ? l.filter((d) => d && typeof d.arquivo === 'string' && typeof d.nome === 'string' && existsSync(join(pastaModelos(), d.arquivo))).map((d) => ({ ...d, apelidos: Array.isArray(d.apelidos) ? d.apelidos.map(String) : [] })) : []
  } catch {
    return []
  }
}

function salvarDesigns(l: Design[]): void {
  mkdirSync(pastaModelos(), { recursive: true })
  writeFileSync(arquivoLista(), JSON.stringify(l, null, 2), 'utf8')
}

/** Caminho livre na pasta (não sobrescreve nada que já está lá). */
function livre(nome: string): string {
  const base = nome.replace(/\.[^.]+$/, ''), e = extname(nome)
  let n = nome, i = 2
  while (existsSync(join(pastaModelos(), n))) n = `${base} ${i++}${e}`
  return n
}

/** Garante que o destino fica dentro da pasta (nada de um zip escrever fora). */
function dentro(pasta: string, rel: string): string {
  const alvo = resolve(pasta, rel)
  if (alvo !== pasta && !alvo.startsWith(pasta + sep)) throw new Error('caminho fora da pasta')
  return alvo
}

function importarZip(origem: string): { arquivo: string; nome: string } {
  if (statSync(origem).size > MAX_PACOTE) throw new Error('pacote grande demais (mais de 250 MB)')
  const dados = readFileSync(origem)
  let total = 0
  const conteudo = lerZip(dados, (n) => !!caminhoDoZip(n), (d) => {
    const r = inflateRawSync(d, { maxOutputLength: MAX_PACOTE })
    total += r.length
    if (total > MAX_PACOTE) throw new Error('o pacote aberto passa de 250 MB')
    return r
  })
  const arquivos = Object.entries(conteudo).map(([n, d]) => ({ caminho: caminhoDoZip(n)!, dados: d }))
  const principal = modeloPrincipal(arquivos.map((a) => ({ caminho: a.caminho, tamanho: a.dados.length })))
  if (!principal) throw new Error('não tem modelo 3D (.glb, .gltf, .obj ou .stl) dentro')
  const pastaNome = livre(nomeSeguro(basename(origem, extname(origem))))
  const pasta = join(pastaModelos(), pastaNome)
  for (const a of arquivos) {
    const alvo = dentro(pasta, a.caminho)
    mkdirSync(dirname(alvo), { recursive: true })
    writeFileSync(alvo, a.dados)
  }
  return { arquivo: `${pastaNome}/${principal}`, nome: nomeDoArquivo(basename(origem)) }
}

function importarModelo(origem: string): { arquivo: string; nome: string } {
  if (statSync(origem).size > MAX_ARQUIVO) throw new Error('arquivo grande demais (mais de 80 MB)')
  const nome = nomeDoArquivo(origem)
  if (extname(origem).toLowerCase() === '.gltf') {
    // O .gltf vem com o .bin e as texturas do lado: vai tudo junto, numa pasta só dele
    const deps = dependenciasDoGltf(readFileSync(origem, 'utf8'))
    if (deps.length) {
      const pastaNome = livre(nomeSeguro(basename(origem, '.gltf')))
      const pasta = join(pastaModelos(), pastaNome)
      mkdirSync(pasta, { recursive: true })
      copyFileSync(origem, join(pasta, basename(origem)))
      for (const d of deps) {
        const de = dentro(dirname(origem), d)
        if (!existsSync(de)) continue
        const para = dentro(pasta, d)
        mkdirSync(dirname(para), { recursive: true })
        copyFileSync(de, para)
      }
      return { arquivo: `${pastaNome}/${basename(origem)}`, nome }
    }
  }
  const destino = livre(nomeSeguro(basename(origem, extname(origem))) + extname(origem).toLowerCase())
  copyFileSync(origem, join(pastaModelos(), destino))
  return { arquivo: destino, nome }
}

/** Importa os arquivos escolhidos. Devolve o que entrou e o que não deu. */
export function importarDesigns(caminhos: string[]): { entraram: Design[]; erros: string[] } {
  mkdirSync(pastaModelos(), { recursive: true })
  const lista = lerDesigns()
  const entraram: Design[] = []
  const erros: string[] = []
  for (const origem of caminhos) {
    try {
      const e = extname(origem).toLowerCase()
      // Já está na pasta de modelos: só registra
      const rel = relative(pastaModelos(), origem)
      let r: { arquivo: string; nome: string }
      if (!rel.startsWith('..') && ehModelo(origem)) r = { arquivo: rel.split(sep).join('/'), nome: nomeDoArquivo(origem) }
      else if (e === '.zip') r = importarZip(origem)
      else if (ehModelo(origem)) r = importarModelo(origem)
      else throw new Error('formato que eu não abro (use .glb, .gltf, .stl, .obj ou .zip)')
      const d: Design = { arquivo: r.arquivo, nome: nomeLivre(r.nome, lista.map((x) => x.nome)), apelidos: [], importadoEm: new Date().toISOString() }
      lista.push(d)
      entraram.push(d)
    } catch (err) {
      erros.push(`${basename(origem)}: ${(err as Error).message}`)
    }
  }
  salvarDesigns(lista)
  return { entraram, erros }
}

/** Abre a janela do Windows para você escolher os arquivos. */
export async function escolherEImportar(dono: BrowserWindow | null): Promise<{ entraram: Design[]; erros: string[]; cancelou: boolean }> {
  const opcoes = {
    title: 'Importar designs para a FRIDAY',
    buttonLabel: 'Importar',
    properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
    filters: [{ name: 'Modelos 3D e pacotes', extensions: ['glb', 'gltf', 'stl', 'obj', 'zip'] }]
  }
  // O HUD fica por cima de tudo e não pega clique: a janela de escolher abre solta
  const r = dono && dono.isFocusable() ? await dialog.showOpenDialog(dono, opcoes) : await dialog.showOpenDialog(opcoes)
  if (r.canceled || !r.filePaths.length) return { entraram: [], erros: [], cancelou: true }
  return { ...importarDesigns(r.filePaths), cancelou: false }
}

export function acharDesignPorNome(qual: string): Design | null {
  return acharDesign([qual], lerDesigns())
}

/** Muda o nome e/ou acrescenta apelidos ("chama esse de reator"). */
export function renomearDesign(qual: string, nome: string, apelidos: string[]): Design | null {
  const lista = lerDesigns()
  const alvo = qual ? acharDesign([qual], lista) : lista[lista.length - 1] ?? null
  if (!alvo) return null
  const d = lista.find((x) => x.arquivo === alvo.arquivo)!
  if (nome) {
    if (d.nome && !d.apelidos.includes(d.nome)) d.apelidos.unshift(d.nome)
    d.nome = nome.trim().slice(0, 60)
  }
  for (const a of apelidos.map((x) => x.trim()).filter(Boolean)) if (!d.apelidos.includes(a) && a !== d.nome) d.apelidos.push(a.slice(0, 60))
  d.apelidos = d.apelidos.slice(0, 12)
  salvarDesigns(lista)
  return d
}

/** Tira da biblioteca e apaga a cópia (o arquivo que você importou continua onde estava). */
export function removerDesign(qual: string): Design | null {
  const lista = lerDesigns()
  const alvo = acharDesign([qual], lista)
  if (!alvo) return null
  const pasta = pastaModelos()
  const topo = alvo.arquivo.split('/')[0]
  // Veio de um pacote: a pasta inteira é dele (se nenhum outro design usa)
  const apagar = alvo.arquivo.includes('/') && !lista.some((x) => x !== alvo && x.arquivo.split('/')[0] === topo) ? topo : alvo.arquivo
  rmSync(dentro(pasta, apagar), { recursive: true, force: true })
  salvarDesigns(lista.filter((x) => x.arquivo !== alvo.arquivo))
  return alvo
}

/** Caminho de um arquivo da biblioteca, sem deixar sair da pasta. */
export const caminhoNaBiblioteca = (rel: string): string => dentro(pastaModelos(), rel)
