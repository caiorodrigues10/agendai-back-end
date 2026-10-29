# Assistente de importação de planilhas

O dono do salão importa clientes, serviços e histórico de agenda a partir de uma
planilha `.xlsx` ou `.csv`. Nada é gravado antes da prévia: o fluxo sempre passa
por **dry-run** (simulação) e só grava depois que o dono confirma.

- **Backend:** `src/modules/dataImport/` (rotas, use cases, processors, worker).
- **Frontend:** `src/features/dataImport/` (assistente em Configurações → Importar dados).
- **Rotas:** `src/modules/dataImport/dataImport.routes.ts` — todas exigem dono
  (`OWNER`/`MASTER_ADMIN`) e passam por `setRlsContext`.

---

## 1. Fluxo

| passo | o que acontece | rota |
|---|---|---|
| 1. Arquivo | o dono envia a planilha (até 10 MB) | `POST /api/barbershops/:barbershopId/imports` |
| 2. O que importar | escolhe o alvo (clientes, serviços ou agenda) e a aba da planilha | `PATCH .../imports/:batchId/target` |
| 3. Colunas | o sistema detecta as colunas por sinônimo; o dono corrige o que quiser | `PATCH .../imports/:batchId/mapping` |
| 4. Validação | **dry-run**: mostra quantas linhas entram, quantas são ignoradas e quantas são rejeitadas — não grava nada | `POST .../imports/:batchId/validate` |
| 5. Prévia | o dono confere e confirma | `POST .../imports/:batchId/confirm` |
| 6. Processamento | o worker processa em pedaços de 200 linhas, cada pedaço em uma transação | fila `data-import` |
| 7. Conclusão | mostra o resultado e permite **desfazer** em até 30 dias | `POST .../imports/:batchId/undo` |

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

Arquivos aceitos: `.xlsx` e `.csv`. A extensão não vale sozinha: o backend confere
a assinatura binária do arquivo (`.xlsx` precisa começar com `PK`). `.xlsm`,
`.xlsb`, `.xls`, `.ods` e `.zip` são recusados com mensagem explícita.

---

## 3. Colunas aceitas por alvo

A detecção automática casa o cabeçalho da planilha com os sinônimos de cada
campo (`IMPORT_FIELDS_BY_TARGET`, em `src/modules/dataImport/dataImport.constants.ts`).
O dono pode trocar o mapeamento antes de confirmar.

### Clientes (`CLIENTS`)

| campo | obrigatório |Observações |
|---|---|---|
| Nome | sim | mínimo 2 caracteres |
| WhatsApp | sim | DDD + número (10 ou 11 dígitos); **é a identidade do cliente** |
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

---

## 5. O que a importação **não** faz

Esta é a parte que mais importa: importar histórico **alimenta o CRM, não o caixa**.

- **Não envia mensagem** nenhuma (WhatsApp, e-mail ou avaliação).
- **Não cria comissão** nem lançamento financeiro.
- **Não marca o agendamento como concluído para o caixa** quando a opção
  "contar valores no histórico financeiro" está desligada (padrão): o agendamento
  entra na agenda, mas `completedAt` e `finalPrice` ficam vazios, então
  relatórios e comissões não o enxergam.
- **Não dispara convite de avaliação.** A opção "convidar para avaliação" existe
  na interface mas é **fase 2**: hoje ela é aceita e guardada, e **nada é
  disparado** (`sendReviewInvitations` — ver `dataImport.types.ts`).
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

## 7. Desfazer

`POST .../imports/:batchId/undo` remove **apenas** o que o lote criou e **apenas**
o que não foi mexido depois:

- registro que ganhou movimentação posterior (agendamento com avaliação, sinal,
  comissão ou item de fila; cliente com agendamento, avaliação, evento financeiro
  ou fiado) é **preservado**;
- registro alterado depois da importação (`updatedAt` posterior ao fim do lote)
  é **preservado**;
- o que o lote criou e ninguém tocou é **removido**;
- junto saem os contadores de CRM do que foi removido.

O relatório do desfazer vem em `removed` (quantos saíram) e `kept` (quantos
ficaram, com o motivo de cada um). A janela é de 30 dias a partir da criação do
lote.

---

## 8. Cancelar lote pendente

`POST .../imports/:batchId/cancel` cancela um lote abandonado (upload sem
confirmação). Lote cancelado não grava nada e libera o salão para uma nova
importação.

---

## 9. Variáveis de ambiente

| env | padrão | para quê |
|---|---|---|
| `IMPORT_MAX_BATCHES_PER_HOUR` | `5` | importações iniciadas por salão em uma hora. Só aumente em ambiente local/teste (o e2e precisa de cota maior para repetir). |

---

## 10. Testes

| tipo | onde | o que cobre |
|---|---|---|
| unit | `src/modules/dataImport/crmCounters.spec.ts` | contadores de CRM: soma, última visita, idempotência, reversão |
| unit | `src/modules/dataImport/processors/*.spec.ts` | processadores de cliente, serviço e agendamento (inclusive o dedupe de agendamento) |
| unit | `src/modules/dataImport/importUndo.spec.ts` | regras do desfazer |
| integração | `src/tests/integration/dataImport.integration.spec.ts` | fluxo completo contra Postgres: dry-run não grava, sem efeitos colaterais, contadores, reimportação sem duplicar, desfazer remove só o criado |
| e2e | `frontend/e2e/data-import.spec.ts` | navegador: upload → alvo → colunas → prévia → confirmar → reimportar sem duplicar → desfazer, e a garantia de que **nenhuma mensagem** foi enviada |

Rodar o e2e (precisa do stack inteiro e de um salão com dono):

```bash
cd frontend
E2E_BASE_URL=http://127.0.0.1:3003 \
IMPORT_E2E=1 PANEL_EMAIL=... PANEL_PASSWORD=... \
npx playwright test e2e/data-import.spec.ts --project=desktop-chromium
```

---

## 11. Fases futuras

- **Fase 2 — convites de avaliação:** implementar `sendReviewInvitations` (hoje a
  opção é aceita e não dispara nada).
- Revisão completa do inventário de RLS (o schema já tem 178 models; o inventário
  foi escrito com 143 — ver `docs/RLS-INVENTARIO.md`).
