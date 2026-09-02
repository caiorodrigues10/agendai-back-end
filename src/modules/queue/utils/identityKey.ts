/**
 * Computes a normalized identity key from phone and name.
 * Used to detect duplicate queue entries across different customer IDs.
 */
export function computeIdentityKey(phone: string, name: string): string {
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return `${normalizedPhone}:${normalizedName}`;
}
