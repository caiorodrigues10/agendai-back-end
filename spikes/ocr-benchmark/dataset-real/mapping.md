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
| `src/modules/dataImport/dataImportUseCases.ts` | validação do mapa de colunas (316-333) |
| `src/modules/dataImport/utils/rowNormalization.ts` | `normalizeDate` (21+), `normalizePhone` (134-155), `normalizeMoney` (161-192), `normalizeInteger` (195-201) |
| `src/modules/dataImport/utils/numericText.ts` | `looksScientificNotation` |
| `src/shared/utils/cnj.ts` | `checkCnjCheckDigit` |
| `src/modules/clients/utils/ensureSalonClient.ts` | `salonClientWhatsappKey` (4-13) |
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

`dataImportUseCases.ts:325-333`:

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

`rowValidator.ts:968-979`:

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

`rowValidator.ts:984-1009`:

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
```

Na prática, com apenas 6 colunas aceitas, `clientWhatsapp` e `caseName` nunca
chegam ao validador: **toda linha de CASE_FEES precisa de `caseNumber`**.

### 2.5 O processo precisa já existir no sistema

`rowValidator.ts:1013-1035`:

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

`rowValidator.ts:1039-1047`:

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

`rowValidator.ts:1049-1057`:

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

`caseFeeImporter.ts:192` (observações) e o comentário de criação do honorário
(`caseFeeImporter.ts:194+`):

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
    // Vírgula como separador de milhar ("1,234") ou decimal ("50,00").
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

`numericText.ts` — `looksScientificNotation` (o expoente é **obrigatório**; um
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

`queueDuplicate.ts:2-7`:

```ts
export const STAFF_QUEUE_PLACEHOLDER_WHATSAPP = "00000000000";

export function isPlaceholderWhatsApp(whatsapp: string): boolean {
  const d = whatsapp.replace(/\D/g, "");
  return !d || d === STAFF_QUEUE_PLACEHOLDER_WHATSAPP;
}
```

`shared/utils/cnj.ts` — `checkCnjCheckDigit`:

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
| `numero_processo` | `caseNumber` | Texto, cortado em 30 caracteres (`rowValidator.ts:968`). | Linha falha ("Número do processo… é obrigatório"). | Número ilegível → célula marcada `incerto`; sem processo a linha falha. |
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

| Imagem | Colunas da imagem | Coluna CASE_FEES equivalente | O que aconteceria se fosse importada em CASE_FEES |
|---|---|---|---|
| `planilha-para-advogado.png` | N° Processo, Status, Grupo de Ação, Tipo de Ação, Cliente, Data Abertura, Valor da Ação (+ última coluna cortada na captura) | `numero_processo` ← "N° Processo" (formato `111.54.4574.47586-4`, **não** é CNJ: 15 dígitos, então `checkCnjCheckDigit` devolve `unknown`) | Falha em `percent` (a imagem não tem percentual). `status` ("ABERTO"/"FINALIZADO") não está no `FEE_STATUS_MAP` → cairia em PENDING com aviso. "Valor da Ação" não é coluna: o valor do honorário é derivado. |
| `planilha-controle-barbearia-1.jpg` | Data, Horário, Cliente, Funcionário, Serviço, Valor, Material usado, Qtd, Status, % comissão, Valor comissão, Observações | Nenhuma (`caseNumber` e `percent` não existem) | Falha em `percent`. "MARCADO/DESMARCADO/REALIZADO" e "% comissão do funcionário" não têm equivalência em `feeStatus`/`percent`. |
| `O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.png` | ID, Serviço, Porte, Duração, Preço Venda, Custo Produto, Custo Mão de Obra, Custo Total | Nenhuma — é tabela de **serviços** (alvo SERVICES), não de honorários | Não é importável em CASE_FEES. |
| `Planilha-para-Barbearia.png` | Dashboard: Receitas, Despesas, Resultado, Serviços × Produtos, TOP 7 de serviços e de produtos | Nenhuma — não é tabela de importação | Não é importável. Serve para medir leitura de números e rótulos de gráfico. |

Nomes das colunas do ground truth real e como foram transcritos:

| Arquivo real | Colunas do GT real | Observações da transcrição |
|---|---|---|
| `planilha-para-advogado.csv` | `numero_processo, status, grupo_acao, tipo_honorario, cliente, data_criacao, valor_total` | 15 linhas. "Grupo de Ação" e "Tipo de Ação" só existem nas 4 primeiras linhas (estão vazias nas demais). A última coluna da imagem ("De…") está **cortada** na captura e não foi transcrita. |
| `planilha-controle-barbearia-1.csv` | `data, horario, cliente, funcionario, servico, valor, material_usado, qtd_material, status, percentual_comissao, valor_comissao, observacoes` | 18 linhas. `incerto` em: "data" da 14ª linha (barra preta sobre a data) e "servico;cliente" da 2ª linha ("MACIQUAGEM" / "JOÃO"). |
| `O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.csv` | `id, servico, porte, duracao_min, preco_venda, custo_produto, custo_mao_de_obra, custo_total` | 18 linhas. |
| `Planilha-para-Barbearia.csv` | `secao, categoria, detalhe, valor` | 19 linhas: 3 indicadores, 2 linhas de Serviços × Produtos (percentual + valor) e 7+7 itens dos TOP 7. |

Convenções da transcrição real: valor monetário sem o prefixo `R$`
(`50.000,00`), percentual sem `%` (`30`), data como aparece na imagem
(`21/12/2022`, `07/10/21 - qui`). Todas as linhas saem com `revisado=nao`;
quem revisa troca para `sim` e o `eval.py --real` só pontua linhas revisadas.

---

## 6. Como o `eval.py` pontua

`dataset-real/eval.py` (dois modos: `--sintetico` e `--real`):

- **Alinhamento**: chave exata (`numero_processo` + `parcela`) primeiro; depois
  linhas sem `numero_processo`, por ordem de aparição; por fim as sobras com
  processo, pelo menor CER. Um dígito errado no processo vira **erro de campo**
  (nunca "ausente + extra").
- **Pesos**: `PESO_CAMPO` (processo 3, dinheiro 5, percentual/parcela 2, resto 1)
  e erro monetário ×`PESO_ERRO_MONETARIO` (5). Taxa de erro ponderada =
  `sum(peso*erro)/sum(peso)`.
- **Falso confiante**: célula errada cujo valor **passa** no normalizador de
  produção (telefone, moeda, DV de CNJ) — o erro entraria no sistema sem ser
  barrado.
- **`incerto`**: célula marcada no GT sai do placar de acerto/erro e é contada
  como "abstenção válida" (OCR vazio) ou "erro confiante" (OCR preencheu).
- Modo `--real` só usa linhas com `revisado=sim` e **não imprime valores**.

Testes: `dataset-real/test_eval.py` (15 casos) e `dataset-real/test_dataset_core.py`.

---

## 7. Limitações conhecidas

- `eval.py` reimplementa os normalizadores em Python (portas 1:1 testadas no
  `test_eval.py`); o `verificador-importacao.ts` roda as funções **reais** do
  TypeScript para conferência — é ele que fecha a divergência entre porta e
  produção.
- O `eval.py` não confere a existence do processo no banco (não há banco, por
  decisão do spike): a checagem de "processo não encontrado" fica para o
  importador real.
- O ground truth real foi transcrito por leitura visual; as 4 imagens são
  modelos de terceiros e servem para medir OCR, não para validar regras de
  negócio.
