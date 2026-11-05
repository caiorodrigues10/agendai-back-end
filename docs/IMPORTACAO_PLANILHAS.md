# Assistente de importação de planilhas

O dono do salão importa clientes, serviços, agenda, horários, folgas, produtos,
pacotes e fiado a partir de uma planilha `.xlsx` ou `.csv`. Nada é gravado antes
da prévia: o fluxo sempre passa por **dry-run** (simulação) e só grava depois que
o dono confirma.

A planilha pode ter **várias abas, cada uma com o seu tipo** (Fase 2): o dono
escolhe o tipo de cada aba e o assistente importa na ordem de dependência entre
os tipos (serviços → clientes → produtos → catálogo de pacotes → horários/folgas
→ pacotes dos clientes → fiado → agenda), nunca na ordem das abas.

- **Backend:** `src/modules/dataImport/` (rotas, use cases, processors, worker).
- **Frontend:** `src/features/dataImport/` (assistente em Configurações → Importar dados).
- **Rotas:** `src/modules/dataImport/dataImport.routes.ts` — todas exigem dono
  (`OWNER`/`MASTER_ADMIN`) e passam por `setRlsContext`.

---

## 1. Fluxo

| passo | o que acontece | rota |
|---|---|---|
| 1. Arquivo | o dono envia a planilha (até 10 MB) | `POST /api/barbershops/:barbershopId/imports` |
| 2. O que importar | escolhe o tipo de **cada aba** (uma aba por tipo) | `PATCH .../imports/:batchId/target` |
| 3. Colunas | o sistema detecta as colunas por sinônimo; o dono corrige o que quiser (aba a aba) | `PATCH .../imports/:batchId/mapping` |
| 4. Validação | **dry-run**: mostra quantas linhas entram, quantas são ignoradas e quantas são rejeitadas — não grava nada | `POST .../imports/:batchId/validate` |
| 5. Prévia | o dono confere e confirma | `POST .../imports/:batchId/confirm` |
| 6. Processamento | o worker processa em pedaços de 200 linhas, cada pedaço em uma transação, **na ordem de dependência entre os tipos** | fila `data-import` |
| 7. Conclusão | mostra o resultado e permite **desfazer** em até 30 dias | `POST .../imports/:batchId/undo` |

As rotas de alvo e de mapeamento aceitam **duas formas**:

- **multi-aba (Fase 2):** `PATCH /target` com `{ sheets: [{ sheetName, targetType }] }`
  e `PATCH /mapping` com `{ sheets: [{ sheetName, targetType, columns, options }] }`;
- **legada (aba única):** `PATCH /target` com `{ targetType, sheetName }` e
  `PATCH /mapping` com `{ columns, options }`.

Quando as abas têm tipos diferentes, o lote guarda `targetType: "MIXED"`.

O dono pode sair da tela no meio: ao voltar, o assistente retoma o lote
pendente (`GET .../imports/active`). Lote abandonado pode ser cancelado
(`POST .../imports/:batchId/cancel`).

---

## 2. Limites

| limite | valor | onde |
|---|---|---|
| Tamanho do arquivo | 10 MB | `MAX_IMPORT_FILE_SIZE_BYTES` |
| Linhas de dados por arquivo | 20.000 | `MAX_IMPORT_ROWS` |
| Abas lidas por planilha | 10 | `MAX_IMPORT_SHEETS` |
| Colunas lidas por linha | 60 | `MAX_IMPORT_COLUMNS` |
| Caracteres por célula | 500 | `MAX_IMPORT_CELL_LENGTH` |
| Importações ativas por salão | 1 | `MAX_ACTIVE_IMPORT_BATCHES` |
| Importações iniciadas por hora | 5 | `MAX_IMPORT_BATCHES_PER_HOUR` (env `IMPORT_MAX_BATCHES_PER_HOUR`, só para afrouxar em local/teste) |
| Janela de desfazer | 30 dias | `IMPORT_UNDO_WINDOW_DAYS` |
| Guarda do arquivo temporário | 7 dias | `IMPORT_FILE_RETENTION_DAYS` |
| Bytes descomprimidos dentro do xlsx | 60 MB | `MAX_XLSX_UNCOMPRESSED_BYTES` (proteção contra ZIP bomb) |
| Entradas dentro do zip | 500 | `MAX_XLSX_ENTRIES` |
| Bytes declarados no container OLE2 (`.xls`) | 60 MB | `MAX_OLE2_DECLARED_BYTES` |
| Bytes declarados nos objetos do PDF | 60 MB | `MAX_PDF_DECLARED_BYTES` |
| Páginas de um PDF | 10 | `MAX_IMPORT_PDF_PAGES` |
| Caracteres de texto extraídos de um PDF | 2.000.000 | `MAX_IMPORT_PDF_TEXT_CHARS` |

Arquivos aceitos: `.xlsx`, `.xlsm`, `.xls` (Excel 97-2003), `.ods` (LibreOffice),
PDF com texto selecionável e texto delimitado (`.csv`, `.tsv`, `.txt`).

**O formato é decidido pelo conteúdo do arquivo (magic bytes), nunca pela
extensão nem pelo mimetype.** A extensão é escrita por quem exportou a planilha
e mente com frequência: um `.csv` que é na verdade XLSX é lido como XLSX, e um
`.xlsx` que é na verdade CSV é lido como CSV. O nome enviado pelo dono é usado
só para exibição.

| formato | como é reconhecido | como é lido |
|---|---|---|
| `.xlsx` | ZIP com `xl/workbook.xml` | `exceljs` (sem avaliar fórmula) |
| `.xlsm` | ZIP com `xl/workbook.xml` + `xl/vbaProject.bin` | idem — **a macro nunca é executada**, a parte é ignorada |
| `.xls` | assinatura OLE2 (`D0 CF 11 E0`) | leitor de BIFF8 que só extrai valores |
| `.ods` | ZIP do OpenDocument (`mimetype` + `content.xml`) | leitura do `content.xml` (só células) |
| PDF | assinatura `%PDF-` | texto posicionado na página agrupado em linhas/colunas |
| `.csv`/`.tsv`/`.txt` | texto sem NUL | separador detectado pelo conteúdo (`,` `;` tab `|`) |

Recusados com mensagem clara: arquivo vazio, acima de 10 MB, binário disfarçado
de texto, ZIP que não é planilha, PDF sem texto (digitalização), ZIP bomb,
OpenDocument que não é planilha, `.xls` que declara um tamanho falso e PDF que
declara um objeto gigante.

### Guardas de tamanho declarado

Dois formatos **declaram** o tamanho do conteúdo em vez de terem o tamanho
medido: o `.xls` (container OLE2) e o PDF (objetos com `/Length`). Um arquivo
malicioso declara gigabytes num arquivo de poucos KB — quem acredita na
declaração aloca por ela e estoura a memória do processo.

Por isso, antes de qualquer leitura:

- **`inspectOle2`** (`utils/oleGuard.ts`) lê o cabeçalho e o diretório do
  compound file e compara o que é declarado com o que o arquivo realmente tem.
  Se o `.xls` declarar mais setores do que tem, ou declarar streams maiores que
  o arquivo, ele é recusado — o tamanho declarado **não** é confiável.
- **`inspectPdf`** (`utils/pdfGuard.ts`) soma os `/Length` diretos do arquivo
  cru (sem interpretador de PDF) e recusa o PDF que declara mais do que 60 MB.
  `/Length 12 0 R` (referência indireta) não entra na conta.

As duas guardas rodam **no upload** (`validateImportFile`) e de novo na leitura
(`parseXls`/`parsePdf`): o arquivo traiçoeiro nunca nem chega a ser gravado em
disco.

### Planilha do mundo real

O dono manda a planilha como saiu do sistema dele. O leitor lida com isso:

| caso | o que acontece |
|---|---|
| Mais de uma aba | cada aba é lida com o seu próprio cabeçalho (`parseXlsxSheets`/`parseXls`/`parseOds`); o dono escolhe o tipo de cada uma |
| Células mescladas | o valor da célula mestra **não duplica** a linha (no `.xlsx`, a célula escrava da mescla é ignorada; no `.ods`, a célula coberta mantém a posição da coluna) |
| Cabeçalho fora da 1ª linha | a primeira linha mais larga é o cabeçalho; as linhas de capa ("Clientes — abril/2026") viram aviso (`preambleRows`), não linha de cliente |
| Linha de total ("TOTAL 2.334,46") | descartada e contada no aviso (`skippedTotalRows`) |
| Rodapé ("Gerado em 01/05/2026") | descartado — só quando a linha tem **uma célula só** e a primeira parece rodapé (cliente de verdade tem nome **e** contato) |
| Data em serial do Excel (`45900`) | o `.xls` entrega o número cru; a normalização (`normalizeDate`) converte para `2025-08-31` (45900 dias depois de 30/12/1899) |

#### Limitações conhecidas (Fase 1)

Estas duas limitações são **conhecidas e não resolvidas** na Fase 1. O dono
precisa saber delas para não estranhar o resultado:

**1. Mescla vertical: o valor não propaga para as linhas de baixo.**

Quando a mesma célula está mesclada em várias linhas (A2:A3, por exemplo), o
valor existe **só na célula mestra** (a de cima). O importador **não
repropaga** esse valor para as linhas de baixo — cada linha da planilha vira
uma linha de importação independente.

O que o dono vê: a linha de cima entra com o valor; a linha de baixo entra com
a coluna mesclada **vazia**. Se a coluna mesclada for "Nome" ou "WhatsApp", a
linha de baixo é **rejeitada** na validação (falta o dado obrigatório) e
aparece no relatório de erros — não vira cliente duplicado nem cliente pela
metade.

O que o dono faz: **desfazer a mescla** antes de enviar (o Excel/LibreOffice
pede "manter só o valor da célula superior" ao colar) ou **repetir o valor em
cada linha**. O importador prefere a linha rejeitada e explícita a um palpite
silencioso sobre o que a mescla queria dizer.

**2. Rodapé só é descartado quando o texto começa com palavra conhecida.**

A regra de rodapé (`looksLikeFooterRow`, em `utils/sheetMatrix.ts`) só apaga a
linha quando **todas** estas condições valem:

1. a linha tem **uma célula preenchida só** (as outras colunas estão vazias);
2. essa célula é a **primeira** da linha;
3. o texto começa com `gerado`, `exportado`, `impresso`, `atualizado` ou
   `criado` (sem diferenciar maiúsculas/minúsculas).

Um rodapé escrito de outra forma — "Emitido pelo sistema X", "Fim do
relatório", "Página 1 de 3" — **não** é apagado: ele vira uma linha de
importação e, por não ter WhatsApp, aparece como linha **rejeitada** no
relatório de erros. Isso é proposital: apagar linha por semelhança de texto
arriscaria apagar um cliente de verdade (uma empresa chamada "Total
Expressão", por exemplo).

O que o dono faz: se o rodapé aparecer na prévia, apagar essa linha da
planilha antes de confirmar. Nenhum dado é perdido — a linha rejeitada fica
visível no relatório, com o motivo.

### Fórmula e link externo

A planilha é **dado**, nunca programa:

- **Fórmula não é avaliada.** Entra o último valor literal guardado na célula
  (`42`), nunca `SUM(...)`. Vale para `.xlsx`, `.xlsm`, `.xls` e `.ods`.
- **Link externo não é resolvido.** Nenhuma requisição de rede é feita ao ler a
  planilha (há teste com `fetch` espionado) e o endereço **não** entra no dado
  importado: entra o rótulo do link ("Ver site").

Cada formato novo tem **arquivo de exemplo e caso hostil** em
`src/modules/dataImport/utils/fixtures/` (gerados por
`scripts/generate-import-fixtures.mjs`).

### Números que vêm da planilha

- **Telefone sem zero à esquerda** (`11987654321`, 11 dígitos) é preservado
  exatamente — é o formato que o Excel entrega quando a coluna é número.
- **Telefone com zero à esquerda** (`011987654321`, prefixo de operadora/antigo
  DDD) tem o zero removido; o número não muda.
- **DDI 55** (`+55 11 98765-4321`) é removido.
- **Notação científica** (`1,23456789E+10`) é **rejeitada**: os dígitos são
  outros, e essa forma tem 11 dígitos — pareceria um telefone válido e viraria
  a identidade errada de um cliente. CPF e documento devem estar como **texto**
  na planilha.

---

## 3. Alvos e colunas

A detecção automática casa o cabeçalho da planilha com os sinônimos de cada
campo (`IMPORT_FIELDS_BY_TARGET`, em `src/modules/dataImport/dataImport.constants.ts`).
O dono pode trocar o mapeamento antes de confirmar.

Os 11 alvos: `CLIENTS`, `SERVICES`, `APPOINTMENTS`, `STAFF_SCHEDULES`,
`SHOP_SCHEDULE`, `TIME_OFF`, `PRODUCTS`, `SERVICE_PACKAGES`, `CLIENT_PACKAGES`,
`FIADOS`, `CASES`. O alvo `PRODUCTS` fica oculto para o segmento jurídico e o
alvo `CASES` fica oculto para todos os segmentos que não tenham a feature
`caseManagement` (`availableImportTargets`).

### Clientes (`CLIENTS`)

| campo | obrigatório | Observações |
|---|---|---|
| Nome | sim | mínimo 2 caracteres |
| WhatsApp | sim | DDD + número (10 ou 11 dígitos); **é a identidade do cliente** |
| E-mail | não | |
| Data de nascimento | não | `dd/mm/aaaa` ou `aaaa-mm-dd` |
| Observações | não | até 2.000 caracteres |

### Serviços (`SERVICES`)

| campo | obrigatório | Observações |
|---|---|---|
| Nome do serviço | sim | |
| Preço | não | `R$ 1.234,56`, `1234.56` ou `1234,56` |
| Duração (minutos) | não | número inteiro |
| Categoria | não | categoria existente ou nova do salão |
| Descrição | não | |

### Agenda (`APPOINTMENTS`)

| campo | obrigatório | Observações |
|---|---|---|
| Data | sim | `dd/mm/aaaa`, `aaaa-mm-dd` ou serial do Excel |
| Hora | sim | `hh:mm` |
| Serviço | sim | precisa existir no catálogo — senão a linha é rejeitada |
| Nome do cliente | não | |
| WhatsApp do cliente | não | quando informado, o cliente é localizado (ou criado) pelo telefone |
| Profissional | não | localizado pelo nome na equipe do salão |
| Situação | não | `confirmado`, `concluído`, `cancelado`, `faltou`… (traduzidas para o status interno) |
| Valor | não | só entra no financeiro com a opção correspondente ligada |
| Forma de pagamento | não | `pix`, `dinheiro`, `cartão`, `crédito`, `débito`, `fiado`… |
| Modalidade | não | `presencial` ou `online` |
| Caso/processo | não | só para salões do segmento jurídico (`includeCase`) |

### Horários da equipe (`STAFF_SCHEDULES`)

| campo | obrigatório | Observações |
|---|---|---|
| Profissional | sim | casa com um membro da equipe existente — **nunca cria login novo**; nome ambíguo rejeita a linha |
| Dia da semana | sim | `segunda`, `terça`… (acentos normalizados) |
| Início / fim | sim | `hh:mm` |
| Pausa (início/fim) | não | pausa de almoço que não cabe no intervalo é ignorada + aviso |

Por padrão dias que já têm horário são **mantidos**; a opção
`replaceExistingSchedules` substitui.

### Horário do salão (`SHOP_SCHEDULE`)

| campo | obrigatório | Observações |
|---|---|---|
| Dia da semana | sim | |
| Abre / fecha | sim | `hh:mm`; `aberto=não` marca o dia fechado |

### Férias e folgas (`TIME_OFF`)

| campo | obrigatório | Observações |
|---|---|---|
| Profissional | sim | casa com a equipe existente |
| Início / fim | sim | `dd/mm/aaaa` |
| Motivo | não | |
| Status | não | por padrão entra **aprovada**; `importTimeOffAsPending` importa como pendente |

### Produtos e estoque (`PRODUCTS`)

| campo | obrigatório | Observações |
|---|---|---|
| Produto | sim | |
| SKU / código de barras | não | dedupe: SKU → código de barras → nome |
| Categoria | não | `createProductCategories` cria a que não existe |
| Preço de venda / custo | não | |
| Estoque inicial | não | vira **movimento de entrada** (`StockMovement` tipo `IMPORT`) — nunca sobrescreve o saldo direto |
| Estoque mínimo | não | `updateExistingProducts` atualiza preço/mínimo de produto existente |
| Imagem (URL) | não | **ignorada** + aviso |

### Catálogo de pacotes (`SERVICE_PACKAGES`)

| campo | obrigatório | Observações |
|---|---|---|
| Pacote | sim | |
| Sessões | sim | inteiro |
| Preço | sim | |
| Validade (dias) | não | |

### Pacotes dos clientes (`CLIENT_PACKAGES`)

| campo | obrigatório | Observações |
|---|---|---|
| Cliente (telefone) | sim | cria o cliente se não existir |
| Pacote | sim | casa no catálogo |
| Sessões totais / restantes | sim | |
| Valor pago | não | **não** cria `PACKAGE_SALE` nem evento financeiro |
| Compra / validade | não | |

### Fiados (`FIADOS`)

| campo | obrigatório | Observações |
|---|---|---|
| Cliente (telefone) | sim | **não cria cliente novo** — só vincula por telefone; telefone desconhecido rejeita a linha |
| Descrição | não | |
| Valor original | sim | |
| Já pago | não | vira `FiadoPayment` forma `other` **sem** lançamento no caixa |
| Vencimento | não | |

O fiado importado nasce com `origin: IMPORT`: ele **não entra no primeiro
ciclo de cobrança**. `sendFiadoReminders` (desligado por padrão) é a única forma
de disparar lembrete — e hoje também não dispara nada.

### Processos (`CASES`)

Disponível apenas para o segmento `LAW_FIRM` (feature `caseManagement`).

| campo | obrigatório | Observações |
|---|---|---|
| Cliente | sim | telefone identifica o cliente no CRM; cria o cliente se não existir |
| WhatsApp do cliente | sim | DDD + número (10 ou 11 dígitos); é a identidade do cliente |
| Apelido do caso | sim | mínimo 2 caracteres; apelido interno do escritório, nunca aparece para o cliente |
| Número do processo | não | padrão CNJ; dígito inválido entra com aviso, não bloqueia |
| Área de atuação | não | texto livre, ex.: "Cível", "Trabalhista" |
| Situação | não | `lead`, `em andamento`, `aguardando cliente`, `em juízo`, `suspenso`, `encerrado`, `arquivado` |
| Prioridade | não | `baixa`, `normal`, `alta`, `urgente` |
| Título do processo | não | texto livre |
| Órgão julgador / vara | não | texto livre |
| Parte adversária | não | texto livre |
| Valor da causa | não | `R$ 1.234,56`; dados do processo, não entra no caixa nem no financeiro |
| Valor obtido | não | `R$ 1.234,56`; base do honorário de êxito, não entra no caixa nem no financeiro |
| Data de abertura | não | `dd/mm/aaaa`; padrão é a data da importação |
| Advogado responsável | não | localizado pelo nome na equipe; ausente ou ambíguo entra sem responsável, com aviso |
| Observações | não | até 2.000 caracteres; interno, nunca aparece para o cliente |

**Regras de reimportação:**
- Número do processo repetido já existente no salão → linha ignorada (`SKIPPED`), não duplica.
- Sem número do processo: dedupe por cliente + apelido do caso (case-insensitive).
- CNJ com dígito verificador inválido → aviso na prévia, processo entra assim mesmo (processos antigos podem não seguir o padrão).
- O processo nasce com `shareWithClient: false` (sigilo): não aparece no portal do cliente nem em mensagens.
- Processo importado **não** lança caixa, receita, honorário nem comissão.

---

## 4. Regras de identidade (por que não duplica)

- **Cliente:** o telefone é a identidade. Cliente com o mesmo telefone **não é
  duplicado**:
  - com "Atualizar quem já existe" **ligado** (padrão), os dados da planilha
    atualizam o cadastro existente;
  - com a opção **desligada**, a linha é ignorada e aparece como `SKIPPED` na prévia.
- **Serviço:** o nome do serviço dentro do salão é a identidade; serviço
  existente é reaproveitado.
- **Agendamento:** a chave é **salão + serviço + dia + hora + cliente** (cliente
  comparado pelo CRM quando há telefone, pelo nome quando não). Agendamento
  equivalente já existente na agenda é ignorado (`SKIPPED`) — reimportar o mesmo
  arquivo não duplica a agenda.
- **Produto:** dedupe por SKU → código de barras → nome.
- **Horário:** por dia + profissional (ou dia do salão); mantido por padrão.
- **Pacote do cliente:** cliente + pacote; saldo é atualizado, não duplicado.

---

## 5. O que a importação **não** faz

Esta é a parte que mais importa: importar histórico **alimenta o CRM, não o caixa**.

- **Não envia mensagem** nenhuma (WhatsApp, e-mail ou avaliação).
- **Não cria comissão** nem lançamento financeiro.
- **Não marca o agendamento como concluído para o caixa** quando a opção
  "contar valores no histórico financeiro" está desligada (padrão): o agendamento
  entra na agenda, mas `completedAt` e `finalPrice` ficam vazios, então
  relatórios e comissões não o enxergam.
- **Não dispara convite de avaliação.** A opção `sendReviewInvitations` é aceita
  e guardada, e **nada é disparado**.
- **Não cria caixa/estoque direto:** estoque inicial é movimento `IMPORT`;
  "valor já pago" do fiado é pagamento sem caixa.
- Cliente importado **nunca entra em campanha de marketing** sem consentimento:
  o importador grava `marketingOptIn: false`.

---

## 6. Contadores de CRM

Ao concluir o lote, o cliente importado passa a ter o histórico alimentado:

| campo | regra |
|---|---|
| `totalAppointments` | soma dos agendamentos do lote que ficaram vinculados ao cliente |
| `lastVisitAt` | data do atendimento mais recente do lote com situação `COMPLETED` ou `CHECKED_IN` (nunca sobrescreve uma visita mais nova) |

Nada além disso muda: sem comissão, sem financeiro, sem notificação.

- **Idempotência:** o lote guarda `crmCountersAppliedAt`. Se a fila reprocessar o
  mesmo lote, os contadores não são contados duas vezes.
- **Ordem:** os contadores são aplicados **antes** de o lote ser marcado como
  concluído — assim o `updatedAt` do cliente continua anterior ao `finishedAt` e o
  desfazer consegue remover o que o lote criou.
- Código: `src/modules/dataImport/crmCounters.ts` (aplicar) e `revertCrmCountersForBatch`
  (desfazer, em `importUndo.ts`).

---

## 7. Desfazer (por tipo, com snapshot)

`POST .../imports/:batchId/undo` remove **apenas** o que o lote criou e **apenas**
o que não foi mexido depois. O desfazer cobre os 12 tipos de entidade
(`ImportCreatedEntity.entityType`), na ordem `UNDO_ORDER` (agenda → caso →
fiado → pacote do cliente → catálogo de pacotes → folga → horário da equipe →
horário do salão → produto → categoria → cliente → serviço):

- **Criado pelo lote** (`previousState: null`): removido, junto com o que dele
  depende (movimentos `IMPORT` de produto saem antes do produto; contador de CRM
  é revertido).
- **Substituído pelo lote** (`previousState: { before, applied }`): o desfazer
  **restaura** o `before` (ex.: horário que existia antes, preço de produto) —
  e usa o `applied` para detectar edição posterior.
- **Editado depois** (`applied` ≠ estado atual, ou `status` rejeitado/cancelado
  em folga): **preservado**, com o motivo no relatório.
- Registro com movimentação posterior (agendamento com avaliação/sinal/comissão,
  fiado com pagamento posterior, cliente com agendamento/avaliação) é
  **preservado**.

O relatório vem em `removed`, `kept` e `details[]` (`action: removed | kept |
restored` + motivo). A janela é de 30 dias a partir da criação do lote.

---

## 8. Cancelar lote pendente

`POST .../imports/:batchId/cancel` cancela um lote abandonado (upload sem
confirmação). Lote cancelado não grava nada e libera o salão para uma nova
importação.

---

## 8.1 Ciclo de vida do arquivo temporário do lote

Quem apaga o CSV (e o sidecar `.ocr.json`) do lote:

| momento | quem apaga | onde |
|---|---|---|
| Lote **concluído** com sucesso | `apagarArquivosLote(batch.filePath)`, logo após o processamento | `src/modules/dataImport/importProcessor.ts:243` |
| Lote **cancelado** pelo dono | `apagarArquivosLote(batch.filePath)` | `src/modules/dataImport/dataImportUseCases.ts:617` |
| Lote **expirado** (passou da janela de desfazer de 30 dias) | cron `data-import-cleanup` (`30 4 * * *`, `America/Sao_Paulo`), que marca o lote como `EXPIRED` e apaga os arquivos | `src/shared/infra/cron/dataImportCleanup.cron.ts:23` |
| Lote **concluído** que ficou com arquivo em disco (rede de segurança) | cron `data-import-cleanup` → `findCompletedForFileCleanup` | `src/shared/infra/cron/dataImportCleanup.cron.ts:32` |
| Arquivo **órfão** (o processo caiu no meio) | `cleanupOldTempFiles(7)` — apaga o que estiver no diretório temporário com mais de 7 dias | `src/modules/dataImport/utils/tempFiles.ts:43` |

O TTL do arquivo temporário é `IMPORT_FILE_RETENTION_DAYS = 7`
(`src/modules/dataImport/dataImport.constants.ts:57`), aplicado pelo cron de
limpeza; a janela de desfazer do lote é `IMPORT_UNDO_WINDOW_DAYS = 30`. O
arquivo **precisa** sobreviver ao processamento: é ele que permite desfazer a
importação depois.

---

## 9. Modelos (.xlsx)

`GET .../imports/template?target=<TIPO>` devolve um modelo por tipo (10 modelos),
com **duas linhas de exemplo** e os cabeçalhos certos para aquele segmento. A aba
"Como preencher" do modelo explica as regras. O assistente expõe os links na
etapa de upload.

---

## 10. Variáveis de ambiente

| env | padrão | para quê |
|---|---|---|
| `IMPORT_MAX_BATCHES_PER_HOUR` | `5` | importações iniciadas por salão em uma hora. Só aumente em ambiente local/teste (o e2e precisa de cota maior para repetir). |

---

## 11. Testes

| tipo | onde | o que cobre |
|---|---|---|
| unit | `src/modules/dataImport/**/*.spec.ts` (26 arquivos) | processadores dos 10 alvos, plano multi-aba, desfazer 12 tipos com snapshot, contadores, parsers (xlsx/xlsm/xls/ods/pdf/texto), **detecção por magic bytes**, **número → texto sem perder dígito**, rótulos |
| integração | `src/tests/integration/dataImport.integration.spec.ts` | fluxo completo contra Postgres: dry-run não grava, sem efeitos colaterais, contadores, reimportação sem duplicar, desfazer remove só o criado, **multi-aba (MIXED) com desfazer multi-tipo e ordem de dependência** |
| e2e | `frontend/e2e/data-import.spec.ts` | navegador: upload → alvo → colunas → prévia → confirmar → reimportar sem duplicar → desfazer, garantia de que **nenhuma mensagem** foi enviada, e **multi-aba** (atribuição de tipo por aba + desfazer) |

Rodar o e2e (precisa do stack inteiro e de um salão com dono):

```bash
cd frontend
E2E_BASE_URL=http://127.0.0.1:3003 \
IMPORT_E2E=1 PANEL_EMAIL=... PANEL_PASSWORD=... \
npx playwright test e2e/data-import.spec.ts --project=desktop-chromium
```

---

## 12. Próximos passos

- Revisão completa do inventário de RLS (o schema já tem 178 models; o inventário
  foi escrito com 143 — ver `docs/RLS-INVENTARIO.md`).
