// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Dupla de programação, a parte que não depende do Windows: entender o título do VS Code, ler a
// saída dos testes (node:test, Jest, Vitest, pytest, TypeScript), revisar o que vai para o GitHub e
// montar o link de issue. Testado em tests/programacao.test.ts.

import { ocultarSegredos } from './cerebro.ts'

// ---------- VS Code ----------

/** "● app.ts - meu-projeto - Visual Studio Code" → { arquivo: "app.ts", pasta: "meu-projeto" } */
export function lerTituloVsCode(titulo: string): { arquivo: string; pasta: string } | null {
  if (!/Visual Studio Code|VSCodium|Cursor$/.test(titulo)) return null
  const partes = titulo.replace(/^[●•*]\s*/, '').split(' - ').map((p) => p.trim()).filter(Boolean)
  partes.pop() // "Visual Studio Code"
  if (!partes.length) return null
  const pasta = (partes.length >= 2 ? partes[partes.length - 1] : '').replace(/\s*\((Workspace|Espaço de Trabalho|WSL[^)]*|SSH[^)]*)\)$/i, '').replace(/\s*\[[^\]]*\]$/, '')
  const arquivo = partes.length >= 2 ? partes[0] : ''
  // Abas especiais ("Welcome", "Settings", "Extension: ...") não são arquivos
  const ehArquivo = /\.[A-Za-z0-9]{1,8}$/.test(arquivo) || /^(Dockerfile|Makefile|LICENSE|README)$/i.test(arquivo)
  return { arquivo: ehArquivo ? arquivo : '', pasta: pasta || (partes.length === 1 ? partes[0] : '') }
}

// ---------- Testes ----------

export interface Falha { titulo: string; mensagem: string; arquivo: string; linha: number }
export interface ResumoTestes { passaram: number | null; falharam: number | null; falhas: Falha[]; ferramenta: string }

const semCor = (s: string): string => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

/** Primeiro "arquivo:linha" de código do projeto (ignora node_modules e o próprio Node). */
function local(texto: string): { arquivo: string; linha: number } {
  const re = /(?:\(|\s|^|file:\/\/)((?:\/?[A-Za-z]:)?[^\s():'"]+\.(?:[cm]?[jt]sx?|py|java|cs|go|rs|rb|php|kt|dart|swift|vue|svelte))[:(](\d+)/gm
  for (const m of texto.matchAll(re)) {
    if (/node_modules|node:internal|internal\/|site-packages|\/usr\/lib/.test(m[1])) continue
    // file:///C:/x vira /C:/x: tira a barra antes da letra do disco
    return { arquivo: m[1].replace(/\\/g, '/').replace(/^\/([A-Za-z]:)/, '$1'), linha: Number(m[2]) }
  }
  return { arquivo: '', linha: 0 }
}

/** Entende a saída dos testes mais comuns e tira as falhas, com arquivo e linha quando der. */
export function resumirTestes(saidaBruta: string): ResumoTestes {
  const saida = semCor(saidaBruta).replace(/\r/g, '')
  const falhas: Falha[] = []
  let passaram: number | null = null, falharam: number | null = null, ferramenta = ''

  // TypeScript (tsc): app.ts(12,5): error TS2322: ...
  for (const m of saida.matchAll(/^([^\s(][^(\n]*\.[cm]?tsx?)\((\d+),\d+\): error (TS\d+): (.+)$/gm)) {
    ferramenta = 'tsc'
    falhas.push({ titulo: m[3], mensagem: m[4].trim(), arquivo: m[1].replace(/\\/g, '/'), linha: Number(m[2]) })
  }
  if (ferramenta === 'tsc') return { passaram: null, falharam: falhas.length, falhas: falhas.slice(0, 8), ferramenta }

  // node:test (TAP): "not ok 3 - nome" ... "# pass 10" "# fail 1"
  const tapPass = saida.match(/^# pass (\d+)/m), tapFail = saida.match(/^# fail (\d+)/m)
  if (tapPass || tapFail) {
    ferramenta = 'node:test'
    passaram = tapPass ? Number(tapPass[1]) : null
    falharam = tapFail ? Number(tapFail[1]) : null
    const blocos = saida.split(/^(?=\s*not ok \d+ - )/m).slice(1)
    for (const b of blocos) {
      const titulo = b.match(/not ok \d+ - (.+)/)?.[1]?.trim() ?? 'teste'
      if (/^tests?\//.test(titulo) && blocos.length > 1 && /\.test\.[jt]s$/.test(titulo)) continue // linha do arquivo inteiro
      // error: "texto" | 'texto' | bloco |- nas linhas de baixo
      const e = b.match(/^\s*error: (?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\|-?\n((?:[ \t]{4,}.*\n?)+)|(.*))$/m)
      let msg = (e?.[1] ?? e?.[2] ?? e?.[3]?.trim().split('\n')[0] ?? e?.[4] ?? '').trim()
      const nomeErro = b.match(/^\s*name: '?(\w+)'?/m)?.[1]
      if (nomeErro && !/Assertion/.test(nomeErro) && msg) msg = `${nomeErro}: ${msg}`
      // Onde quebrou de verdade: a primeira linha da pilha que é código do projeto
      const pilha = b.match(/stack: \|-?\n((?:[ \t]{4,}.*\n?)+)/)?.[1] ?? ''
      const onde = b.match(/location: '([^']+):(\d+):\d+'/)
      const daPilha = local(pilha)
      const l = daPilha.arquivo ? daPilha : onde ? { arquivo: onde[1].replace(/\\/g, '/'), linha: Number(onde[2]) } : local(b)
      falhas.push({ titulo, mensagem: msg, ...l })
    }
    return { passaram, falharam, falhas: falhas.slice(0, 8), ferramenta }
  }

  // pytest: "FAILED tests/test_x.py::test_y - AssertionError: ..." e "=== 1 failed, 3 passed in 0.1s ==="
  const py = saida.match(/=+ (?:(\d+) failed)?,? ?(?:(\d+) passed)?.* in [\d.]+s/)
  if (py || /^FAILED /m.test(saida)) {
    ferramenta = 'pytest'
    falharam = py?.[1] ? Number(py[1]) : (saida.match(/^FAILED /gm)?.length ?? 0)
    passaram = py?.[2] ? Number(py[2]) : null
    for (const m of saida.matchAll(/^FAILED ([^\s:]+)::(\S+)(?: - (.*))?$/gm)) {
      const linha = saida.match(new RegExp(`${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):`))
      falhas.push({ titulo: m[2], mensagem: (m[3] ?? '').trim(), arquivo: m[1], linha: linha ? Number(linha[1]) : 0 })
    }
    return { passaram, falharam, falhas: falhas.slice(0, 8), ferramenta }
  }

  // Jest / Vitest: "Tests: 2 failed, 5 passed" ou "Tests  2 failed | 5 passed"; falhas com ● ou ×/✕
  const jest = saida.match(/Tests:?\s+(?:(\d+) failed)?[,|\s]*(?:(\d+) passed)?/)
  if (jest && (jest[1] || jest[2])) {
    ferramenta = /vitest|✓|×/.test(saida) && !/●/.test(saida) ? 'vitest' : 'jest'
    falharam = jest[1] ? Number(jest[1]) : 0
    passaram = jest[2] ? Number(jest[2]) : null
    const blocos = saida.split(/^\s*(?:● |FAIL\s+\S+\s+>\s+)/m).slice(1)
    for (const b of blocos) {
      const titulo = b.split('\n')[0].replace(/›/g, '>').trim()
      if (!titulo || /^Console$/.test(titulo)) continue
      const msg = b.split('\n').slice(1).map((x) => x.trim()).find((x) => x && !/^at /.test(x)) ?? ''
      falhas.push({ titulo, mensagem: msg, ...local(b) })
    }
    return { passaram, falharam, falhas: falhas.slice(0, 8), ferramenta }
  }

  // Não reconheceu: procura a primeira linha de erro
  const erro = saida.split('\n').find((l) => /error|erro|failed|exception/i.test(l))
  return { passaram: null, falharam: null, falhas: erro ? [{ titulo: 'erro', mensagem: erro.trim().slice(0, 300), ...local(saida) }] : [], ferramenta: '' }
}

/** Linhas em volta de onde quebrou, numeradas, com a linha do erro marcada. */
export function trechoComLinhas(conteudo: string, linha: number, raio = 6): string {
  const linhas = conteudo.split(/\r?\n/)
  const ini = Math.max(1, linha - raio), fim = Math.min(linhas.length, linha + raio)
  const largura = String(fim).length
  const saida: string[] = []
  for (let i = ini; i <= fim; i++) saida.push(`${i === linha ? '>' : ' '} ${String(i).padStart(largura)} | ${linhas[i - 1]}`)
  return saida.join('\n')
}

// ---------- Revisora antes do push ----------

export type TipoAchado = 'segredo' | 'arquivo_secreto' | 'conflito' | 'console' | 'debugger' | 'todo' | 'grande'
export interface AchadoRevisao { tipo: TipoAchado; arquivo: string; linha: number; texto: string }

const ARQUIVO_SECRETO = /(^|\/)(\.env(\.[\w.-]+)?|[^/]*\.(pem|key|pfx|p12|keystore|jks)|id_(rsa|ed25519|ecdsa)|credentials\.json|serviceAccount[^/]*\.json)$/i

/** Olha as linhas ADICIONADAS de um diff unificado e aponta o que não deveria ir para o GitHub. */
export function revisarDiff(diff: string): AchadoRevisao[] {
  const achados: AchadoRevisao[] = []
  let arquivo = '', linha = 0
  for (const l of diff.replace(/\r/g, '').split('\n')) {
    const novo = l.match(/^\+\+\+ (?:b\/)?(.+)$/)
    if (novo) {
      arquivo = novo[1] === '/dev/null' ? '' : novo[1]
      if (arquivo && ARQUIVO_SECRETO.test(arquivo) && !/\.example$|\.sample$|\.exemplo$/i.test(arquivo)) achados.push({ tipo: 'arquivo_secreto', arquivo, linha: 0, texto: arquivo })
      continue
    }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
    if (h) { linha = Number(h[1]); continue }
    if (l.startsWith('-') || l.startsWith('\\')) continue
    if (!l.startsWith('+')) { if (l.startsWith(' ')) linha++; continue }
    const t = l.slice(1)
    if (ocultarSegredos(t) !== t) achados.push({ tipo: 'segredo', arquivo, linha, texto: ocultarSegredos(t).trim().slice(0, 120) })
    else if (/^(<{7}|={7}|>{7})( |$)/.test(t)) achados.push({ tipo: 'conflito', arquivo, linha, texto: t.trim() })
    else if (/\bconsole\.(log|debug)\(/.test(t) && !/\.(test|spec)\.[jt]sx?$/.test(arquivo) && !/scripts?\//.test(arquivo)) achados.push({ tipo: 'console', arquivo, linha, texto: t.trim().slice(0, 120) })
    else if (/^\s*debugger;?\s*$/.test(t) || /\bbreakpoint\(\)/.test(t)) achados.push({ tipo: 'debugger', arquivo, linha, texto: t.trim() })
    else if (/\b(TODO|FIXME|XXX|HACK)\b/.test(t)) achados.push({ tipo: 'todo', arquivo, linha, texto: t.trim().slice(0, 120) })
    linha++
  }
  return achados
}

/** Frase para ela falar sobre a revisão (os segredos primeiro). */
export function falarRevisao(achados: AchadoRevisao[]): string {
  if (!achados.length) return 'Nada de chave, senha, conflito ou console.log esquecido. Pode mandar.'
  const conta = (t: TipoAchado) => achados.filter((a) => a.tipo === t)
  const partes: string[] = []
  const graves = [...conta('segredo'), ...conta('arquivo_secreto')]
  if (graves.length) partes.push(`PARE: ${graves.length === 1 ? 'tem uma chave ou senha' : `tem ${graves.length} chaves ou senhas`} indo junto (${graves.slice(0, 3).map((a) => `${a.arquivo}${a.linha ? `, linha ${a.linha}` : ''}`).join('; ')}). Tire antes do push e, se já foi para o GitHub alguma vez, troque a chave.`)
  if (conta('conflito').length) partes.push(`Ficaram marcas de conflito do merge em ${[...new Set(conta('conflito').map((a) => a.arquivo))].join(', ')}.`)
  if (conta('console').length) partes.push(`${conta('console').length} console.log esquecido${conta('console').length > 1 ? 's' : ''} (${conta('console').slice(0, 2).map((a) => `${a.arquivo}:${a.linha}`).join(', ')}).`)
  if (conta('debugger').length) partes.push(`Um debugger ficou no código (${conta('debugger')[0].arquivo}:${conta('debugger')[0].linha}).`)
  if (conta('todo').length) partes.push(`${conta('todo').length} TODO novo${conta('todo').length > 1 ? 's' : ''}, só para você saber.`)
  return partes.join(' ')
}

/** Gancho pre-push: bloqueia o push se tiver chave ou arquivo secreto nos commits que estão indo. */
export const GANCHO_PRE_PUSH = `#!/bin/sh
# FRIDAY: revisora antes do push (instalada por voz). Bloqueia chaves, senhas e arquivos .env
# indo para o GitHub. Para passar mesmo assim (cuidado!): git push --no-verify
zero=0000000000000000000000000000000000000000
padrao='AIza[0-9A-Za-z_-]{30,}|AQ\\.[0-9A-Za-z_.-]{30,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abpr]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
achou=0
while read local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$zero" ] && continue
  if [ "$remote_sha" = "$zero" ]; then
    diff=$(git log -p --format= "$local_sha" --not --remotes 2>/dev/null)
    nomes=$(git log --name-only --format= "$local_sha" --not --remotes 2>/dev/null)
  else
    diff=$(git diff "$remote_sha" "$local_sha" 2>/dev/null)
    nomes=$(git diff --name-only "$remote_sha" "$local_sha" 2>/dev/null)
  fi
  if printf '%s\\n' "$diff" | grep -E '^\\+' | grep -Eq "$padrao"; then
    echo "FRIDAY: tem uma chave de API ou chave privada nos commits deste push. Push cancelado." >&2
    printf '%s\\n' "$diff" | grep -E '^\\+' | grep -Eo "$padrao" | cut -c1-8 | sed 's/$/... (escondida)/' >&2
    achou=1
  fi
  if printf '%s\\n' "$nomes" | grep -Eiq '(^|/)\\.env(\\.[A-Za-z0-9_.-]+)?$|\\.(pem|key|pfx|p12|keystore|jks)$|(^|/)id_(rsa|ed25519|ecdsa)$'; then
    if ! printf '%s\\n' "$nomes" | grep -Eiq '\\.(example|sample|exemplo)$'; then
      echo "FRIDAY: um arquivo secreto (.env, chave) está indo junto. Push cancelado." >&2
      achou=1
    fi
  fi
done
exit $achou
`

// ---------- GitHub ----------

/** "git@github.com:dono/repo.git" ou "https://github.com/dono/repo" → "dono/repo" */
export function repoDoGithub(remoto: string): string | null {
  const m = remoto.trim().match(/github\.com[:/]+([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
  return m ? `${m[1]}/${m[2]}` : null
}

/** Página de issue nova já preenchida (você só confere e clica em "Submit"). */
export function linkIssueNova(repo: string, titulo: string, corpo: string): string {
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(corpo)}`
}
