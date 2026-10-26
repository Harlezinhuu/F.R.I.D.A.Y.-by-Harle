// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ferramentas que a FRIDAY pode usar. A IA só age no PC por aqui:
// nada de comandos livres, só ações conhecidas e seguras.

type Simples = { type: 'STRING' | 'NUMBER' | 'BOOLEAN'; description: string; enum?: string[] }
type Lista = { type: 'ARRAY'; description: string; items: { type: 'OBJECT'; properties: Record<string, Simples>; required?: string[] } }
type ListaSimples = { type: 'ARRAY'; description: string; items: Simples }

export interface ToolDeclaration {
  name: string
  description: string
  parameters?: {
    type: 'OBJECT'
    properties: Record<string, Simples | Lista | ListaSimples>
    required?: string[]
  }
}

/** Ferramentas resolvidas no próprio HUD, sem passar pelo processo principal. */
export const TOOLS_DO_HUD = ['mostrar_painel', 'minimizar', 'projetar', 'controlar_projecao', 'encerrar_conversa', 'modo_foco', 'encerrar_foco', 'diagnostico', 'executar_rotina', 'mostrar_cena'] as const

const CAMINHO = 'Caminho começando pela pasta pessoal: "downloads/arquivo.pdf", "área de trabalho/projetos", "documentos", "imagens", "músicas" ou "vídeos".'

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
    description: 'Cria um lembrete que avisa no horário marcado, uma vez ou repetindo ("todo dia às 8", "nos dias úteis").',
    parameters: {
      type: 'OBJECT',
      properties: {
        texto: { type: 'STRING', description: 'Do que lembrar.' },
        quando_iso: { type: 'STRING', description: 'Data e hora (a primeira vez) no formato ISO 8601 com fuso, ex.: 2026-10-24T09:00:00-03:00' },
        repetir: { type: 'STRING', description: 'Repetição.', enum: ['nunca', 'diario', 'dias_uteis', 'semanal', 'mensal'] }
      },
      required: ['texto', 'quando_iso']
    }
  },
  {
    name: 'criar_timer',
    description: 'Liga um timer ("timer de 10 minutos", "me avisa em 30 segundos").',
    parameters: {
      type: 'OBJECT',
      properties: {
        minutos: { type: 'NUMBER', description: 'Minutos.' },
        segundos: { type: 'NUMBER', description: 'Segundos (somados aos minutos).' },
        texto: { type: 'STRING', description: 'Para que é o timer (opcional, ex.: "macarrão").' }
      }
    }
  },
  {
    name: 'listar_lembretes',
    description: 'Lista os lembretes e timers pendentes.'
  },
  {
    name: 'cancelar_lembrete',
    description: 'Cancela um lembrete pelo texto ("cancela o do dentista") ou os timers ligados (timer=true).',
    parameters: {
      type: 'OBJECT',
      properties: {
        texto: { type: 'STRING', description: 'Trecho do texto do lembrete.' },
        timer: { type: 'BOOLEAN', description: 'true para cancelar timers.' }
      }
    }
  },
  {
    name: 'criar_rotina',
    description:
      'Cria ou atualiza uma rotina com nome ("modo trabalho": abre o Chrome, abre o Spotify, diz bom trabalho). Passos permitidos: abrir_app, fechar_app, volume, midia, pesquisar_web, abrir_site, status_sistema, clima, capturar_tela, modo_foco, mostrar_painel, dizer {texto}, esperar {segundos até 60}. Se tiver fechar_app, peça confirmação e chame de novo com confirmado=true.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome curto da rotina, como o usuário vai falar.' },
        passos: {
          type: 'ARRAY',
          description: 'Passos na ordem.',
          items: {
            type: 'OBJECT',
            properties: {
              ferramenta: { type: 'STRING', description: 'Nome da ferramenta do passo.' },
              argumentos_json: { type: 'STRING', description: 'Argumentos do passo em JSON, ex.: {"nome":"Spotify"}' }
            },
            required: ['ferramenta']
          }
        },
        confirmado: { type: 'BOOLEAN', description: 'true somente depois que o usuário confirmou.' }
      },
      required: ['nome', 'passos']
    }
  },
  {
    name: 'executar_rotina',
    description: 'Executa uma rotina salva. Use quando o usuário disser o nome de uma rotina ("modo trabalho").',
    parameters: { type: 'OBJECT', properties: { nome: { type: 'STRING', description: 'Nome da rotina.' } }, required: ['nome'] }
  },
  { name: 'listar_rotinas', description: 'Lista as rotinas salvas.' },
  {
    name: 'apagar_rotina',
    description: 'Apaga uma rotina salva.',
    parameters: { type: 'OBJECT', properties: { nome: { type: 'STRING', description: 'Nome da rotina.' } }, required: ['nome'] }
  },
  { name: 'capturar_tela', description: 'Tira um print da tela e salva em Imagens/FRIDAY.' },
  {
    name: 'listar_arquivos',
    description: 'Lista o que tem numa pasta pessoal, os mais recentes primeiro. Use antes de mover ou apagar para saber o nome exato.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pasta: { type: 'STRING', description: CAMINHO },
        filtro: { type: 'STRING', description: 'Trecho do nome para filtrar (opcional), ex.: ".pdf" ou "contrato".' }
      },
      required: ['pasta']
    }
  },
  {
    name: 'abrir_arquivo',
    description: 'Abre um arquivo ou pasta com o programa padrão do Windows.',
    parameters: { type: 'OBJECT', properties: { caminho: { type: 'STRING', description: CAMINHO } }, required: ['caminho'] }
  },
  {
    name: 'mover_arquivo',
    description: 'Move ou renomeia um arquivo ou pasta. Se o destino for uma pasta, vai para dentro dela. Nunca sobrescreve. Dá para desfazer.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origem: { type: 'STRING', description: CAMINHO },
        destino: { type: 'STRING', description: CAMINHO }
      },
      required: ['origem', 'destino']
    }
  },
  {
    name: 'criar_pasta',
    description: 'Cria uma pasta.',
    parameters: { type: 'OBJECT', properties: { caminho: { type: 'STRING', description: CAMINHO } }, required: ['caminho'] }
  },
  {
    name: 'apagar_arquivo',
    description: 'Manda um arquivo ou pasta para a Lixeira. Ação perigosa: chame sem confirmado, pergunte e só chame com confirmado=true se o usuário confirmar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        caminho: { type: 'STRING', description: CAMINHO },
        confirmado: { type: 'BOOLEAN', description: 'true somente depois que o usuário confirmou.' }
      },
      required: ['caminho']
    }
  },
  { name: 'desfazer', description: 'Desfaz o último mover, renomear ou criar pasta.' },
  {
    name: 'clima',
    description: 'Clima agora e do dia.',
    parameters: { type: 'OBJECT', properties: { cidade: { type: 'STRING', description: 'Cidade (opcional; sem ela, usa a cidade do usuário).' } } }
  },
  {
    name: 'modo_foco',
    description: 'Liga o modo foco: tela calma, timer no núcleo e avisos guardados até o fim.',
    parameters: { type: 'OBJECT', properties: { minutos: { type: 'NUMBER', description: 'Duração em minutos (padrão 25).' } } }
  },
  { name: 'encerrar_foco', description: 'Encerra o modo foco antes da hora.' },
  {
    name: 'memorizar',
    description:
      'Guarda algo duradouro que o usuário contou sobre si: gostos, pessoas da vida dele, projetos, rotina e como quer ser atendido (inclusive correções, como "não me chama de senhor"). Chame sem anunciar, junto com a resposta normal. Nunca guarde senhas, PINs, chaves, documentos, números de cartão ou conta, nem coisas passageiras (o que vai fazer hoje).',
    parameters: {
      type: 'OBJECT',
      properties: {
        fato: { type: 'STRING', description: 'Uma frase curta em terceira pessoa, ex.: "Gosta de café sem açúcar".' },
        categoria: { type: 'STRING', description: 'Tipo do fato.', enum: ['gosto', 'pessoa', 'projeto', 'preferencia', 'rotina', 'outro'] }
      },
      required: ['fato', 'categoria']
    }
  },
  {
    name: 'o_que_sabe',
    description: 'Mostra o que você sabe sobre o usuário ("o que você sabe sobre mim?", "o que você aprendeu?").',
    parameters: { type: 'OBJECT', properties: { assunto: { type: 'STRING', description: 'Filtro opcional, ex.: "projetos" ou "café".' } } }
  },
  {
    name: 'esquecer',
    description: 'Esquece algo da memória ("esquece isso", "esquece o que eu disse sobre café"). Para apagar tudo, tudo=true e confirmação.',
    parameters: {
      type: 'OBJECT',
      properties: {
        trecho: { type: 'STRING', description: 'Assunto ou palavras do que esquecer. Para "esquece isso", use o fato que acabou de ser guardado.' },
        tudo: { type: 'BOOLEAN', description: 'true para apagar toda a memória.' },
        confirmado: { type: 'BOOLEAN', description: 'true somente depois que o usuário confirmou apagar tudo.' }
      }
    }
  },
  {
    name: 'aprendizado',
    description: 'Liga ou desliga o aprendizado ("para de aprender", "volta a aprender").',
    parameters: { type: 'OBJECT', properties: { ativo: { type: 'BOOLEAN', description: 'true liga, false desliga.' } }, required: ['ativo'] }
  },
  {
    name: 'mostrar_cena',
    description:
      'Mostra na tela uma foto e um resumo da Wikipédia sobre algo concreto de que você está falando: pessoa, lugar, obra, animal, objeto, evento. Chame sem anunciar, no começo da resposta, no máximo uma vez por resposta. Não use para ações no PC nem para assuntos abstratos.',
    parameters: { type: 'OBJECT', properties: { termo: { type: 'STRING', description: 'Nome como estaria no título da Wikipédia, ex.: "Torre Eiffel".' } }, required: ['termo'] }
  },
  { name: 'listar_projetos', description: 'Lista os projetos de programação configurados para tarefas.' },
  {
    name: 'tarefa_programacao',
    description:
      'Entrega uma tarefa de programação ao Claude Code, que trabalha em segundo plano numa cópia isolada do projeto e deixa o resultado numa branch para revisão. Use quando o usuário pedir para programar algo num projeto ("tarefa no projeto site: criar a página de contato").',
    parameters: {
      type: 'OBJECT',
      properties: {
        projeto: { type: 'STRING', description: 'Nome do projeto.' },
        pedido: { type: 'STRING', description: 'A tarefa completa e detalhada, com tudo o que o usuário falou.' }
      },
      required: ['projeto', 'pedido']
    }
  },
  { name: 'status_tarefas', description: 'Diz como estão as tarefas de programação ("como está a tarefa?").' },
  { name: 'cancelar_tarefa', description: 'Cancela a tarefa de programação em andamento (ou a próxima da fila).' },
  {
    name: 'projetar',
    description:
      'Projeta um holograma 3D: as partículas saem da fita e montam o objeto. Use para "projeta...", "me mostra em 3D...", "modela...". ' +
      'Formas prontas (fonte forma): fita de Möbius, Möbius invertida, toro, nó de trevo, esfera, Saturno, garrafa de Klein, DNA, átomo, tesseract, sistema solar (posições reais de hoje), atrator de Lorenz, galáxia, buraco negro, cubo, tetraedro, octaedro, dodecaedro, icosaedro, onda, sela. ' +
      'Funções (fonte funcao): "z igual seno de x vezes cosseno de y" → formula "sin(x)*cos(y)"; use t para animar ("sin(x - t)"). ' +
      'Moléculas reais (fonte molecula, nome em inglês: caffeine, water, glucose). Proteínas (fonte proteina: hemoglobin, insulin, ou o código PDB). ' +
      'Naves, sondas, telescópios, foguetes e trajes espaciais da NASA (fonte nasa). Arquivos do usuário (fonte arquivo). Qualquer outro objeto: fonte auto (tenta arquivos, NASA, Wikimedia e por fim a IA monta) ou ia.',
    parameters: {
      type: 'OBJECT',
      properties: {
        o_que: { type: 'STRING', description: 'O que projetar, como o usuário falou (ex.: "motor V8", "cafeína", "estação espacial").' },
        termo_ingles: { type: 'STRING', description: 'O mesmo nome em inglês, para buscar nas bibliotecas (ex.: "V8 engine", "caffeine", "International Space Station").' },
        fonte: { type: 'STRING', description: 'De onde vem o modelo.', enum: ['auto', 'forma', 'funcao', 'molecula', 'proteina', 'nasa', 'wikimedia', 'arquivo', 'ia'] },
        formula: { type: 'STRING', description: 'Só para fonte funcao: z em notação matemática com x, y e t (ex.: "sin(x)*cos(y)", "x^2 - y^2", "sin(sqrt(x^2+y^2) - t)").' }
      },
      required: ['o_que']
    }
  },
  {
    name: 'controlar_projecao',
    description:
      'Mexe no holograma que está na tela. girar/parar, esquerda/direita (90°), virar (de cabeça para baixo), frente/cima/lado (vistas), aproximar/afastar, ' +
      'explodir (separa as peças com etiquetas)/juntar, inverter (o "inverted" do filme)/desinverter, cortar (corte transversal)/tirar_corte, renderizar (superfície sólida: "renderiza", "render"), ' +
      'so_linhas (só wireframe)/particulas, medir (medidas e caixa), salvar (foto da projeção em Imagens/FRIDAY), fechar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer.', enum: ['girar', 'parar', 'esquerda', 'direita', 'virar', 'frente', 'cima', 'lado', 'aproximar', 'afastar', 'explodir', 'juntar', 'inverter', 'desinverter', 'cortar', 'tirar_corte', 'renderizar', 'so_linhas', 'particulas', 'medir', 'salvar', 'fechar'] },
        vezes: { type: 'NUMBER', description: 'Quantas vezes (para aproximar, afastar, esquerda e direita). Padrão 1.' }
      },
      required: ['acao']
    }
  },
  { name: 'listar_modelos', description: 'Lista os arquivos 3D do usuário (pasta Documentos/FRIDAY Modelos) que dá para projetar.' },
  {
    name: 'visao_deus',
    description:
      'Abre a Visão de Deus: um globo 3D com dados públicos ao vivo (aviões, satélites, navios, terremotos, câmeras públicas, radar de chuva, raios). Use para "visão de Deus", "me mostra os aviões sobre São Paulo", "abre o globo em Tóquio". Se já estiver aberta, troca só o que foi pedido (lugar, camadas ou estilo).',
    parameters: {
      type: 'OBJECT',
      properties: {
        lugar: { type: 'STRING', description: 'Cidade, país, monumento ou endereço. Vazio = o planeta inteiro (ou mantém o lugar atual).' },
        camadas: {
          type: 'ARRAY',
          description: 'Camadas para ligar. Vazio = mantém as atuais.',
          items: { type: 'STRING', description: 'Camada.', enum: ['avioes', 'militares', 'satelites', 'navios', 'terremotos', 'cameras', 'foguetes', 'radar', 'raios', 'ciclones', 'vento', 'transito'] }
        },
        estilo: { type: 'STRING', description: 'Estilo visual.', enum: ['normal', 'noturno', 'termico', 'retro', 'anime', 'noir', 'neve'] }
      }
    }
  },
  { name: 'fechar_visao_deus', description: 'Fecha a Visão de Deus e desliga o servidor dela.' },
  { name: 'diagnostico', description: 'Confere como a FRIDAY está: cérebro, voz, microfone, palavra de ativação, internet, controle do Windows ("como você está?", "status", "diagnóstico").' },
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
    name: 'minimizar',
    description: 'Minimiza a FRIDAY: volta ao modo compacto do canto da tela, como quando ela abre, e fica esperando o "Friday" ("minimiza", "fica pequena", "volta pro canto", "recolhe").'
  },
  {
    name: 'encerrar_conversa',
    description: 'Encerra a conversa quando o usuário se despede ("pode descansar", "tchau", "é só isso").'
  }
]

export function systemPrompt(nome: string, agora: Date, memoria = ''): string {
  const quem = nome ? `o ${nome}` : 'o usuário'
  const data = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  return [
    `Você é F.R.I.D.A.Y, a assistente pessoal de voz de ${quem}, rodando no PC Windows dele.`,
    'Fale sempre em português do Brasil, de forma natural, curta e direta: uma ou duas frases, a não ser que peçam detalhes.',
    'Personalidade: calma, rápida e eficiente, com humor seco e um toque de ironia, como uma IA que já sabe o que você vai pedir.',
    'Vá direto ao ponto: nada de "claro!", "com certeza!" ou frases de cortesia. Confirme ações em poucas palavras ("Feito.", "Abrindo.").',
    'Nunca bajuladora. Pode provocar de leve, sem ser grosseira.',
    'Use as ferramentas para agir no PC. Nunca diga que fez algo sem ter chamado a ferramenta e recebido sucesso.',
    'Se uma ferramenta pedir confirmação, pergunte em uma frase e só repita a chamada com confirmado=true se a pessoa confirmar com clareza.',
    'Se não entendeu o pedido, peça para repetir. Se não existe ferramenta para o pedido, diga isso com honestidade.',
    'Quando a pessoa se despedir ("pode descansar", "tchau", "é só isso"), responda brevemente e chame encerrar_conversa.',
    'Se a pessoa disser só o nome de uma rotina ("modo trabalho"), chame executar_rotina com esse nome.',
    'Para arquivos, use listar_arquivos antes de mover, abrir ou apagar, para usar o nome exato. Você só alcança as pastas pessoais.',
    'Quando o resultado de uma ferramenta trouxer um campo "dizer", fale esse texto.',
    'Quando o usuário contar algo duradouro sobre si, chame memorizar em silêncio, sem anunciar que guardou.',
    'Quando falar de algo concreto e conhecido (pessoa, lugar, obra, objeto), chame mostrar_cena com o nome, sem anunciar.',
    'Com a Visão de Deus aberta, não chame mostrar_cena para lugares: o globo já mostra.',
    'Com uma projeção 3D na tela, não chame mostrar_cena. Pedidos como "gira", "explode", "inverte", "renderiza", "aproxima", "corta", "salva" ou "fecha" se referem à projeção: use controlar_projecao.',
    'Ao projetar, sempre passe termo_ingles. Para objetos reais, prefira a fonte certa (nasa, molecula, proteina); use auto quando não souber.',
    'A Visão de Deus mostra lugares, veículos e eventos públicos. Ela nunca localiza nem rastreia pessoas: se pedirem isso, recuse em uma frase.',
    `Agora é ${data} (horário de Brasília). Use isso para calcular horários de lembretes.`,
    ...(memoria ? ['', 'O que você já sabe sobre o usuário (use com naturalidade, sem recitar):', memoria] : [])
  ].join('\n')
}
