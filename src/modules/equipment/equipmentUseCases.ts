import { EquipmentRepository } from "./equipmentRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type {
  createEquipmentSchema,
  updateEquipmentSchema,
  createMovementSchema,
  createNeedSchema,
  updateNeedSchema,
  equipmentListQuerySchema,
  movementListQuerySchema,
  needListQuerySchema,
  dashboardQuerySchema,
} from "./equipmentSchema";

type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
type CreateMovementInput = z.infer<typeof createMovementSchema>;
type CreateNeedInput = z.infer<typeof createNeedSchema>;
type UpdateNeedInput = z.infer<typeof updateNeedSchema>;
type ListQuery = z.infer<typeof equipmentListQuerySchema>;
type MovementQuery = z.infer<typeof movementListQuerySchema>;
type NeedQuery = z.infer<typeof needListQuerySchema>;
type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export class EquipmentUseCases {
  private repo = new EquipmentRepository();

  // ─── Equipment CRUD ──────────────────────────────────────

  async listEquipment(barbershopId: string, query: ListQuery) {
    return this.repo.listByBarbershop(barbershopId, {
      category: query.category,
      isActive: query.isActive,
      condition: query.condition,
      search: query.search,
    });
  }

  async getEquipment(id: string, barbershopId: string) {
    const equip = await this.repo.findById(id);
    if (!equip) throw new AppError("Equipamento não encontrado", 404);
    if (equip.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
    return equip;
  }

  async createEquipment(barbershopId: string, data: CreateEquipmentInput) {
    // Validate serialNumber uniqueness per barbershop (when not null)
    if (data.serialNumber) {
      const existing = await this.repo.findBySerialNumber(barbershopId, data.serialNumber);
      if (existing) {
        throw new AppError("Já existe um equipamento com este número de série nesta barbearia", 409);
      }
    }

    // Validate quantity bounds
    const qtyTotal = data.quantityTotal ?? 1;
    const qtyAvail = data.quantityAvailable ?? qtyTotal;
    if (qtyAvail > qtyTotal) {
      throw new AppError("Quantidade disponível não pode exceder a quantidade total", 400);
    }

    const equip = await this.repo.create({ ...data, barbershopId });

    // Auto-create EquipmentNeed if below minQuantity
    await this.checkAndCreateNeed(equip);

    return equip;
  }

  async updateEquipment(id: string, barbershopId: string, data: UpdateEquipmentInput) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Equipamento não encontrado", 404);
    if (existing.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);

    // Validate serialNumber uniqueness (if changed)
    if (data.serialNumber !== undefined && data.serialNumber !== existing.serialNumber) {
      if (data.serialNumber) {
        const dup = await this.repo.findBySerialNumber(barbershopId, data.serialNumber);
        if (dup && dup.id !== id) {
          throw new AppError("Já existe um equipamento com este número de série nesta barbearia", 409);
        }
      }
    }

    // Validate quantity bounds
    const newQtyTotal = data.quantityTotal ?? existing.quantityTotal;
    const newQtyAvail = data.quantityAvailable ?? existing.quantityAvailable;

    if (newQtyAvail > newQtyTotal) {
      throw new AppError("Quantidade disponível não pode exceder a quantidade total", 400);
    }

    const updated = await this.repo.update(id, data);

    // Auto-create EquipmentNeed if below minQuantity
    await this.checkAndCreateNeed(updated);

    return updated;
  }

  async deleteEquipment(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Equipamento não encontrado", 404);
    if (existing.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
    return this.repo.delete(id);
  }

  // ─── Movements ───────────────────────────────────────────

  async listMovements(barbershopId: string, query: MovementQuery) {
    return this.repo.listMovements(barbershopId, {
      equipmentId: query.equipmentId,
      type: query.type,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    });
  }

  async createMovement(barbershopId: string, data: CreateMovementInput, staffId?: string) {
    const equip = await this.repo.findById(data.equipmentId);
    if (!equip) throw new AppError("Equipamento não encontrado", 404);
    if (equip.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);

    const qty = data.quantity;

    // Validate quantity available won't go negative
    if (data.type === "out" || data.type === "maintenance" || data.type === "loss") {
      if (equip.quantityAvailable < qty) {
        throw new AppError(
          `Estoque insuficiente. Disponível: ${equip.quantityAvailable}, solicitado: ${qty}`,
          400
        );
      }
    }

    // Calculate new quantities
    let newQtyAvailable = equip.quantityAvailable;
    if (data.type === "in") {
      newQtyAvailable = Math.min(equip.quantityAvailable + qty, equip.quantityTotal);
    } else if (data.type === "out" || data.type === "loss") {
      newQtyAvailable = equip.quantityAvailable - qty;
    } // maintenance and adjustment don't change quantity

    // Validate quantityAvailable won't exceed quantityTotal
    if (newQtyAvailable > equip.quantityTotal) {
      throw new AppError("Quantidade disponível não pode exceder a quantidade total", 400);
    }
    if (newQtyAvailable < 0) {
      throw new AppError("Quantidade disponível não pode ser negativa", 400);
    }

    // Create movement and update quantity atomically
    const [movement] = await Promise.all([
      this.repo.createMovement({ ...data, barbershopId, staffId }),
      this.repo.updateQuantity(data.equipmentId, newQtyAvailable),
    ]);

    // Auto-create EquipmentNeed if below minQuantity
    const updated = await this.repo.findById(data.equipmentId);
    if (updated) await this.checkAndCreateNeed(updated);

    return movement;
  }

  // ─── Needs ───────────────────────────────────────────────

  async listNeeds(barbershopId: string, query: NeedQuery) {
    return this.repo.listNeeds(barbershopId, {
      status: query.status,
      priority: query.priority,
    });
  }

  async createNeed(barbershopId: string, data: CreateNeedInput) {
    return this.repo.createNeed({ ...data, barbershopId });
  }

  async updateNeed(id: string, barbershopId: string, data: UpdateNeedInput) {
    const existing = await this.repo.findNeedById(id);
    if (!existing) throw new AppError("Necessidade não encontrada", 404);
    if (existing.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
    return this.repo.updateNeed(id, data);
  }

  // ─── Dashboard ───────────────────────────────────────────

  async getDashboard(barbershopId: string, query: DashboardQuery) {
    const [summary, lowStockItems, pendingNeedsList, recentNeeds] = await Promise.all([
      this.repo.countByBarbershop(barbershopId),
      this.repo.getLowStockItems(barbershopId),
      this.repo.listNeeds(barbershopId, { status: "requested" }),
      this.repo.listNeeds(barbershopId),
    ]);

    return {
      ...summary,
      lowStockItems,
      pendingNeedsList: pendingNeedsList.slice(0, 10),
      recentNeeds: recentNeeds.slice(0, 5),
    };
  }

  // ─── Private helpers ─────────────────────────────────────

  private async checkAndCreateNeed(equip: { id: string; barbershopId: string; name: string; quantityAvailable: number; minQuantity: number }) {
    if (equip.minQuantity > 0 && equip.quantityAvailable < equip.minQuantity) {
      // Check if there's already an open REQUESTED need for this equipment
      const existing = await this.repo.listNeeds(equip.barbershopId, { status: "requested" });
      const alreadyHasNeed = existing.some((n: { equipmentId: string | null }) => n.equipmentId === equip.id);
      if (!alreadyHasNeed) {
        await this.repo.createNeed({
          barbershopId: equip.barbershopId,
          equipmentId: equip.id,
          name: `Reposição: ${equip.name}`,
          quantityNeeded: equip.minQuantity - equip.quantityAvailable + 1,
          priority: "high",
          reason: `Estoque abaixo do mínimo (disponível: ${equip.quantityAvailable}, mínimo: ${equip.minQuantity})`,
        });
      }
    }
  }
}
