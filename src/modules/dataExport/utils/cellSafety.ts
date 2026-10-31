/**
 * Segurança e formatação de células da exportação.
 *
 * Regras:
 *   • **Neutralização de fórmula** em TODA célula de texto vinda de usuário:
 *     prefixo `'` quando o valor começa por `=`, `+`, `@`, tab ou CR. O `-` é
 *     ambíguo (número negativo legítimo): só recebe o prefixo quando o resto
 *     NÃO parseia como número — negativos numéricos continuam numéricos.
 *   • **Anonimização** opcional (relatório para contador): nome parcial,
 *     telefone e e-mail mascarados.
 *   • Datas viram datas reais do Excel (formato `dd/mm/yyyy`); horas ficam
 *     como texto `HH:MM`; valores como números com formato monetário BRL;
 *     booleanos como "Sim"/"Não".
 */

/** Inicia com um caractere que o Excel interpretaria como fórmula? */
function startsWithFormulaChar(value: string): boolean {
  const first = value[0];
  return first === "=" || first === "+" || first === "@" || first === "\t" || first === "\r";
}

/** Não-numérico começando com "-" também é injeção (ex.: "-cmd"). */
function isDangerousNegative(value: string): boolean {
  if (!value.startsWith("-")) return false;
  // "-1.234,56", "-12", "-12.5" continuam números.
  return !/^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/.test(value);
}

/**
 * Converte o valor para string segura de célula.
 * Números e datas passam intactos (quem chama decide o tipo da célula).
 */
export function safeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (text === "") return null;
  if (startsWithFormulaChar(text) || isDangerousNegative(text)) return `'${text}`;
  return text;
}

/**
 * Converte para número de célula (moeda BRL).
 * Aceita "1.234,56", "1234.56", "1234,56", "R$ 80,00". Não-numérico → null.
 */
export function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value).trim().replace(/^R\$\s*/i, "");
  if (!text) return null;
  // Formato pt-BR: ponto = milhar, vírgula = decimal.
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "Sim" / "Não". */
export function safeBool(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value ? "Sim" : "Não";
}

/** ── Anonimização ─────────────────────────────────────────────────────────── */

/**
 * Nome parcial: "Maria da Silva" → "M*** d* S***"; nomes de 1 letra ficam "M*".
 * Telefone: "11987654321" → "119****4321". E-mail: "maria@x.com" → "m***@x.com".
 */
export function anonymizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts
    .map((part) =>
      part.length <= 1 ? `${part}*` : `${part[0]}${"*".repeat(Math.min(3, part.length - 1))}`,
    )
    .join(" ");
}

export function anonymizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "*".repeat(digits.length);
  return `${digits.slice(0, 3)}${"*".repeat(digits.length - 7)}${digits.slice(-4)}`;
}

export function anonymizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = String(email).split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}
