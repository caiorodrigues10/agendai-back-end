# Showcase de demonstração (16 negócios)

Seed local de demonstração com **16 negócios**, agenda viva, histórico,
financeiro, CRM, estoque, avaliações e imagens reais selecionadas pelo
manifesto `../agendaja-materiais/manifest.json`.

Todos os tenants e registros de fixture usam UUIDs determinísticos. No mesmo
dia, uma nova execução preserva as contagens e os estados terminais; o modo
`--refresh` reancora somente a agenda corrente/futura.

- CLI: `scripts/seed-demo-showcase.ts`
- Implementação: `src/shared/utils/demoShowcaseSeed.ts`,
  `demoShowcaseDensity.ts`, `demoShowcaseFinancial.ts`,
  `demoShowcaseHelpers.ts` e `demoShowcaseAssets.ts`
- Manifesto: `../agendaja-materiais/manifest.json`

## Pré-requisitos e guardas

```bash
cd backend

# Seed e verificação exigem a trava explícita de ambiente local.
export SEED_DEMO=true

# Senha usada para todos os usuários demo. Nunca gravá-la em arquivo.
export SEED_DEMO_SHOWCASE_PASSWORD='<senha-local-forte>'
```

- O seed é recusado fora de desenvolvimento/local e não deve ser usado em
  produção.
- A senha vale para dono e equipe. Ela fica somente no ambiente do processo.
- `--list` é estático: não exige `SEED_DEMO`, senha ou conexão com o banco.
- `--refresh` e as trocas de imagem não exigem senha; o refresh também não
  processa nem reenvia imagens.

## Comandos principais

```bash
# Seed completo dos 16 negócios.
SEED_DEMO=true SEED_DEMO_SHOWCASE_PASSWORD='<senha>' \
  npm run prisma:seed:demo-showcase

# Reancora a agenda na data atual sem purge e sem upload.
SEED_DEMO=true npm run prisma:seed:demo-showcase -- --refresh

# Verificação real: banco, login owner, seis telas privadas e HEAD das imagens.
# A API de dev precisa estar no ar.
SEED_DEMO=true SEED_DEMO_SHOWCASE_PASSWORD='<senha>' \
  npm run prisma:seed:demo-showcase -- --verify \
  --api=http://127.0.0.1:3333/api

# Lista ids, nomes e e-mails sem tocar no banco.
npm run prisma:seed:demo-showcase -- --list

# Processa somente um id do manifest ou um segmento.
SEED_DEMO=true SEED_DEMO_SHOWCASE_PASSWORD='<senha>' \
  npm run prisma:seed:demo-showcase -- --only=barbearia
SEED_DEMO=true SEED_DEMO_SHOWCASE_PASSWORD='<senha>' \
  npm run prisma:seed:demo-showcase -- --only=LAW_FIRM
```

Opcionais: `--materials=<dir>`, `--output=<dir>` e
`--api=<baseUrl incluindo /api>`.

### Login da API durante a verificação

O `--verify` autentica cada owner por `POST /api/auth/login`, usa o token
`accessToken` como Bearer e chama endpoints privados reais. Em desenvolvimento,
o limite padrão de login é 10/min por IP; para verificar 16 tenants em uma
execução, inicie a API com `LOGIN_RATE_LIMIT_MAX=100` ou maior. Essa variável é
ignorada em produção.

## Roteiro de apresentação em 5 minutos

1. **0:00–0:45 — Agenda:** abrir o negócio e mostrar a agenda viva. No dia
   corrente há atendimentos da manhã concluídos, um em andamento e uma
   confirmação nas próximas 4–6 horas; a tarde fica livre. O próximo dia
   aberto aparece cheio.
2. **0:45–1:30 — Clientes/CRM:** mostrar clientes, histórico, contatos de
   reativação e indicadores calculados a partir de atendimentos concluídos.
3. **1:30–2:30 — Financeiro:** mostrar caixa, ledger, comissões, despesas,
   Fiado e fechamento diário.
4. **2:30–3:30 — Estoque e vendas:** mostrar catálogo, saldos, movimentos e
   vendas nos segmentos que possuem produtos.
5. **3:30–4:30 — Metas:** mostrar as metas de APPOINTMENTS e REVENUE e o
   progresso calculado.
6. **4:30–5:00 — Presentação:** mostrar logo, capa, plano Pro e a página
   pública com tráfego de 30 dias.

Roteiros recomendados:

- Barbearia e PetShop: Agenda → Caixa → Estoque → Vendas.
- Demais 14 negócios: Agenda → CRM → Caixa → Metas.
- Advocacia: Agenda → CRM → Caixa → Metas; estoque e vendas são N/A por
  restrição do segmento.

## Logins

| negócio | nome exibido | owner | equipe |
|---|---|---|---|
| `barbearia` | Barbearia Navalha de Ouro | demo+owner.barbearia@agendai.local | demo+staff.barbearia.0@agendai.local, demo+staff.barbearia.1@agendai.local |
| `cilios` | Estúdio Cílios Aurora | demo+owner.cilios@agendai.local | demo+staff.cilios.0@agendai.local, demo+staff.cilios.1@agendai.local |
| `manicure` | Ateliê Unhas de Cereja | demo+owner.manicure@agendai.local | demo+staff.manicure.0@agendai.local, demo+staff.manicure.1@agendai.local |
| `maquiagem` | Paetê Makeup Studio | demo+owner.maquiagem@agendai.local | demo+staff.maquiagem.0@agendai.local, demo+staff.maquiagem.1@agendai.local |
| `spa` | Spa Sereno | demo+owner.spa@agendai.local | demo+staff.spa.0@agendai.local, demo+staff.spa.1@agendai.local |
| `petshop` | Patinhas Banho e Tosa | demo+owner.petshop@agendai.local | demo+staff.petshop.0@agendai.local, demo+staff.petshop.1@agendai.local |
| `fisioterapia` | Movimento Fisioterapia | demo+owner.fisioterapia@agendai.local | demo+staff.fisioterapia.0@agendai.local, demo+staff.fisioterapia.1@agendai.local |
| `nutricao` | Nutrição Vital | demo+owner.nutricao@agendai.local | demo+staff.nutricao.0@agendai.local, demo+staff.nutricao.1@agendai.local |
| `psicologia` | Psicologia Horizonte | demo+owner.psicologia@agendai.local | demo+staff.psicologia.0@agendai.local, demo+staff.psicologia.1@agendai.local |
| `lavajato` | Brilho Lava Jato | demo+owner.lavajato@agendai.local | demo+staff.lavajato.0@agendai.local, demo+staff.lavajato.1@agendai.local |
| `mecanica` | Auto Center Aurora | demo+owner.mecanica@agendai.local | demo+staff.mecanica.0@agendai.local, demo+staff.mecanica.1@agendai.local |
| `fotografia` | Lume Fotografia | demo+owner.fotografia@agendai.local | demo+staff.fotografia.0@agendai.local, demo+staff.fotografia.1@agendai.local |
| `tatuagem` | Tinta & Arte Studio | demo+owner.tatuagem@agendai.local | demo+staff.tatuagem.0@agendai.local, demo+staff.tatuagem.1@agendai.local |
| `diarista` | Casa Organizada | demo+owner.diarista@agendai.local | demo+staff.diarista.0@agendai.local, demo+staff.diarista.1@agendai.local |
| `domiciliar` | Mãos Que Ajudam | demo+owner.domiciliar@agendai.local | demo+staff.domiciliar.0@agendai.local, demo+staff.domiciliar.1@agendai.local |
| `advocacia` | Advocacia Horizonte | demo+owner.advocacia@agendai.local | demo+staff.advocacia.0@agendai.local, demo+staff.advocacia.1@agendai.local |

A senha de todos é `SEED_DEMO_SHOWCASE_PASSWORD`.

## O que é populado

Por negócio:

- exatamente **1 owner e 2 funcionários**, com nomes, contatos, agenda,
  endereço/cidade, coordenadas, telefone e plano Pro com assinatura ativa;
- **6–8 serviços** com comissão e **29–34 clientes**, com CPF sintético válido,
  telefone normalizado e consentimento de marketing;
- agenda histórica e futura com aproximadamente **360–414 atendimentos**, sem
  sobreposição de profissional e somente dentro dos dias/horários abertos;
- ledger de caixa, comissões, despesas, metas, pacotes, fidelidade e vouchers;
- CRM financeiro e agregados de reativação derivados de atendimentos
  concluídos; fila nos segmentos compatíveis;
- avaliações e 12 convites de reputação nos segmentos sem publicidade
  restrita; `LAW_FIRM` fica com zero avaliações e zero convites;
- um atendimento histórico concluído marcado como **fiado** em cada negócio,
  sem converter pagamentos em dinheiro;
- catálogo, estoque, RetailSale e RetailSaleLine nos segmentos em que produto
  e venda são coerentes; os demais mantêm Fiado de serviço;
- `Payment` fictício `approved`, sem `providerPaymentId` e sem chamada real a
  provedor;
- `DailyCloseout` do último dia aberto;
- tráfego da página pública em 30 dias e dados específicos de pets, veículos,
  casos jurídicos e serviços domiciliares.

### Agenda viva

A agenda usa o relógio civil de São Paulo. O dia corrente começa com a manhã
concluída, passa por um atendimento `CHECKED_IN` e uma confirmação 4–6 horas
à frente; a tarde permanece livre. O próximo dia aberto recebe a agenda cheia.
Se o dia corrente estiver fechado ou já não tiver janela útil, o par de dias
muda para os próximos dias abertos.

O mês anterior recebe volume menor que o mês corrente para que a comparação
de receita continue crescendo mesmo nos primeiros dias do mês.

## Refresh

```bash
SEED_DEMO=true npm run prisma:seed:demo-showcase -- --refresh
```

O refresh:

- reancora somente a agenda corrente/futura;
- não faz purge e não reenvia logo/capa;
- preserva clientes, serviços, agendamentos históricos, ledger, eventos CRM,
  pagamentos, reviews, comissões, fidelidade, uso de vouchers, Fiado e estoque
  terminal;
- não converte pagamentos nem reescreve estados terminais;
- aceita `--only=<id>` para reancorar um recorte.

A validação local compara as linhas SQL antes/depois, inclusive `updatedAt`.
Clientes, serviços, histórico, dados financeiros, CRM, estoque e URLs de
imagem permanecem idênticos.

## Trocar imagens de um negócio

O manifesto é a fonte de verdade dos filenames. As trocas abaixo processam e
reenviam **somente o tenant escolhido**.

### Inverter logo e capa

```bash
SEED_DEMO=true npm run prisma:seed:demo-showcase -- --swap-images=barbearia
```

O comando inverte `logo` e `banner` no manifest, processa os dois assets e
reenvia apenas aquele negócio. Execute o mesmo comando novamente para
restaurar a ordem original.

### Usar arquivos específicos

```bash
SEED_DEMO=true npm run prisma:seed:demo-showcase -- \
  --images=barbearia \
  --logo=/caminho/para/logo.png \
  --banner=/caminho/para/banner.png
```

- `--logo` e `--banner` aceitam caminhos absolutos; apenas o basename é
  copiado para a pasta do negócio.
- O manifest passa a referenciar os arquivos instalados.
- O `publicId` físico do tenant é mantido; a URL recebe uma query de versão
  para invalidar cache.
- Em caso de falha, o manifest e os arquivos substituídos são restaurados.
- A troca não pode ser combinada com `--only`, `--verify`, `--purge` ou
  `--refresh`.

## Verificação automatizada

```bash
SEED_DEMO=true SEED_DEMO_SHOWCASE_PASSWORD='<senha>' \
  npm run prisma:seed:demo-showcase -- --verify \
  --api=http://127.0.0.1:3333/api
```

A verificação falha se qualquer item não for verdadeiro:

- todos os 16 tenants existem, estão aprovados e possuem plano Pro;
- agenda sem sobreposição e com o padrão viva/cheio esperado;
- receita do mês atual **estritamente maior** que a do mês anterior;
- login real do owner e Bearer válido;
- HTTP 200 nas telas privadas aplicáveis: agenda, CRM, caixa, estoque, vendas
  e metas;
- `LAW_FIRM` é N/A em estoque/vendas por `segmentModuleGuard`;
- HEAD 200 e `Content-Type: image/*` para logo e capa;
- zero chave de ledger duplicada, zero `Payment.providerPaymentId` e zero
  review/convite em `LAW_FIRM`.

A saída inclui tabela dos 16 negócios, URLs, contagens operacionais,
contagens financeiras/CRM, matriz 16×6, logins e roteiro recomendado.

## Limpeza

```bash
# DRY-RUN: informa o que seria removido.
SEED_DEMO=true npm run prisma:seed:demo-showcase -- --purge

# Remoção efetiva, restrita aos tenants demo selecionados.
SEED_DEMO=true npm run prisma:seed:demo-showcase -- --purge --confirm
```

O purge remove os tenants selecionados, dados derivados, referências de
tráfego e imagens no storage. Dependentes com FK `RESTRICT` são removidos
primeiro; a auditoria final consulta dinamicamente todas as tabelas com
`barbershopId`. `--only` limita a limpeza a um id ou segmento. Dados de
negócios não-demo não são tocados.

## Limitações e decisões

- Pagamentos e convites são fixtures locais: não simulam webhook, não chamam
  provedor e não enviam e-mail.
- A agenda é sintética e determinística, mas usa a data/hora atual de São Paulo
  para o estado vivo.
- Não são inventados campos que não existem no schema, como aniversário, VIP,
  cargo/especialidade ou descrição própria do negócio.
- Eventos CRM, ledger, pagamentos e estados terminais são imutáveis; replay
  reutiliza o registro existente.
- O `--verify` exige acesso Pro estável e uma API local real; ele não simula
  uma resposta de tela.
- URLs de Cloudinary mantêm o `publicId` fixo e adicionam cache-bust por
  versão.

## Testes

```bash
NODE_OPTIONS=--max-old-space-size=6144 npm run typecheck
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
  scripts/seed-demo-showcase.spec.ts \
  src/shared/utils/demoShowcaseSeed.spec.ts \
  src/shared/utils/demoShowcaseDensity.spec.ts \
  src/shared/utils/demoShowcaseFinancial.spec.ts \
  src/shared/utils/demoShowcaseAssets.spec.ts \
  src/shared/utils/demoShowcaseLocalStorage.spec.ts
npm run docs:check
```
