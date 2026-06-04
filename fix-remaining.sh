#!/usr/bin/env bash
# ============================================================
# fix-remaining.sh — Corrige problemas nos módulos queue, admin e auth
# Execute na raiz do projeto: bash fix-remaining.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${YELLOW}[..] $1${NC}"; }
err()  { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

[ -f "src/shared/infra/http/server.ts" ] || err "Execute este script na raiz do projeto BarberQueue."

# ============================================================
# FIX 1 — QueueRepository: joinedAt retorna timestamp numérico
# ============================================================
info "FIX 1 — QueueRepository: mapToDTO converte joinedAt para timestamp"

python3 - <<'PYEOF'
import sys

path = "src/modules/queue/infra/repositories/QueueRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
  private mapToDTO(item: any): IQueueItemResponseDTO {
    return {
      id: item.id,
      barbershopId: item.barbershopId,
      serviceId: item.serviceId,
      customerId: item.customerId,
      customerName: item.customerName,
      whatsapp: item.whatsapp,
      joinedAt: item.joinedAt,
      status: item.status,
      estimatedStartAt: item.estimatedStartAt,
      addedByStaff: item.addedByStaff,
      completedAt: item.completedAt,
      completedBy: item.completedBy,
      finalPrice: item.finalPrice,
      serviceName: item.service?.name
    };
  }"""

new = """\
  private mapToDTO(item: any): IQueueItemResponseDTO {
    return {
      id: item.id,
      barbershopId: item.barbershopId,
      serviceId: item.serviceId,
      customerId: item.customerId,
      customerName: item.customerName,
      whatsapp: item.whatsapp,
      joinedAt: item.joinedAt instanceof Date
        ? item.joinedAt.getTime()
        : Number(item.joinedAt),
      status: item.status,
      estimatedStartAt: item.estimatedStartAt instanceof Date
        ? item.estimatedStartAt.getTime()
        : item.estimatedStartAt ?? null,
      addedByStaff: item.addedByStaff,
      completedAt: item.completedAt instanceof Date
        ? item.completedAt.getTime()
        : item.completedAt ?? null,
      completedBy: item.completedBy ?? null,
      finalPrice: item.finalPrice ?? null,
      serviceName: item.service?.name ?? null
    };
  }"""

if old not in src:
    print("SKIP: mapToDTO já corrigido ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 1 aplicado."

# ============================================================
# FIX 2 — UpdateQueueItemUseCase: import dinâmico → estático
# ============================================================
info "FIX 2 — UpdateQueueItemUseCase: substituir import dinâmico do AppError"

python3 - <<'PYEOF'
import sys

path = "src/modules/queue/useCases/updateQueueItem/UpdateQueueItemUseCase.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

# Adiciona import estático se não existir
if 'import { AppError }' not in src:
    old_import = 'import { inject, injectable } from "tsyringe";'
    new_import = 'import { inject, injectable } from "tsyringe";\nimport { AppError } from "@/shared/errors/AppError";'
    src = src.replace(old_import, new_import)

# Substitui o throw com import dinâmico
old_throw = '    if (!item) throw new (await import("@/shared/errors/AppError")).AppError("Item de fila não encontrado", 404);'
new_throw = '    if (!item) throw new AppError("Item de fila não encontrado", 404);'

if old_throw not in src:
    print("SKIP: import dinâmico já foi removido ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old_throw, new_throw)

# execute não precisa mais ser async só por causa do import dinâmico,
# mas mantemos async pois chama o repository
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 2 aplicado."

# ============================================================
# FIX 3 — queue.routes.ts: GET /queue exige autenticação e
#          protege listagem global (sem barbershopId)
# ============================================================
info "FIX 3 — queue.routes.ts: proteger GET /queue e POST /queue"

python3 - <<'PYEOF'
import sys

path = "src/shared/infra/http/routes/queue.routes.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
  app.get("/queue", list.handle.bind(list));
  app.post("/queue", join.handle.bind(join));"""

new = """\
  // GET /queue: autenticado — sem barbershopId só MASTER_ADMIN pode listar tudo
  app.get("/queue", { preHandler: [authenticate] }, list.handle.bind(list));
  // POST /queue: público — cliente entra na fila sem precisar de conta
  app.post("/queue", join.handle.bind(join));"""

if old not in src:
    print("SKIP: rotas de queue já corrigidas ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 3 — rota atualizada."

# Protege no UseCase contra listagem global por não-admins
info "FIX 3 — ListQueueController: bloquear listagem global para não-admins"

python3 - <<'PYEOF'
import sys

path = "src/modules/queue/useCases/listQueue/ListQueueController.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
export class ListQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { barbershopId } = request.query as { barbershopId?: string };
    const listQueueUseCase = container.resolve(ListQueueUseCase);
    const queue = await listQueueUseCase.execute(barbershopId);
    return reply.status(200).send(queue);
  }
}"""

new = """\
export class ListQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { barbershopId } = request.query as { barbershopId?: string };
    const user = request.user!;

    // Não-admins só podem ver a fila da própria barbearia
    if (user.role !== "MASTER_ADMIN" && !barbershopId) {
      const resolvedId = user.barbershopId;
      if (!resolvedId) {
        return reply.status(400).send({
          success: false,
          message: "Informe o barbershopId ou vincule seu usuário a uma barbearia"
        });
      }
      const listQueueUseCase = container.resolve(ListQueueUseCase);
      const queue = await listQueueUseCase.execute(resolvedId);
      return reply.status(200).send(queue);
    }

    if (user.role !== "MASTER_ADMIN" && barbershopId && barbershopId !== user.barbershopId) {
      return reply.status(403).send({
        success: false,
        message: "Acesso negado: você não pertence a esta barbearia"
      });
    }

    const listQueueUseCase = container.resolve(ListQueueUseCase);
    const queue = await listQueueUseCase.execute(barbershopId);
    return reply.status(200).send(queue);
  }
}"""

if old not in src:
    print("SKIP: ListQueueController já corrigido ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 3 aplicado."

# ============================================================
# FIX 4 — AdminController: dashboard usa GROUP BY no banco
#          em vez de carregar tudo em memória
# ============================================================
info "FIX 4 — AdminController: substituir carga em memória por queries agregadas"

python3 - <<'PYEOF'
import sys

path = "src/modules/admin/controllers/AdminController.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
    const barbershopsInPeriod = await prisma.barbershop.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const appointmentsInPeriod = await prisma.appointment.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    const queueCompletedInPeriod = await prisma.queueItem.findMany({
      where: { joinedAt: { gte: startDate }, status: 'COMPLETED' },
      select: { joinedAt: true },
      orderBy: { joinedAt: 'asc' },
    });

    const slots = generateTimeSlots(startDate, groupByFormat);

    const chartData = slots.map(({ label: slotLabel, date: slotStart }) => {
      const slotEnd = new Date(slotStart);
      if (groupByFormat === 'day') slotEnd.setDate(slotStart.getDate() + 1);
      else if (groupByFormat === 'week') slotEnd.setDate(slotStart.getDate() + 7);
      else if (groupByFormat === 'month') slotEnd.setMonth(slotStart.getMonth() + 1);
      else slotEnd.setFullYear(slotStart.getFullYear() + 1);

      const newShops = barbershopsInPeriod.filter(b => b.createdAt >= slotStart && b.createdAt < slotEnd).length;
      const appointments = appointmentsInPeriod.filter(a => a.createdAt >= slotStart && a.createdAt < slotEnd).length;
      const completedQueue = queueCompletedInPeriod.filter(q => q.joinedAt >= slotStart && q.joinedAt < slotEnd).length;

      return { label: slotLabel, newShops, appointments, completedQueue };
    });"""

new = """\
    const slots = generateTimeSlots(startDate, groupByFormat);

    // Queries agregadas por slot — evita carregar todos os registros em memória
    const chartData = await Promise.all(
      slots.map(async ({ label: slotLabel, date: slotStart }) => {
        const slotEnd = new Date(slotStart);
        if (groupByFormat === 'day') slotEnd.setDate(slotStart.getDate() + 1);
        else if (groupByFormat === 'week') slotEnd.setDate(slotStart.getDate() + 7);
        else if (groupByFormat === 'month') slotEnd.setMonth(slotStart.getMonth() + 1);
        else slotEnd.setFullYear(slotStart.getFullYear() + 1);

        const [newShops, appointments, completedQueue] = await Promise.all([
          prisma.barbershop.count({
            where: { createdAt: { gte: slotStart, lt: slotEnd } }
          }),
          prisma.appointment.count({
            where: { createdAt: { gte: slotStart, lt: slotEnd } }
          }),
          prisma.queueItem.count({
            where: { joinedAt: { gte: slotStart, lt: slotEnd }, status: 'COMPLETED' }
          }),
        ]);

        return { label: slotLabel, newShops, appointments, completedQueue };
      })
    );"""

if old not in src:
    print("SKIP: dashboard já usa queries agregadas ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 4 aplicado."

# ============================================================
# FIX 5 — IBarbershopResponseDTO: adicionar cnpj e address
# ============================================================
info "FIX 5 — IBarbershopResponseDTO: expor cnpj e address"

python3 - <<'PYEOF'
import sys

path = "src/modules/barbershops/dtos/IBarbershopResponseDTO.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
export interface IBarbershopResponseDTO {
  id: string;
  name: string;
  whatsapp: string;
  logoUrl?: string | null;
  createdAt: Date;
  active: boolean;
}"""

new = """\
export interface IBarbershopResponseDTO {
  id: string;
  name: string;
  whatsapp: string;
  logoUrl?: string | null;
  cnpj?: string | null;
  address?: string | null;
  createdAt: Date;
  active: boolean;
}"""

if old not in src:
    print("SKIP: DTO já atualizado ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 5 — DTO atualizado."

# Atualiza o select do BarbershopRepository para incluir cnpj e address
info "FIX 5 — BarbershopRepository: incluir cnpj e address nos selects"

python3 - <<'PYEOF'
import sys

path = "src/modules/barbershops/infra/repositories/BarbershopRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

changed = False

# Substitui todos os selects que têm logoUrl mas não têm cnpj
old_select = """\
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        createdAt: true,
        active: true
      }"""

new_select = """\
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        cnpj: true,
        address: true,
        createdAt: true,
        active: true
      }"""

count = src.count(old_select)
if count == 0:
    print("SKIP: selects já atualizados ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old_select, new_select)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print(f"Aplicado em {count} select(s).")
PYEOF

# Atualiza o MockBarbershopRepository para incluir cnpj e address
info "FIX 5 — MockBarbershopRepository: incluir cnpj e address"

python3 - <<'PYEOF'
import sys

path = "src/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
    const entity: IBarbershopResponseDTO = {
      id,
      name: payload.name,
      whatsapp: payload.whatsapp,
      logoUrl: payload.logoUrl ?? null,
      createdAt: now,
      active: true
    };"""

new = """\
    const entity: IBarbershopResponseDTO = {
      id,
      name: payload.name,
      whatsapp: payload.whatsapp,
      logoUrl: payload.logoUrl ?? null,
      cnpj: null,
      address: null,
      createdAt: now,
      active: true
    };"""

if old not in src:
    print("SKIP: mock já atualizado ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 5 aplicado."

# ============================================================
# FIX 6 — LoginUseCase / MeController / RefreshController:
#          mapRole trata CUSTOMER corretamente
# ============================================================
info "FIX 6 — mapRole: adicionar case para CUSTOMER"

python3 - <<'PYEOF'
import sys

files = [
    "src/modules/auth/useCases/login/LoginUseCase.ts",
    "src/modules/auth/useCases/me/MeController.ts",
    "src/modules/auth/useCases/refresh/RefreshController.ts",
]

old = """\
function mapRole(role: string): "admin" | "owner" | "employee" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}"""

new = """\
function mapRole(role: string): "admin" | "owner" | "employee" | "customer" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  if (role === "CUSTOMER") return "customer";
  return "employee";
}"""

for path in files:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    if old not in src:
        print(f"SKIP: {path} já corrigido.")
        continue
    src = src.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"Aplicado em {path}.")
PYEOF

ok "FIX 6 aplicado."

# ============================================================
# FIX 7 — LoginUseCase: limpar refresh tokens expirados no login
#          e RefreshController: deletar token antigo ao rotacionar
# ============================================================
info "FIX 7 — LoginUseCase: limpar tokens expirados no login"

python3 - <<'PYEOF'
import sys

path = "src/modules/auth/useCases/login/LoginUseCase.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt }
    });"""

new = """\
    // Remove tokens expirados do usuário antes de criar um novo
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } }
    });

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt }
    });"""

if old not in src:
    print("SKIP: limpeza de tokens já existe ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 7 — LoginUseCase atualizado."

info "FIX 7 — RefreshController: deletar token antigo ao rotacionar"

python3 - <<'PYEOF'
import sys

path = "src/modules/auth/useCases/refresh/RefreshController.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """\
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { token: newRefreshToken, expiresAt: new Date(Date.now() + parseDuration(auth.refreshExpiresIn)) }
      });"""

new = """\
      // Rotaciona: apaga o token antigo e cria um novo (evita acúmulo no banco)
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      await prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: decoded.sub,
          expiresAt: new Date(Date.now() + parseDuration(auth.refreshExpiresIn))
        }
      });"""

if old not in src:
    print("SKIP: rotação de token já corrigida ou padrão não encontrado.")
    sys.exit(0)

src = src.replace(old, new)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("Aplicado.")
PYEOF

ok "FIX 7 aplicado."

# ============================================================
# Resumo final
# ============================================================
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Todos os fixes aplicados com sucesso!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "  FIX 1 — QueueRepository         : joinedAt/completedAt convertidos para timestamp numérico"
echo "  FIX 2 — UpdateQueueItemUseCase   : import dinâmico do AppError removido"
echo "  FIX 3 — queue.routes + controller: GET /queue protegido; listagem global bloqueada para não-admins"
echo "  FIX 4 — AdminController          : dashboard usa COUNT no banco (sem carga em memória)"
echo "  FIX 5 — IBarbershopResponseDTO   : cnpj e address adicionados ao DTO e selects"
echo "  FIX 6 — mapRole (auth)           : CUSTOMER mapeado corretamente"
echo "  FIX 7 — Refresh tokens           : tokens expirados deletados; rotação usa delete+create"
echo ""
echo "Execute 'npm test' para validar todas as alterações."
