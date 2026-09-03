import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { assertProductsInventoryCapability } from "@/shared/constants/productsInventory";

export async function checkProductsInventoryAccess(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError("Não autenticado", 401);
  if (user.role === "MASTER_ADMIN") {
    await assertProductsInventoryCapability(user.barbershopId || "master", user.role);
    return;
  }
  if (!user.barbershopId) throw new AppError("Usuário não vinculado a nenhum salão", 400);
  await assertProductsInventoryCapability(user.barbershopId, user.role);
}
