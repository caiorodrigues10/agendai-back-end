/**
 * Calcula joinedAt para inserir um cliente na fila WAITING (ordenada ASC).
 * insertAt = 0 → frente; insertAt = waiting.length → fim.
 */
export function computeInsertJoinedAt(waitingJoinedAtMs: number[], insertAt: number): Date {
  const n = waitingJoinedAtMs.length;
  const idx = Math.max(0, Math.min(Math.floor(insertAt), n));
  const now = Date.now();

  if (n === 0) return new Date(now);

  if (idx === 0) {
    return new Date(waitingJoinedAtMs[0] - 1000);
  }

  if (idx >= n) {
    return new Date(Math.max(now, waitingJoinedAtMs[n - 1] + 1000));
  }

  const prev = waitingJoinedAtMs[idx - 1];
  const next = waitingJoinedAtMs[idx];
  if (next - prev > 2) {
    return new Date(Math.floor((prev + next) / 2));
  }
  return new Date(prev + 1);
}
