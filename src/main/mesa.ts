// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Mesa holográfica, o lado do PC: os cartões (seus projetos, designs e relatórios) e a maquete de um
// projeto, lida da pasta dele (pastas, arquivos e linhas), do git (o que mudou e não foi enviado) e da
// última vez que os testes rodaram (onde quebrou).

import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { lerProjetos } from './tarefas'
import { encontrarProjeto } from './logica/tarefas'
import { lerDesigns } from './designs'
import { pesquisas } from './pesquisa'
import { ultimasFalhas } from './programacao'
import { EXTENSOES_CODIGO, PASTAS_FORA, lerGitStatus, montarPredio } from './logica/predio'
import type { CartaoMesa, Predio } from '../shared/mesa'

const MAX_ARQUIVOS = 3000
const MAX_BYTES_LINHAS = 512 * 1024

const quando = (ms: number): string => {
  const d = Math.round((Date.now() - ms) / 86_400_000)
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : d < 30 ? `há ${d} dias` : new Date(ms).toLocaleDateString('pt-BR')
}

/** Os cartões da mesa: projetos primeiro, depois os designs e os relatórios prontos. */
export function cartoesDaMesa(): CartaoMesa[] {
  const cartoes: CartaoMesa[] = []
  for (const p of lerProjetos().projetos) {
    const falhas = ultimasFalhas(p.nome)
    cartoes.push({
      id: `projeto:${p.nome}`,
      tipo: 'projeto',
      titulo: p.nome,
      sub: path.basename(p.pasta),
      ficha: [
        existsSync(p.pasta) ? 'Toque duplo: vira prédio' : 'Pasta não encontrada',
        falhas ? (falhas.arquivos.length ? `Testes: falhando (${quando(falhas.quando)})` : `Testes: passando (${quando(falhas.quando)})`) : 'Testes: ainda não rodaram',
        p.comandos.length ? `Liberado: ${p.comandos.slice(0, 2).join(', ')}` : ''
      ].filter(Boolean)
    })
  }
  for (const d of lerDesigns()) {
    cartoes.push({
      id: `design:${d.nome}`,
      tipo: 'design',
      titulo: d.nome,
      sub: d.arquivo.split('/').pop() ?? d.arquivo,
      ficha: [d.apelidos.length ? `Também: ${d.apelidos.slice(0, 3).join(', ')}` : '', `Importado ${quando(Date.parse(d.importadoEm) || Date.now())}`, 'Toque duplo: projeta na mesa'].filter(Boolean)
    })
  }
  try {
    for (const r of pesquisas().filter((x) => x.estado === 'pronta').slice(-8).reverse()) {
      cartoes.push({ id: `relatorio:${r.id}`, tipo: 'relatorio', titulo: (r.titulo || r.tema).slice(0, 60), sub: 'Pesquisa profunda', ficha: [quando(r.criadaEm), r.foco ? `Foco: ${r.foco.slice(0, 60)}` : '', 'Toque duplo: abre o relatório'].filter(Boolean) })
    }
  } catch { /* sem pesquisas */ }
  return cartoes
}

/** Os arquivos de código do projeto, com o número de linhas (sem dependências nem build). */
function lerArquivos(raiz: string): { caminho: string; linhas: number }[] {
  const out: { caminho: string; linhas: number }[] = []
  const fila = ['']
  while (fila.length && out.length < MAX_ARQUIVOS) {
    const rel = fila.shift()!
    let itens: import('node:fs').Dirent[]
    try { itens = readdirSync(path.join(raiz, rel), { withFileTypes: true }) } catch { continue }
    for (const it of itens) {
      const r = rel ? `${rel}/${it.name}` : it.name
      if (it.isDirectory()) {
        if (!PASTAS_FORA.has(it.name) && !it.name.startsWith('.')) fila.push(r)
      } else if (it.isFile() && EXTENSOES_CODIGO.test(it.name) && !/\.min\.(js|css)$|lock\.json$|\.lock$/i.test(it.name)) {
        let linhas = 0
        try {
          const caminho = path.join(raiz, r)
          if (statSync(caminho).size <= MAX_BYTES_LINHAS) {
            const t = readFileSync(caminho, 'utf8')
            for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) linhas++
            if (t.length && !t.endsWith('\n')) linhas++
          } else linhas = Math.round(statSync(caminho).size / 40)
        } catch { /* sem acesso */ }
        out.push({ caminho: r, linhas })
        if (out.length >= MAX_ARQUIVOS) break
      }
    }
  }
  return out
}

const gitStatus = (pasta: string): Promise<string[]> =>
  new Promise((ok) => execFile('git', ['status', '--porcelain', '-uall'], { cwd: pasta, windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (e, out) => ok(e ? [] : lerGitStatus(String(out)))))

/** A maquete do projeto pedido. */
export async function predioDoProjeto(nome: string): Promise<Predio> {
  const { projetos } = lerProjetos()
  const p = encontrarProjeto(nome, projetos) ?? (projetos.length === 1 ? projetos[0] : null)
  if (!p) throw new Error(projetos.length ? `Não achei o projeto "${nome}". Tenho: ${projetos.map((x) => x.nome).join(', ')}.` : 'Ainda não tem projeto no projetos.json (ícone da bandeja › Editar projetos de programação).')
  if (!existsSync(p.pasta)) throw new Error(`A pasta do ${p.nome} não existe mais: ${p.pasta}.`)
  const [arquivos, mudados] = await Promise.all([Promise.resolve(lerArquivos(p.pasta)), gitStatus(p.pasta)])
  if (!arquivos.length) throw new Error(`Não achei código na pasta do ${p.nome}.`)
  return montarPredio(p.nome, arquivos, ultimasFalhas(p.nome)?.arquivos ?? [], mudados)
}
