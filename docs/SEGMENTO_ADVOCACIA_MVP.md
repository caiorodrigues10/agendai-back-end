# Segmento profissional — Advocacia (`LAW_FIRM`)

Documento de referência do MVP implementado para o grupo de segmentos
`professional` (rótulo **Serviços profissionais**). O segmento concreto é
`LAW_FIRM` (Advocacia), com vocabulário de **atendimento** e repository de
**honorários**.

- Fonte de verdade do segmento: `backend/src/shared/segments/index.ts`
- Gate genérico por segmento: `backend/src/shared/segments/segmentGate.ts`
  (espelho em `frontend/src/config/segmentGate.ts`)
- Restrição de publicidade por segmento: `backend/src/shared/segments/advertising.ts`
  (espelho de leitura em `frontend/src/shared/segments/index.ts`)
- Migration: `backend/prisma/migrations/20261028160000_law_firm_segment_fields/migration.sql`
- Gestão de processos: `backend/src/modules/cases/` — migration
  `backend/prisma/migrations/20261028210000_case_management/migration.sql`
- Feature de segmento (`caseManagement`): `backend/src/shared/segments/index.ts`
  (`features`) + `segmentFeatureGuard` (403 para quem não tem a feature)

## O que existe no MVP

### 1. Segmento e vocabulário

- `BusinessSegment.LAW_FIRM` no grupo `professional` / "Serviços profissionais".
- Rótulos: serviço = **atendimento**, faturamento = **honorários**,
  estabelecimento = **escritório**, profissional = **advogado(a)**.
- `operationMode` sugerido `APPOINTMENTS_ONLY` (fila já some sozinha).
- `auxiliaryProfile: 'case'` — a ficha auxiliar do segmento vira caso/processo
  (mesmo mecanismo de pet e veículo, sem `if/else` por segmento).
- Catálogo inicial de serviços (consulta, audiência, diligência, reunião).

### 2. Gate genérico por segmento

Uma única configuração declara, por segmento, o que **não** existe:

| Segmento  | Abas ocultas     | Módulos ocultos                          |
| --------- | ---------------- | ---------------------------------------- |
| `LAW_FIRM` | `products`, `equipment` | `products`, `equipment`, `commissions`, `tip` |

- UI: `canAccessTab` / `getDefaultTab` consultam `isTabEnabled`.
- API: `segmentModuleGuard` nega os endpoints dedicados com
  `403 SEGMENT_FEATURE_UNAVAILABLE` (master admin passa).
- Gorjeta: bloqueada no `registerMovement` de caixa (`TIP`).
- Comissões: seção do `FinancialDashboard` some e a chamada é dispensada.
- Cache de segmento com TTL de 60s, invalidado ao trocar `businessSegment`.

### 3. Áreas de atuação e OAB

- `Barbershop.practiceAreas` (tags, máx. 20) e `Barbershop.oabRegistration`
  (texto livre opcional por estabelecimento, ex. `SP 123456`).
- Edição em **Configurações → Perfil profissional** (só no segmento de
  advocacia); validação leve de UF + número, sem consulta externa.
- Exibição no perfil público como `OAB/SP nº 123456` + lista de áreas.

### 4. Ficha auxiliar "caso/processo"

- `ClientCase` (apelido, área de atuação, número CNJ, observações) com CRUD em
  `/api/clients/:id/cases`.
- Aba **Casos** na ficha do cliente (aparece quando `auxiliaryProfile === 'case'`).
- No agendamento, o caso é escolhido por chip e o **apelido vem do banco**
  (`resolveCaseSnapshot`): o cliente nunca digita o identificador do processo.
- Número CNJ normalizado para `NNNNNNN-DD.AAAA.J.TR.OOOO` (aceita a variante
  sem pontos; vazio é permitido).

### 5. Modalidade e link da reunião

- `Appointment.modality` (`IN_PERSON`, `VIDEO`, `PHONE`), `Appointment.meetingLink`
  e `Appointment.practiceArea`.
- Escolha da modalidade (presencial / vídeo / telefone) e link opcional no
  formulário de agendamento do painel.
- O **lembrete** ao cliente inclui a modalidade e o link da reunião.

### 6. Serviço interno (`publicBookable`)

- `Service.publicBookable` (default `true`), editável em Catálogo → Serviço.
- Serviço com `publicBookable = false` (audiência interna, diligência, despacho):
  - não aparece no perfil público nem na agenda pública;
  - a API recusa o agendamento público com `SERVICE_NOT_PUBLICLY_BOOKABLE`;
  - os slots públicos do serviço não são oferecidos.

### 7. Privacidade dos dados de caso

- Dados de caso/processo **nunca** aparecem em: perfil público, resposta da API
  pública de agendamento, mensagens/lembretes ao cliente, assistente do
  WhatsApp do owner bot.
- Logs redigem `caseId`, `caseName`, `caseNumber` e `nickname`.

### 8. Restrição de publicidade (`advertisingRestricted`)

Declaração única no segmento (`advertisingRestricted: true` no `LAW_FIRM`) +
helper genérico `shared/segments/advertising.ts`. Desliga, no segmento:

| Recurso | Como desliga |
| ------- | ------------- |
| Campanhas/mensagens em massa do assistente | `ownerBotActions.sendCampaignToClients` bloqueado; comando de campanha fora do catálogo do segmento |
| Pedido de avaliação e nota/reputação públicas | `reviewInvitationService` não cria convite, `getPublicSummary` vazio, `submit` recusa (403) e a rota de listagem pública não expõe avaliações |
| Pesquisa NPS | `npsService.assertShopEligible` nega com 403 `ADVERTISING_FEATURE_UNAVAILABLE` |
| Indicações (referrals) | middleware `advertisingGuard` nas rotas + o código **não é gerado** no cadastro (`RegisterUseCase`/`RegisterGoogleUseCase`) |
| Fidelidade (loyalty) | middleware `advertisingGuard` nas rotas + programa nasce **inativo** no seed |
| Notificações promocionais | `notificationDeliveryService` marca `ADVERTISING_RESTRICTED` e não envia |
| Preços públicos | o perfil público e o booking público não exibem valores (`isAdvertisingRestricted` no front) |

**Continua existindo:** agenda, clientes, casos, honorários, financeiro e a
consulta interna do dono ("quem não vem há X dias") — é lista para o dono, não
divulgação ao cliente.

### 9. Assistente do WhatsApp com o vocabulário do escritório

- Perfil do segmento em `whatsappOwnerBot/segmentProfiles.ts`: sem fila, sem
  walk-in, sem marketing; destaques do escritório, vocabulário de
  **atendimento**/**audiência**/**honorários**.
- Catálogo de comandos por segmento (`commands/catalog.ts`): em advocacia
  ficam fora fila, waitlist, comissões e cupom; a ajuda usa os exemplos do
  escritório ("audiencias" → agenda do dia).
- Briefing diário e resumo no vocabulário do segmento ("Hoje você tem 2
  atendimentos e 1 audiência"; "Honorários" no lugar de "Faturamento").
- Encerrar atendimento com cobrança pergunta **valor** e **forma de
  pagamento** (Pix, Dinheiro, Cartão, Fiado) antes de concluir.
- Dados de caso/processo são removidos das mensagens do bot (`stripCaseData`).

### 10. Cadastro, onboarding e conformidade

- `seedBarbershopDefaults` aplica catálogo (Consultoria/Contencioso), preset de
  horário (seg–sex), modo sugerido `APPOINTMENTS_ONLY` e preferências por
  segmento; em segmento restrito: sem despesa "Marketing", fidelidade inativa
  e NPS desligado.
- Onboarding com o vocabulário do segmento ("Revisar dados do escritório",
  "Revisar atendimentos sugeridos").
- `complianceNote` do segmento aparece no cadastro e em Configurações
  ("Não substitui a análise jurídica: valide com um advogado e com as regras
  da OAB aplicáveis qualquer conteúdo que você divulgar.").
- Página de marketing do escritório (`/software-para-escritorio-de-advocacia`)
  sem promessa de resultado jurídico.

### 11. Gestão de processos (gerenciador de processos)

Feature de segmento `caseManagement` (declarada no `LAW_FIRM`, sem
`if (segment === ...)`): habilita a aba **Processos** no painel e as rotas
`/api/cases*` na API (`segmentFeatureGuard` nega com 403
`SEGMENT_FEATURE_UNAVAILABLE` os segmentos sem a feature).

- **Pipeline** (`ClientCase.status`): consulta → em andamento → aguardando
  cliente → em tribunal → suspenso → encerrado (→ arquivado), com prioridade
  (baixa, normal, alta, urgente) e responsável (advogado(a) do escritório).
- **Caso**: título do processo, órgão julgador/vara, parte adversária, valor da
  causa (`claimedAmount`), valor obtido (`awardedAmount`), data de abertura e
  `closedAt` carimbado ao encerrar/arquivar.
- **Tarefas** (`CaseTask`): título, descrição, prioridade, responsável,
  data de entrega e conclusão (`DONE`/`CANCELED`).
- **Prazos** (`CaseDeadline`): tipo (resposta judicial, audiência, recurso,
  contratual, interno), data **em dias úteis** (pula fins de semana, feriados
  nacionais BR e feriados/suspensões do escritório em `OfficeHoliday`),
  dias restantes (negativo = atraso) e marcação de cumprido.
- **Andamentos** (`CaseEvent`): linha do tempo (nota, reunião, distribuição,
  andamento judicial, intimação, pagamento, contato com cliente).
- **Documentos** (`CaseDocument`): contrato, procuração, peça, prova,
  documento judicial, termo de abertura, recibo — com tipo, versão e link do
  arquivo.
- **Financeiro do caso**: honorários somados dos atendimentos concluídos
  vinculados ao caso (`Appointment.caseId`), saldo em aberto do cliente (fiado),
  valor da causa e valor obtido.
- **Relatório por área de atuação** (`GET /cases/reports/practice-areas`):
  processos por área, ativos/encerrados, valores da causa e honorários.
- **Assistente do WhatsApp**: comandos `case.deadlines` (próximos prazos),
  `case.tasks` (tarefas abertas) e `case.pipeline` (resumo do pipeline) — com
  sigilo: só título, data e dias, nunca número de processo, tribunal ou
  apelido do caso.
- **Tela do painel** (`frontend/src/features/cases/`): pipeline com contagem
  por etapa, busca e filtros, lista de processos, detalhe com abas (visão
  geral, tarefas, prazos, andamentos, documentos, financeiro) e calendário de
  prazos do escritório.

### 12. Backlog do escritório entregue (fase 2)

Tudo abaixo passou a existir em `20261029000000_case_backlog` (migration
`prisma/migrations/20261029000000_case_backlog/`).

- **Contratos e procurações com assinatura** (`CaseContract`,
  `ContractSignature`): contrato do caso com tipo (serviços, procuração,
  acordo, honorários), texto, arquivo digitalizado, valor e percentual de
  êxito. Cada signatário (cliente, advogado, testemunha) recebe um **link
  público com token** (`/assinar/:token`) para assinar digitando o nome ou
  desenhando (canvas). O status do contrato é recalculado: todos assinados →
  `SIGNED`, alguns → `PARTIALLY_SIGNED`. O link de assinatura só expõe
  título, conteúdo e nome do signatário — nunca número de processo, apelido
  interno ou dados do cliente.
- **Timesheet** (`CaseTimeEntry`): horas por caso e profissional, com valor
  por hora, marcação de "cobrável" e de "faturado". O valor é **derivado**
  (minutos/60 × valor/hora) — o escritório lança horas, não valores.
- **Honorários de êxito** (`CaseSuccessFee`): percentual sobre o valor obtido
  no caso (`awardedAmount`), com parcelamento. O valor é **recalculado** pelo
  sistema; o escritório informa o percentual.
- **Digestão de intimações / PJe** (`CourtIntimation`): o escritório cola o
  texto da intimação (email do tribunal, notificação do PJe, tabela de
  movimentações) e o sistema **detecta o número CNJ** e **sugere o tipo do
  andamento** (audiência, sentença, petição, prazo, pagamento). A triagem
  vincula ao caso e gera o andamento. O parser também é usado no cadastro
  manual de intimações.
  - O PJe **não expõe API pública universal**: a importação por texto/arquivo
    é o caminho que funciona hoje; um provedor de tribunal real pluga no
    contrato de parser/adapter sem mudar o resto do módulo.
- **NFS-e** (`CaseFeeInvoice`): nota fiscal do escritório com descrição,
  valor, retenção de ISS, tomador e status. Emissão **manual** (o número é
  digitado) funciona sem credenciais; NFE.io e Focus NFe exigem token na env
  (`NFEIO_API_TOKEN` / `FOCUS_NFE_API_TOKEN`) e falham com mensagem clara
  quando não configurados.
- **Alertas automáticos de vencimento de prazo** (`DeadlineAlert`): cron
  diário (08:00, horário de Brasília) varre os prazos pendentes e avisa o
  dono por WhatsApp quando o prazo vence em até 3 dias úteis ou já venceu.
  A deduplicação é por (prazo, destinatário, tipo, canal, dia) — índice
  único no banco, então a varredura é idempotente.
- **Portal do cliente — acompanhamento do processo**: `GET /client/portal/cases`
  (sessão do portal, não do painel) devolve **apenas** o que o escritório
  marcou como compartilhável: `ClientCase.shareWithClient` liga o caso no
  portal (alternável no painel, aba "Visão geral") e `CaseEvent.visibleToClient`
  libera cada andamento (checkbox ao registrar o andamento). Nunca saem
  número de processo, apelido interno, parte adversária, tribunal ou
  observações. O portal também oferece o link de assinatura pendente.
  O vínculo entre a identidade do portal e a ficha do cliente é o
  `ClientSalonLink` confirmado (`POST /client/portal/request-link` + confirmação
  no painel) — sem ele, o portal não enxerga nenhum caso.
- **Multi-escritório com transferência de casos** (`CaseTransfer`): a unidade
  de origem solicita a transferência para uma **unidade irmã** (mesma
  `Organization`); a unidade de destino aceita e, aí, o caso e tudo que é
  vinculado (tarefas, prazos, andamentos, documentos, contratos, assinaturas,
  horas, honorários, intimações e NFS-e) passa para a unidade de destino em
  uma transação, com trilha de auditoria (`PENDING` → `ACCEPTED`/`REJECTED`).

### 13. Correções de robustez (achadas no smoke test)

- **Transferência entre unidades**: a resposta da unidade de destino falhava
  com 500. O registro de transferência guarda `barbershopId` = **origem**
  (trilha de auditoria), mas a resposta é dada pela **destino** — a busca
  agora considera os dois lados.
- **Portal do cliente**: o filtro de próximos compromissos comparava a coluna
  `Appointment.date` (`@db.Date`) com uma string `"YYYY-MM-DD"`. O Prisma
  exige DateTime completo para `gte`; a comparação passou a usar meia-noite
  UTC. Sem isso, `GET /client/portal/cases` devolvia 500 sempre que havia
  cliente vinculado.
- **Auditoria**: `audit_logs.action` é `VarChar(100)` e rotas com vários uuids
  estouravam o limite — a auditoria era perdida silenciosamente. O hook global
  agora trunca `action`, `resource`, `resourceId` e `ipAddress`.
- **Honorário de êxito**: ao mudar o valor obtido no caso, os honorários de
  êxito do caso são recalculados (o valor é derivado do caso).

### 14. Correção do número CNJ

O segmento do tribunal (TR) do padrão CNJ passou a ser aceito **em letras e
em dígitos** (`1234567-89.2026.8.SP.0100` e `1234567-89.2026.8.26.0100` — o
formato oficial usa dígitos). Antes só o formato com letras era aceito, o que
rejeitava a maioria dos números brasileiros colados do tribunal.

## Fora de escopo (backlog)

Nada abaixo foi implementado; fica registrado para as próximas fases:

1. **Provedor real de tribunal (PJe/e-CNJ)** — a digestão atual é por texto
   colado; falta a integração autenticada com cada tribunal (credenciais por
   tribunal) e o polling automático de andamentos.
2. **Assinatura com certificado digital (ICP-Brasil)** — hoje há assinatura
   eletrônica por link (digitada ou desenhada), com registro de data/hora.
3. **Emissão de NFS-e de verdade** — os adaptadores existem e estão
   documentados, mas exigem credenciais do provedor e o mapeamento fiscal do
   município (tipo de serviço, alíquota, tomador).
4. **Rateio de honorários entre sócios** e **split de pagamento**.
5. **Intimações automáticas por e-mail** — hoje a colagem é manual; falta
   conectar o e-mail do escritório (IMAP) para capturar as intimações.
6. **Assinatura com biometria** e comprovação de identidade do signatário
   além do token do link.

## Notas de operação

- A migration precisa ser aplicada com `prisma migrate deploy` (produção) ou
  `npm run prisma:migrate:dev` (dev). O schema é idempotente e inclui a policy
  RLS `tenant_isolation` da tabela `client_cases`.
- Depois de mudar `schema.prisma`, reinicie o container da API: o Prisma Client
  em memória continua com o schema antigo até o restart.
- Trocar o segmento do estabelecimento invalida o cache de segmento; o gate de
  UI e o da API passam a valer na próxima requisição.
