export type CnjCheckDigitStatus = "valid" | "invalid" | "unknown";

export function checkCnjCheckDigit(value: string): CnjCheckDigitStatus {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 20) return "unknown";

  const base = `${digits.slice(0, 7)}${digits.slice(9)}`;
  const checkDigit = BigInt(digits.slice(7, 9));
  const remainder = (BigInt(base) * 100n + checkDigit) % 97n;
  return remainder === 1n ? "valid" : "invalid";
}
