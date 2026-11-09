# Coleção de advocacia — funções editoriais v6 / renderer v10

A revisão substitui variações de uma apresentação de serviços por dez funções editoriais. As chaves e a ordem do catálogo continuam estáveis para preservar os posts salvos. Os nomes visíveis passam a indicar a finalidade do modelo; uma chave histórica como `advocacia-trabalhista` representa agora o modelo Dúvida e resposta, utilizável por diferentes áreas do escritório.

| Chave preservada | Nome visível | Conteúdo de exemplo |
|---|---|---|
| `advocacia-cartao` | Identidade do escritório | Mensagem de abertura, identificação e duas áreas principais |
| `advocacia-areas` | Mapa de atuação | Quatro áreas de atuação em uma visão geral |
| `advocacia-trabalhista` | Pergunta e resposta | Contrato completo, anexos e aditivos para contextualizar uma dúvida |
| `advocacia-consumidor` | Checklist de contratos | Partes, condições combinadas e trechos que geram dúvidas |
| `advocacia-familia` | Etapas de contratação | Apresentação do assunto, escopo do serviço e proposta |
| `advocacia-previdenciario` | Guia de registros | Contrato, recibos e mensagens relacionados ao trabalho |
| `advocacia-empresarial` | Contato seguro | Confirmar a origem de pedidos de dados ou pagamentos por um canal conhecido |
| `advocacia-contratos` | Pauta aberta | Sugestões de temas sem exposição de dados de casos |
| `advocacia-perfil` | Perfil profissional | Identificação, atendimento e localização do profissional fictício |
| `advocacia-comunicado` | Aviso com data | Aviso fictício: 23 NOV de 2026, das 13h às 18h |

## Contrato dos dados

`designOptions.legalPost` mantém nome, inscrição, áreas e contatos, e aceita três campos opcionais: `eyebrow` (até 40 caracteres), `summary` (até 160) e `highlight` (até 60). `areas` aceita até quatro entradas, cada uma com título de até 50 caracteres e descrição de até 140. Rascunhos aceitam dados incompletos. Publicação, agendamento e edição de um post ativo exigem nome e inscrição em todos os modelos. Pergunta e resposta exige resposta em `summary` ou `highlight`; Aviso exige data/período em `highlight`; Perfil exige apresentação em `summary` ou um bloco. Pauta aberta exige uma orientação em `summary` ou um bloco com título. Os demais exigem ao menos um bloco com título. O frontend apresenta o erro junto ao campo e direciona o foco.

Título e CTA têm os mesmos limites na prévia, criação e edição: 200 e 120 caracteres. O limite de entrada não implica que todo texto caiba na arte. Sugestões da IA têm contrato mais curto (40/30): respostas vazias, repetidas ou acima do limite são descartadas, sem cortar palavras; se nenhuma opção válida restar, a cadeia de provedores e o fallback existente continuam funcionando.

A geração aceita `templateKey` opcional. O controller confere o modelo no catálogo da categoria cadastrada, e o prompt jurídico recebe sua finalidade. Sem provedor disponível, um modelo selecionado recebe uma sugestão determinística compatível com essa finalidade; sem modelo, a categoria jurídica oferece até cinco temas/chamadas distintos. Datas, nomes, horários e qualificações não são inventados pelo fallback. O campo extra do usuário continua com 500 caracteres, separado da chave do modelo.

Os limites de entrada não garantem que qualquer combinação máxima caiba em todos os formatos. O renderer deve medir os textos, preservar as palavras e pedir um resumo quando o conteúdo ultrapassar o espaço legível. Não se deve omitir entradas ou reduzir silenciosamente o texto a um tamanho ilegível.

## Tipografia e composição

Cormorant Garamond Medium normal/itálica nos títulos e Inter no corpo. As fontes são empacotadas; medidas dos glifos determinam as quebras sem depender das fontes instaladas no servidor. Corpo: 39 px no quadrado, 44 px no retrato e 48–52 px em Story. Nome e contatos usam 42 px; inscrição, CTA e endereço pelo menos 39 px, equivalentes a 13 px na largura de 360 px. O título é ajustado até o mínimo de 66 px. Monogramas e marcadores decorativos podem ser menores. Rodapé é medido com a mesma fonte regular/negrito desenhada. Textos informados são preservados; excesso retorna erro orientando a resumir ou mudar o formato.

No quadrado, as margens verticais são 48 px e os recuos horizontais 64 px. O mapa preserva as alturas mínimas diferentes de cada linha e distribui apenas o espaço restante. O checklist usa lista aberta com divisórias no quadrado, evitando cartões apertados; retrato e Story mantêm os cartões. A Pauta aberta não usa aspas decorativas para não parecer citação. Stories reservam 178 px no topo e 206 px na base; essas margens não certificam todas as sobreposições de cada rede social.

Os exemplos são deliberadamente concisos para demonstrar cada finalidade. Áreas de atuação não precisam sempre de descrição. Checklist e mapa podem usar apenas os títulos; nota e destaque têm uma mensagem central. O aviso reserva a hierarquia principal para a data e o horário.

## Fotografia e identidade

Um perfil profissional não deve selecionar automaticamente um retrato fictício como foto de advogado. A versão sem foto apresenta a identificação tipográfica. O preview aceita uma imagem explicitamente fornecida com `--profile-image`; ela serve apenas à galeria local, sem entrar no catálogo de fotos de produção. As imagens de arquitetura e escritório são ilustrativas; mídia própria pode substituí-las quando o modelo usar fotografia. Fontes, licenças e origem dos fundos estão em `src/modules/posts/assets/LAW_EDITORIAL.md`.

O renderer não recebe dados de processos nem consulta clientes para gerar estes exemplos. As fixtures são fictícias, não prometem direitos ou resultados e tratam de preparação da consulta, organização dos registros e avisos operacionais.

## Gerar e revisar a galeria

As amostras reutilizáveis estão em `src/modules/posts/services/legalPostSamples.fixture.ts`. O comando abaixo usa o renderer real, gera 30 PNGs e 30 SVGs, além da prancha de retratos, do catálogo, das amostras JSON e da galeria HTML com filtros. Não grava no banco nem publica posts.

```powershell
npm run posts:preview:law
```

Para testar o perfil com uma foto fornecida especificamente para revisão:

```powershell
npm run posts:preview:law -- --profile-image "C:\caminho\foto-de-revisao.png"
```

O destino padrão é `artifacts/posts-law-v6` na pasta externa do workspace. Além da galeria, `audit/` recebe dez pranchas com os três formatos em 360 px e `metrics-360.json` com dimensões/tamanhos dos 30 PNGs. A galeria deve ser inspecionada em cada formato; testes de renderização e tipagem não comprovam qualidade visual ou utilidade editorial.

## Verificações da revisão

`npm run test:posts:legal` executa sete arquivos relacionados, com no máximo dois workers. Os testes cobrem os trinta exemplos: dimensões PNG, fontes de leitura de pelo menos 39 px, caixas sem colisão, margens, preservação dos textos, mapa com cartões de alturas diferentes, CTA em negrito com quebra, prontidão por finalidade, ausência de retrato automático e igualdade do PNG local/worker. A inspeção visual em 360 px complementa essas verificações; elas não certificam toda combinação de conteúdo, geração por provedor real ou publicação em produção.

## Revisão enxuta — v5

Os exemplos passam a apresentar uma ideia por arte. Títulos de seção e descrições redundantes foram retirados das fixtures; explicações extensas pertencem à legenda. O prompt jurídico orienta títulos curtos e chamadas que acrescentem uma ação. A comparação dos trinta SVGs de exemplo reduziu o texto visível de 1.359 para 570 palavras (58,1%). Isso descreve as amostras, sem limitar automaticamente todo conteúdo do usuário.

`contactLayout` é opcional: `essential` mostra um contato principal (telefone, site ou endereço, nessa ordem); `complete` e a ausência do campo mantêm todos os contatos preenchidos. Novos posts usam Essencial, enquanto rascunhos antigos preservam Completo. Alternar a apresentação não apaga os campos. No Perfil essencial, o nome é exibido uma vez quando já aparece no título. Seção automática fica ausente no modo essencial; seção explicitamente preenchida continua visível.

O corpo essencial usa 44/48/54 px no quadrado/retrato/Story, exceto descrições do mapa, que mantêm o tamanho anterior para caber nas colunas. Pergunta/resposta e Pauta aberta ganham títulos maiores e posicionamento calculado pelo conteúdo. Os trinta exemplos continuam sujeitos às verificações de margens, colisão e texto integral.

A chamada na arte é independente do botão público de agendamento. O feed expõe `templateKey` e, nos modelos de advocacia, o link para a agenda recebe o rótulo “Agendar atendimento”; frases como “Salve esta lista” permanecem na imagem.

## Alinhamento e espaçamento — v6

Monogramas e números de etapas usam âncora central e métricas da fonte. A identificação alinha o símbolo ao centro do bloco de nome/inscrição; no Perfil sem nome repetido, a inscrição alinha ao símbolo. Os cartões essenciais do mapa centralizam marcador, título e descrição como um grupo. O retrato mantém proporção vertical, centralizado na coluna, e o texto se alinha ao centro vertical da foto.

Títulos, listas, painéis e rodapés têm separação explícita: intervalos principais de 40/48/64 px em quadrado/retrato/Story, distância de 48–72 px antes da linha do rodapé, recuo de 36 px após a linha e 20 px entre chamada e contato. O corpo dos blocos curtos (pergunta, etapas, documentos e pauta) é distribuído pela área disponível; a seção acompanha o grupo em vez de ficar isolada no topo. Avisos essenciais centralizam mês, data, horário e título. A escala de fontes e o conteúdo enxuto permanecem.

A revisão cobre as dez pranchas em 360 px (30 imagens). Seis novos casos verificam centralização dos cartões, separação entre título/lista e chamada/contato, âncora dos números e centro vertical/proporção do retrato. Os sete arquivos de testes dos posts somam 334 casos aprovados. A validação estática não substitui a publicação real em cada rede social.
