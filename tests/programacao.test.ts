import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GANCHO_PRE_PUSH, falarRevisao, lerTituloVsCode, linkIssueNova, repoDoGithub, resumirTestes, revisarDiff, trechoComLinhas } from '../src/main/logica/programacao.ts'

test('título do VS Code', () => {
  assert.deepEqual(lerTituloVsCode('● app.ts - harle-bot - Visual Studio Code'), { arquivo: 'app.ts', pasta: 'harle-bot' })
  assert.deepEqual(lerTituloVsCode('index.ts - friday (Workspace) - Visual Studio Code'), { arquivo: 'index.ts', pasta: 'friday' })
  assert.deepEqual(lerTituloVsCode('Welcome - harle-bot - Visual Studio Code'), { arquivo: '', pasta: 'harle-bot' })
  assert.equal(lerTituloVsCode('YouTube - Google Chrome'), null)
})

test('saída do node:test', () => {
  const saida = `TAP version 13
# Subtest: soma
ok 1 - soma
# Subtest: divide por zero
not ok 2 - divide por zero
  ---
  duration_ms: 1.2
  location: 'C:\\\\proj\\\\tests\\\\calc.test.ts:14:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
  code: 'ERR_ASSERTION'
  ...
# pass 7
# fail 1`
  const r = resumirTestes(saida)
  assert.equal(r.ferramenta, 'node:test')
  assert.equal(r.passaram, 7)
  assert.equal(r.falharam, 1)
  assert.equal(r.falhas[0].titulo, 'divide por zero')
  assert.equal(r.falhas[0].linha, 14)
  assert.match(r.falhas[0].arquivo, /calc\.test\.ts$/)
})

test('saída do Jest com cores', () => {
  const saida = `\u001b[31mFAIL\u001b[39m src/fila.test.js
  ● Fila › tira o primeiro

    expect(received).toBe(expected)

      at Object.<anonymous> (src/fila.test.js:22:18)
      at node_modules/jest-circus/build/utils.js:1:1

Tests:       1 failed, 9 passed, 10 total`
  const r = resumirTestes(saida)
  assert.equal(r.falharam, 1)
  assert.equal(r.passaram, 9)
  assert.equal(r.falhas[0].titulo, 'Fila > tira o primeiro')
  assert.equal(r.falhas[0].mensagem, 'expect(received).toBe(expected)')
  assert.deepEqual([r.falhas[0].arquivo, r.falhas[0].linha], ['src/fila.test.js', 22])
})

test('saída do pytest e do tsc', () => {
  const py = resumirTestes(`tests/test_bot.py:31: AssertionError\nFAILED tests/test_bot.py::test_musica - AssertionError: fila vazia\n==== 1 failed, 4 passed in 0.31s ====`)
  assert.deepEqual([py.falharam, py.passaram, py.falhas[0].titulo, py.falhas[0].linha], [1, 4, 'test_musica', 31])
  const tsc = resumirTestes(`src/main/app.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.`)
  assert.deepEqual([tsc.ferramenta, tsc.falhas[0].arquivo, tsc.falhas[0].linha], ['tsc', 'src/main/app.ts', 12])
})

test('trecho numerado marca a linha', () => {
  const t = trechoComLinhas('a\nb\nc\nd\ne', 3, 1)
  assert.equal(t, '  2 | b\n> 3 | c\n  4 | d')
})

test('revisora acha chave, .env, conflito e console.log', () => {
  const diff = `diff --git a/src/api.ts b/src/api.ts
+++ b/src/api.ts
@@ -1,2 +1,5 @@
 import x from 'y'
+const chave = 'AIzaSyA1234567890abcdefghijklmnopqrstuv'
+console.log('debug', x)
+// TODO: tirar isso
 export default x
+++ b/.env
@@ -0,0 +1 @@
+GEMINI_API_KEY=abc
+++ b/.env.example
@@ -0,0 +1 @@
+GEMINI_API_KEY=
+++ b/src/m.ts
@@ -10,0 +11,3 @@
+<<<<<<< HEAD
+=======
+>>>>>>> outra`
  const a = revisarDiff(diff)
  assert.deepEqual(a.find((x) => x.tipo === 'segredo')?.linha, 2)
  assert.ok(!a.find((x) => x.tipo === 'segredo')!.texto.includes('AIzaSy'), 'a chave não pode aparecer nem no aviso')
  assert.equal(a.filter((x) => x.tipo === 'arquivo_secreto').map((x) => x.arquivo).join(), '.env')
  assert.equal(a.find((x) => x.tipo === 'console')?.linha, 3)
  assert.equal(a.filter((x) => x.tipo === 'conflito').length, 3)
  assert.match(falarRevisao(a), /^PARE: tem 2 chaves ou senhas/)
  assert.equal(falarRevisao([]), 'Nada de chave, senha, conflito ou console.log esquecido. Pode mandar.')
})

test('GitHub: repo e link de issue', () => {
  assert.equal(repoDoGithub('git@github.com:Harlezinhuu/F.R.I.D.A.Y.-by-Harle.git'), 'Harlezinhuu/F.R.I.D.A.Y.-by-Harle')
  assert.equal(repoDoGithub('https://github.com/dono/harle-bot'), 'dono/harle-bot')
  assert.equal(repoDoGithub('https://gitlab.com/x/y'), null)
  assert.equal(linkIssueNova('dono/bot', 'Fila trava', 'quando vazia'), 'https://github.com/dono/bot/issues/new?title=Fila%20trava&body=quando%20vazia')
})

test('gancho pre-push bloqueia chave e deixa o resto passar', () => {
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  const base = mkdtempSync(join(tmpdir(), 'friday-gancho-'))
  const remoto = join(base, 'remoto.git'), local = join(base, 'local')
  git(base, 'init', '-q', '--bare', remoto)
  git(base, 'clone', '-q', remoto, local)
  writeFileSync(join(local, 'a.txt'), 'oi\n')
  git(local, 'add', '.'); git(local, 'commit', '-qm', 'um')
  mkdirSync(join(local, '.git', 'hooks'), { recursive: true })
  writeFileSync(join(local, '.git', 'hooks', 'pre-push'), GANCHO_PRE_PUSH)
  chmodSync(join(local, '.git', 'hooks', 'pre-push'), 0o755)
  git(local, 'push', '-q', 'origin', 'HEAD') // sem chave: passa
  writeFileSync(join(local, 'config.js'), "const k = 'AIzaSyA1234567890abcdefghijklmnopqrstuv'\n")
  git(local, 'add', '.'); git(local, 'commit', '-qm', 'dois')
  assert.throws(() => git(local, 'push', '-q', 'origin', 'HEAD'), /chave de API/)
  git(local, 'reset', '-q', '--hard', 'HEAD~1')
  writeFileSync(join(local, '.env'), 'X=1\n')
  git(local, 'add', '-f', '.env'); git(local, 'commit', '-qm', 'tres')
  assert.throws(() => git(local, 'push', '-q', 'origin', 'HEAD'), /arquivo secreto/)
  git(local, 'reset', '-q', '--hard', 'HEAD~1')
  writeFileSync(join(local, '.env.example'), 'X=\n')
  git(local, 'add', '.'); git(local, 'commit', '-qm', 'quatro')
  git(local, 'push', '-q', 'origin', 'HEAD') // exemplo: passa
})
