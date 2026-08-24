function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
): boolean {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB && startB < endA;
}

export interface IBatchSlot {
  date: string;
  time: string;
  staffId?: string | null;
}

/** True se dois slots do mesmo lote colidem (mesmo dia e mesmo profissional / qualquer). */
export function batchSlotsOverlap(
  slots: IBatchSlot[],
  durationMinutes: number
): boolean {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (slots[i].date !== slots[j].date) continue;
      const aStaff = slots[i].staffId ?? null;
      const bStaff = slots[j].staffId ?? null;
      const sameStaff = !aStaff || !bStaff || aStaff === bStaff;
      if (!sameStaff) continue;
      if (
        overlaps(
          timeToMinutes(slots[i].time),
          durationMinutes,
          timeToMinutes(slots[j].time),
          durationMinutes
        )
      ) {
        return true;
      }
    }
  }
  return false;
}
