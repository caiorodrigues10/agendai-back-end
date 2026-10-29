/**
 * Registro na OAB do estabelecimento.
 *
 * Texto livre opcional, com validação leve de formato: a UF (2 letras) e o
 * número da inscrição. Não há consulta externa — o sistema não valida a
 * inscrição junto ao Counselho Federal.
 *
 * Entrada aceita: "sp 123.456", "SP-123456", "SP 123456".
 * Gravação: "SP 123456" (exibida no perfil como "OAB/SP nº 123456").
 */

const OAB_PATTERN = /^([A-Z]{2})\s*(\d{3,10})$/;

export function normalizeOabRegistration(value: string): string {
  const raw = value.trim().toUpperCase().replace(/[.\-/]/g, " ").replace(/\s+/g, " ");
  const match = OAB_PATTERN.exec(raw);
  if (!match) return raw;
  return `${match[1]} ${match[2]}`;
}

export function isValidOabRegistration(value: string): boolean {
  const normalized = normalizeOabRegistration(value);
  return normalized === "" || OAB_PATTERN.test(normalized);
}

/** Rótulo exibido no perfil público: "OAB/SP nº 123456". */
export function formatOabRegistration(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeOabRegistration(value);
  const match = OAB_PATTERN.exec(normalized);
  if (!match) return null;
  return `OAB/${match[1]} nº ${match[2]}`;
}
