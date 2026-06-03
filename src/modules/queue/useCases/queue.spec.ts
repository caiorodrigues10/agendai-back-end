import { describe, it, expect, beforeEach } from "vitest";
import { MockQueueRepository } from "@/modules/queue/infra/repositories/mocks/MockQueueRepository";
import { JoinQueueUseCase } from "./joinQueue/JoinQueueUseCase";
import { ListQueueUseCase } from "./listQueue/ListQueueUseCase";
import { UpdateQueueItemUseCase } from "./updateQueueItem/UpdateQueueItemUseCase";
import { DeleteQueueItemUseCase } from "./deleteQueueItem/DeleteQueueItemUseCase";
import { AppError } from "@/shared/errors/AppError";

let queues: MockQueueRepository;
let join: JoinQueueUseCase;
let list: ListQueueUseCase;
let update: UpdateQueueItemUseCase;
let del: DeleteQueueItemUseCase;

beforeEach(() => {
  queues = new MockQueueRepository();
  join = new JoinQueueUseCase(queues as any);
  list = new ListQueueUseCase(queues as any);
  update = new UpdateQueueItemUseCase(queues as any);
  del = new DeleteQueueItemUseCase(queues as any);
});

describe("Queue module", () => {
  it("join queue e lista por barbearia", async () => {
    const q1 = await join.execute({ barbershopId: "shop-1", customerName: "João", whatsapp: "5599", serviceId: "svc-1", customerId: "cust-1" });
    const q2 = await join.execute({ barbershopId: "shop-2", customerName: "Maria", whatsapp: "5598", serviceId: "svc-2", customerId: "cust-2" });
    const all = await list.execute();
    expect(all.length).toBe(2);
    const onlyShop1 = await list.execute("shop-1");
    expect(onlyShop1.length).toBe(1);
    expect(onlyShop1[0].id).toBe(q1.id);
    expect(q1.status).toBe("waiting");
  });

  it("atualiza status para in_chair e completed com preço informado", async () => {
    const q = await join.execute({ barbershopId: "shop-1", customerName: "Ana", whatsapp: "55", serviceId: "svc-1" , customerId: "cust-1" });
    const inChair = await update.execute(q.id, "in_chair");
    expect(inChair.status).toBe("in_chair");
    const completed = await update.execute(q.id, "completed", { completedBy: "staff-1", finalPrice: 50 });
    expect(completed.status).toBe("completed");
    expect(completed.finalPrice).toBe(50);
    expect(completed.completedBy).toBe("staff-1");
    expect(typeof completed.completedAt).toBe("number");
  });

  it("cancela item e remove do histórico", async () => {
    const q = await join.execute({ barbershopId: "shop-1", customerName: "Ana", whatsapp: "55", serviceId: "svc-1", customerId: "cust-1" });
    const cancelled = await update.execute(q.id, "cancelled");
    expect(cancelled.status).toBe("cancelled");
    await del.execute(q.id);
    const listAll = await list.execute();
    expect(listAll.find(i => i.id === q.id)).toBeUndefined();
  });

  it("lança erro ao atualizar item inexistente", async () => {
    await expect(update.execute("not-found", "completed")).rejects.toBeInstanceOf(AppError);
  });
});
