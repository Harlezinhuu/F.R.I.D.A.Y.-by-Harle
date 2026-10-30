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
export const TOOLS_DO_HUD = ['mostrar_painel', 'minimizar', 'projetar', 'controlar_projecao', 'gestos', 'encerrar_conversa', 'modo_foco', 'encerrar_foco', 'diagnostico', 'executar_rotina', 'mostrar_cena', 'explicar', 'mandar_para_celular', 'cadastrar_rosto', 'rostos'] as const

/** Ferramentas do PC que o celular pareado pode pedir pelo elo (o resto fica só no PC). */
export const TOOLS_REMOTAS = [
  'listar_apps', 'abrir_app', 'fechar_app', 'volume', 'midia', 'pesquisar_web', 'abrir_site', 'status_sistema', 'capturar_tela',
  'listar_arquivos', 'abrir_arquivo', 'listar_rotinas', 'executar_rotina', 'projetar', 'controlar_projecao', 'visao_deus', 'fechar_visao_deus',
  'tarefa_programacao', 'status_tarefas', 'energia_pc', 'modo_foco', 'minimizar', 'mostrar_painel',
  'responder_consulta', 'andamento_consulta', 'buscar_nos_meus_arquivos', 'abrir_achado', 'segundo_cerebro',
  'pesquisa_profunda', 'pesquisas'
]

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
    description: 'Clima e previsão de qualquer lugar do mundo: agora, hoje, amanhã ou até 16 dias ("vai chover amanhã em Gramado?", "como fica o tempo no fim de semana em Lisboa?").',
    parameters: {
      type: 'OBJECT',
      properties: {
        lugar: { type: 'STRING', description: 'Cidade, bairro, região, estado, país ou ponto turístico, com o estado ou país quando ajudar ("São José, SC", "Lisboa, Portugal"). Vazio = onde o usuário está.' },
        dias: { type: 'NUMBER', description: 'Quantos dias de previsão (1 a 16). Ex.: fim de semana = até o domingo.' },
        data: { type: 'STRING', description: 'Um dia específico, AAAA-MM-DD (ex.: amanhã). Use em vez de dias quando perguntarem de um dia só.' }
      }
    }
  },
  {
    name: 'buscar_na_internet',
    description: 'Pesquisa no Google e responde: notícias, resultados de jogos, preços, cotações, horários, lançamentos, qualquer fato atual ou que você não tenha certeza.',
    parameters: { type: 'OBJECT', properties: { pergunta: { type: 'STRING', description: 'A pergunta completa, como o usuário falou.' } }, required: ['pergunta'] }
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
  {
    name: 'explicar',
    description:
      'Abre o modo explicação na tela: enquanto você fala, as palavras-chave aparecem enormes, montadas em partículas e sincronizadas com a sua voz, com fotos e fatos ao lado. Use quando pedirem para explicar algo, contar uma história, um caso, uma teoria ou uma curiosidade, dizer como algo funciona, o que aconteceu, ou "o que você faria". Chame ANTES de começar a falar, sem anunciar, e depois explique falando.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tema: { type: 'STRING', description: 'Título curto, ex.: "O pouso na Lua".' },
        palavras: {
          type: 'ARRAY',
          description: '8 a 16 palavras-chave (uma ou duas palavras cada), escritas EXATAMENTE como você vai falá-las e na ordem da sua fala. Cada uma aparece na tela no momento em que você a disser.',
          items: { type: 'STRING', description: 'Palavra-chave.' }
        },
        alertas: {
          type: 'ARRAY',
          description: 'Quais dessas palavras são de perigo, proibição, mentira, crime ou morte (ficam vermelhas).',
          items: { type: 'STRING', description: 'Uma das palavras-chave.' }
        },
        imagens: {
          type: 'ARRAY',
          description: 'Até 4 coisas concretas do assunto para mostrar foto, como estariam no título da Wikipédia (pessoas, lugares, objetos, eventos).',
          items: { type: 'STRING', description: 'Título da Wikipédia.' }
        },
        fatos: {
          type: 'ARRAY',
          description: 'Até 3 fatos curtos e verdadeiros (datas, números, nomes), até 70 caracteres cada, para cartões ao lado.',
          items: { type: 'STRING', description: 'Fato curto.' }
        },
        veredito: { type: 'STRING', description: 'Opcional. Carimbo final em uma palavra quando a explicação responde se algo é verdade: "FALSO", "VERDADE", "MITO", "CONFIRMADO" ou "INCERTO".' }
      },
      required: ['tema', 'palavras']
    }
  },
  {
    name: 'cadastrar_rosto',
    description:
      'Cadastra o rosto de quem está na frente do PC para a FRIDAY reconhecer quem chama (opcional). O primeiro cadastro vira o dono; depois, só o dono cadastra convidados. Antes, explique que fica guardada só uma assinatura numérica do rosto (não é foto), só neste PC, e que dá para apagar quando quiser; só chame com confirmado=true depois que a pessoa disser que concorda.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome de quem está sendo cadastrado.' },
        papel: { type: 'STRING', description: 'dono ou convidado (o primeiro é sempre o dono).', enum: ['dono', 'convidado'] },
        confirmado: { type: 'BOOLEAN', description: 'true só depois que a pessoa cadastrada concordou.' }
      },
      required: ['nome']
    }
  },
  {
    name: 'rostos',
    description: 'Gerencia o reconhecimento facial: listar quem está cadastrado, apagar um cadastro ("apaga meu rosto"), "só atende a mim" (so_dono) ou "atende todo mundo" (todos). Apagar o dono apaga tudo e desliga o reconhecimento.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer.', enum: ['listar', 'apagar', 'so_dono', 'todos'] },
        nome: { type: 'STRING', description: 'De quem (para apagar).' },
        confirmado: { type: 'BOOLEAN', description: 'true depois de confirmar (para apagar o dono).' }
      },
      required: ['acao']
    }
  },
  {
    name: 'parear_celular',
    description: 'Mostra na tela o QR Code e o código para parear o app FRIDAY do celular com este PC ("pareia o celular", "conecta o celular").'
  },
  {
    name: 'energia_pc',
    description: 'Bloqueia, suspende, desliga ou reinicia o PC. Desligar e reiniciar pedem confirmação antes; "cancelar" desfaz um desligamento agendado.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer.', enum: ['bloquear', 'suspender', 'desligar', 'reiniciar', 'cancelar'] },
        confirmado: { type: 'BOOLEAN', description: 'true só depois que o usuário confirmou.' }
      },
      required: ['acao']
    }
  },
  {
    name: 'ligar_de_fora',
    description: 'Deixa o PC pronto para ser ligado de fora de casa pelo celular, mesmo desligado ("prepara para ligar o PC de fora"): ajusta a placa de rede e o Windows (o Windows pede autorização), abre a porta no roteador e confere se a operadora deixa. Depois diga o que ficou faltando (a BIOS sempre é com ele).'
  },
  {
    name: 'mandar_para_celular',
    description: 'Manda algo para o app FRIDAY no celular: a projeção 3D que está na tela, um link ou um texto ("joga isso pro celular", "manda esse site pro celular").',
    parameters: {
      type: 'OBJECT',
      properties: {
        o_que: { type: 'STRING', description: 'O que mandar.', enum: ['projecao', 'link', 'texto'] },
        url: { type: 'STRING', description: 'O link (https), quando for link.' },
        texto: { type: 'STRING', description: 'O texto, quando for texto.' }
      },
      required: ['o_que']
    }
  },
  {
    name: 'buscar_nos_meus_arquivos',
    description:
      'Segundo cérebro: procura pelo ASSUNTO nos documentos, anotações, PDFs, Word, planilhas e projetos dele ("onde está aquele PDF de redes que fala de sub-rede?", "o que eu anotei sobre o TCC?", "acha o contrato do aluguel"). Responda com o nome do arquivo e o que o trecho diz; para abrir, use abrir_achado.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pergunta: { type: 'STRING', description: 'O que ele procura, com as palavras dele.' },
        relacionadas: { type: 'ARRAY', description: 'De 3 a 10 palavras ou expressões relacionadas que podem estar no texto: sinônimos, termos técnicos, o mesmo em inglês (para "sub-rede": subnet, máscara, CIDR, endereçamento IP).', items: { type: 'STRING', description: 'Uma palavra ou expressão.' } }
      },
      required: ['pergunta']
    }
  },
  {
    name: 'abrir_achado',
    description: 'Abre um dos arquivos da última busca do segundo cérebro, pelo número (1 = o primeiro).',
    parameters: { type: 'OBJECT', properties: { numero: { type: 'NUMBER', description: 'Número do arquivo na lista (1, 2, 3...).' } }, required: ['numero'] }
  },
  {
    name: 'segundo_cerebro',
    description: 'Como está o segundo cérebro (quantos arquivos ela já leu, quais pastas) ou atualizar agora ("lê meus arquivos de novo").',
    parameters: { type: 'OBJECT', properties: { acao: { type: 'STRING', description: 'O que fazer. Padrão: estado.', enum: ['estado', 'atualizar'] } } }
  },
  {
    name: 'pesquisa_profunda',
    description:
      'Pesquisa a fundo, sozinha e em segundo plano, e entrega um relatório com fontes (leva alguns minutos): "pesquisa a fundo os melhores cursos de Node e me entrega amanhã cedo", "faz uma pesquisa completa sobre X". Ela também olha o que ele já tem nos arquivos dele. Para perguntas rápidas, use buscar_na_internet.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tema: { type: 'STRING', description: 'O que pesquisar, com as palavras dele.' },
        foco: { type: 'STRING', description: 'O que ele quer saber em especial ou para que é (opcional).' },
        entregar_iso: { type: 'STRING', description: 'Quando contar o resultado, em ISO 8601 no horário local (ex.: amanhã às 8h). Vazio = assim que ficar pronta.' }
      },
      required: ['tema']
    }
  },
  {
    name: 'pesquisas',
    description: 'As pesquisas profundas: como está a que está rodando, listar as últimas, abrir o relatório ou contar o resumo de novo ("como está a pesquisa?", "abre a pesquisa de Node", "me conta a pesquisa").',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer. Padrão: estado.', enum: ['estado', 'listar', 'abrir', 'contar', 'pasta'] },
        qual: { type: 'STRING', description: 'Qual pesquisa (parte do tema). Vazio = a última.' }
      }
    }
  },
  {
    name: 'marcar_consulta',
    description:
      'Marca consulta ou exame pelo WhatsApp do plano de saúde ou da clínica: você conversa com o robô ou a atendente por ele, em segundo plano, e pergunta antes de escolher horário, confirmar ou passar algum dado. Antes de começar, diga em uma frase com quem vai falar e o que vai pedir; só chame com confirmado=true depois que ele confirmar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        o_que: { type: 'STRING', description: 'O que marcar, como ele falou ("consulta com ortopedista", "retorno com a Dra. Ana", "ressonância do joelho").' },
        quando: { type: 'STRING', description: 'Preferências de dia, horário e unidade ("semana que vem à tarde", "unidade Mooca"). Vazio = qualquer.' },
        onde: { type: 'STRING', description: 'Com quem falar: um dos lugares salvos em lugar_de_consulta. Vazio = o primeiro salvo.' },
        observacoes: { type: 'STRING', description: 'Outros detalhes ("primeira consulta", "é retorno").' },
        confirmado: { type: 'BOOLEAN', description: 'true só depois que ele confirmou.' }
      },
      required: ['o_que']
    }
  },
  {
    name: 'responder_consulta',
    description: 'Passa para a consulta que você está marcando a resposta dele ao que você perguntou ("a de quinta", "pode mandar", "pede outro horário"). Serve também para uma instrução nova no meio da conversa.',
    parameters: { type: 'OBJECT', properties: { resposta: { type: 'STRING', description: 'O que ele respondeu, com as palavras dele.' } }, required: ['resposta'] }
  },
  {
    name: 'andamento_consulta',
    description: 'Diz como está a consulta que você está marcando pelo WhatsApp, ou para a conversa ("como está a consulta?", "deixa que eu continuo").',
    parameters: { type: 'OBJECT', properties: { acao: { type: 'STRING', description: 'O que fazer. Padrão: ver.', enum: ['ver', 'cancelar'] } } }
  },
  {
    name: 'lugar_de_consulta',
    description:
      'Planos de saúde e clínicas com quem você marca pelo WhatsApp: salvar (nome e número do WhatsApp), listar ou remover. "dados" são as informações que ele liberou para você passar quando pedirem (carteirinha, nome completo...). Ficam só neste aparelho.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer.', enum: ['salvar', 'listar', 'remover'] },
        nome: { type: 'STRING', description: 'Nome do lugar ("São Cristóvão", "Clínica do joelho").' },
        whatsapp: { type: 'STRING', description: 'Número do WhatsApp com DDD.' },
        dados: { type: 'STRING', description: 'O que pode passar a eles quando pedirem, como ele ditou.' }
      },
      required: ['acao']
    }
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
  {
    name: 'gestos',
    description: 'Liga ou desliga o controle da projeção pelas mãos, com a webcam ("quero mexer com as mãos", "liga os gestos", "desliga a câmera"). A imagem é processada só no PC.',
    parameters: { type: 'OBJECT', properties: { ligar: { type: 'BOOLEAN', description: 'true liga, false desliga.' } }, required: ['ligar'] }
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
    'Quando pedirem uma explicação, história, teoria, curiosidade, "como funciona", "o que aconteceu" ou "o que você faria", chame explicar primeiro, sem anunciar, e então explique falando em 5 a 9 frases, dizendo as palavras-chave na ordem que passou. Nesse caso não chame mostrar_cena.',
    'Com a Visão de Deus aberta, não chame mostrar_cena para lugares: o globo já mostra.',
    'Para qualquer coisa atual (notícias, jogos, preços, cotações, eventos) ou que você não tenha certeza, use buscar_na_internet e diga de onde veio em poucas palavras. Para clima, use clima (qualquer lugar do mundo, até 16 dias).',
    'Com uma projeção 3D na tela, não chame mostrar_cena nem explicar. Pedidos como "gira", "explode", "inverte", "renderiza", "aproxima", "corta", "salva" ou "fecha" se referem à projeção: use controlar_projecao.',
    'Ao projetar, sempre passe termo_ingles. Para objetos reais, prefira a fonte certa (nasa, molecula, proteina); use auto quando não souber.',
    'Reconhecimento facial é opcional: "cadastra meu rosto" usa cadastrar_rosto (peça o consentimento antes). Se o começo da conversa disser quem está falando, trate a pessoa pelo nome e respeite o que é só do dono.',
    'O app FRIDAY do celular pode ser pareado com este PC (parear_celular). Pareado, avisos de ligação e mensagem do celular chegam aqui e você pode mandar coisas para ele (mandar_para_celular).',
    'Para achar algo nos documentos, anotações ou projetos dele pelo assunto, use buscar_nos_meus_arquivos (mande palavras relacionadas e o termo em inglês). Diga o nome do arquivo e o que ele diz; não leia caminhos inteiros.',
    'Pedidos de "pesquisa a fundo", "pesquisa completa" ou "me entrega um relatório" usam pesquisa_profunda (leva alguns minutos e ela avisa quando terminar); perguntas rápidas continuam em buscar_na_internet.',
    'Com o celular pareado, ele pode ligar o PC pelo celular, até de fora de casa; para deixar isso pronto, use ligar_de_fora.',
    'Para marcar consulta ou exame ("marca um ortopedista semana que vem"), use marcar_consulta: você conversa com o plano ou a clínica pelo WhatsApp em segundo plano. Se o começo da conversa trouxer uma pergunta da consulta, ou chegar um aviso da consulta, pergunte a ele e passe a resposta em responder_consulta.',
    'A Visão de Deus mostra lugares, veículos e eventos públicos. Ela nunca localiza nem rastreia pessoas: se pedirem isso, recuse em uma frase.',
    `Agora é ${data} (horário de Brasília). Use isso para calcular horários de lembretes.`,
    ...(memoria ? ['', 'O que você já sabe sobre o usuário (use com naturalidade, sem recitar):', memoria] : [])
  ].join('\n')
}
