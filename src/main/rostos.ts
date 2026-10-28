// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Cadastro de rostos: assinaturas numéricas (não fotos) de quem aceitou ser reconhecido.
// Fica só neste PC, em rostos.json na pasta de dados; nunca vai para a internet nem para o celular.

import { app } from 'electron'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Cadastro, Papel, Pessoa } from '../shared/rostos'

const caminho = (): string => join(app.getPath('userData'), 'rostos.json')

export function lerCadastro(): Cadastro {
  try {
    if (!existsSync(caminho())) return { soDono: false, pessoas: [] }
    const d = JSON.parse(readFileSync(caminho(), 'utf8')) as Partial<Cadastro>
    const pessoas = (Array.isArray(d.pessoas) ? d.pessoas : []).filter((p) => p && typeof p.nome === 'string' && Array.isArray(p.descritores) && p.descritores.length)
    return { soDono: d.soDono === true && pessoas.some((p) => p.papel === 'dono'), pessoas }
  } catch {
    return { soDono: false, pessoas: [] }
  }
}

function salvar(c: Cadastro): void {
  if (!c.pessoas.length) { rmSync(caminho(), { force: true }); return }
  const tmp = `${caminho()}.tmp`
  writeFileSync(tmp, JSON.stringify(c), 'utf8')
  renameSync(tmp, caminho())
}

const limparDescritores = (d: unknown): number[][] =>
  (Array.isArray(d) ? d : []).filter((x): x is number[] => Array.isArray(x) && x.length >= 64 && x.every((n) => typeof n === 'number' && Number.isFinite(n))).slice(0, 12)

export function salvarPessoa(nome: string, papel: Papel, descritores: unknown): Pessoa {
  const c = lerCadastro()
  const lista = limparDescritores(descritores)
  if (lista.length < 2) throw new Error('Poucas amostras do rosto.')
  // O primeiro cadastro é sempre o dono
  const p: Pessoa = { id: randomUUID(), nome: nome.trim().slice(0, 40) || 'Sem nome', papel: c.pessoas.length ? papel : 'dono', descritores: lista, criadoEm: new Date().toISOString() }
  // Mesmo nome: substitui (recadastro)
  c.pessoas = [...c.pessoas.filter((x) => x.nome.toLowerCase() !== p.nome.toLowerCase()), p]
  if (!c.pessoas.some((x) => x.papel === 'dono')) p.papel = 'dono'
  salvar(c)
  return p
}

export function apagarPessoa(id: string): Pessoa[] {
  const c = lerCadastro()
  const alvo = c.pessoas.find((p) => p.id === id)
  if (!alvo) return []
  // Apagar o dono apaga tudo: o reconhecimento desliga
  const fora = alvo.papel === 'dono' ? c.pessoas : [alvo]
  salvar({ soDono: alvo.papel === 'dono' ? false : c.soDono, pessoas: c.pessoas.filter((p) => !fora.includes(p)) })
  return fora
}

export function definirSoDono(ligar: boolean): void {
  const c = lerCadastro()
  salvar({ ...c, soDono: ligar })
}

/** O rosto muda com a luz e o tempo: reconhecimentos firmes viram amostras novas (até 12). */
export function aprender(id: string, descritor: unknown): void {
  const c = lerCadastro()
  const p = c.pessoas.find((x) => x.id === id)
  const novo = limparDescritores([descritor])[0]
  if (!p || !novo) return
  p.descritores = [...p.descritores, novo].slice(-12)
  salvar(c)
}
