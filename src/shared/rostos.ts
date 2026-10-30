// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Regras do reconhecimento facial (sem câmera nem modelo, por isso têm testes): comparar a
// assinatura do rosto com as cadastradas e decidir o que cada pessoa pode pedir.
// A "assinatura" é uma lista de números tirada do rosto (não é foto) e fica só no PC.

export type Papel = 'dono' | 'convidado'

export interface Pessoa {
  id: string
  nome: string
  papel: Papel
  /** Assinaturas do rosto (várias, de ângulos e luzes diferentes) */
  descritores: number[][]
  criadoEm: string
}

export interface Cadastro {
  /** Só o dono conversa com ela; os outros ouvem um "só atendo o dono" */
  soDono: boolean
  pessoas: Pessoa[]
}

/** Mesma conta do Human (distância euclidiana normalizada, 0 a 1; acima de 0,5 é a mesma pessoa). */
export function semelhanca(a: number[], b: number[], multiplicador = 25, min = 0.2, max = 0.8): number {
  if (!a?.length || a.length !== b?.length) return 0
  let soma = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; soma += d * d }
  const dist = Math.round(100 * multiplicador * soma) / 100
  if (dist === 0) return 1
  const norm = (1 - Math.sqrt(dist) / 100 - min) / (max - min)
  return Math.round(100 * Math.max(Math.min(norm, 1), 0)) / 100
}

export const LIMIAR = 0.5

export interface Reconhecimento { pessoa: Pessoa; semelhanca: number }

/**
 * Quem é? Compara com todas as assinaturas de cada pessoa e fica com a melhor.
 * Se duas pessoas diferentes ficarem quase empatadas, não arrisca: devolve null.
 */
export function reconhecer(descritor: number[], pessoas: Pessoa[], limiar = LIMIAR): Reconhecimento | null {
  const notas = pessoas.map((p) => ({ pessoa: p, semelhanca: Math.max(0, ...p.descritores.map((d) => semelhanca(descritor, d))) }))
    .sort((x, y) => y.semelhanca - x.semelhanca)
  const [primeiro, segundo] = notas
  if (!primeiro || primeiro.semelhanca < limiar) return null
  if (segundo && primeiro.semelhanca - segundo.semelhanca < 0.04) return null
  return primeiro
}

/** O que só o dono pode pedir: arquivos, memória, desligar o PC, tarefas, pareamento e cadastro de rostos. */
export const SO_DONO = new Set([
  'listar_arquivos', 'abrir_arquivo', 'mover_arquivo', 'criar_pasta', 'apagar_arquivo', 'desfazer',
  'memorizar', 'o_que_sabe', 'esquecer', 'aprendizado',
  'energia_pc', 'fechar_app', 'capturar_tela',
  'tarefa_programacao', 'cancelar_tarefa', 'status_tarefas', 'listar_projetos',
  'criar_rotina', 'apagar_rotina', 'parear_celular', 'mandar_para_celular',
  'marcar_consulta', 'responder_consulta', 'andamento_consulta', 'lugar_de_consulta', 'ligar_de_fora', 'buscar_nos_meus_arquivos', 'abrir_achado', 'segundo_cerebro', 'pesquisa_profunda', 'pesquisas'
])

export function podeUsar(ferramenta: string, papel: Papel | null): boolean {
  return papel === 'dono' || !SO_DONO.has(ferramenta)
}

/** Linha que entra no começo da conversa dizendo quem está falando. */
export function quemEsta(r: Reconhecimento | null, temCadastro: boolean, nomeDono: string): string {
  if (!temCadastro) return ''
  if (!r) return `Quem chamou agora não foi reconhecido pelo rosto: trate como visitante. Não revele nada da memória ou da vida de ${nomeDono || 'o dono'}, e ações do dono (arquivos, memória, desligar o PC, tarefas) estão bloqueadas.`
  if (r.pessoa.papel === 'dono') return `Quem chamou agora é ${r.pessoa.nome}, o dono (reconhecido pelo rosto).`
  return `Quem chamou agora é ${r.pessoa.nome}, convidado (reconhecido pelo rosto). Chame pelo nome. Não revele nada da memória ou da vida de ${nomeDono || 'o dono'}; ações do dono estão bloqueadas.`
}

/** Junta as assinaturas boas do cadastro: tira as que destoam da média (piscada, rosto virado). */
export function filtrarAmostras(amostras: number[][], minimo = 3): number[][] {
  if (amostras.length <= minimo) return amostras
  const notas = amostras.map((a, i) => ({ a, media: amostras.reduce((s, b, j) => (i === j ? s : s + semelhanca(a, b)), 0) / (amostras.length - 1) }))
  const corte = Math.max(...notas.map((n) => n.media)) - 0.15
  return notas.filter((n) => n.media >= corte).map((n) => n.a).slice(0, 6)
}
