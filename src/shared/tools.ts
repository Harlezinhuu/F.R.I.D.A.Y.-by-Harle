// Ferramentas que a FRIDAY pode usar. A IA só age no PC por aqui:
// nada de comandos livres, só ações conhecidas e seguras.

export interface ToolDeclaration {
  name: string
  description: string
  parameters?: {
    type: 'OBJECT'
    properties: Record<string, { type: 'STRING' | 'NUMBER' | 'BOOLEAN'; description: string; enum?: string[] }>
    required?: string[]
  }
}

/** Ferramentas resolvidas no próprio HUD, sem passar pelo processo principal. */
export const TOOLS_DO_HUD = ['mostrar_painel', 'encerrar_conversa'] as const

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'listar_apps',
    description: 'Lista os programas que a FRIDAY tem permissão para abrir e fechar.'
  },
  {
    name: 'abrir_app',
    description: 'Abre um programa do PC pelo nome (ex.: Spotify, Discord, Chrome, Steam).',
    parameters: {
      type: 'OBJECT',
      properties: { nome: { type: 'STRING', description: 'Nome do programa, como o usuário falou.' } },
      required: ['nome']
    }
  },
  {
    name: 'fechar_app',
    description:
      'Fecha um programa. É uma ação perigosa (pode perder trabalho não salvo): chame primeiro sem "confirmado", pergunte ao usuário e só chame de novo com confirmado=true se ele confirmar claramente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome do programa.' },
        confirmado: { type: 'BOOLEAN', description: 'true somente depois que o usuário confirmou por voz.' }
      },
      required: ['nome']
    }
  },
  {
    name: 'volume',
    description: 'Controla o volume geral do Windows.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer.', enum: ['definir', 'aumentar', 'diminuir', 'mudo', 'tirar_mudo', 'consultar'] },
        valor: { type: 'NUMBER', description: 'Porcentagem de 0 a 100 (para definir) ou quanto mudar (para aumentar/diminuir).' }
      },
      required: ['acao']
    }
  },
  {
    name: 'midia',
    description: 'Controla a música ou vídeo que está tocando (Spotify, YouTube, etc.).',
    parameters: {
      type: 'OBJECT',
      properties: { acao: { type: 'STRING', description: 'Ação de mídia.', enum: ['tocar_pausar', 'proxima', 'anterior'] } },
      required: ['acao']
    }
  },
  {
    name: 'pesquisar_web',
    description: 'Abre uma pesquisa no navegador padrão.',
    parameters: {
      type: 'OBJECT',
      properties: { consulta: { type: 'STRING', description: 'O que pesquisar.' } },
      required: ['consulta']
    }
  },
  {
    name: 'abrir_site',
    description: 'Abre um site no navegador padrão. Só endereços https.',
    parameters: {
      type: 'OBJECT',
      properties: { url: { type: 'STRING', description: 'Endereço completo, começando com https://' } },
      required: ['url']
    }
  },
  {
    name: 'status_sistema',
    description: 'Mostra o uso de CPU, RAM e placa de vídeo agora.'
  },
  {
    name: 'criar_lembrete',
    description: 'Cria um lembrete que avisa no horário marcado.',
    parameters: {
      type: 'OBJECT',
      properties: {
        texto: { type: 'STRING', description: 'Do que lembrar.' },
        quando_iso: { type: 'STRING', description: 'Data e hora no formato ISO 8601 com fuso, ex.: 2026-10-24T09:00:00-03:00' }
      },
      required: ['texto', 'quando_iso']
    }
  },
  {
    name: 'listar_lembretes',
    description: 'Lista os lembretes pendentes.'
  },
  {
    name: 'mostrar_painel',
    description: 'Abre ou fecha os painéis completos do HUD.',
    parameters: {
      type: 'OBJECT',
      properties: { painel: { type: 'STRING', description: 'Qual painel.', enum: ['sistema', 'modulos', 'tudo', 'fechar'] } },
      required: ['painel']
    }
  },
  {
    name: 'encerrar_conversa',
    description: 'Encerra a conversa quando o usuário se despede ("pode descansar", "tchau", "é só isso").'
  }
]

export function systemPrompt(nome: string, agora: Date): string {
  const quem = nome ? `o ${nome}` : 'o usuário'
  const data = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  return [
    `Você é F.R.I.D.A.Y, a assistente pessoal de voz de ${quem}, rodando no PC Windows dele.`,
    'Fale sempre em português do Brasil, de forma natural, curta e direta: uma ou duas frases, a não ser que peçam detalhes.',
    'Tom: confiante, leve e um pouco espirituosa. Nunca bajuladora.',
    'Use as ferramentas para agir no PC. Nunca diga que fez algo sem ter chamado a ferramenta e recebido sucesso.',
    'Se uma ferramenta pedir confirmação, pergunte em uma frase e só repita a chamada com confirmado=true se a pessoa confirmar com clareza.',
    'Se não entendeu o pedido, peça para repetir. Se não existe ferramenta para o pedido, diga isso com honestidade.',
    'Quando a pessoa se despedir ("pode descansar", "tchau", "é só isso"), responda brevemente e chame encerrar_conversa.',
    `Agora é ${data} (horário de Brasília). Use isso para calcular horários de lembretes.`
  ].join('\n')
}
