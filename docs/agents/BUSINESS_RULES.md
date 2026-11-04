# Regras de negócio — Backend

Invariantes confirmadas no código/testes. Divergências com regra de produto aprovada → pendência documental (não alterar comportamento só por doc).

## Trial e assinatura

- `TRIAL_DAYS = 30` em `shared/constants/subscription.ts`.
- Trial calendário **≠** inadimplência: não bloquear CPF só porque o trial acabou.
- Status bloqueados nas APIs operacionais: trial expirado sem assinatura válida, ou `PAST_DUE` / `CANCELED` / `UNPAID` → tipicamente **402** `SUBSCRIPTION_REQUIRED`.
- Inadimplência real pode levar a `BlockedEntity` / **403** `CPF_BLOCKED`.
- Pagamento aprovado (webhook) → desbloqueio + assinatura `ACTIVE`.
- `MASTER_ADMIN` isento de `checkSubscription`.
- Dashboard/insights: `checkDashboardAccess` / **403** `DASHBOARD_REQUIRED` no plano sem dashboard (exceto trial Pro).

## Tenant, permissões, RLS

- Tenant = `Barbershop`.
- `authorize(roles)` + permissões de employee onde aplicável.
- `setRlsContext` para isolamento; não assumir que todo endpoint já aplica RLS — verificar rota.

## Imagens & página pública (Cloudinary)

- **Todo upload de imagem é Cloudinary** via DI token `ImageStorageProvider` (logo, capa, avatar, produtos, posts/mídia); token legado `StorageProvider` (GCS→Cloudinary) só cobre **deletes de objects antigos** e vídeo legado. Env obrigatória: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` (sem ela, upload → 503).
- Arte de posts (`FeedPost`): a data-URL gerada **no ato de salvar/publicar/editar** vira asset na pasta `posts-art` (`posts/services/postImageStorageService.ts`); `imageUrl` grava a URL pública e `imageAssetName` o `public_id` (NULL = legado base64/URL externa, sem asset a destruir). Falha de upload → 502 "tente de novo" (**nunca** regrava base64 no banco); gravação falha após upload → `destroy` do asset novo (compensação); update com arte nova → grava a nova e destrói a anterior; deletar post → destrói o asset (best-effort). Prévia (`POST /posts/generate`, preview de template) **nunca** sobe. **Formato da arte (decisão registrada):** camada de foto presente (upload **ou** stock ilustrativo) → **JPEG q90 4:4:4**; sem nenhuma camada de foto → **PNG** otimizado; prévia do editor → **JPEG** ~q78/540px — a escolha é automática no motor (`RenderSpec.output` omitido = auto; `preview: true` = prévia). O broadcast WhatsApp baixa a URL hospedada e enfileira base64 cru (falha de download → broadcast abortado com warn).
- Spec única de imagens em `shared/constants/imageSpecs.ts` (espelhada no front por `npm run theme:mirror`/`theme:check`): **capa aceita QUALQUER medida/proporção** (1920×1080 16:9 é só recomendação de UI — o recorte `c_fill,ar_16:9` e o ponto focal `coverFocalX/Y` são aplicados na entrega pelo helper único `frontend/src/shared/coverImage.ts`, com `coverWidth/coverHeight` do back evitando ampliação; ideal ≤2× da maior dimensão) e logo 1:1 exata (recomendado 512×512, mín. 400×400); JPEG/PNG/WebP. **Peso validado no back ANTES do decode** (`validateAndNormalizeImage` → 413: capa ≤5 MB, logo ≤2 MB via `maxBytes`) e teto de 5 MB no multipart global (rotas de vídeo/mídia sobrescrevem por chamada). Validação em 3 camadas: front (instantânea: tipo sempre; dimensões/proporção só do logo), back (`validateAndNormalizeImage` com sharp: peso, magic bytes, dimensões/proporção apenas do logo, EXIF removido) e Cloudinary.
- Upload direto assinado de imagem: `POST /barbershops/:id/uploads/sign` `{kind: cover|logo}` → back assina params (public_id determinístico, overwrite/invalidate, allowed_formats) e o cliente envia FormData direto ao Cloudinary com progresso/cancelamento; depois `POST /barbershops/:id/page-theme/cover/confirm` `{publicId, version}` → back consulta `cloudinary.api.resource` (autoridade: pasta do tenant, formato, version — dimensões livres) e, se o asset estiver fora do padrão, `destroy` + 400; grava `coverWidth/coverHeight` (original) preservando o focal atual. Rota multipart legada de capa mantida como fallback (sem limites de tamanho).
- `public_id` determinístico e sobrescrito: `agendaja/{barbershopId}/logo/logo` e `agendaja/{barbershopId}/cover/cover` (`overwrite` + `invalidate`); falha de DB após upload apaga o asset (sem órfão). Deletes roteiam pela origem (`shared/utils/imageAssetDeletion.ts`): URL/publicId do Cloudinary → `ImageStorageProvider`; URL do GCS legado → `StorageProvider`.
- Migração sob demanda de imagens GCS → Cloudinary: `npm run images:migrate-cloudinary` (dry-run; `--apply [--barbershop=<uuid>] [--limit=N] [--delete-source]`).
- Tema da página pública (`BarbershopPageTheme`, 1:1): cores hex + radius + botão + overlay 0–80 + capa (`coverFocalX/Y` 0–100, padrão 50/50 — aceito no `PUT`; `coverWidth/Height` só do servidor); **contraste WCAG AA validado no back por variante** (escura sempre; clara quando materializada — par reprovado → 400 com o nome da variante); `mode` (`AUTO|LIGHT|DARK`) + `darkColors`/`lightColors` (JSON), colunas planas = espelho legado do `darkColors` (linha sem JSON volta às planas); `PUT` exige OWNER do tenant (ou MASTER_ADMIN); rotas de upload/tema com rate limit próprio.
- Cartão OG da página pública: `GET /barbershops/:id/page-theme/og-image` gera PNG 1200×630 (cores do tema + nome do salão via sharp/SVG; fonte `font-noto-sans` no Dockerfile), cache 1h.

## Galeria do perfil (aba Fotos)

- A galeria é alimentada **exclusivamente** pela sub-aba "Fotos do perfil" (dentro da tela "Posts" do painel do dono): `POST /posts/media/:barbershopId` com `inGallery=true`. O upload do editor de posts grava `inGallery=false` e **não** publica no perfil.
- Limite de `GALLERY_MAX_PHOTOS = 30` (`PostMediaController`): a verificação roda **antes** do envio ao Cloudinary → **400** "Sua galeria já tem 30 fotos. Remova uma foto para enviar outra." (nada é enviado ao storage, sem arquivo órfão).
- `GET /posts/media?barbershopId=…&inGallery=true` lista a galeria respeitando o tenant (`ensureTenant` → 403 para outro salão); a rota pública `GET /social/:salonId/gallery` devolve `inGallery: true` em `createdAt DESC` (`take: 30`).
- Excluir foto de galeria funciona normalmente: o bloqueio 409 ("remova a imagem dos rascunhos ou posts agendados") só vale para foto usada em rascunho/post agendado — foto de galeria nunca é usada em post.
- Sem backfill: fotos já existentes mantêm o `inGallery` atual (default da coluna: `false`).

## Posts do feed — agendamento fora da UI

- O frontend não tem mais UI de agendamento: `PostsManager` só expõe as sub-abas **Publicados** e **Rascunhos**, e `PostEditor` só salva rascunho (`create/update` com `status: 'draft'`) ou publica (`POST /posts/:id/publish`). Não há botão/fluxo de "Agendar publicação" nem "Cancelar agendamento".
- Migration de dados `20261028140000_posts_scheduled_to_draft`: converte `FeedPost` de `SCHEDULED` → `DRAFT` e zera `scheduledFor` (posts legados senão ficariam invisíveis na UI). Idempotente; nenhum DDL — enum `FeedPostStatus.SCHEDULED`, coluna `scheduledFor` e rotas legadas permanecem.
- Rotas mantidas por compatibilidade (sem consumidores no front): `POST /posts/:id/schedule`, `POST /posts/:id/cancel-schedule`, `GET /posts/scheduled` (`staffGuard`). O `createPostSchema` continua aceitando `scheduledFor` (futuro → agenda), e o cron `postPublisher` mantém o bloco que publica `SCHEDULED` vencidos — legado/inerte sem chamadas de agendamento, mas remoção exige decisão explícita do produto.
- Editor: validar que a API deixa um rascunho incompleto salvar (por design — rascunho é livre) e que publicar exige modelo carregado, fotos exigidas pelo template e itens de preço quando o template usa lista.

## Redes sociais do perfil (barbershops.socialLinks)

- O dono cadastra até 5 redes (Instagram, TikTok, X, YouTube, Facebook) via `PATCH|PUT /barbershops/:id` (corpo `socialLinks`, mapa rede → URL; OWNER/MASTER_ADMIN + tenant via `assertShopAccess`). A resposta pública `GET /barbershops/:id` (e a lista) devolve o mapa ordenado pelas redes conhecidas.
- Persistência: coluna JSONB `barbershops.socialLinks` (migration `20261028120000_barbershop_social_links`; sem backfill, NULL = nenhuma rede). JSON em vez de tabela nova: herda a RLS/tenant já existente da tabela `barbershops` e segue o padrão de `pageTheme`/`designOptions`.
- Normalização por rede (`modules/barbershops/utils/socialLinks.ts`): aceita `@usuario`, `usuario`, `rede.com/usuario`, URL com/sem `https://`; `http://` vira `https://`; `twitter.com` vira `x.com`; YouTube aceita `@handle` e `/channel|c|user/` (mantém o path do canal); Facebook recusa `profile.php`. Hosts fora da allowlist da rede (inclusive IPs, localhost, `javascript:`, `data:`, porta não padrão) são recusados com mensagem PT-BR no padrão "O link do Instagram precisa ser de instagram.com".
- Entrada vazia remove a rede; mapa final vazio grava `null`; chave desconhecida gera erro claro ("Rede social desconhecida: kwai."). Validação roda no schema Zod (`updateBarbershopSchema`), com path do issue em `socialLinks.<rede>`.
- Saída: `orderSocialLinks` no repositório filtra só redes conhecidas/strings não vazias e ordena — perfil sem redes não renderiza nada (sem espaço vazio).

## Segmentos (gate por segmento)

- A configuração de cada segmento vive em `src/shared/segments/index.ts` (`SEGMENT_CONFIGS`); o front espelha em `frontend/src/shared/segments/segmentConfigs.ts` e a paridade é conferida por `npm run segments:parity` (back) + `src/shared/segments/segmentParity.test.ts` (front).
- Regra do repositório: **nenhum `if (segment === ...)` espalhado**. Quem precisa de comportamento novo por segmento acrescenta entrada em `SEGMENT_GATE_CONFIG` (backend e front), no perfil do bot (`shared/segments`/`segmentProfiles.ts`) ou na regra de publicidade (`shared/segments/advertising.ts`).
- Gate do segmento (`shared/segments/segmentGate.ts`): oculta abas/módulos e nega o endpoint dedicado com **403** `SEGMENT_FEATURE_UNAVAILABLE`. `LAW_FIRM` (advocacia) esconde produtos, equipamento, comissões e gorjeta — o repository é honorários.
- `publicBookable` (`Service`): serviço agendável pelo cliente na agenda pública. Default **true**; serviço interno (audiência, diligência) fica `false` e não aparece nem pode ser agendado pelo público (`SERVICE_NOT_PUBLICLY_BOOKABLE`, 400). A rota `GET /services` é pública com `authenticateOptional`: anônimo vê só os públicos, staff do salão (token) vê todos (`includeInternal`).
- Ficha auxiliar do cliente por segmento (`auxiliaryProfile`): `pet` (petshop/veterinária), `vehicle` (lava jato/oficina), `case` (advocacia). Em advocacia a ficha é **caso/processo**: apelido, área de atuação e número do processo — sempre restritos à equipe.
- Sigilo: área de atuação, número de processo e apelido de caso **não** aparecem em mensagem ao cliente, no perfil público nem no assistente do dono (`stripCaseData` no bot).
- Cadastro: `seedBarbershopDefaults` aplica catálogo, preset de horário, modo de atendimento e preferências **por segmento**; onboarding usa o vocabulário do segmento (`shopNoun`, `service`, `servicePlural`).
- Troca de segmento pelo master (`PATCH /admin/barbershops/:id/segment`, permissão `ACCOUNTS_MANAGE`): exige motivo (10–500), recusa o mesmo segmento (409), detecta dados incompatíveis (`Product`, `Equipment`, `CommissionEntry`, `CashMovement` de gorjeta, `SalonClient`) e responde 409 `SEGMENT_CHANGE_REQUIRES_CONFIRMATION` com `{ requiresConfirmation, conflicts, impact }`; só aplica com `confirm: true`. Limpa `businessSegmentOther` fora de `OTHER`, zera `targetAudience` quando o novo segmento não o usa e registra `AuditLog` `ACCOUNT_CHANGE_SEGMENT` com before/after, impacto e conflitos.
- Impacto da troca vem de `shared/segments/segmentImpact.ts` (`diffSegmentImpact`): módulos/abas ocultados ou liberados, features perdidas/ganhas e mudança de publicidade — a mesma fonte usada pela prévia do front.

### Feature por segmento (`features`)

- Segmentos podem declarar **features** opcionais em `SEGMENT_CONFIGS` (`features?: SegmentFeature[]`), espelhadas no front (`frontend/src/shared/segments/segmentConfigs.ts`) e conferidas pela paridade (`segmentParity.json`).
- `caseManagement` (gestão de processos) existe só no `LAW_FIRM`: habilita a aba "Processos" no painel (`TabDef.segmentFeature`) e as rotas `/cases*` na API (`segmentFeatureGuard`, 403 `SEGMENT_FEATURE_UNAVAILABLE`). Não há `if (segment === ...)` espalhado: quem precisa de nova feature declara no segmento.

### Gestão de processos (escritório)

- Dados **internos do escritório**: caso, tarefas, prazos, andamentos e documentos nunca aparecem para o cliente, no perfil público nem em mensagem do assistente.
- Prazo em dias úteis: contagem ignora fins de semana, feriados nacionais (BR) e feriados/suspensões cadastrados pelo escritório (`shared/utils/businessDays.ts` + `OfficeHoliday`). Enviar `businessDays` calcula a data; enviar `dueDate` fixa a data.
- Dias restantes (`daysRemaining`) são calculados em dias úteis: negativo = atraso. O prazo não é "cumprido" sozinho: o usuário marca (`FULFILLED`).
- Fechar/arquivar um caso carimba `closedAt` (`ClientCaseRepository`).
- Financeiro do caso: honorários vêm dos atendimentos concluídos vinculados ao caso (`Appointment.caseId`) e o saldo em aberto do cliente (fiado). Valor da causa (`claimedAmount`) e valor obtido (`awardedAmount`) são dados do processo, não do faturamento.
- Relatório por área de atuação (`GET /cases/reports/practice-areas`) agrega processos, valores da causa e honorários por área.
- **Contratos e assinaturas**: o documento do contrato é interno; a assinatura acontece em página pública por **token** (`/assinar/:token`). O token é a credencial. O status do contrato é recalculado pelas assinaturas (todas → `SIGNED`, algumas → `PARTIALLY_SIGNED`). Enviar para assinatura exige ao menos um signatário.
- **Assinatura não expõe o processo**: a página pública de assinatura devolve só título, tipo, conteúdo e nome do signatário — nunca número de processo, apelido interno, tribunal ou dados do cliente.
- **Timesheet**: o valor da hora é **derivado** (`minutos/60 × valor/hora`); o escritório lança horas, nunca o total. Lançamento pode ser marcado como "faturado" (não pode ser faturado duas vezes).
- **Honorário de êxito**: percentual sobre o `awardedAmount` do caso; o valor é recalculado pelo sistema (`baseAmount × percent`), com parcelamento e situação própria (`PENDING`/`INVOICED`/`PAID`/`CANCELED`).
- **Digestão de intimações**: o sistema detecta o número CNJ no texto e **sugere** o tipo do andamento; a triagem é humana (vincular/ignorar). O conteúdo da intimação nunca vai para o cliente nem para o assistente.
- **Número CNJ**: segmento do tribunal (TR) aceito em letras **e** dígitos (`8.SP` e `8.26`, formato oficial). Normalizado para o canônico.
- **NFS-e**: emissão manual funciona sem credenciais (número digitado); NFE.io e Focus NFe exigem token na env e falham com mensagem clara quando ausentes (nunca em silêncio).
- **Alertas de prazo**: cron diário (08:00 BRT) avisa o dono por WhatsApp quando o prazo vence em até 3 dias úteis ou já venceu. Deduplicação por (prazo, destinatário, tipo, canal, dia) — índice único, varredura idempotente. Alerta é operacional interno: não passa pelo gate de publicidade.
- **Portal do cliente**: o caso só aparece se `shareWithClient` estiver ligado (alternável pelo escritório) e apenas os andamentos com `visibleToClient` são expostos. Nunca saem número de processo, apelido interno, parte adversária, tribunal ou observações. O portal enxerga os casos pela **identidade do cliente** (`ClientSalonLink` confirmado): sem vínculo confirmado, nada aparece.
- **Transferência entre unidades**: só para unidade **irmã** (mesma `Organization`); a unidade de destino aceita e, ao aceitar, o caso e tudo que é vinculado (tarefas, prazos, andamentos, documentos, contratos, assinaturas, horas, honorários, intimações, NFS-e) muda de `barbershopId` em uma transação.

### Restrição de publicidade (`advertisingRestricted`)

- Declaração única no segmento (`advertisingRestricted: true` no `LAW_FIRM`) + helper `shared/segments/advertising.ts`. Não é regra da advocacia escrita em vários arquivos: é uma feature genérica por segmento.
- Desliga: campanhas/mensagens em massa do assistente, pedido de avaliação e nota/reputação públicas, NPS, indicações (o código nem é gerado no cadastro), fidelidade (nasce inativa) e preços públicos no perfil/agenda.
- Não desliga: a consulta interna do dono ("quem não vem há X dias") — é lista para o dono, não disparo ao cliente; agenda, clientes, honorários e financeiro continuam.
- APIs: middleware `advertisingGuard` (403 `ADVERTISING_FEATURE_UNAVAILABLE`) em referrals e loyalty; NPS nega em `assertShopEligible`; `reviewInvitationService` não cria convite, não expõe resumo público e recusa envio de link antigo; `notificationDeliveryService` marca `ADVERTISING_RESTRICTED` nas notificações promocionais.

## Fila / agenda / híbrido

- Modos de operação do salão restringem join/booking (`shopOpenState`, WhatsApp obrigatório em alguns fluxos).
- Fila pública vs staff mascarada conforme auth.

## Pacotes

- Receita na venda do pacote (`pricePaid`); consumo/agenda debita sessão; cancelamento `CONFIRMED` restaura crédito (ver `packages.spec.ts`).

## Fiado / despesas / comissões

- Fiado com pagamentos parciais; validação de telefone/valores nos schemas.
- Comissões: módulo dedicado + testes de validação — confirmar regras ao alterar fechamento.

## Produtos / estoque / retail

- Estoque insuficiente → erro de negócio (`INSUFFICIENT_STOCK`), não 500 genérico.
- SKU/barcode únicos por tenant (índices parciais + asserts).
- Venda/estorno: idempotência e prevenção de duplicidade financeira (serviços de idempotency / refunds).
- Resumos financeiros de produtos devem **liquidar estornos** (net), não só bruto.
- `DELETE /products/:id` só apaga produto **sem histórico** (`stock_movements`, `inventory_receipt_items`, `retail_sale_lines`, `retail_sale_refund_lines`) e sem reserva `RESERVED` vigente; caso contrário 409 `PRODUCT_HAS_HISTORY` / `PRODUCT_HAS_OPEN_RESERVATIONS` (recomendação: Inativar). Reservas finalizadas caem em cascata. Checagem e delete rodam **fora** de `prisma.$transaction` (mesmo motivo do P2028 da extensão de RLS).

### Reserva de produto (público → painel)

- A reserva **não decrementa** `stockQty`. Disponível = `stockQty − Σ(reservas `RESERVED` com `expiresAt > now`)`, recalculado a cada leitura (não existe cron de expiração).
- `trackStock = false` → sempre disponível (`available: null` no DTO público).
- Máximo de **3 reservas abertas** por WhatsApp no mesmo salão (`RESERVATION_LIMIT_REACHED`, 409); `quantity` 1..10; WhatsApp só dígitos (10–11, mesmo `phoneBR` da agenda).
- `unitPrice` é congelado no ato da reserva; status final (`PICKED_UP`/`CANCELED`) é imutável (409 `RESERVATION_FINALIZED`).
- Prazo de retenção via env `PRODUCT_RESERVATION_RETENTION_HOURS` (padrão 48h).
- DTO público expõe apenas `id, name, description, imageUrl, price, unitLabel, category, available` — custo/SKU/código/lote ficam no painel autenticado.
- Criar reserva usa transação com `SELECT … FOR UPDATE` **em SQL puro**: a extensão de RLS (`libs/prismaExtensions.ts`) roteia operações de modelo para outra conexão do pool e quebraria a atomicidade (deadlock/P2028).
- `PICKED_UP` **não** baixa `stockQty`: a reserva sai da soma de `RESERVED`, então a unidade volta a aparecer como disponível até o dono registrar a venda na aba Vendas (baixa automática fora de escopo).
- `GET /products` devolve `reservedQty` (só vigentes) e `availableQty` (`null` quando `trackStock = false`). `reservations[]` com `customerName`/`whatsapp` só vai para OWNER/MASTER_ADMIN ou quem tem `PRODUCTS_VIEW` / `PRODUCTS_MANAGE` / `RETAIL_SELL` (`permissions.canSeeReservationCustomer`); permissão só de `INVENTORY_MANAGE` recebe apenas os totais.
- Criar reserva **avisa o dono do salão** (nunca o cliente), fire-and-forget em `productReservations/reservationNotify.ts`: WhatsApp Evolution + e-mail `product_reservation_alert` (categoria `OPERATION`), um `try/catch` por canal e dedup `product-reservation:{id}:{whatsapp|email}` — falha de notificação não atrasa nem derruba a reserva (201 continua 201).

## Assistente no WhatsApp (dono)

- O assistente conversa com o **dono** (não com o cliente final) e executa os **mesmos use cases do app** — nunca escreve direto no banco.
- O bot usa **sempre a instância da plataforma** (`EVOLUTION_INSTANCE_NAME`, via `{ platform: true }`); instâncias `shop-*` não recebem nem enviam mensagens do assistente.
- Vínculo: código de 6 caracteres, **10 minutos**, **uso único**, máximo de **5 tentativas**; o banco guarda só o **HMAC** do código (`owner_bot_link_codes.codeHash`) e a comparação é em tempo constante.
- O número que escreve tem que ser **o telefone cadastrado no estabelecimento** (`Barbershop.whatsapp` normalizado). `User` não tem telefone — o telefone do dono é o do salão.
- Um número pertence a um dono: ao vincular, vínculos ativos do mesmo número ligados a **outros** donos são revogados. O mesmo dono pode ter várias unidades (contexto de unidade ativa + "trocar de unidade").
- Idempotência da entrada: `key.id` da Evolution vira chave no Redis (`ownerbot:msg:{id}`, 24h); o estado da conversa vive no Redis (15 min). Número **não vinculado** responde no máximo uma vez a cada 10 minutos.
- Ação sensível (agendar, cancelar, remarcar, check-in, encerrar, falta, encaixe, desvincular) **sempre pede confirmação** ("1-Sim 2-Não"). Resposta em texto numerado, sem IA.
- Assinatura sem acesso (trial expirado / plano inativo) **bloqueia** as ações do assistente.
- `Appointment.source` registra a origem: `APP`, `PUBLIC` ou `WHATSAPP_OWNER_BOT` (usado no selo "via WhatsApp" do painel).
- Auditoria: toda ação executada vira linha em `owner_bot_action_logs` (ação, status, request redigido, telefone mascarado).

## Atendente de IA no WhatsApp (cliente final)

- O atendente de IA conversa com o **cliente final** do salão (o assistente da seção anterior é do **dono**). Ele é **por salão** e responde automaticamente no WhatsApp.
- **Qual salão atender é resolvido pelo número do cliente**: `client_identities.normalizedPhone` → `client_salon_links` com `status = CONFIRMED` (portal do cliente) **ou** `salon_clients.normalizedWhatsapp` (CRM do salão). Cliente de mais de uma unidade → o bot pergunta e o cliente responde com o número da unidade (15 min no Redis). Cliente sem nenhum vínculo → a mensagem é **ignorada** (sem resposta e sem spam).
- A resposta sai pela **mesma instância** em que o cliente escreveu: instância `shop-<barbershopId>` (número do próprio salão) ou a instância compartilhada da IA (`EVOLUTION_AI_INSTANCE_NAME`). A instância da plataforma (`EVOLUTION_INSTANCE_NAME`) é do assistente do dono e **não** é atendida pela IA — assim os dois nunca respondem à mesma mensagem.
- Webhook de entrada: `POST /api/webhooks/evolution/ai`, autenticado por `EVOLUTION_WEBHOOK_SECRET` (mesmo segredo do assistente do dono), processado na fila BullMQ `whatsapp-ai` (fallback inline se o Redis cair).
- **Kill switch por salão**: `Barbershop.whatsappAiEnabled` (começa `false`). `PUT /api/barbershops/:id/ai/settings` liga e desliga. Salão inativo, sem assinatura/trial válido ou com a IA desligada → mensagem ignorada.
- Respostas usam **dados reais do salão**: endereço/cidade do `Barbershop`, quadro de horários do `Schedule`, serviços e preços do `Service` (`publicBookable` e `active`). Nada de endereço ou horário fixo no código.
- Detecção de intenção por **palavra-chave determinística** (sem LLM): `scheduling`, `reschedule`, `pricing`, `hours`, `location`, `human_transfer`, `greeting`, `farewell`, `unknown`. Palavra curta casa por token exato ("boa noite" não vira saudação por causa do "oi" dentro de "noite").
- Intenção `unknown` (confiança < 0.5) ou pedido explícito de atendente → a conversa vai para `TRANSFERRED_TO_HUMAN` e o log fica como `HYBRID`. Agendamento/remarcação também ficam `HYBRID` (a IA coleta os dados, um atendente confirma).
- Idempotência: `key.id` da Evolution vira chave no Redis (`whatsappai:msg:{id}`, 24h); teto de **10 respostas por minuto** por número (`whatsappai:rate:{phone}`).
- Telefone é gravado no formato canônico **55 + número** (`normalizeWhatsAppPhone`); a busca considera as variantes com e sem DDI, porque o cadastro pode ter vindo em formatos diferentes.
- Conversas, mensagens e logs de intenção ficam em `ai_conversations` / `ai_messages` / `ai_intent_logs` (visíveis no painel do dono). O OWNER só acessa o **próprio** salão (o id da URL é conferido com o usuário).
- A lista de unidades é ordenada por nome (ordem estável entre a pergunta e a escolha pelo número).
- **Deploy**: runbook em `docs/WHATSAPP_AI_DEPLOY.md`; `npm run whatsappai:check` confere as envs (instância própria, segredo do webhook, Redis/DB) e imprime a URL de webhook a configurar na Evolution. No boot, o processo avisa quando `EVOLUTION_AI_INSTANCE_NAME`/`EVOLUTION_WEBHOOK_SECRET` faltam.

## Controle master do WhatsApp

- `PlatformWhatsAppSetting` é um singleton (`id = "global"`). `aiGloballyEnabled` e `ownerBotGloballyEnabled` são kill switches globais; `outboundPaused` pausa **todo** envio de WhatsApp da plataforma.
- O gate de `outboundPaused` fica em `sendWhatsAppMessageDetailed`/`sendWhatsAppMessage`/`sendWhatsAppMedia` (`shared/services/evolutionApiService.ts`), então vale para fila, campanhas, lembretes, indicações, reenvios e **OTP de login do cliente**. Não duplicar o gate nos workers.
- Falha ao ler a configuração global → **modo seguro**: IA/assistente desligados e `outboundPaused = true` (não envia). Cache curto (5 s) é invalidado em toda escrita. No modo seguro **o OTP de login também fica bloqueado** (o gate de pausa vale para todo envio, inclusive o de autenticação).
- Webhooks de entrada (`/webhooks/evolution/ai` e `/webhooks/evolution/platform`) checam o segredo antes do parser e respondem `{ success: true, data: { ignored: motivo } }` quando o kill switch do bot está desligado ou o evento é ignorado — sem enfileirar.
- Reenvio de entrega só ocorre fora de `outboundPaused`, com motivo ≥10 caracteres, e bloqueia entrega em estado terminal. Supressão é consultada por `destinationHash` + canal; preferência é consultada por **salão + tipo** e **não** é consultada quando `NotificationDelivery.barbershopId` é nulo (evita bloquear por preferência de outro salão).
- Ações de mutação do painel master exigem `WHATSAPP_MANAGE`; leitura exige `WHATSAPP_READ`. O `/auth/me` devolve `internalPermissions` para `MASTER_ADMIN` (lista vazia = acesso total, mesma regra do backend) e o front esconde ações sem permissão.
- Lote de salões aceita 1–50 ids únicos; cada salão alterado gera uma linha de auditoria própria.
- Reconectar/deslogar instância exige apenas `reason` (schema estrito) e é auditado; reconexão pode devolver `qrcodeBase64` para leitura no painel.
- Filas expõem telefone **mascarado** (`phoneMasked`), nunca o número completo.
- **Lista de instâncias** (`GET /admin/whatsapp/instances`) pagina as instâncias de salão (`page`, `limit` padrão 20, máximo 50) e devolve `meta { total, page, limit, totalPages }`. As instâncias da IA e da plataforma aparecem sempre na **primeira página** e ficam **fora** da contagem de salões. O estado de cada instância da página é resolvido com concorrência máxima de **5** e timeout de **3 s por chamada**: erro, timeout ou Evolution não configurada → `unreachable` com `error` curto (sem stack e sem segredo); `close` só quando a Evolution respondeu que a instância está fechada. O overview usa a mesma resolução (`allSettled`), sem derrubar a tela.
- **Filas do painel master**: o gateway reusa as filas já instanciadas (`whatsappQueue`, `whatsappAiQueue`, `ownerBotQueue`) — nenhuma conexão nova por request. O parâmetro `:queue` é validado por enum Zod na rota. `reprocess` só aceita job no estado `failed` (outro estado → 409 com o estado atual); `clean` só aceita `failed` ou `completed` (job `active`, `waiting` ou `delayed` → 409). Leitura indisponível **não** é engolida: a fila vem como `{ available: false, error }` e o front mostra "fila indisponível" em vez de zeros.
- **Falhas de envio**: `GET /admin/whatsapp/notifications/failed` devolve `retryable: boolean` e, quando `false`, `notRetryableReason` ("Envios pausados globalmente", "Destinatário suprimido", "Reclamação do destinatário", "Envios rejeitados pelo destinatário", "Preferência de WhatsApp desligada"), calculado com a mesma regra do reenvio — a UI nunca oferece o que a API recusa.

## Reprocessamento de CRM (backfill)

- `CrmBackfillRun` registra cada execução com `scope` (`TENANT` = um salão via `POST /crm/backfill`; `GLOBAL` = lote do master via `POST /crm/backfill/all`) e `triggeredById`. Índice `(scope, startedAt)` para o histórico.
- Um segundo backfill do mesmo salão enquanto o anterior está `RUNNING` responde **409** ("Já existe um reprocessamento em andamento para este salão"); o lote global também recusa quando já há run `GLOBAL` em andamento.
- Histórico do master: `GET /admin/crm/backfill/runs` (`DASHBOARD_READ`) pagina (`page`/`limit`, máx. 50) com filtros `status`/`scope`/`barbershopId`, devolve o nome do salão, `triggeredBy { id, name, email }` e `meta.running`/`meta.runningGlobal`. `runningGlobal` conta runs `GLOBAL` em `RUNNING` **independente dos filtros** — é a trava usada pelo front para bloquear um novo disparo global mesmo com a página/filtro atual sem esse registro.

## Importação de planilhas via WhatsApp (bot do dono)

- O assistente baixa a mídia via Evolution, valida tipo/tamanho pelo conteúdo (`validateImportFile`) e cria o lote com `source=WHATSAPP_OWNER_BOT`; revisão/mapeamento/confirmação/desfazer continuam no painel (deep link).
- Mídia sem texto no atendente de IA é ignorada (sem custo de IA nem resposta).
- Bot do dono: áudio/vídeo/tipos não suportados respondem "Só consigo importar planilhas por aqui. Envie um arquivo .xlsx, .xls, .ods, .xlsm, PDF com texto ou .csv/.tsv/.txt." (sem mencionar foto) sem tentar baixar; imagem sem OCR disponível recebe orientação para enviar planilha.
- Vínculo com mais de um salão: não baixa nem processa; guarda mídia pendente em Redis (TTL 10 min) e pergunta a unidade; **qualquer resposta que não seja número válido** conta como inválida — a lista repete uma vez e a segunda cancela; expirado avisa para reenviar. Um único vínculo mantém o fluxo atual.
- **Pausado = silêncio total**: `outboundPaused`/kill switch cortam QUALQUER resposta do assistente (inclusive recusas de importação, que acontecem antes do ponto de envio). A checagem mora no `reply` do serviço, não só no transporte.
- Garantias antes de baixar, nesta ordem fixa: vínculo ativo → OWNER → assinatura/trial → segmento com alvos de importação → cota de upload (`checkImportQuota`) → kill switch/`outboundPaused` (pausado = **silêncio**: não responde e não importa) → instância da plataforma → tipo de mídia → tamanho do arquivo. Nenhuma recusa chega no download. Idempotência por `messageId` (chave Redis com TTL 24 h); arquivo temporário removido em erro.
- O `remoteJid` do webhook atravessa a fila até o download (`downloadEvolutionMedia`) — não é derivado do telefone.
- SSRF: `downloadEvolutionMedia` aceita apenas host/porta/esquema de `EVOLUTION_API_URL`, bloqueia endereços de metadados (`169.254.169.254`, `metadata.google.internal`) mesmo em host permitido, não segue redirect, timeout de 30 s, `Content-Length` conferido antes de ler o corpo e reader **cancelado** ao estourar o limite de bytes; base64 checado antes de decodificar.
- Auditoria: `DATA_IMPORT_UPLOAD` (use case, única vez, com `source` nos detalhes), `DATA_IMPORT_CONFIRM/CANCEL/UNDO` (controller); log de ações do bot (`owner-bot/action-logs`) registra **recebida** (`IMPORT_MEDIA_RECEIVED`/SUCCESS), **recusada** (`IMPORT_MEDIA_REJECTED`/BLOCKED, com motivo) e **criada** (`IMPORT_MEDIA_CREATED`/SUCCESS). Número não vinculado **não** grava log — `barbershopId` é obrigatório com foreign key e não se inventa id.
- Rastreio de registros criados via `ImportCreatedEntity` (join table), não coluna nas tabelas de negócio.

## Importação de planilhas — origem e auditoria

- Cada `ImportBatch` tem `source` (`WEB` por padrão, `WHATSAPP_OWNER_BOT` quando o dono envia o arquivo pelo assistente no WhatsApp). O assistente baixa a mídia via Evolution, valida tipo/tamanho pelo conteúdo (`validateImportFile`) e cria o lote; a revisão/mapeamento/confirmação/desfazer continuam no painel.
- Ações auditadas: `DATA_IMPORT_UPLOAD`, `DATA_IMPORT_CONFIRM`, `DATA_IMPORT_CANCEL`, `DATA_IMPORT_UNDO` (AuditLog, com `barbershopId`).
- A importação por imagem (OCR) existe **no painel** (wizard de importação), com feature flag `OCR_IMPORT_ENABLED`; o bot do dono no WhatsApp **não** aceita imagem — ele orienta o envio da planilha.

## Importação por imagem (OCR)

- Feature flag `OCR_IMPORT_ENABLED` (padrão **off**). Com a flag off, o upload de imagem é recusado **antes de qualquer acesso ao banco**, com o código `OCR_DISABLED` e a mensagem "A importação por imagem está desativada…".
- O OCR é **local** (Tesseract.js) e sem rede: o `traineddata` tem de estar em `OCR_TESSDATA_PATH` (`<caminho>/por.traineddata` e `<caminho>/eng.traineddata`). Sem os arquivos, o upload é recusado com `OCR_TRAINEDDATA_MISSING` (503) — nunca há tentativa de download.
- A imagem vira uma tabela com cabeçalhos **genéricos** ("Coluna 1", "Coluna 2"…): o **destino** (clientes, serviços, agenda…) e o **mapeamento** coluna → campo são escolhidos pelo dono, no mesmo fluxo da planilha. O destino gravado no lote antes da escolha é só o valor inicial (`CLIENTS`), igual ao das planilhas.
- Piso de resolução: a régua é a largura da **região da tabela** (`REPORT.md` linha 80: 693 px para telefone, 924 px para valor), medida na escala da imagem **original** (o redimensionamento para OCR não pode baixar a régua). Abaixo de 693 px a imagem é recusada (`OCR_IMAGE_LOW_RESOLUTION`); entre 693 e 924 px a validação avisa que os valores podem estar errados.
- Confiança por célula: guardada num arquivo lateral ao lado do CSV do lote (sem coluna nova no banco, sem migration). O gate `gateOcrLinha` vira `revisar` da linha no dry-run, usando o mapeamento escolhido pelo dono.
- O botão confirmar fica travado enquanto houver célula pendente: o dono **corrige** o valor ou **aceita** explicitamente cada célula (`PATCH /imports/:batchId/review`), e a validação roda de novo. O backend recusa a confirmação com `OCR_REVIEW_PENDING` (409) se sobrar pendência.
- Erros com código próprio (nunca "erro interno"): `OCR_DISABLED`, `OCR_QUEUE_FULL` (429), `OCR_IMAGE_TOO_LARGE` (413), `OCR_IMAGE_FORMAT_INVALID` (400), `OCR_IMAGE_LOW_RESOLUTION` (400), `OCR_TRAINEDDATA_MISSING` (503), `OCR_NO_TABLE` (400), `OCR_REVIEW_PENDING` (409).
- `CASE_FEES` por imagem: `caseNumber` (CNJ) e `percent` são obrigatórios — sem as duas colunas na foto o mapa é recusado. O CNJ lido de foto é frágil: a célula vai para revisão quando a confiança é baixa e quando o número não parece CNJ.

## Importação de processos (`CASES`)

- Alvo disponível apenas para o segmento `LAW_FIRM` (feature `caseManagement`); oculto para os demais segmentos via `availableImportTargets`.
- Identidade do cliente: telefone (WhatsApp) é a chave; cliente com o mesmo telefone não é duplicado — criado se não existir.
- Dedupe de processo: número do processo repetido já existente no salão → `SKIPPED`; sem número, dedupe por cliente + apelido do caso (case-insensitive).
- CNJ: dígito verificador inválido gera **apenas aviso** na prévia, não bloqueia a importação (processos antigos podem não seguir o padrão).
- Advogado responsável: resolvido pelo nome na equipe; ausente ou ambíguo entra sem responsável, com aviso, nunca rejeita a linha.
- Sigilo: `shareWithClient` nasce `false`; número de processo, apelido, área, parte adversária, tribunal e observações não saem para o cliente nem em mensagens.
- Sem lançamento financeiro: processo importado não cria caixa, receita, honorário, comissão nem `CashMovement`. `PAID` importado não lança caixa.
- Campos de valor (`claimedAmount`, `awardedAmount`) são dados do processo, não do faturamento; honorário de êxito vem dos atendimentos concluídos vinculados ao caso (`Appointment.caseId`).

## Importação de planilhas (assistente do dono)

- Só o **dono** importa (`authorize(["MASTER_ADMIN","OWNER"])` + `setRlsContext`): importar dado é decisão do responsável pelo salão.
- Fluxo em 7 passos com **dry-run** obrigatório: `validate` é somente leitura — nada é gravado antes da confirmação do dono.
- **Identidade**: telefone identifica o cliente (mesma regra do CRM); serviço é identificado pelo nome no salão; agendamento pela chave **salão + serviço + dia + hora + cliente**; produto por SKU → código de barras → nome. Reimportar o mesmo arquivo **não duplica** — a linha equivalente vira `SKIPPED`.
- **Multi-aba (fase 2)**: uma planilha pode ter várias abas, cada uma com o seu tipo (10 alvos); o lote misto grava `targetType: "MIXED"` e processa as abas na ordem de dependência entre os tipos, nunca na ordem das abas.
- **Importar histórico alimenta o CRM, não o caixa**: sem mensagem (WhatsApp/e-mail), sem convite de avaliação, sem comissão e sem lançamento financeiro. A opção "contar valores no histórico financeiro" só entra em jogo quando o dono liga. Estoque inicial vira movimento `IMPORT`; "valor já pago" do fiado é pagamento sem caixa.
- **Contadores de CRM** (`crmCounters.ts`): ao concluir o lote, o cliente importado ganha `totalAppointments` e `lastVisitAt` (visita = `COMPLETED`/`CHECKED_IN`). Nada mais muda. Idempotente via `ImportBatch.crmCountersAppliedAt` — reprocessar a fila não conta duas vezes. Aplicado **antes** de fechar o lote, para o `updatedAt` do cliente não travar o desfazer.
- `sendReviewInvitations` é aceita e guardada, e **nada é disparado**.
- Cliente importado nasce com `marketingOptIn: false` — histórico importado nunca vira campanha.
- **Desfazer** (30 dias) remove só o que o lote criou **e** o que ninguém tocou depois, cobrindo os 12 tipos de entidade: o que o lote criou é removido; o que ele **substituiu** é **restaurado** do snapshot `{before, applied}`; o que foi editado depois (detectado pelo `applied` ou pelo status, já que horário/folga não têm `updatedAt`) é preservado, com o motivo no relatório (`removed`/`kept`/`restored`).
- Limites: 10 MB por arquivo, 20.000 linhas, 10 abas, 1 importação ativa por salão, 5 importações por hora (`IMPORT_MAX_BATCHES_PER_HOUR`), arquivo temporário guardado por 7 dias e apagado no fim do processamento.
- **Fase 1 — o formato vem do CONTEÚDO (magic bytes), nunca da extensão nem do mimetype**: `detectImportFormat` decide pelo arquivo, e `validateImportFile` só usa o nome enviado para exibição. São lidos `.xlsx`, `.xlsm` (macro nunca é executada), `.xls` (OLE2), `.ods` (OpenDocument), PDF com texto e texto delimitado (`.csv`/`.tsv`/`.txt`, separador detectado pelo conteúdo). Um `.csv` que é XLSX é lido como XLSX; um `.xlsx` que é CSV é lido como CSV. Formato não suportado, ZIP que não é planilha, PDF sem texto, binário disfarçado de texto e ZIP bomb são recusados com mensagem clara. Cada formato novo tem arquivo de exemplo **e** caso hostil em `src/modules/dataImport/utils/fixtures/` (gerados por `scripts/generate-import-fixtures.mjs`).
- **Mimetype da mídia do WhatsApp é só filtro de entrada**: `downloadEvolutionMedia` aceita os mimetypes de `.xlsx`, `.xlsm`, `.xls`, `.ods`, PDF, texto delimitado e imagem (áudio/vídeo/executável são recusados antes do download) — mas o formato do lote é decidido depois pelo **conteúdo** (`detectImportFormat`). Um `.xls` que chega com nome `.ods` continua sendo lido como `.xls`.
- **Tamanho declarado nunca é acreditado**: `.xls` (container OLE2) e PDF (objetos com `/Length`) **declaram** o tamanho do conteúdo. `inspectOle2` e `inspectPdf` comparam a declaração com o arquivo real e recusam o que mente — antes de qualquer leitura e antes de gravar em disco. PDF com mais de 10 páginas (`MAX_IMPORT_PDF_PAGES`) é recusado antes da extração do texto.
- **A planilha é dado, nunca programa**: fórmula não é avaliada (entra só o valor literal guardado) e link externo não é resolvido (nenhuma requisição de rede; entra o rótulo do link, nunca o endereço).
- **Planilha do mundo real**: multi-aba (cada aba com seu cabeçalho), células mescladas (o valor não duplica a linha), cabeçalho fora da 1ª linha (capa vira aviso), linha de total e rodapé descartados (contados no aviso) e data em serial do Excel convertida na normalização.
- **Número da planilha vira texto sem perder dígito**: telefone sem zero à esquerda (11 dígitos) é preservado; zero à esquerda (prefixo de operadora/antigo DDD) é removido; DDI 55 é removido; **notação científica é rejeitada** (`1,23456789E+10` tem 11 dígitos e pareceria um telefone válido, mas os dígitos são outros) — nunca vira identidade de cliente. CPF/documento deve estar como **texto** na planilha.
- Detalhes completos em `docs/IMPORTACAO_PLANILHAS.md`.

## Exportação de processos e honorários (F4)

- **Segmento**: as abas `Processos` e `Honorários de êxito` só aparecem na exportação para segmento `LAW_FIRM` (feature `caseManagement`), via `hasSegmentFeature`.
- **Sigilo (`cases`)**: a aba `Processos` só entra na planilha quando o segmento é `LAW_FIRM` **e** a opção `includeCase` está ligada. Sem `includeCase`, nenhum dado de caso/processo sai da exportação (mesma regra do relatório de honorários).
- **Sigilo (`caseFees`)**: a aba `Honorários de êxito` entra para escritórios jurídicos mesmo sem `includeCase`, mas as colunas que identificam o processo (número e apelido) saem vazias quando `includeCase` está desligado. As observações internas do honorário também saem vazias sem `includeCase`.
- **Período**:
  - **Processos**: não filtra por período. Exporta todos os processos do escritório (backup completo), independentemente da data de abertura.
  - **Honorários de êxito**: filtra por vencimento (`dueDate`) dentro do período escolhido, com fallback para `createdAt` quando o honorário não tem vencimento. Quando o período é "Tudo", exporta todos os honorários.
  - Honorários nunca entram no caixa nem no financeiro: não há coluna de pagamento, lançamento ou recebimento.
- **Anonimização na aba Processos (`cases`)**: a aba `Processos` **pode** ser exportada com `anonymize` ligado — a anonimização não é bloqueio, é mascaramento. Com `anonymize=true` **e** `includeCase=true`, saem mascarados **todos** os campos pessoais da aba:
  - nome e WhatsApp do cliente;
  - número do processo;
  - apelido do caso (`nickname`);
  - parte adversária (`opponent`);
  - título do processo (`title`);
  - advogado responsável (`responsibleStaff.name`).

  Permanecem legíveis: valores (`claimedAmount`, `awardedAmount`), datas, situação, prioridade, área de atuação e órgão julgador. A exigência de `includeCase=true` para a aba `Processos` continua valendo com `anonymize` ligado — o que muda é apenas o conteúdo das células, não o gate.
- **Anonimização na aba Honorários de êxito (`caseFees`)**: a aba também **pode** ser exportada com `anonymize` ligado. Com `anonymize=true` **e** `includeCase=true`:
  - número do processo sai **mascarado** (não vazio, não cru);
  - apelido do caso (`nickname`) sai **mascarado**;
  - **Observações saem vazias** — a nota interna do escritório não é mascarável campo a campo, então é omitida por inteiro.

  Sem `includeCase` (e com ou sem `anonymize`), número, apelido e Observações já saíam vazios. Valores (`percent`, `baseAmount`, `amount`), situação, vencimento, parcelas e data de criação permanecem legíveis.
- **Campos de valor** (`claimedAmount`, `awardedAmount`, `percent`, `baseAmount`, `amount`) são dados do processo, não do faturamento.

## Notificações

- Evolution WhatsApp: opcional; sem credenciais = no-op / falha isolada.
- E-mail Resend + filas BullMQ; allowlist em dev.
- Crons: lembretes de agenda, publisher de posts, etc.

## Pagamentos

Providers **implementados:** Asaas, AbacatePay, Mercado Pago.

- **Produção (default):** só Asaas (`paymentProviders.ts` fallback `["ASAAS"]`).
- Override: env `PAYMENT_PROVIDERS_ENABLED`.
- Webhooks com verificação de assinatura/token; modo inseguro só com flag explícita de não-produção.
