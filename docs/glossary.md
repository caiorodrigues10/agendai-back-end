# Glossário — código em inglês, usuário em português

> Regra geral da padronização Clean Architecture: **identificadores, comentários,
> títulos de teste e logs internos vão para inglês**; **textos de UI, mensagens
> `message` da API exibidas pelo front, e-mails/WhatsApp/PDF e seeds visíveis
> permanecem em pt-BR**. As mensagens de domínio ficam em um catálogo central
> (`src/shared/messages/pt-BR.ts`) referenciado por **chave em inglês**.
> Este glossário é a fonte de tradução — termo fora daqui: perguntar antes de
> inventar sinônimo.

## Termos fechados (decisão, não negociável)

| pt-BR | inglês (código) | nunca usar |
|---|---|---|
| fiado (tabuada do cliente) | `customerTab` | `storeCredit`, `credit`, `fiado` em identificador novo |

## Módulo `clients` (escopo da Fase 1)

Termos levantados no inventário (`docs/architecture/portuguese-identifiers.md`,
229 ocorrências em `src/modules/clients/`) **antes** de qualquer rename.

| pt-BR (UI / comentário legado) | inglês (código interno) | observação de contrato |
|---|---|---|
| salão, salões | `barbershop` | coluna/JSON `barbershopId` **é contrato — não muda** |
| cliente, clientes | `client` | rota `/api/clients` e campos são contrato |
| ficha/ficha do cliente | `clientProfile` | termo de comentário/UI |
| pet | `pet` | já em inglês (`ClientPet`) |
| veículo, carro | `vehicle` | campo JSON `vehicleModel` é contrato |
| caso, processo | `case` | rota `/api/clients/:id/cases` é contrato |
| número de processo | `caseNumber` | contrato (validação CNJ) |
| apelido (do caso) | `nickname` | contrato |
| parte adversária | `opponent` | contrato |
| área de atuação | `practiceArea` | contrato |
| vara / tribunal | `courtName` | contrato |
| registro de procedimento | `procedureRecord` | contrato |
| profissional | `professional` (`professionalName`) | contrato |
| visita (última) | `lastVisitAt` | contrato — não renomear |
| pacote (de sessões) | `package` (`ClientPackage`) | modelo/JSON são contrato |
| sessões restantes | `remainingSessions` | contrato |
| opt-in de marketing | `marketingOptIn` | contrato |
| placa | `plate` | contrato (normalização uppercase) |
| espécie / porte / pelagem | `species` / `size` / `coat` | contrato |
| em aberto (fiado) | `openCustomerTab` | **query param `hasOpenFiado` é contrato** — mantém na URL; internamente `openCustomerTab` |
| status de fiado aberto | `OPEN_CUSTOMER_TAB_STATUSES` | constante interna (`PENDING`, `PARTIAL`) |
| ativo/ativo (flag) | `active` | contrato |
| dados (variável `data`) | caso a caso: `payload` / `body` / `dto` / `date` | `data` no dicionário PT = data; **não** traduzir cegamente — `data` significa payload na maioria dos casos do módulo |

### Decisões sobre legados do módulo

- **`SalonClient`** (model Prisma, tabela) e `salonClient*` (repositórios): já
  estão em inglês e **fazem parte do contrato de banco** → mantidos como estão;
  documentados aqui como "salão" na UI ⇄ `SalonClient`/`barbershopId` no código.
  Renomear model/coluna exigiria migration (Fase 4, com `@@map` — fora de escopo).
- **`hasOpenFiado`**: nome de query param aceito pela API → permanece na URL;
  o presenter traduz para o interno (`hasOpenCustomerTab`) na borda.
- `remainingSessions`, `activePackageCount`, `packages`, `appointments`:
  chaves de resposta JSON → contrato; internamente podem ser referenciadas com
  os mesmos nomes (já são inglês).

## Termos fora de `clients` (decisões já tomadas / adotar ao migrar o módulo)

| pt-BR | inglês |
|---|---|
| agendamento | `appointment` |
| fila | `queue` |
| salão (genérico no código novo) | `barbershop` |
| pacote de serviços | `servicePackage` (model `Package` é contrato) |
| comissão | `commission` |
| assinatura (cobrança recorrente) | `subscription` |
| despesa | `expense` |
| guia/dia de caixa | `dailyCloseout` |
| visita agendada (presença) | `visit` (módulo `visits`) |

## Feature `adicionais` (Fases 1–4 — contrato novo, aditivo)

Termos da feature de adicionais de serviço (decisões da FASE 0). O legado
`service_addons` / `ServiceAddon` **não muda de nome** nesta feature; as tabelas
novas usam os nomes abaixo.

| pt-BR (UI / comentários) | inglês (código / tabelas) | observação de contrato |
|---|---|---|
| adicional (de serviço) | `addon` | termo genérico em código novo |
| catálogo de adicionais (por salão) | `salonAddon` (`SalonAddon`) | tabela nova; `availableOnline` define visibilidade no portal |
| adicional × serviço (vínculo) | `serviceAddonLink` (`ServiceAddonLink`) | tabela nova de junção N:N |
| adicional no agendamento (linha) | `appointmentAddon` (`AppointmentAddon`) | tabela nova; snapshot de preço unitário |
| preço do adicional | `price` / `unitPrice` | `Decimal(12,2)` na API/banco; domínio calcula em centavos |
| preço sobrescrito no atendimento | `priceOverride` | null = preço do catálogo |
| comissionável | `commissionable` | flag em `SalonAddon` |
| quantidade máxima (por atendimento) | `maxQuantity` | limite 1–10 por agendamento (decisão #11) |
| quantidade escolhida | `quantity` | em `AppointmentAddon` |
| total do atendimento (base + adicionais) | `appointmentTotal` / cálculo em domínio | função pura única; não derivar em UI |
| pacote com adicional | — | pacote cobra só a base; adicional cobra à parte (receita/comissão separadas) |
| remover adicional do atendimento | `removeAddon` | MVP: só antes da conclusão (edição pós-criação = fase futura) |

### Fora do MVP (não implementar sem nova ordem)

- Fila (walk-in) com adicional.
- Bot do dono criando agendamento com adicional.
- Estoque de adicional (`productId` / `stockQtyPerUse` foram removidos do schema).

## Catálogo de mensagens

- Back: `src/shared/messages/pt-BR.ts` — exporta um objeto por módulo com
  **chaves em inglês** e texto em pt-BR; o código usa
  `messages.clients.notFound` (ou `AppError(MESSAGES.clients.notFound, 404)`).
- Strings de UI do front: `src/messages/ptBR.ts` (Fase 3), mesmo critério.
- Nenhuma mensagem exibida ao usuário pode ser traduzida para inglês.
