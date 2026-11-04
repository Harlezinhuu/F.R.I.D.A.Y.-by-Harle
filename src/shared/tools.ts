// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ferramentas que a FRIDAY pode usar. A IA só age no PC por aqui:
// nada de comandos livres, só ações conhecidas e seguras.

type Simples = { type: 'STRING' | 'NUMBER' | 'BOOLEAN'; description: string; enum?: string[] }
type Lista = { type: 'ARRAY'; description: string; items: { type: 'OBJECT'; properties: Record<string, Simples>; required?: string[] } }
type ListaSimples = { type: 'ARRAY'; description: string; items: Simples }
type Tabela = { type: 'ARRAY'; description: string; items: { type: 'ARRAY'; description: string; items: Simples } }

export interface ToolDeclaration {
  name: string
  description: string
  parameters?: {
    type: 'OBJECT'
    properties: Record<string, Simples | Lista | ListaSimples | Tabela>
    required?: string[]
  }
}

/** Ferramentas resolvidas no próprio HUD, sem passar pelo processo principal. */
export const TOOLS_DO_HUD = ['mostrar_painel', 'minimizar', 'projetar', 'controlar_projecao', 'gestos', 'encerrar_conversa', 'modo_foco', 'encerrar_foco', 'diagnostico', 'executar_rotina', 'mostrar_cena', 'explicar', 'mandar_para_celular', 'cadastrar_rosto', 'rostos', 'mesa', 'sentinela', 'protocolo'] as const

/** Ferramentas do PC que o celular pareado pode pedir pelo elo (o resto fica só no PC). */
export const TOOLS_REMOTAS = [
  'listar_apps', 'abrir_app', 'fechar_app', 'volume', 'midia', 'pesquisar_web', 'abrir_site', 'status_sistema', 'capturar_tela',
  'listar_arquivos', 'abrir_arquivo', 'listar_rotinas', 'executar_rotina', 'projetar', 'controlar_projecao', 'visao_deus', 'fechar_visao_deus',
  'tarefa_programacao', 'status_tarefas', 'energia_pc', 'modo_foco', 'minimizar', 'mostrar_painel',
  'responder_consulta', 'andamento_consulta', 'buscar_nos_meus_arquivos', 'abrir_achado', 'segundo_cerebro',
  'pesquisa_profunda', 'pesquisas', 'rodar_testes', 'revisar_codigo', 'anotar_bug', 'rede_de_casa', 'mesa',
  'ameacas', 'raio_x', 'cotacao', 'vigiar_assunto', 'sentinela', 'protocolo', 'bem_estar',
  'cliente', 'fechar_negocio', 'pendencias', 'raio_x_loja', 'ver_raio_x', 'previa_site', 'documento_cliente', 'tabela_precos', 'prospectar', 'financas', 'planilha'
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
      'Cria ou atualiza uma rotina com nome ("modo trabalho": abre o Chrome, abre o Spotify, diz bom trabalho). Passos permitidos: abrir_app, fechar_app, volume, midia, pesquisar_web, abrir_site, status_sistema, clima, capturar_tela, modo_foco, mostrar_painel, ameacas, cotacao {moedas}, raio_x, buscar_na_internet {pergunta}, bem_estar, dizer {texto}, esperar {segundos até 60}. Uma rotina chamada "chegada" roda sozinha quando ele chega em casa. Se tiver fechar_app, peça confirmação e chame de novo com confirmado=true.',
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
    description: 'Executa uma rotina salva. Use quando o usuário disser o nome de uma rotina ("modo trabalho"). Para "ativa o protocolo X", use protocolo.',
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
    name: 'rodar_testes',
    description: 'Roda os testes (ou o typecheck) de um projeto de programação e explica o que quebrou: qual teste, em que linha e por quê ("roda os testes", "roda os testes do Harle Bot"). Sem projeto, usa o que está aberto no VS Code.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projeto: { type: 'STRING', description: 'Nome do projeto (opcional).' },
        comando: { type: 'STRING', description: 'Comando liberado no projeto, se ele disser qual (ex.: "npm run typecheck"). Vazio = o de testes.' }
      }
    }
  },
  {
    name: 'revisar_codigo',
    description: 'Revisora antes do push: confere o que ainda não foi para o GitHub (chave de API, senha, .env, conflito de merge, console.log esquecido). acao=instalar coloca um gancho no git que bloqueia sozinho o push com chave ou .env.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projeto: { type: 'STRING', description: 'Nome do projeto (opcional; padrão: o aberto no VS Code).' },
        acao: { type: 'STRING', description: 'O que fazer. Padrão: revisar.', enum: ['revisar', 'instalar'] },
        geral: { type: 'BOOLEAN', description: 'true para também receber as mudanças e comentar o código (revisão geral).' }
      }
    }
  },
  {
    name: 'explicar_codigo',
    description: 'Explica um arquivo de código, parte por parte ("explica esse código", "o que esse arquivo faz?", "explica a função tocarMusica"). Sem arquivo, usa o que está aberto no VS Code.',
    parameters: {
      type: 'OBJECT',
      properties: {
        arquivo: { type: 'STRING', description: 'Nome ou caminho do arquivo (opcional).' },
        parte: { type: 'STRING', description: 'Função ou trecho para focar (opcional).' },
        projeto: { type: 'STRING', description: 'Nome do projeto (opcional).' }
      }
    }
  },
  {
    name: 'anotar_bug',
    description: 'Anota um bug como issue no GitHub do projeto ("anota um bug no Harle Bot: a fila trava quando está vazia"). Leia o título para ele e só chame com confirmado=true depois que ele confirmar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo: { type: 'STRING', description: 'Título curto do bug.' },
        detalhes: { type: 'STRING', description: 'O que acontece, como reproduzir, o que era esperado (com as palavras dele).' },
        projeto: { type: 'STRING', description: 'Nome do projeto (opcional).' },
        confirmado: { type: 'BOOLEAN', description: 'true só depois que ele confirmou.' }
      },
      required: ['titulo']
    }
  },
  {
    name: 'rede_de_casa',
    description:
      'Guardiã da rede de casa: quais aparelhos estão no Wi-Fi ("quem está no meu Wi-Fi?"), olhar agora, dar nome a um aparelho ("o 37 é o celular da minha mãe"), esquecer um, ou quanto da internet a casa e o PC estão usando agora ("quem está gastando a internet?").',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer. Padrão: listar. meu_celular = marcar qual é o celular dele (para as boas-vindas quando ele chegar em casa).', enum: ['listar', 'varrer', 'apelidar', 'esquecer', 'uso', 'meu_celular'] },
        alvo: { type: 'STRING', description: 'Qual aparelho: IP, final do IP ("37"), nome ou fabricante.' },
        apelido: { type: 'STRING', description: 'O nome que ele quer dar ao aparelho.' }
      }
    }
  },
  {
    name: 'mesa',
    description:
      'Mesa holográfica no HUD: um arquivo de cartões com os projetos, designs, relatórios e clientes dele (a pasta Clientes: um cartão por loja, com a cor da etapa; abrir o cartão abre a pasta e conta como ele está). abrir ("abre a mesa", "mostra meus projetos na mesa"); proximo e anterior passam os cartões; abrir_cartao abre o da frente ou o que ele disser em qual (projeto vira prédio: pastas são andares, arquivos são salas, vermelho é teste falhando; design vira holograma; relatório abre no PC): "mostra o prédio do Harle Bot", "coloca a turbina na mesa"; explodir e juntar abrem e fecham as peças ou os andares; voltar volta para os cartões; fechar fecha a mesa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer.', enum: ['abrir', 'proximo', 'anterior', 'abrir_cartao', 'voltar', 'explodir', 'juntar', 'fechar'] },
        qual: { type: 'STRING', description: 'Nome do projeto, design ou relatório (opcional; vazio = o cartão da frente).' },
        tipo: { type: 'STRING', description: 'Só um tipo de cartão (opcional).', enum: ['tudo', 'projetos', 'designs', 'relatorios', 'clientes'] }
      },
      required: ['acao']
    }
  },
  {
    name: 'designs',
    description:
      'Os designs 3D que ele importou (modelos .glb, .gltf, .stl, .obj ou pacotes .zip): importar abre a janela para ele escolher os arquivos ("importa um design", "quero colocar uns modelos"); listar diz quais tem; renomear dá nome ou apelidos ("chama esse de reator"); remover tira da biblioteca (confirme antes). Para mostrar um design, use projetar com o nome dele e fonte arquivo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'O que fazer. Padrão: listar.', enum: ['importar', 'listar', 'renomear', 'remover'] },
        qual: { type: 'STRING', description: 'Qual design (nome ou apelido). Vazio em renomear = o último importado.' },
        nome: { type: 'STRING', description: 'Nome novo (renomear).' },
        apelidos: { type: 'ARRAY', description: 'Outros jeitos de chamar (renomear).', items: { type: 'STRING', description: 'Um apelido.' } },
        confirmado: { type: 'BOOLEAN', description: 'true só depois que ele confirmou a remoção.' }
      }
    }
  },
  {
    name: 'ver_janela',
    description:
      'Ela usa o Windows por ele: lê o programa que está na frente (botões, campos e textos, numerados) e vê a tela. Use antes de clicar ou digitar, em pedidos como "no Spotify, coloca a playlist de estudo", "preenche esse formulário com meu nome", "no Chrome, abre meus favoritos". Só funciona nos programas da lista dele.',
    parameters: {
      type: 'OBJECT',
      properties: {
        continuar: { type: 'BOOLEAN', description: 'true só quando ele mandou continuar depois do aviso de 15 passos.' }
      }
    }
  },
  {
    name: 'clicar_janela',
    description: 'Clica num item da janela lida por ver_janela, pelo número (#) ou pelo texto do botão. Botões de pagar, comprar, enviar, apagar ou confirmar pedem confirmação: pergunte e chame de novo com confirmado=true.',
    parameters: {
      type: 'OBJECT',
      properties: {
        numero: { type: 'NUMBER', description: 'O número do item (#) na lista.' },
        texto: { type: 'STRING', description: 'O texto do botão ou link, se não souber o número.' },
        confirmado: { type: 'BOOLEAN', description: 'true só depois que ele confirmou.' }
      }
    }
  },
  {
    name: 'digitar_janela',
    description: 'Escreve um texto num campo da janela (pelo número) ou onde o cursor está. Nunca em campo de senha.',
    parameters: {
      type: 'OBJECT',
      properties: {
        texto: { type: 'STRING', description: 'O que escrever.' },
        numero: { type: 'NUMBER', description: 'O número do campo (#). Vazio = onde o cursor está.' }
      },
      required: ['texto']
    }
  },
  {
    name: 'tecla_janela',
    description: 'Aperta uma tecla ou atalho no programa da frente (ex.: enter para pesquisar, ctrl_s para salvar, ctrl_t para nova aba).',
    parameters: {
      type: 'OBJECT',
      properties: {
        tecla: {
          type: 'STRING',
          description: 'A tecla.',
          enum: ['enter', 'tab', 'shift_tab', 'esc', 'espaco', 'apagar', 'seta_cima', 'seta_baixo', 'seta_esquerda', 'seta_direita', 'pagina_cima', 'pagina_baixo', 'inicio', 'fim', 'f5', 'ctrl_s', 'ctrl_c', 'ctrl_v', 'ctrl_a', 'ctrl_z', 'ctrl_y', 'ctrl_f', 'ctrl_t', 'ctrl_l', 'ctrl_n', 'ctrl_w', 'ctrl_tab', 'ctrl_mais', 'ctrl_menos']
        }
      },
      required: ['tecla']
    }
  },
  {
    name: 'rolar_janela',
    description: 'Rola o programa da frente para baixo ou para cima.',
    parameters: {
      type: 'OBJECT',
      properties: { direcao: { type: 'STRING', description: 'Para onde. Padrão: baixo.', enum: ['baixo', 'cima'] } }
    }
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
  {
    name: 'cliente',
    description:
      'Clientes do negócio de sites para lojas (cada um com uma pasta em Documentos/FRIDAY/Clientes): criar ("anota a padaria do João como cliente, WhatsApp 11 9..."), ver, listar ("como estão os clientes?"), atualizar dados, mudar a etapa, material_recebido, pagamento_recebido (só quando ELE disser que o dinheiro caiu), nota_emitida, abrir_pasta e arquivar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'Padrão: ver.', enum: ['criar', 'ver', 'listar', 'atualizar', 'etapa', 'material_recebido', 'pagamento_recebido', 'nota_emitida', 'abrir_pasta', 'arquivar'] },
        nome: { type: 'STRING', description: 'Nome da loja.' },
        etapa: { type: 'STRING', description: 'Para acao=etapa.', enum: ['prospectado', 'raio_x', 'previa', 'proposta', 'fechado', 'construcao', 'entregue', 'manutencao', 'arquivado'] },
        responsavel: { type: 'STRING', description: 'Nome do dono ou de quem cuida.' },
        whatsapp: { type: 'STRING', description: 'WhatsApp da loja.' },
        telefone: { type: 'STRING', description: 'Telefone.' },
        instagram: { type: 'STRING', description: 'Instagram (@...).' },
        email: { type: 'STRING', description: 'E-mail.' },
        endereco: { type: 'STRING', description: 'Endereço.' },
        cidade: { type: 'STRING', description: 'Cidade.' },
        documento: { type: 'STRING', description: 'CNPJ ou CPF da loja (para o contrato).' },
        segmento: { type: 'STRING', description: 'Ramo: padaria, pet shop...' },
        site: { type: 'STRING', description: 'Site atual ou o publicado.' },
        observacoes: { type: 'STRING', description: 'Algo a anotar.' },
        valor: { type: 'NUMBER', description: 'Para pagamento_recebido: o valor que caiu.' }
      },
      required: ['acao']
    }
  },
  {
    name: 'fechar_negocio',
    description:
      'Fecha preço e prazo com um cliente. Ela pode fechar sozinha dentro da tabela (até 10% de desconto); abaixo do mínimo precisa de confirmação. Calcula o prazo pela capacidade dele, gera o contrato e deixa esperando o "pode" dele para assinar e cobrar a entrada (dinheiro e assinatura nunca andam sozinhos).',
    parameters: {
      type: 'OBJECT',
      properties: {
        cliente: { type: 'STRING', description: 'Nome da loja.' },
        pacote: { type: 'STRING', description: 'vitrine, site ou loja.', enum: ['vitrine', 'site', 'loja'] },
        valor: { type: 'NUMBER', description: 'Valor combinado (padrão: o da tabela).' },
        mensalidade: { type: 'NUMBER', description: 'Manutenção mensal combinada (0 = sem).' },
        confirmado: { type: 'BOOLEAN', description: 'true só se ele confirmou um valor abaixo do mínimo.' }
      },
      required: ['cliente']
    }
  },
  {
    name: 'pendencias',
    description: 'O que está esperando o "pode" dele (cobranças, assinaturas, mensagens para lojas novas) e o diário do que ela fez sozinha. "O que está esperando por mim?", "pode mandar a cobrança da padaria", "não manda esse", "o que você fez hoje?".',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'Padrão: listar.', enum: ['listar', 'aprovar', 'recusar', 'diario'] },
        alvo: { type: 'STRING', description: 'Qual: número da lista ("a 2") ou palavras dela ("cobrança da padaria").' }
      }
    }
  },
  {
    name: 'raio_x_loja',
    description: 'Raio-X de uma loja antes de oferecer o site: pesquisa o que é público (Instagram, avaliações do Google, site atual, concorrentes) e usa as fotos e o logo que ele colocou na pasta do cliente. Entrega identidade, produtos, elogios e reclamações, pacote recomendado, estrutura do site, efeito-assinatura e perguntas para o dono. Leva uns 30 a 60 segundos e ela avisa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        cliente: { type: 'STRING', description: 'Nome da loja (cria o cliente se ainda não existir).' },
        instagram: { type: 'STRING', description: 'Instagram da loja, se ele souber.' },
        cidade: { type: 'STRING', description: 'Cidade da loja.' }
      },
      required: ['cliente']
    }
  },
  { name: 'ver_raio_x', description: 'Conta o raio-X já feito de uma loja.', parameters: { type: 'OBJECT', properties: { cliente: { type: 'STRING', description: 'Nome da loja.' } }, required: ['cliente'] } },
  {
    name: 'previa_site',
    description: 'Prévia do site de uma loja: criar (o Claude Code monta o rascunho em segundo plano, seguindo o raio-X e a base de design) ou ver (abre a prévia pronta no navegador).',
    parameters: { type: 'OBJECT', properties: { cliente: { type: 'STRING', description: 'Nome da loja.' }, acao: { type: 'STRING', description: 'Padrão: criar.', enum: ['criar', 'ver'] } }, required: ['cliente'] }
  },
  {
    name: 'documento_cliente',
    description: 'Gera a proposta ou o contrato da loja em PDF (na pasta do cliente) e abre.',
    parameters: { type: 'OBJECT', properties: { cliente: { type: 'STRING', description: 'Nome da loja.' }, tipo: { type: 'STRING', description: 'Qual documento.', enum: ['proposta', 'contrato'] } }, required: ['cliente', 'tipo'] }
  },
  { name: 'tabela_precos', description: 'Diz a tabela de preços dos sites e as regras de fechamento.' },
  {
    name: 'financas',
    description:
      'Finanças dele: anotar gasto ou entrada ("gastei 45 na padaria", "recebi 300 do freela"), resumo do mês ("quanto gastei esse mês?"), últimos lançamentos, limite por categoria ("limite de 600 para comida"; ela avisa em 80% e 100%) e apagar um lançamento (precisa confirmar). Os pagamentos dos clientes entram sozinhos. Ela só anota; nunca paga nem mexe no banco.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'Padrão: resumo.', enum: ['gasto', 'entrada', 'resumo', 'listar', 'orcamento', 'apagar'] },
        valor: { type: 'NUMBER', description: 'Valor em reais (para gasto, entrada e limite; limite 0 tira).' },
        descricao: { type: 'STRING', description: 'Onde ou com o quê ("padaria", "Uber", "freela do site").' },
        categoria: { type: 'STRING', description: 'Opcional: mercado, comida, transporte, casa, saúde, assinaturas, trabalho, educação, lazer, compras, outros. Vazio = ela descobre.' },
        data: { type: 'STRING', description: 'AAAA-MM-DD (padrão hoje).' },
        mes: { type: 'STRING', description: 'AAAA-MM para resumo/listar (padrão o mês atual).' },
        alvo: { type: 'STRING', description: 'Para apagar: "o último", "o do ifood", "o de 45".' },
        confirmado: { type: 'BOOLEAN', description: 'Para apagar, depois que ele confirmar.' }
      }
    }
  },
  {
    name: 'planilha',
    description:
      'Cria uma planilha do Excel (.xlsx) e abre: "gastos" (do mês, com resumo por categoria em fórmulas), "clientes", "precos" (tabela de preços dos sites) ou "livre" (qualquer uma que ele pedir: você monta as colunas e as linhas; números, datas AAAA-MM-DD e fórmulas como "=SOMA(B2:B9)" são reconhecidos). Salva em Documentos > FRIDAY > Planilhas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: { type: 'STRING', description: 'Qual planilha (padrão livre).', enum: ['gastos', 'clientes', 'precos', 'livre'] },
        titulo: { type: 'STRING', description: 'Nome da planilha (vira o nome do arquivo).' },
        mes: { type: 'STRING', description: 'Para gastos: AAAA-MM (padrão o mês atual).' },
        colunas: { type: 'ARRAY', items: { type: 'STRING', description: 'Título da coluna.' }, description: 'Para livre: os títulos das colunas.' },
        linhas: { type: 'ARRAY', items: { type: 'ARRAY', description: 'Uma linha.', items: { type: 'STRING', description: 'O valor de uma coluna.' } }, description: 'Para livre: as linhas, cada uma com um valor por coluna (em texto).' },
        total: { type: 'BOOLEAN', description: 'Para livre: põe uma linha de total somando as colunas de número.' },
        abrir: { type: 'BOOLEAN', description: 'Abrir depois de criar (padrão true).' }
      }
    }
  },
  {
    name: 'prospectar',
    description: 'Acha lojas perto dele que ainda não têm site, pelo mapa aberto (OpenStreetMap), das mais fáceis de contatar para as menos ("acha padarias sem site aqui perto"). Depois: adicionar uma da lista (vira cliente; a primeira mensagem fica esperando o "pode" dele) ou descartar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'Padrão: lista.', enum: ['lista', 'adicionar', 'descartar'] },
        ramo: { type: 'STRING', description: 'Tipo de loja (padaria, pet shop, roupa, salão, açaí...). Vazio = todas.' },
        raio_km: { type: 'NUMBER', description: 'Raio em km (padrão 3, até 15).' },
        lugar: { type: 'STRING', description: 'Bairro ou cidade (padrão: onde ele está).' },
        alvo: { type: 'STRING', description: 'Para adicionar/descartar: o número na lista ou o nome.' },
        mensagem: { type: 'BOOLEAN', description: 'Para adicionar: preparar a primeira mensagem (padrão true).' }
      }
    }
  },
  {
    name: 'protocolo',
    description:
      'Ativa um protocolo ("ativa o protocolo X", "protocolo de saída"). Prontos: bloqueio (corta o som e tranca o PC), saida (bloqueio + modo sentinela, para quando ele sai de casa) e chegada (desliga a sentinela, dá as boas-vindas e roda a rotina "chegada" dele). Qualquer outro nome roda a rotina salva com esse nome.',
    parameters: { type: 'OBJECT', properties: { nome: { type: 'STRING', description: 'Nome do protocolo, como ele falou ("bloqueio", "saída", "chegada", "festa").' } }, required: ['nome'] }
  },
  {
    name: 'sentinela',
    description: 'Modo sentinela: vigia pela webcam enquanto ele está fora. Se alguém aparecer, tira uma foto (fica só no PC, em Imagens/FRIDAY/Sentinela) e avisa no celular. Se reconhecer o rosto dele, desliga sozinha. "liga a sentinela", "vigia o quarto", "desliga a sentinela".',
    parameters: { type: 'OBJECT', properties: { ligar: { type: 'BOOLEAN', description: 'true liga, false desliga.' } }, required: ['ligar'] }
  },
  {
    name: 'achar_celular',
    description: 'Faz o celular pareado tocar alto (mesmo no silencioso), vibrar e piscar a lanterna, para achar ("cadê meu celular?", "toca meu celular"). Funciona com o app fechado e até fora de casa.'
  },
  {
    name: 'ameacas',
    description:
      'Vigia de ameaças com dados reais: asteroides passando perto da Terra (NASA), tempestade solar (NOAA), terremotos perto dele (USGS) e tempo severo na cidade dele. "alguma ameaça hoje?", "tem asteroide passando perto?", "o sol está calmo?". Também liga ou desliga os avisos automáticos.',
    parameters: { type: 'OBJECT', properties: { acao: { type: 'STRING', description: 'Padrão: olhar.', enum: ['olhar', 'ligar', 'desligar'] } } }
  },
  {
    name: 'raio_x',
    description:
      'Raio-X do PC (só leitura, não muda nada): o que está deixando lento, memória, processos pesados, espaço e saúde dos discos, temperaturas, bateria, há quanto tempo não reinicia, programas que abrem com o Windows, e a segurança (antivírus, firewall, atualizações). "por que o PC está lento?", "faz um check-up", "meu PC está seguro?".',
    parameters: { type: 'OBJECT', properties: { foco: { type: 'STRING', description: 'O que olhar. Padrão: geral.', enum: ['geral', 'lento', 'seguranca'] } } }
  },
  {
    name: 'bem_estar',
    description: 'Bem-estar: quanto tempo ele ficou no PC hoje e sem pausa ("quanto tempo eu fiquei no PC?"), ou liga/desliga os lembretes de pausa e de hora de dormir.',
    parameters: { type: 'OBJECT', properties: { acao: { type: 'STRING', description: 'Padrão: estado.', enum: ['estado', 'ligar', 'desligar'] } } }
  },
  {
    name: 'vigiar_assunto',
    description: 'Vigia um assunto na internet e avisa quando sair notícia nova ("me avisa se sair notícia do GTA 6", "fica de olho no preço da RTX 5070"). Também lista ou para de vigiar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        acao: { type: 'STRING', description: 'Padrão: vigiar.', enum: ['vigiar', 'listar', 'parar'] },
        tema: { type: 'STRING', description: 'O assunto, como ele falou.' }
      }
    }
  },
  {
    name: 'cotacao',
    description: 'Cotação de moedas e cripto em reais agora (dólar, euro, libra, iene, peso, bitcoin, ethereum...) ou conversão ("quanto é 50 dólares em reais?").',
    parameters: {
      type: 'OBJECT',
      properties: {
        moedas: { type: 'ARRAY', description: 'Moedas pelo nome ("dólar", "euro", "bitcoin"). Para converter, só a moeda de origem.', items: { type: 'STRING', description: 'Moeda.' } },
        valor: { type: 'NUMBER', description: 'Só para converter: o valor na moeda de origem.' },
        para: { type: 'STRING', description: 'Só para converter: moeda de destino. Padrão: real.' }
      }
    }
  },
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
    'Programação por voz: "roda os testes" usa rodar_testes; "posso dar push?" ou "revisa antes de eu mandar" usa revisar_codigo; "explica esse código" usa explicar_codigo; "anota um bug" usa anotar_bug (confirme antes). Para corrigir algo, ofereça tarefa_programacao.',
    'Com a mesa holográfica aberta, "passa", "volta", "abre esse", "explode", "junta" e "fecha" se referem à mesa: use mesa. Ao abrir um prédio ou design, comente em uma ou duas frases o que aparece (o resultado traz o resumo).',
    'Ele pode importar os próprios designs 3D (designs com acao=importar). Depois de importar, pergunte como ele quer chamar cada um e use acao=renomear. "Projeta o <nome>" com um design dele usa projetar com fonte arquivo.',
    'Para fazer algo dentro de um programa do PC ("no Spotify, coloca a playlist de estudo", "preenche isso com meu nome"), use ver_janela, depois clicar_janela, digitar_janela, tecla_janela ou rolar_janela, um passo por vez, conferindo a janela que volta. Só nos programas da lista dele; nunca senhas; banco, pagamento e login são com ele. Se não estiver dando certo em poucos passos, diga o que falta.',
    'Quando chegar o aviso de um aparelho novo no Wi-Fi e ele disser de quem é, use rede_de_casa com acao=apelidar.',
    'Pedidos de "pesquisa a fundo", "pesquisa completa" ou "me entrega um relatório" usam pesquisa_profunda (leva alguns minutos e ela avisa quando terminar); perguntas rápidas continuam em buscar_na_internet.',
    'Com o celular pareado, ele pode ligar o PC pelo celular, até de fora de casa; para deixar isso pronto, use ligar_de_fora.',
    'Para marcar consulta ou exame ("marca um ortopedista semana que vem"), use marcar_consulta: você conversa com o plano ou a clínica pelo WhatsApp em segundo plano. Se o começo da conversa trouxer uma pergunta da consulta, ou chegar um aviso da consulta, pergunte a ele e passe a resposta em responder_consulta.',
    'Negócio de sites para lojas: cliente (fichas e etapas), raio_x_loja (antes de oferecer), previa_site, documento_cliente (proposta e contrato), fechar_negocio (preço dentro da tabela ela fecha sozinha), pendencias e prospectar (lojas sem site perto dele). Finanças dele: financas (anotar gasto/entrada, resumo do mês, limites) e planilha (gera .xlsx de gastos, clientes, preços ou qualquer uma). Pagar, cobrar, assinar e mandar mensagem para loja que ainda não é cliente: só com o "pode" dele. Nunca diga que um pagamento caiu sem ele dizer.',
    'Ativar um protocolo ("ativa o protocolo de saída", "protocolo bloqueio") usa protocolo. Ao sair de casa, ofereça o protocolo de saída (tranca o PC e liga a sentinela).',
    'Quando ele chegar em casa, ela já dá as boas-vindas sozinha se souber qual é o celular dele (rede_de_casa com acao=meu_celular).',
    'Perguntas sobre por que o PC está lento, temperatura, disco, bateria ou segurança do PC usam raio_x. Você só lê: diga o que fazer, não faça nada sozinha.',
    'Cotações e conversões de moeda usam cotacao (mais rápido e exato que buscar_na_internet).',
    'Os avisos de pausa e de hora de dormir são cuidado, não sermão: se ele disser que está bem, aceite.',
    'A Visão de Deus mostra lugares, veículos e eventos públicos. Ela nunca localiza nem rastreia pessoas: se pedirem isso, recuse em uma frase.',
    `Agora é ${data} (horário de Brasília). Use isso para calcular horários de lembretes.`,
    ...(memoria ? ['', 'O que você já sabe sobre o usuário (use com naturalidade, sem recitar):', memoria] : [])
  ].join('\n')
}
