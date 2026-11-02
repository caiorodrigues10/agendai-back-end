# Auditoria de dependências — importação de planilhas (Fase 1)

> Data: 2026-11-01. Escopo: os 4 pacotes novos da Fase 1 (`@e965/xlsx`,
> `unpdf`, `jszip`, `fast-xml-parser`) e o risco que justificou o mirror.
> Comando de reprovação: `npm audit` no pacote e no projeto.

## 1. Resultado por pacote

| Pacote | Versão | Licença | Mantenedor (npm) | Última publicação | `npm audit` (isolado) |
|---|---|---|---|---|---|
| `@e965/xlsx` | 0.20.3 | Apache-2.0 | `e965 <rulaitisk@gmail.com>` | 2024-07-19 | **0** advisories |
| `unpdf` | 2.1.0 | MIT | `johannschopplich <johann@schopplich.com>` | 2026-10-30 | **0** advisories |
| `jszip` | 3.10.2 | (MIT OR GPL-3.0-or-later) | `stuk <npm@website.stuartk.com>`, `jkoops <jonkoops@gmail.com>` | 2026-09-08 | **0** advisories |
| `fast-xml-parser` | 5.11.2 | MIT | `amitgupta <amitgupta.gwl@gmail.com>` | 2026-09-29 | **0** advisories |

Todos são permissivos (MIT / Apache-2.0) ou double-license que permite uso
proprietário sob MIT — compatíveis com o modelo SaaS fechado do produto.

### Pontos de atenção

- **`@e965/xlsx` (publicação de 2024-07-19)** — é o único com data antiga. É
  um **mirror** do SheetJS Community Edition, não um fork com alterações: o
  `dist/` do mirror é **byte-a-byte idêntico** ao tarball oficial do SheetJS
  (`xlsx-0.20.3.tgz` em `cdn.sheetjs.com`). Verificação por SHA-256:
  - `xlsx.js` → `fd159f1e2d694e12cd0709c1ec1b63c6e1f045d2c4ce857a346f9b965798cbfa` (idêntico)
  - `dist/xlsx.core.min.js` → `197255b0c278588117e45c14c1b25398562864cd9ffa9752c4b4d29f6d9bfd27` (idêntico)
- **`unpdf`** tem peer dependency **opcional** `@napi-rs/canvas` (para rasterizar
  página em imagem). Não é instalado: a Fase 1 só extrai texto posicionado, o
  que não precisa de canvas.
- **`jszip`** é double-license (MIT OR GPL-3.0). O projeto escolhe a MIT.

## 2. Por que o mirror e não o `xlsx` do registry

O pacote `xlsx` oficial no npm está **parado em 0.18.5** e tem 1 advisory
**high** sem correção disponível:

| Advisory | Sev. | Afeta | Correção |
|---|---|---|---|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) — Prototype Pollution | high | `< 0.19.3` | **sem correção no registry** |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) — ReDoS | high | `< 0.20.2` | **sem correção no registry** |

O `npm audit` do `xlsx@0.18.5` reproduz: `{"high": 1, "total": 1}`.

Como o SheetJS só publica no próprio CDN desde a 0.20, o mirror
`@e965/xlsx` é o caminho de instalação oficial da versão corrigida. O arquivo
lido é o mesmo do upstream — o risco de o mirror divergir é nulo enquanto o
SHA-256 bater.

## 3. `npm audit` do projeto (baseline)

O projeto tem **63 advisories pré-existentes** (55 moderate, 8 high, 0 critical)
em dependências que **não** foram tocadas nesta fase:

- `fastify` 4.x, `@fastify/static`, `@fastify/rate-limit`, `@fastify/cors`
- `@opentelemetry/*` (core, exporter, instrumentations)
- `vitest` 4.0.18 (devDependency)
- `fast-uri` (transitiva)
- `exceljs` → `archiver` (moderate, **pré-existente**)

**Nenhum advisory** diz respeito aos 4 pacotes novos. A lista não aumentou
nesta fase.

> Os advisories do `fastify` 4.x e do `vitest` são de dependências fora do
> escopo desta fase (atualização de major). O `archiver` é transitiva do
> `exceljs` e já estava no baseline.

## 4. Como reauditar

```bash
# Advisory do projeto (baseline)
npm audit

# Auditoria isolada de um pacote
mkdir -p /tmp/audit-pkg && cd /tmp/audit-pkg && npm init -y
npm install --no-audit --no-fund <pacote>@<versão>
npm audit
```
