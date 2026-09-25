type Row = Record<string, any>;

function whereMatches(row: Row, where?: Row | null): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some(sub => whereMatches(row, sub));
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("in" in c) return (c.in as any[]).includes(value);
      if ("equals" in c) return value === c.equals;
      return false;
    }
    return value === cond;
  });
}

export function createFakeDelegate(uniqueBy: string[] = [], seedRows: Row[] = []) {
  const rows: Row[] = [...seedRows];
  let seq = 0;
  const nextId = () => `fake-${++seq}`;
  return {
    rows,
    async findFirst(args?: Row) {
      return rows.find(r => whereMatches(r, args?.where)) ?? null;
    },
    async findUnique(args?: Row) {
      return rows.find(r => whereMatches(r, args?.where)) ?? null;
    },
    async findUniqueOrThrow(args?: Row) {
      const row = rows.find(r => whereMatches(r, args?.where));
      if (!row) {
        const error: any = new Error("Record not found");
        error.code = "P2025";
        throw error;
      }
      return row;
    },
    async create(args: Row) {
      const row: Row = { id: nextId(), ...args.data };
      rows.push(row);
      return row;
    },
    async createMany(args: Row) {
      let count = 0;
      for (const data of args.data as Row[]) {
        if (args.skipDuplicates && uniqueBy.length > 0) {
          if (rows.some(r => uniqueBy.every(k => r[k] === data[k]))) continue;
        }
        rows.push({ id: nextId(), ...data });
        count += 1;
      }
      return { count };
    },
    async update(args: Row) {
      const row = rows.find(r => whereMatches(r, args.where));
      if (!row) {
        const error: any = new Error("Record not found");
        error.code = "P2025";
        throw error;
      }
      Object.assign(row, args.data);
      return row;
    },
    async updateMany(args: Row) {
      let count = 0;
      for (const row of rows) {
        if (whereMatches(row, args.where)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
    async upsert(args: Row) {
      const row = rows.find(r => whereMatches(r, args.where));
      if (row) {
        Object.assign(row, args.update ?? {});
        return row;
      }
      const created: Row = { id: nextId(), ...args.create };
      rows.push(created);
      return created;
    },
    async count(args?: Row) {
      return rows.filter(r => whereMatches(r, args?.where)).length;
    },
  };
}

/**
 * Fake in-memory de PrismaClient/tx para specs de seed. Cobre apenas os
 * delegates/ops usados por seedBarbershopDefaults e prisma/seed.ts.
 */
export function createFakeSeedDb() {
  const rawValues: any[][] = [];
  const db: any = {
    user: createFakeDelegate(),
    plan: createFakeDelegate(),
    serviceCategory: createFakeDelegate(),
    service: createFakeDelegate(),
    schedule: createFakeDelegate(["barbershopId", "dayOfWeek"]),
    expenseCategory: createFakeDelegate(),
    productCategory: createFakeDelegate(["barbershopId", "name"]),
    appointmentPolicy: createFakeDelegate(),
    barbershopEmailSettings: createFakeDelegate(),
    profitSettings: createFakeDelegate(),
    loyaltyProgram: createFakeDelegate(),
    notificationPreference: createFakeDelegate(["barbershopId", "channel", "type"]),
    barbershop: createFakeDelegate(),
    $executeRaw: (...args: any[]) => {
      rawValues.push(args.slice(1));
      return Promise.resolve(0);
    },
    $transaction: async (fn: (tx: any) => any) => fn(db),
  };
  return { db, rawValues };
}
