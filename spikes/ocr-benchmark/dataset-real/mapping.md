# Mapeamento: campos da imagem → colunas do importador CASE_FEES

Documento de conferência do spike `spikes/ocr-benchmark`. Cada afirmação
abaixo vem do código do backend e traz o trecho literal (com `arquivo:linha`).
Nenhuma regra aqui foi inferida "no olho": quando o código não diz, o documento
diz que não diz.

Fontes lidas (todas em `backend/`):

| Arquivo | O que foi lido |
|---|---|
| `src/modules/dataImport/dataImport.constants.ts` | `CASE_FEE_FIELDS` (795-844), `IMPORT_FIELDS_BY_TARGET` (847-860) |
| `src/modules/dataImport/utils/rowValidator.ts` | `validateCaseFeeRow` (962-1066) |
| `src/modules/dataImport/processors/caseFeeImporter.ts` | `FEE_STATUS_MAP` (31-40), `parseFeeStatus` (43-52), `feeInstallmentsWarning` (55-64), `importCaseFeeRow` (67+) |
| `src/modules/dataImport/dataImportUseCases.ts` | validação do mapa de colunas (316-333); trecho literal 295-330 no anexo 8.3 |
| `src/modules/dataImport/utils/rowNormalization.ts` | `normalizeDate` (21+), `normalizePhone` (134-155), `normalizeMoney` (161-192), `normalizeInteger` (195-201) |
| `src/modules/dataImport/utils/numericText.ts` | `looksScientificNotation` |
| `src/shared/utils/cnj.ts` | `checkCnjCheckDigit` |
| `src/modules/clients/utils/ensureSalonClient.ts` | `salonClientWhatsappKey` (4-13), `salonClientCrmKey` (24-27) |
| `src/modules/queue/utils/queueDuplicate.ts` | `isPlaceholderWhatsApp` (4-7), `STAFF_QUEUE_PLACEHOLDER_WHATSAPP` (2) |

---

## 1. Colunas aceitas no alvo CASE_FEES

`dataImport.constants.ts:795-844` — o alvo aceita **exatamente 6 colunas**:

```ts
const CASE_FEE_FIELDS: ImportFieldDefinition[] = [
  {
    key: "caseNumber",
    label: "Número do processo",
    required: true,
    type: "text",
    synonyms: ["numero do processo", "número do processo", "processo", "numero cnj", "número cnj", "cnj", "process number"],
    hint: "Identifica o processo já existente (padrão CNJ).",
  },
  {
    key: "percent",
    label: "Percentual do honorário",
    required: true,
    type: "number",
    synonyms: ["percentual", "percent", "percentual do honorario", "percentual do honorário", "taxa", "taxa de sucesso"],
    hint: "Percentual sobre o valor obtido (ex.: 20 para 20%).",
  },
  {
    key: "feeStatus",
    label: "Situação",
    required: false,
    type: "text",
    synonyms: ["situacao", "situação", "status", "estado", "fase"],
    hint: "Pendente, faturado, pago ou cancelado.",
  },
  {
    key: "feeDueDate",
    label: "Vencimento",
    required: false,
    type: "date",
    synonyms: ["vencimento", "due date", "data de vencimento", "prazo"],
    hint: "Data de vencimento do honorário. Use dd/mm/aaaa.",
  },
  {
    key: "feeInstallments",
    label: "Parcelas",
    required: false,
    type: "number",
    synonyms: ["parcelas", "installments", "numero de parcelas", "número de parcelas"],
    hint: "Na importação só é aceito 1 parcela.",
  },
  {
    key: "feeNotes",
    label: "Observações",
    required: false,
    type: "text",
    synonyms: ["observacoes", "observações", "obs", "notas", "notes", "comentarios", "comentários"],
    hint: "Observação interna do honorário.",
  },
];
```

`dataImport.constants.ts:859` — `CASE_FEES: CASE_FEE_FIELDS` dentro de
`IMPORT_FIELDS_BY_TARGET`.

Não existem, para este alvo, as colunas `clientName`, `clientWhatsapp`,
`caseName`, `caseFeeAmount`, `feeAmount`, CPF ou CNPJ.

## 2. Regras do importador (trechos literais)

### 2.1 Coluna não aplicável é recusada (400)

`dataImportUseCases.ts:316-319`:

```ts
      for (const [field, column] of Object.entries(columnMap)) {
        if (!validFields.has(field as ImportFieldKey)) {
          throw new AppError(`Campo "${field}" não se aplica a este tipo de importação.`, 400);
        }
```

### 2.2 Obrigatório faltando é recusado antes de processar

`dataImportUseCases.ts:325-334`:

```ts
      const missing = fields
        .filter((field) => field.required && columnMap[field.key] === undefined)
        .map((field) => getFieldLabel(field, segment));
      if (missing.length) {
        const sheetLabel = input.sheetName ? `aba "${input.sheetName}"` : "aba";
        throw new AppError(
          `Falta mapear na ${sheetLabel}: ${missing.join(", ")}. Ajuste o mapa antes de continuar.`,
          400,
        );
      }
```

Ou seja: mapear `caseNumber` e `percent` é obrigatório **no mapa**, antes de
qualquer linha ser lida.

### 2.3 Processo (e apelido) é obrigatório na linha

`rowValidator.ts:969-979`:

```ts
  const caseNumber = cellValue(row, context, "caseNumber").slice(0, 30);
  const caseName = cellValue(row, context, "caseName").slice(0, 120);

  if (!caseNumber && !caseName) {
    return {
      rowNumber,
      status: "FAILED",
      field: "caseNumber",
      message: "Número do processo ou apelido do caso é obrigatório.",
    };
  }
```

### 2.4 Sem número de processo, exige WhatsApp do cliente já cadastrado

`rowValidator.ts:983-1009`:

```ts
  if (!caseNumber) {
    const rawPhone = cellValue(row, context, "clientWhatsapp");
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return {
        rowNumber,
        status: "FAILED",
        field: "clientWhatsapp",
        message: rawPhone
          ? "Telefone do cliente inválido. Use DDD + número (10 ou 11 dígitos)."
          : "Telefone do cliente é obrigatório quando não há número do processo.",
      };
    }
    const client = await db.salonClient.findFirst({
      where: { barbershopId, normalizedWhatsapp: phone },
      select: { id: true },
    });
    if (!client) {
      return {
        rowNumber,
        status: "FAILED",
        field: "clientWhatsapp",
        message: "Cliente não encontrado. Importe o cliente antes do honorário.",
      };
    }
    clientId = client.id;
  }
```

Na prática, com apenas 6 colunas aceitas, `clientWhatsapp` e `caseName` nunca
chegam ao validador: **toda linha de CASE_FEES precisa de `caseNumber`**.

### 2.5 O processo precisa já existir no sistema

`rowValidator.ts:1012-1033`:

```ts
  const caseWhere: Record<string, unknown> = { barbershopId };
  if (caseNumber) {
    caseWhere.caseNumber = caseNumber;
  } else if (clientId) {
    caseWhere.clientId = clientId;
    caseWhere.nickname = { equals: caseName, mode: "insensitive" };
  }

  const existingCase = await db.clientCase.findFirst({
    where: caseWhere,
    select: { id: true },
  });
  if (!existingCase) {
    return {
      rowNumber,
      status: "FAILED",
      field: caseNumber ? "caseNumber" : "caseName",
      message: caseNumber
        ? `Processo com número "${caseNumber}" não encontrado.`
        : `Processo "${caseName}" não encontrado para o cliente.`,
    };
  }
```

### 2.6 Percentual obrigatório, entre 0 e 100

`rowValidator.ts:1037-1046`:

```ts
  const rawPercent = cellValue(row, context, "percent");
  const percent = rawPercent ? normalizeMoney(rawPercent) : null;
  if (percent === null || percent < 0 || percent > 100) {
    return {
      rowNumber,
      status: "FAILED",
      field: "percent",
      message: "Percentual do honorário é obrigatório e deve estar entre 0 e 100.",
    };
  }
```

`normalizeMoney` é usado como conversor de percentual (`rowNormalization.ts:161`):
aceita `"20"`, `"20%"`, `"20,5"`.

### 2.7 Situação: texto desconhecido vira PENDING **com aviso**

`caseFeeImporter.ts:31-52`:

```ts
const FEE_STATUS_MAP: Record<string, SuccessFeeStatus> = {
  pendente: "PENDING",
  pending: "PENDING",
  faturado: "INVOICED",
  invoiced: "INVOICED",
  pago: "PAID",
  paid: "PAID",
  cancelado: "CANCELED",
  canceled: "CANCELED",
};

/** Situação do honorário; texto desconhecido vira PENDING com aviso. */
export function parseFeeStatus(raw: string): { value: SuccessFeeStatus; warning?: string } {
  const text = raw.trim();
  if (!text) return { value: "PENDING" };
  const mapped = FEE_STATUS_MAP[normalizeHeaderText(text)];
  if (mapped) return { value: mapped };
  return {
    value: "PENDING",
    warning: `Situação "${text}" não reconhecida; usando "Pendente".`,
  };
}
```

### 2.8 Vencimento: dd/mm/aaaa; data inválida reprova a linha

`rowValidator.ts:1051-1059`:

```ts
  const rawDueDate = cellValue(row, context, "feeDueDate");
  if (rawDueDate && !normalizeDate(rawDueDate)) {
    return {
      rowNumber,
      status: "FAILED",
      field: "feeDueDate",
      message: "Data de vencimento inválida. Use dd/mm/aaaa.",
    };
  }
```

### 2.9 Parcelas: só 1 é aceita na importação; mais que 1 é **aviso**, não recusa

`caseFeeImporter.ts:55-64`:

```ts
export function feeInstallmentsWarning(raw: string): { value: number; warning?: string } | null {
  const parsed = normalizeInteger(raw);
  if (parsed === null) return null;
  if (parsed <= 0) return null;
  if (parsed === 1) return { value: 1 };
  return {
    value: 1,
    warning: `Parcelas "${parsed}" não são aceitas na importação; o honorário entra com 1 parcela.`,
  };
}
```

### 2.10 O valor do honorário é derivado, nunca importado

`caseFeeImporter.ts:191-194` (observações e criação do honorário):

```ts
  // Observações.
  const notes = cellValue(row, context, "feeNotes").slice(0, 2000) || null;

  // Criar o honorário. O valor é derivado pelo repositório (base × percent / 100).
```

Não existe coluna de valor, caixa, receita, lucro ou comissão no alvo.

---

## 3. Normalizadores (trechos literais)

`rowNormalization.ts:161-192` — `normalizeMoney`:

```ts
export function normalizeMoney(value: string): number | null {
  let text = String(value ?? "").trim();
  if (!text) return null;

  text = text.replace(/r\$\s*/gi, "").replace(/\s/g, "").replace(/%$/, "");

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    // O último separador é o decimal.
    const decimalIndex = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
    const integerPart = text.slice(0, decimalIndex).replace(/[.,]/g, "");
    const decimalPart = text.slice(decimalIndex + 1).replace(/[^0-9]/g, "");
    text = `${integerPart || "0"}.${decimalPart || "0"}`;
  } else if (hasComma) {
    // Vírgula como separador de milhar ("1,234") ou decimal ("X,XX").
    const onlyOneComma = text.indexOf(",") === text.lastIndexOf(",");
    const digitsAfter = text.length - text.indexOf(",") - 1;
    text = onlyOneComma && digitsAfter !== 3
      ? text.replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasDot) {
    const onlyOneDot = text.indexOf(".") === text.lastIndexOf(".");
    const digitsAfter = text.length - text.indexOf(".") - 1;
    if (!onlyOneDot || digitsAfter === 3) text = text.replace(/\./g, "");
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}
```

`rowNormalization.ts:134-155` — `normalizePhone`:

```ts
export function normalizePhone(value: string): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  if (looksScientificNotation(text)) return null;

  let digits = text.replace(/\D/g, "");
  if (!digits) return null;

  // DDI 55: 55 + DDD + número.
  if ((digits.length === 13 || digits.length === 14) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  // Zero à esquerda (0 + DDD + número): some com o prefixo, não com o número.
  if (digits.startsWith("0")) {
    const semZero = digits.slice(1);
    if (semZero.length === 10 || semZero.length === 11) digits = semZero;
  }

  return salonClientWhatsappKey(digits);
}
```

`numericText.ts:11-13` — `looksScientificNotation` (o expoente é **obrigatório**; um
telefone só com dígitos NÃO é notação científica):

```ts
export function looksScientificNotation(value: string): boolean {
  return /^[+-]?\d+([.,]\d+)?[eE][+-]?\d+$/.test(String(value ?? "").trim());
}
```

`ensureSalonClient.ts:4-13` — `salonClientWhatsappKey`:

```ts
export function salonClientWhatsappKey(whatsapp: string): string | null {
  if (isPlaceholderWhatsApp(whatsapp)) return null;
  const digits = whatsapp.replace(/\D/g, "");
  const national =
    (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
      ? digits.slice(2)
      : digits;
  if (national.length < 10 || national.length > 11) return null;
  return national;
}
```

`ensureSalonClient.ts:24-27` — `salonClientCrmKey` (usado pelo repositório do
CRM) é **só um wrapper**: delega para `salonClientWhatsappKey` e ignora o
nome. A função chamada pelo importador (`rowNormalization.ts:154`) é
`salonClientWhatsappKey`, **não** `salonClientCrmKey`:

```ts
export function salonClientCrmKey(whatsapp: string, name: string): string | null {
  void name;
  return salonClientWhatsappKey(whatsapp);
}
```

`queueDuplicate.ts:2-7`:

```ts
export const STAFF_QUEUE_PLACEHOLDER_WHATSAPP = "00000000000";

export function isPlaceholderWhatsApp(whatsapp: string): boolean {
  const d = whatsapp.replace(/\D/g, "");
  return !d || d === STAFF_QUEUE_PLACEHOLDER_WHATSAPP;
}
```

`shared/utils/cnj.ts:3-11` — `checkCnjCheckDigit`:

```ts
export function checkCnjCheckDigit(value: string): CnjCheckDigitStatus {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 20) return "unknown";

  const base = `${digits.slice(0, 7)}${digits.slice(9)}`;
  const checkDigit = BigInt(digits.slice(7, 9));
  const remainder = (BigInt(base) * 100n + checkDigit) % 97n;
  return remainder === 1n ? "valid" : "invalid";
}
```

Observação: o DV do CNJ **não** é validado pelo importador de honorários
(`validateCaseFeeRow` não chama `checkCnjCheckDigit`); o número é usado como
texto para localizar o caso. O `eval.py` usa `checkCnjCheckDigit` só para
medir "erro confiante" (número plausível que passaria pela checagem).

---

## 4. Mapeamento do dataset sintético (imagem → coluna CASE_FEES)

| Campo do ground truth | Coluna do importador | Regra | Ausente | Ambíguo |
|---|---|---|---|---|
| `numero_processo` | `caseNumber` | Texto, cortado em 30 caracteres (`rowValidator.ts:969`). | Linha falha ("Número do processo… é obrigatório"). | Número ilegível → célula marcada `incerto`; sem processo a linha falha. |
| `percentual_exito` | `percent` | `normalizeMoney`; precisa estar em 0–100. | Linha falha. | Fora de 0–100 → linha falha. |
| `parcela` ("1/3") | `feeInstallments` | Só 1 é aceita; o total de parcelas entra no arquivo para gerar o aviso. | Entra com 1 parcela. | Total > 1 → aviso, entra com 1 parcela. |
| `vencimento` | `feeDueDate` | `normalizeDate`; dd/mm/aaaa ou aaaa-mm-dd. | Honorário sem vencimento. | Data inválida → linha falha. |
| `status` | `feeStatus` | `parseFeeStatus`: pago→PAID, pendente→PENDING, faturado→INVOICED, cancelado→CANCELED. | Entra como PENDING. | Texto desconhecido (ex.: "atrasado") → PENDING **com aviso**. |
| `cliente` | — | Não existe coluna de cliente no alvo CASE_FEES. | — | Não afeta a importação. |
| `telefone` | — | Não existe `clientWhatsapp` no alvo CASE_FEES. | — | Não afeta a importação de honorário. |
| `valor_total` | — | O valor é derivado (base × percent / 100). | — | Valor ambíguo → `incerto`; não é importado. |
| `data_pagamento` | — | Não existe coluna de data de pagamento no alvo. | — | — |
| `incerto` | — | Marca de revisão, não é coluna. | — | Célula incerta fica fora do placar do `eval.py`. |

Casos do dataset sintético (`dataset-real/ground-truth/`):

| Caso | Arquivo | Efeito na importação |
|---|---|---|
| Mesmo cliente em duas imagens | `cadastro-01`, `cadastro-02` | CASE_FEES não deduplica cliente: cada linha vira um honorário do processo indicado. |
| Mesmo processo em linhas diferentes | `cadastro-03`, `cadastro-04` | O processo já existe; cada linha vira um honorário (1 parcela cada). |
| Valor ambíguo | `cadastro-05` | `valor_total` com `incerto`; o valor não é importado. |
| Processo sem cliente | `cadastro-06` | O honorário liga pelo `caseNumber`; cliente não é coluna. |
| Processo ausente | `recibo-01` | Linha reprovada ("Número do processo ou apelido do caso é obrigatório."). |

---

## 5. Mapeamento das 4 imagens REAIS (`testimage/` → `dataset-real/`)

As 4 imagens são **modelos de planilha de terceiros** (`sintetica=nao`,
`origem=terceiros`); nenhuma delas é uma tabela do alvo CASE_FEES. O
ground truth delas (`dataset-real/ground-truth-real/`) existe para medir o
OCR em planilha de verdade — não para simular importação de honorário.

> O que segue vem do **ground truth transcrito** (`ground-truth-real/*.csv`) e
> do código do importador. As 4 imagens reais foram lidas na **Sessão 3**,
> **uma por chamada**, depois de rodar o OCR local; o rascunho segue com
> `revisado=nao` e as dúvidas estão marcadas em `incerto`.

| Arquivo em `testimage/` | Colunas transcritas (ground truth) | Coluna CASE_FEES equivalente | O que aconteceria se fosse importada em CASE_FEES |
|---|---|---|---|
| `planilha-para-advogado.jpg.webp` (convertida para `.png` em `dataset-real/real/`) | `numero_processo, status, grupo_acao, tipo_honorario, cliente, data_criacao, valor_total` | `numero_processo` ← "N° Processo" (formato `N.NN.NNNN.NNNNN-D`; **não** é CNJ — tem 15 ou 16 dígitos, nunca 20, então `checkCnjCheckDigit` devolve `unknown`) | Falha em `percent` (não há coluna de percentual). `status` (palavras fora do `FEE_STATUS_MAP` — o `normalizeHeaderText` ignora caixa e acento, então o que impede é o **vocabulário**) não tem equivalência → cairia em PENDING com aviso. "Valor da Ação" não é coluna: o valor do honorário é derivado. |
| `planilha-controle-barbearia-1.jpg` | `data, horario, cliente, funcionario, servico, valor, material_usado, qtd_material, status, percentual_comissao, valor_comissao, observacoes` | Nenhuma (`caseNumber` e `percent` não existem) | Falha em `percent`. "os status do controle" (palavras fora do `FEE_STATUS_MAP`, não por causa da caixa) e "% comissão do funcionário" não têm equivalência em `feeStatus`/`percent`. |
| `O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.png` | `id, servico, porte, duracao_min, preco_venda, custo_produto, custo_mao_de_obra, custo_total` | Nenhuma comprovada — é tabela de serviços (preço/custo), não de honorários | Não é importável em CASE_FEES. |
| `Planilha-para-Barbearia.png` | `secao, categoria, detalhe, valor` | Nenhuma — não é tabela de importação | Não é importável. Serve para medir leitura de números e rótulos de gráfico. |

Nomes das colunas do ground truth real e como foram transcritos:

| Arquivo real | Colunas do GT real | Observações da transcrição |
|---|---|---|
| `planilha-para-advogado.csv` | `numero_processo, status, grupo_acao, tipo_honorario, cliente, data_criacao, valor_total` | 15 linhas. "Grupo de Ação" e "Tipo de Ação" só existem nas 4 primeiras linhas (estão vazias nas demais). |
| `planilha-controle-barbearia-1.csv` | `data, horario, cliente, funcionario, servico, valor, material_usado, qtd_material, status, percentual_comissao, valor_comissao, observacoes` | 18 linhas. `incerto` em **16 células** (Sessão 4): "servico" e "valor;valor_comissao" da 2ª linha (servico e valor/comissão com leitura divergente), "servico" das linhas 6 e 7, "percentual_comissao;valor_comissao" das linhas 9 e 10, "data;qtd_material" da 14ª (barra preta sobre a data) e "qtd_material" das linhas 13, 15, 16, 17 e 18 (texto pequeno). |
| `O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.csv` | `id, servico, porte, duracao_min, preco_venda, custo_produto, custo_mao_de_obra, custo_total` | 18 linhas. `incerto` em **1 célula** (Sessão 4): "custo_produto" da 4ª linha. |
| `Planilha-para-Barbearia.csv` | `secao, categoria, detalhe, valor` | 19 linhas: 3 indicadores, 2 linhas de totais do dashboard (percentual + valor) e 7+7 itens dos TOP 7. |

Convenções da transcrição real: valor monetário sem o prefixo `R$`
(`X.XXX,XX`), percentual sem `%` (`NN`), data como aparece na imagem
(`dd/mm/aaaa`, `dd/mm/aa - dia da semana`). **Todas as 70 linhas estão com
`revisado=nao`** (verificado por script); quem revisa troca para `sim` e o
`eval.py --real` só pontua linhas revisadas — hoje ele avisa e sai sem erro.

Revisão da Sessão 3 (leitura visual contra o OCR local `A-tesseract-texto`):
o rascunho do `planilha-controle-barbearia-1` foi corrigido (valor e comissão
da 2ª linha, serviço das linhas 6 e 7, percentual e comissão da 9ª e da 10ª,
`qtd_material` das linhas 13-18) e o do petshop foi corrigido (`custo_produto`
da 4ª linha corrigido para fechar com o custo total da mesma linha); acentos foram
ajustados. As demais linhas já batiam com a imagem.

**Sessão 4 — método do rascunho:** os valores corrigidos na Sessão 3
vieram de **releitura com conferência por cálculo** (ex.: percentual × valor
para escolher a leitura certa) e **não** de uma leitura direta e confiável da
imagem; por isso toda célula alterada foi marcada em `incerto` (16 no
controle de barbearia + 1 no petshop = **17 células**) para conferência
humana. Célula marcada em `incerto` sai do placar de acerto/erro do
`eval.py`: o OCR preenchê-la conta como "erro confiante", e o OCR deixá-la
vazia conta como "abstenção válida". **O `revisado` continua `nao` em todas
as linhas** — a revisão é do humano.

### 5.1 OCR estruturado (`ocr-para-csv.ts` → `ocr-output-real/*.csv`)

O `eval.py --real` compara **CSV**, não texto de OCR: ele lê
`ground-truth-real/<arquivo>.csv` e `ocr-output-real/<arquivo>.csv` pelo mesmo
basename. O elo que faltava era o texto do OCR local virado em tabela.

`dataset-real/ocr-para-csv.ts` faz essa conversão (sem rede, sem banco):

- entrada: `ocr-output-real/<base>.a-tesseract-texto.txt` (texto bruto do
  `A-tesseract-texto`);
- saída: `ocr-output-real/<base>.csv`, **com as mesmas colunas do ground truth**
  da imagem correspondente;
- parser por layout (processos, tabela de itens, dashboard, controle de
  barbearia);
- dinheiro sai **verbatim** (só perde o `R$`/`RS`); a vírgula decimal pt-BR é
  preservada; nenhum valor é inventado — quando o OCR não traz o número, a
  célula fica vazia.

**Sessão 5 — o parser não pode "conhecer a resposta".** Os parsers trabalham
só com **formato** e **posição**. O formato do processo **foi derivado da
amostra**: o `N.NN.NNNN.NNNNN-D` (e o `dd/mm/aaaa` e o token depois de
`R$`/`RS`) sai do texto do Tesseract da imagem `planilha-para-advogado` — não
é conhecimento de domínio nem regra de CNJ: é o que a amostra mostra. Os
demais layouts seguem a mesma lógica (formato + posição vistos na amostra):

| Layout | Regra do parser (formato/posição vistos na amostra) |
|---|---|
| processos | o processo é o token no formato `N.NN.NNNN.NNNNN-D`; a data é `dd/mm/aaaa`; o valor é o token que vem depois de `R$`/`RS`; as colunas de texto são mapeadas por posição (a primeira é o status, a última é o cliente; as do meio só quando a linha tem o mesmo número de colunas da linha mais completa do arquivo — senão são ambíguas e ficam vazias) |
| tabela de itens | o id é o primeiro número depois da coluna de índice; a duração é o último número antes do primeiro valor; o rótulo curto ("porte") é o token imediatamente antes da duração, **verbatim**; os 4 valores monetários são posicionais |
| dashboard | a primeira linha com valores é o bloco de indicadores (rótulos = palavras em caixa alta da linha de cabeçalho acima); a linha com título "A X B" abre um bloco (o 1º valor usa A, o 2º usa B) e o texto que sobra na linha é a legenda do top (sem valor; a "detalhe" = posição) |
| controle de barbearia | o texto do Tesseract é ruído: sai **só o cabeçalho** |

Regras que valem para todos: **não normalizar o OCR** (o "m" lido continua
"m"; nada de "arrumar" maiúscula/minúscula, número ou acento) e **deixar
vazio** o que não dá para extrair sem conhecer a resposta. Nenhum valor do
ground truth pode estar no `.ts` — o teste
`dataset-real/test_ocr_para_csv.ts` faz o grep de todos os valores do GT
dentro do parser e falha se algum aparecer.

O que o OCR local entregou (Sessão 5, formato derivado da amostra):

| Imagem | Linhas no CSV do OCR | Células preenchidas | Observação |
|---|---|---|---|
| `planilha-para-advogado` | 15 | 83/105 | valores às vezes sem a vírgula (`50.00000`) — erro do OCR, visível no placar |
| `O-Que-Voce-Encontra-...-Petshop` | 18 | 138/144 | id/porte lidos errado em 4 linhas (`a`, `5`, `Mm`, `Gc`, `©`) |
| `Planilha-para-Barbearia` (dashboard) | 9 | 18/36 | indicadores e totais com valor; `secao` fica vazia (é um agrupamento da transcrição, não existe na imagem) e os rótulos do top saíram sem número |
| `planilha-controle-barbearia-1` | 0 | 0/0 | o OCR local não separou linhas/tabela: sai **só o cabeçalho** (nada inventado) |

O `eval.py --real` foi exercitado ponta a ponta em diretório temporário
(cópia do GT com `revisado=sim` + os CSV do OCR, sem tocar no GT do repo),
Sessão 7 — **placar só com célula que tem valor no GT** (§6), com o
alinhamento por chave textual (§6) e o falso confiante só de campo com
normalizador (§6):

| Arquivo | Células com valor | Acerto exato | Vazias no GT |
|---|---|---|---|
| `planilha-para-advogado.csv` | 83 | 68/83 (81,9%) | 22 |
| `O-Que-Voce-Encontra-...-Petshop.csv` | 143 | 70/143 (49,0%) | 0 |
| `Planilha-para-Barbearia.csv` | 54 | 8/54 (14,8%) | 3 |
| `planilha-controle-barbearia-1.csv` | 182 | 0/182 (0,0%) — **sem extração** (o CSV do OCR tem só o cabeçalho) | 18 |
| **GERAL** | **462** | **146 (31,6%)** | **43** |

Geral: CER médio 0,5682, 54 falsos confiantes, 99 erros monetários, taxa de
erro ponderada **0,8933**; 43 células vazias no GT (todas com OCR vazio) e 17
`incerto` ficam fora do placar; `secao` (19 células) fica fora por ser coluna
do modo real. Números ruins **por honestidade** — o OCR local das imagens
reais é ruim e o placar mede isso, não a qualidade do parser. O arquivo sem
extração **conta no geral** (182 células com valor, todas ausentes = 0%) e
aparece na seção "SEM EXTRAÇÃO" do relatório.

**Sessão 8 — o critério do falso confiante mudou, a qualidade não.** `status`
volta a contar como campo **com normalizador** (§2.7: `FEE_STATUS_MAP`), então
os 19 erros de `status` do GT real foram reavaliados. A contagem **continua
54**: o texto lido pelo OCR nesses erros é uma **palavra que não existe no
`FEE_STATUS_MAP`** — o mapa só reconhece `pendente`/`pending`,
`faturado`/`invoiced`, `pago`/`paid`, `cancelado`/`canceled`, e o
`normalizeHeaderText` **ignora caixa e acento** (§2.7), então "caixa alta"
não tem nada a ver: é o **vocabulário** que está fora do mapa. Com texto fora
do mapa a produção não aceita o erro em silêncio — vira PENDING **com aviso**
(§2.7). Ou seja: mesmos erros, mesmo placar (462 células, 146 acertos, taxa
0,8933); o que mudou foi o **critério** do falso confiante, não a qualidade
do OCR nem a do ground truth.

Tabela do `--real` em tmpdir (cópia do GT com `revisado=sim`), por campo —
erros x falsos confiantes (`status` incluso):

| Campo | Erros | Falsos confiantes |
|---|---|---|
| preco_venda | 14 | 14 |
| custo_mao_de_obra | 11 | 11 |
| custo_total | 11 | 11 |
| custo_produto | 10 | 10 |
| valor_total | 6 | 6 |
| valor | 33 | 2 |
| **status** | **19** | **0** |
| servico | 21 | 0 |
| cliente | 18 | 0 |
| funcionario | 18 | 0 |
| horario | 18 | 0 |
| material_usado | 18 | 0 |
| data | 17 | 0 |
| detalhe | 16 | 0 |
| percentual_comissao | 16 | 0 |
| porte | 16 | 0 |
| valor_comissao | 15 | 0 |
| categoria | 14 | 0 |
| qtd_material | 12 | 0 |
| grupo_acao | 4 | 0 |
| tipo_honorario | 4 | 0 |
| id | 3 | 0 |
| duracao_min | 2 | 0 |

Os 19 erros de `status` são erros de verdade (o GT e o OCR discordam) que
**não** viram falso confiante: o valor lido é barrado pela produção.

---

## 6. Como o `eval.py` pontua

`dataset-real/eval.py` (dois modos: `--sintetico` e `--real`):

- **Placar principal (por campo, por arquivo e no geral): só célula com valor
  no GT.** Célula vazia no GT **não conta como acerto** (nem como erro): ela
  sai do placar e aparece numa linha própria do relatório,
  `vazias no GT: N, OCR vazio: X, OCR preencheu: Y`. Sem essa regra, "vazio ×
  vazio" inflava o acerto; com ela, **arquivo sem extração dá 0% no
  principal** (as células com valor estão todas ausentes no OCR) e o placar
  mede leitura de valor, não preenchimento de célula vazia.
- **Alinhamento**: chave exata (`numero_processo` + `parcela`) primeiro; depois,
  entre as linhas **sem** `numero_processo` (dashboard e planilha de serviços),
  a **chave textual** — o rótulo da linha (`categoria` ou `servico`) sem caixa
  e sem acento — **só quando ela é única nos dois lados** (um rótulo repetido
  não identifica a linha e cai na posição); depois a posição; por fim as sobras
  com processo, pelo menor CER. Um dígito errado no processo vira **erro de
  campo** (nunca "ausente + extra").
- **Pesos**: `PESO_CAMPO` (processo 3, dinheiro 5, percentual/parcela 2, resto 1)
  e erro monetário ×`PESO_ERRO_MONETARIO` (5). Taxa de erro ponderada =
  `sum(peso*erro)/sum(peso)`.
- **Falso confiante**: célula errada de campo **com normalizador** cujo valor
  **passa** no normalizador de produção (`telefone`, moeda, percentual, DV de
  CNJ e o `status` do `FEE_STATUS_MAP` — §2.7) — o erro entraria no sistema
  sem ser barrado. **Campo de texto não conta** (`cliente`, `servico`,
  `categoria`, `detalhe`...): sem normalizador não há filtro que o erro
  pudesse atravessar. No `status`, "passa" quer dizer **reconhecido pelo
  mapa**: texto desconhecido vira PENDING **com aviso**, ou seja, a produção
  barra o erro em vez de aceitá-lo em silêncio. O relatório traz a tabela
  `FALSO CONFIANTE POR CAMPO` (campo, erros, falsos confiantes) e a lista dos
  campos sem normalizador.
- **`incerto`**: célula marcada no GT **sai do placar geral** (não conta como
  acerto nem como erro). O relatório mostra **só as contagens**:
  "preenchida pelo OCR" x "vazia no OCR".
- **Arquivo sem extração**: GT sem nenhuma linha de OCR **não some** — as
  linhas dele entram no placar como **ausentes** (erro total, 0% no principal)
  e o arquivo aparece na seção "SEM EXTRAÇÃO" do relatório.
- **Modo `--real` — comparativo do dashboard (Sessão 6)**:
  - `secao` **fica de fora** do comparativo: é agrupamento da transcrição do
    GT e **não existe na imagem** (o OCR não pode lê-la). As células
    excluídas são contadas e aparecem em
    "COLUNAS FORA DO COMPARATIVO (só no modo --real)".
  - `categoria` (os rótulos do dashboard) é comparada **sem diferenciar caixa
    nem acento**: `Rótulo Acentuado` × `ROTULO ACENTUADO` conta
    como acerto. Isso vale **só na comparação**: o `gt`/`ocr` da célula e o
    CSV do OCR continuam **verbatim** (nada é "arrumado"). No modo
    `--sintetico` nada muda: `secao` continua comparada e o rótulo continua
    verbatim.
- Modo `--real` só usa linhas com `revisado=sim` e **não imprime valores**. Sem
  nenhuma linha revisada, ele avisa e sai com código 0 (sem pontuar).

Testes: `dataset-real/test_eval.py` (51 casos), `dataset-real/test_dataset_core.py`
(11 casos) e `dataset-real/test_ocr_para_csv.py` (3 casos: parser, grep do GT
e o SKIP quando falta `ground-truth-real/`) — **65 no total**, rodados com
`dataset-real/.venv/bin/python -m pytest`.

---

## 7. Limitações conhecidas

- `eval.py` reimplementa os normalizadores de produção em Python (portas
  manuais). A paridade é conferida **automaticamente**: `gerar-paridade.ts`
  grava as saídas das funções **reais** do backend em
  `paridade-normalizadores.json` e `test_eval.py` compara cada caso com a
  porta Python — divergência faz o teste falhar.
- O ground truth real foi transcrito por leitura visual (Sessão 3, uma imagem
  por chamada, depois do OCR local); as 4 imagens são modelos de terceiros e
  servem para medir OCR, não para validar regras de negócio.
- O `eval.py` não confere a existência do processo no banco (não há banco, por
  decisão do spike): a checagem de "processo não encontrado" fica para o
  importador real.
- As 70 linhas do ground truth real ainda estão com `revisado=nao`; o
  `eval.py --real` não pontua nada até a revisão humana.
- O `C-macos-vision` (Vision do macOS) **não roda** neste ambiente: o script
  exige `pyobjc` e o `xcrun` sem developer tools. O erro fica registrado em
  `ocr-output-real/*.ocr.json`; o `A-tesseract-texto` (tesseract.js) funciona
  offline e foi ele que alimentou o CSV estruturado.
- O parser do `ocr-para-csv.ts` é específico por layout (4 layouts) e foi
  escrito contra o texto do Tesseract, não contra a imagem: onde o OCR
  embaralha colunas (ids trocados, vírgula perdida, rótulo colado) o parser
  propaga o erro — o propósito é medir o OCR, não consertá-lo.
- O parser **não inventa** o que não está no texto do OCR. Duas consequências
  no dashboard: a coluna `secao` (agrupamento da transcrição, que não existe
  na imagem) sai **vazia** — por isso ela ficou **fora do comparativo real**
  (§6) — e os rótulos mantêm a caixa e os acentos do OCR. A comparação do modo
  `--real` ignora caixa e acento **só em `categoria`** (§6), mas o CSV do OCR
  continua verbatim: o parser não conserta nada.
- Como o parser é posicional, ele não sabe quantas colunas de texto existem
  quando o layout muda no meio do arquivo: nesses casos as colunas do meio
  ficam vazias (é o comportamento pedido: sem conhecer a resposta, vazio).

---

## 8. Anexos — trechos literais (saída de `sed -n`)

Reproduzidos sem edição a partir do backend, para conferência.

### 8.1 `src/modules/dataImport/utils/rowValidator.ts` — linhas 962-1066

`sed -n '962,1066p' src/modules/dataImport/utils/rowValidator.ts`

```ts
async function validateCaseFeeRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const caseNumber = cellValue(row, context, "caseNumber").slice(0, 30);
  const caseName = cellValue(row, context, "caseName").slice(0, 120);

  if (!caseNumber && !caseName) {
    return {
      rowNumber,
      status: "FAILED",
      field: "caseNumber",
      message: "Número do processo ou apelido do caso é obrigatório.",
    };
  }

  // Se não há número, o cliente precisa existir para identificar o caso pelo apelido.
  let clientId: string | null = null;
  if (!caseNumber) {
    const rawPhone = cellValue(row, context, "clientWhatsapp");
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return {
        rowNumber,
        status: "FAILED",
        field: "clientWhatsapp",
        message: rawPhone
          ? "Telefone do cliente inválido. Use DDD + número (10 ou 11 dígitos)."
          : "Telefone do cliente é obrigatório quando não há número do processo.",
      };
    }
    const client = await db.salonClient.findFirst({
      where: { barbershopId, normalizedWhatsapp: phone },
      select: { id: true },
    });
    if (!client) {
      return {
        rowNumber,
        status: "FAILED",
        field: "clientWhatsapp",
        message: "Cliente não encontrado. Importe o cliente antes do honorário.",
      };
    }
    clientId = client.id;
  }

  // O caso precisa já existir.
  const caseWhere: Record<string, unknown> = { barbershopId };
  if (caseNumber) {
    caseWhere.caseNumber = caseNumber;
  } else if (clientId) {
    caseWhere.clientId = clientId;
    caseWhere.nickname = { equals: caseName, mode: "insensitive" };
  }

  const existingCase = await db.clientCase.findFirst({
    where: caseWhere,
    select: { id: true },
  });
  if (!existingCase) {
    return {
      rowNumber,
      status: "FAILED",
      field: caseNumber ? "caseNumber" : "caseName",
      message: caseNumber
        ? `Processo com número "${caseNumber}" não encontrado.`
        : `Processo "${caseName}" não encontrado para o cliente.`,
    };
  }

  const warnings: string[] = [];

  const rawPercent = cellValue(row, context, "percent");
  const percent = rawPercent ? normalizeMoney(rawPercent) : null;
  if (percent === null || percent < 0 || percent > 100) {
    return {
      rowNumber,
      status: "FAILED",
      field: "percent",
      message: "Percentual do honorário é obrigatório e deve estar entre 0 e 100.",
    };
  }

  const status = parseFeeStatus(cellValue(row, context, "feeStatus"));
  if (status.warning) warnings.push(status.warning);

  const rawDueDate = cellValue(row, context, "feeDueDate");
  if (rawDueDate && !normalizeDate(rawDueDate)) {
    return {
      rowNumber,
      status: "FAILED",
      field: "feeDueDate",
      message: "Data de vencimento inválida. Use dd/mm/aaaa.",
    };
  }

  const rawInstallments = cellValue(row, context, "feeInstallments");
  const installmentsResult = rawInstallments ? feeInstallmentsWarning(rawInstallments) : { value: 1 };
  if (installmentsResult?.warning) warnings.push(installmentsResult.warning);

  return { rowNumber, status: "VALID", warnings };
}
```

### 8.2 `src/modules/dataImport/processors/caseFeeImporter.ts` — arquivo inteiro (217 linhas)

`sed -n '1,217p' src/modules/dataImport/processors/caseFeeImporter.ts`

```ts
/**
 * Processador de linhas de honorário de êxito (`CASE_FEES`).
 *
 * Regras que importam:
 *   • o processo é identificado pelo número CNJ; se não houver número, é
 *     buscado pelo apelido do caso dentro do mesmo cliente (identificado pelo
 *     WhatsApp);
 *   • o cliente é criado se ainda não existir (sem marketing, sem mensagem);
 *   • o percentual é obrigatório (0–100); o valor é sempre **derivado** do
 *     `awardedAmount` do caso — nunca digitado diretamente na importação;
 *   • na importação só é aceito **1 parcela** (`installments > 1` é rejeitado;
 *     parcelas reais dependem do advogado e são criadas manualmente);
 *   • `CANCELED` é terminal; transições inválidas são recusadas;
 *   • o honorário importado não lança caixa, receita, lucro nem comissão;
 *     `shareWithClient` não se aplica (dados internos do escritório);
 *   • auditoria registra ids, status e campos alterados — nunca apelido,
 *     número do processo nem valores.
 */
import type { AppTx } from "@/libs/prismaClient";
import type { SuccessFeeStatus } from "@prisma/client";
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import { normalizeDate, normalizeInteger, normalizeMoney, normalizePhone } from "../utils/rowNormalization";
import { normalizeHeaderText } from "../utils/columnMapping";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { lookupClientByPhone, lookupStaff } from "./lookups";

export interface CaseFeeImportResult extends ProcessedRow {
  createdClientId?: string | null;
}

const FEE_STATUS_MAP: Record<string, SuccessFeeStatus> = {
  pendente: "PENDING",
  pending: "PENDING",
  faturado: "INVOICED",
  invoiced: "INVOICED",
  pago: "PAID",
  paid: "PAID",
  cancelado: "CANCELED",
  canceled: "CANCELED",
};

/** Situação do honorário; texto desconhecido vira PENDING com aviso. */
export function parseFeeStatus(raw: string): { value: SuccessFeeStatus; warning?: string } {
  const text = raw.trim();
  if (!text) return { value: "PENDING" };
  const mapped = FEE_STATUS_MAP[normalizeHeaderText(text)];
  if (mapped) return { value: mapped };
  return {
    value: "PENDING",
    warning: `Situação "${text}" não reconhecida; usando "Pendente".`,
  };
}

/** Aviso quando o número de parcelas não é 1 na importação. */
export function feeInstallmentsWarning(raw: string): { value: number; warning?: string } | null {
  const parsed = normalizeInteger(raw);
  if (parsed === null) return null;
  if (parsed <= 0) return null;
  if (parsed === 1) return { value: 1 };
  return {
    value: 1,
    warning: `Parcelas "${parsed}" não são aceitas na importação; o honorário entra com 1 parcela.`,
  };
}

/** Importa uma linha de honorário de êxito. */
export async function importCaseFeeRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<CaseFeeImportResult> {
  const warnings: string[] = [];

  const caseNumber = cellValue(row, context, "caseNumber").slice(0, 30);
  const caseName = cellValue(row, context, "caseName").slice(0, 120);

  // Localizar o caso: número CNJ primeiro; senão apelido + cliente.
  let targetCaseId: string | null = null;
  let clientId: string | null = null;
  let createdClientId: string | null = null;

  if (caseNumber) {
    const found = await tx.clientCase.findFirst({
      where: { barbershopId, caseNumber },
      select: { id: true, clientId: true },
    });
    if (!found) {
      return {
        status: "FAILED",
        entityType: "CASE_FEE",
        field: "caseNumber",
        message: `Processo com número "${caseNumber}" não encontrado. Importe o processo antes do honorário.`,
      };
    }
    targetCaseId = found.id;
    clientId = found.clientId;
  } else if (caseName) {
    // Sem número: precisa do cliente para identificar o caso pelo apelido.
    const rawPhone = cellValue(row, context, "clientWhatsapp");
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return {
        status: "FAILED",
        entityType: "CASE_FEE",
        field: "clientWhatsapp",
        message: rawPhone
          ? "Telefone do cliente inválido. Use DDD + número (10 ou 11 dígitos)."
          : "Telefone do cliente é obrigatório quando não há número do processo.",
      };
    }
    const existingClient = await lookupClientByPhone(tx, barbershopId, phone);
    if (!existingClient) {
      const createdClient = await tx.salonClient.create({
        data: {
          barbershopId,
          name: salonClientDisplayName(cellValue(row, context, "clientName")) ?? "Cliente importado",
          whatsapp: phone,
          normalizedWhatsapp: phone,
          marketingOptIn: false,
          marketingOptInAt: null,
          marketingOptInSource: null,
        },
        select: { id: true },
      });
      clientId = createdClient.id;
      createdClientId = createdClient.id;
    } else {
      clientId = existingClient.id;
    }

    const foundCase = await tx.clientCase.findFirst({
      where: {
        barbershopId,
        clientId,
        nickname: { equals: caseName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!foundCase) {
      return {
        status: "FAILED",
        entityType: "CASE_FEE",
        field: "caseName",
        message: `Processo "${caseName}" não encontrado para o cliente. Importe o processo antes do honorário.`,
      };
    }
    targetCaseId = foundCase.id;
  } else {
    return {
      status: "FAILED",
      entityType: "CASE_FEE",
      field: "caseNumber",
      message: "Número do processo ou apelido do caso é obrigatório.",
    };
  }

  // Percentual (obrigatório).
  const rawPercent = cellValue(row, context, "percent");
  const percent = rawPercent ? normalizeMoney(rawPercent) : null;
  if (percent === null || percent < 0 || percent > 100) {
    return {
      status: "FAILED",
      entityType: "CASE_FEE",
      field: "percent",
      message: "Percentual do honorário é obrigatório e deve estar entre 0 e 100.",
    };
  }

  // Situação do honorário.
  const status = parseFeeStatus(cellValue(row, context, "feeStatus"));
  if (status.warning) warnings.push(status.warning);

  // Vencimento.
  const rawDueDate = cellValue(row, context, "feeDueDate");
  const dueDateIso = rawDueDate ? normalizeDate(rawDueDate) : null;
  if (rawDueDate && !dueDateIso) {
    return {
      status: "FAILED",
      entityType: "CASE_FEE",
      field: "feeDueDate",
      message: "Data de vencimento inválida. Use dd/mm/aaaa.",
    };
  }

  // Parcelas: só 1 é aceito na importação.
  const rawInstallments = cellValue(row, context, "feeInstallments");
  const installmentsResult = rawInstallments ? feeInstallmentsWarning(rawInstallments) : { value: 1 };
  if (installmentsResult?.warning) warnings.push(installmentsResult.warning);

  // Observações.
  const notes = cellValue(row, context, "feeNotes").slice(0, 2000) || null;

  // Criar o honorário. O valor é derivado pelo repositório (base × percent / 100).
  const dueDate = dueDateIso ? new Date(`${dueDateIso}T00:00:00.000Z`) : null;

  const created = await tx.caseSuccessFee.create({
    data: {
      barbershopId,
      caseId: targetCaseId!,
      percent,
      installments: installmentsResult?.value ?? 1,
      dueDate,
      notes,
      status: status.value,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "CASE_FEE",
    entityId: created.id,
    warnings,
    createdClientId,
  };
}
```

### 8.3 `src/modules/dataImport/dataImportUseCases.ts` — linhas 295-330

`sed -n '295,330p' src/modules/dataImport/dataImportUseCases.ts`

```ts
            {
              sheetName: current.sheets[0]?.sheetName ?? batch.sheetName ?? null,
              targetType:
                current.sheets[0]?.targetType ?? (batch.targetType as ImportTargetType),
              columns: params.columns,
              options: params.options,
            },
          ]
        : [];

    if (!inputs.length) {
      throw new AppError("Mapeie as colunas da planilha antes de continuar.", 400);
    }

    const plan: ImportPlan = { sheets: [] };

    for (const input of inputs) {
      const columnMap = invertColumnMapping(input.columns);
      const fields = availableFields(input.targetType, segment);
      const validFields = new Set(fields.map((field) => field.key));

      for (const [field, column] of Object.entries(columnMap)) {
        if (!validFields.has(field as ImportFieldKey)) {
          throw new AppError(`Campo "${field}" não se aplica a este tipo de importação.`, 400);
        }
        if (!Number.isInteger(column) || column < 0) {
          throw new AppError("Mapa de colunas inválido.", 400);
        }
      }

      const missing = fields
        .filter((field) => field.required && columnMap[field.key] === undefined)
        .map((field) => getFieldLabel(field, segment));
      if (missing.length) {
        const sheetLabel = input.sheetName ? `aba "${input.sheetName}"` : "aba";
        throw new AppError(
```

### 8.4 `CASE_FEE_FIELDS` — lista de `key:`

`src/modules/dataImport/dataImport.constants.ts:795-844` (`CASE_FEE_FIELDS`),
registrado em `IMPORT_FIELDS_BY_TARGET` (`dataImport.constants.ts:859`).

`grep -n 'key:' src/modules/dataImport/dataImport.constants.ts` filtrado para o
bloco `CASE_FEE_FIELDS` (795-844):

```text
797:    key: "caseNumber",
805:    key: "percent",
813:    key: "feeStatus",
821:    key: "feeDueDate",
829:    key: "feeInstallments",
837:    key: "feeNotes",
```

São **6 chaves**, e só `caseNumber` e `percent` são `required: true`.

---

## 9. B6 — conferência visual das imagens SINTÉTICAS (Sessão 2)

3 imagens reabertas, **uma por chamada** (`caderno-01`, `cadastro-01`,
`cadastro-07` — os dois de menor acerto no `eval --sintetico`). Uma linha por
imagem + comparação com o ground truth:

| Imagem | O que se vê (1 linha) | Confere com o ground truth? | Erro do OCR simulado |
|---|---|---|---|
| `imagens/caderno-01.png` | Caderno de honorários manuscrito ("Caderno de Honorários") com 2 registros (Lucas Rodrigues e Gustavo Lima), cada um com processo, telefone, tipo sucumbência, parcela, situação, valor em R$, %, vencimento e data de pagamento. | **Sim** — as 2 linhas do `ground-truth/caderno-01.csv` batem com o que está escrito (inclusive o telefone mascarado por pontuação: `(51) 92674-4145` → `51926744145`). | Nenhum (`caderno-01.csv`: 20/20 células, 100%). |
| `imagens/cadastro-01.png` | Tela escura de terminal ("Honorários de êxito [ SISTEMA ANTIGO v2.3 ]") com cabeçalho Cliente/Telefone/Processo/Tipo/Valor (R$)/%/Parcela/Vencimento/Pagamento/Status e 1 linha (Juliana Oliveira). | **Sim** — a linha do `ground-truth/cadastro-01.csv` bate; o telefone da imagem é `(85) 2632-8043` → `8526328043` (10 dígitos). | O OCR **simulado** leu `852632804` (perdeu o último dígito): 1 erro de campo `telefone`, que **não** passa em `normalizePhone` (9 dígitos é rejeitado) — por isso não entra como "falso confiante". |
| `imagens/cadastro-07.png` | Tabela clara "Honorários de êxito" com 3 linhas (nomes sintéticos), mesmos 10 campos, todas com o processo `0046868-56.2025.8.26.0100`. | **Sim** — as 3 linhas do `ground-truth/cadastro-07.csv` batem; em especial o status da 2ª linha é **"pendente"**. | O OCR **simulado** escreveu `pago` no status da 2ª linha: erro de campo `status` que **passa** pelo `FEE_STATUS_MAP` (§2.7) — `status` **tem** normalizador, então **conta** como falso confiante (§6). |

Conclusão: os erros apontados pelo `eval --sintetico` nestas 3 imagens são
**erros do OCR simulado**, não do ground truth — o GT bate com o que está
desenhado na imagem.

**Números do sintético (Sessão 8).** `eval.py --sintetico`: **156 células,
153 corretas (98,1%)**, taxa de erro ponderada **0,0138** e **2 falsos
confiantes** (`percentual_exito` e `status`). Antes (Sessão 7) eram 156/153
(98,1%), 0,0138 e **1** falso confiante. A diferença é de **critério**, não
de qualidade: o erro de `status` do `cadastro-07` é o mesmo de sempre — ele
saiu da conta só porque a Sessão 7 tratou `status` como campo de texto sem
normalizador. Com `status` de volta no `FEE_STATUS_MAP` (§2.7), ele volta a
contar: 2 = os mesmos 2 erros de antes da Sessão 7.
