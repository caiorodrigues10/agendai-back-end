/**
 * Regras de negócio das reservas de produto (compartilhadas pelo use case e
 * pelo repository — a fórmula precisa ser a mesma nos dois lados: o use case
 * faz o pré-check para devolver um erro amigável e o repository refaz o check
 * dentro da transação com o lock, que é a fonte da verdade contra corrida.
 */

export const RESERVATION_MAX_QUANTITY = 10;
export const RESERVATION_MIN_QUANTITY = 1;
/** Limite de reservas abertas (RESERVED e não vencidas) por WhatsApp no mesmo salão. */
export const RESERVATION_MAX_OPEN_PER_WHATSAPP = 3;
export const DEFAULT_RETENTION_HOURS = 48;

/**
 * Prazo de retenção da reserva (env `PRODUCT_RESERVATION_RETENTION_HOURS`, padrão 48h).
 * Não existe cron de expiração: a expiração é calculada a cada leitura (`expiresAt`).
 */
export function getReservationRetentionMs(): number {
  const raw = Number(process.env.PRODUCT_RESERVATION_RETENTION_HOURS || DEFAULT_RETENTION_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RETENTION_HOURS;
  return hours * 60 * 60 * 1000;
}

/**
 * Disponível para reserva = stockQty − soma das reservas RESERVED não vencidas.
 *
 * - `trackStock: false` → `null` (ilimitado, sempre disponível).
 * - `trackStock: true` → nunca negativo.
 *
 * Retorna `number | null` porque o estoque é `Float` (ex.: ML/KG) e a reserva é
 * inteira: `0.5` disponível não comporta `quantity: 1`, por isso o use case
 * compara `available < quantity` (e não `available <= 0`).
 */
export function computeAvailableQuantity(
  stockQty: number,
  trackStock: boolean,
  reservedQty: number,
): number | null {
  if (!trackStock) return null;
  return Math.max(0, Number(stockQty) - Number(reservedQty));
}
