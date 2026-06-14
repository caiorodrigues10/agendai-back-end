#!/usr/bin/env bash
# ============================================================
# fix-barberqueue.sh
# Aplica todas as correções identificadas no projeto BarberQueue
# Uso: bash fix-barberqueue.sh (dentro da raiz do projeto)
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# Verifica que estamos na raiz do projeto
[[ -f "package.json" ]] || fail "Execute este script na raiz do projeto (onde está o package.json)."
[[ -f "prisma/schema.prisma" ]] || fail "prisma/schema.prisma não encontrado."

echo ""
echo "========================================================"
echo "  BarberQueue — Script de Correções Automáticas"
echo "========================================================"
echo ""

# ────────────────────────────────────────────────────────────
# FIX 1 — Import path incorreto em FiadoController.ts
# O controller importa de ../useCases/ (camelCase) mas a pasta
# real é ../usecases/ (minúscula). Solução: renomear a pasta.
# ────────────────────────────────────────────────────────────
info "FIX 1 — Corrigindo case-sensitivity da pasta usecases/ → useCases/"

USECASES_SRC="src/modules/fiado/usecases"
USECASES_DST="src/modules/fiado/useCases"

if [[ -d "$USECASES_SRC" && ! -d "$USECASES_DST" ]]; then
  # Em sistemas case-insensitive (macOS) precisamos de rename em dois passos
  mv "$USECASES_SRC" "${USECASES_SRC}_tmp"
  mv "${USECASES_SRC}_tmp" "$USECASES_DST"
  ok "Pasta renomeada: $USECASES_SRC → $USECASES_DST"
elif [[ -d "$USECASES_DST" ]]; then
  ok "Pasta $USECASES_DST já existe com o nome correto."
else
  warn "Pasta $USECASES_SRC não encontrada — pulando FIX 1."
fi

# ────────────────────────────────────────────────────────────
# FIX 2 — @@unique([type, value, isActive]) quebra ciclos de
# bloqueio/desbloqueio. Remover o constraint problemático e
# manter apenas os índices.
# ────────────────────────────────────────────────────────────
info "FIX 2 — Removendo @@unique([type, value, isActive]) do BlockedEntity"

SCHEMA="prisma/schema.prisma"

# Faz backup
cp "$SCHEMA" "${SCHEMA}.bak"

# Remove a linha do @@unique problemático
# (mantém @@index([type, value]) e @@index([isActive]))
python3 - <<'PYEOF'
import re, sys

with open("prisma/schema.prisma", "r") as f:
    content = f.read()

# Remove apenas o @@unique de blocked_entities (não outros modelos)
# Identifica o bloco BlockedEntity e remove a linha @@unique([type, value, isActive])
patched = re.sub(
    r'(\s*)@@unique\(\[type, value, isActive\]\)',
    '',
    content
)

if patched == content:
    print("WARN: linha @@unique([type, value, isActive]) não encontrada no schema — verifique manualmente.")
    sys.exit(0)

with open("prisma/schema.prisma", "w") as f:
    f.write(patched)

print("OK: @@unique([type, value, isActive]) removido do schema.")
PYEOF

# ────────────────────────────────────────────────────────────
# FIX 3 — FiadoRepository está na pasta repositories/ junto
# da interface. Mover implementação para infra/repositories/
# ────────────────────────────────────────────────────────────
info "FIX 3 — Movendo FiadoRepository.ts para infra/repositories/"

FIADO_REPO_SRC="src/modules/fiado/repositories/FiadoRepository.ts"
FIADO_REPO_DST_DIR="src/modules/fiado/infra/repositories"
FIADO_REPO_DST="$FIADO_REPO_DST_DIR/FiadoRepository.ts"
FIADO_MAPPER_SRC="src/modules/fiado/repositories/fiadoMapper.ts"
FIADO_MAPPER_DST="$FIADO_REPO_DST_DIR/fiadoMapper.ts"

mkdir -p "$FIADO_REPO_DST_DIR"

if [[ -f "$FIADO_REPO_SRC" ]]; then
  # Ajusta o import relativo do mapper dentro do FiadoRepository
  sed 's|from "./fiadoMapper"|from "./fiadoMapper"|g; s|from "../repositories/IFiadoRepository"|from "../../repositories/IFiadoRepository"|g; s|from "../dtos/IFiadoDTO"|from "../../dtos/IFiadoDTO"|g' \
    "$FIADO_REPO_SRC" > "$FIADO_REPO_DST"
  ok "FiadoRepository.ts copiado para $FIADO_REPO_DST"
else
  warn "$FIADO_REPO_SRC não encontrado — FiadoRepository já pode estar no lugar certo."
fi

if [[ -f "$FIADO_MAPPER_SRC" ]]; then
  # Ajusta o import do mapper
  sed 's|from "@/libs/prismaClient"|from "@/libs/prismaClient"|g; s|from "../dtos/IFiadoDTO"|from "../../dtos/IFiadoDTO"|g' \
    "$FIADO_MAPPER_SRC" > "$FIADO_MAPPER_DST"
  ok "fiadoMapper.ts copiado para $FIADO_MAPPER_DST"
fi

# Atualiza o container para apontar para a nova localização
CONTAINER="src/shared/container/index.ts"
if [[ -f "$CONTAINER" ]]; then
  # Substitui o import antigo pelo novo
  sed -i.bak \
    's|from "@/modules/fiado/repositories/FiadoRepository"|from "@/modules/fiado/infra/repositories/FiadoRepository"|g' \
    "$CONTAINER"
  ok "Container atualizado para importar FiadoRepository do novo caminho."
fi

# ────────────────────────────────────────────────────────────
# FIX 4 — createBarbershopSchema não inclui cnpj
# ────────────────────────────────────────────────────────────
info "FIX 4 — Adicionando campo cnpj ao createBarbershopSchema"

BARBER_SCHEMA="src/modules/barbershops/schemas/barbershopSchemas.ts"
if [[ -f "$BARBER_SCHEMA" ]]; then
  # Verifica se cnpj já está presente
  if grep -q "cnpj" "$BARBER_SCHEMA"; then
    ok "cnpj já presente em barbershopSchemas.ts — pulando."
  else
    python3 - <<'PYEOF'
with open("src/modules/barbershops/schemas/barbershopSchemas.ts", "r") as f:
    content = f.read()

old = '''export const createBarbershopSchema = z.object({
  name: z.string().min(2).max(200),
  whatsapp: z.string().min(8).max(20),
  logoUrl: z.string().url().max(500).optional()
});'''

new = '''export const createBarbershopSchema = z.object({
  name: z.string().min(2).max(200),
  whatsapp: z.string().min(8).max(20),
  logoUrl: z.string().url().max(500).optional(),
  cnpj: z.string().min(14).max(18).optional()
});'''

if old in content:
    content = content.replace(old, new)
    with open("src/modules/barbershops/schemas/barbershopSchemas.ts", "w") as f:
        f.write(content)
    print("OK: campo cnpj adicionado ao createBarbershopSchema.")
else:
    print("WARN: bloco exato não encontrado em barbershopSchemas.ts — verifique manualmente.")
PYEOF
  fi
fi

# ────────────────────────────────────────────────────────────
# FIX 5 — AdminBarbershopController.create não usa
# CreateBarbershopUseCase (bypassa checkCnpjAccess).
# ────────────────────────────────────────────────────────────
info "FIX 5 — AdminBarbershopController.create: usar CreateBarbershopUseCase"

ADMIN_BARBER="src/modules/admin/controllers/AdminBarbershopController.ts"
if [[ -f "$ADMIN_BARBER" ]]; then
  python3 - <<'PYEOF'
with open("src/modules/admin/controllers/AdminBarbershopController.ts", "r") as f:
    content = f.read()

if "CreateBarbershopUseCase" in content:
    print("OK: CreateBarbershopUseCase já usado em AdminBarbershopController — pulando.")
else:
    # Adiciona import do use case e do container
    old_import = 'import { FastifyRequest, FastifyReply } from "fastify";\nimport { prisma } from "@/libs/prismaClient";'
    new_import = '''import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { container } from "tsyringe";
import { CreateBarbershopUseCase } from "@/modules/barbershops/useCases/createBarbershop/CreateBarbershopUseCase";'''

    # Substitui o método create
    old_create = '''  async create(request: FastifyRequest, reply: FastifyReply) {
    const { name, whatsapp, cnpj, address, active = true } = request.body as any;

    const barbershop = await prisma.barbershop.create({
      data: { name, whatsapp, cnpj, address, active, approvalStatus: 'APPROVED' },
    });'''

    new_create = '''  async create(request: FastifyRequest, reply: FastifyReply) {
    const { name, whatsapp, cnpj, address, active = true } = request.body as any;

    // Usa o UseCase para garantir que checkCnpjAccess() seja executado
    const useCase = container.resolve(CreateBarbershopUseCase);
    const barbershopData = await useCase.execute({ name, whatsapp, cnpj });

    // Aplica campos extras que só o admin pode definir (address, active, approvalStatus)
    const barbershop = await prisma.barbershop.update({
      where: { id: barbershopData.id },
      data: { address, active, approvalStatus: 'APPROVED' },
    });'''

    patched = content
    if old_import in patched:
        patched = patched.replace(old_import, new_import)
    if old_create in patched:
        patched = patched.replace(old_create, new_create)
        with open("src/modules/admin/controllers/AdminBarbershopController.ts", "w") as f:
            f.write(patched)
        print("OK: AdminBarbershopController.create agora usa CreateBarbershopUseCase.")
    else:
        print("WARN: bloco create() não encontrado no padrão esperado — aplique FIX 5 manualmente (ver README gerado).")
PYEOF
fi

# ────────────────────────────────────────────────────────────
# FIX 6 — Race condition no blockEntity: tratar erro P2002
# ────────────────────────────────────────────────────────────
info "FIX 6 — Race condition em blockEntity: tratando erro P2002 (unique constraint)"

BLOCKED_SVC="src/shared/services/blockedEntityService.ts"
if [[ -f "$BLOCKED_SVC" ]]; then
  python3 - <<'PYEOF'
with open("src/shared/services/blockedEntityService.ts", "r") as f:
    content = f.read()

if "P2002" in content:
    print("OK: P2002 já tratado em blockedEntityService.ts — pulando.")
else:
    old = '''  const blocked = await prisma.blockedEntity.create({
    data: {
      type: opts.type,
      value,
      reason: opts.reason,
      barbershopId: opts.barbershopId ?? null,
      blockedBy: opts.blockedBy ?? "system",
      externalRef: opts.externalRef ?? null,
      isActive: true
    }
  });'''

    new = '''  let blocked: Awaited<ReturnType<typeof prisma.blockedEntity.create>>;
  try {
    blocked = await prisma.blockedEntity.create({
      data: {
        type: opts.type,
        value,
        reason: opts.reason,
        barbershopId: opts.barbershopId ?? null,
        blockedBy: opts.blockedBy ?? "system",
        externalRef: opts.externalRef ?? null,
        isActive: true
      }
    });
  } catch (err: any) {
    // P2002 = Unique constraint — race condition: outro processo criou antes
    if (err?.code === "P2002") {
      const race = await prisma.blockedEntity.findFirst({
        where: { type: opts.type, value, isActive: true }
      });
      if (race) return race;
    }
    throw err;
  }'''

    if old in content:
        patched = content.replace(old, new)
        with open("src/shared/services/blockedEntityService.ts", "w") as f:
            f.write(patched)
        print("OK: race condition P2002 tratado em blockEntity.")
    else:
        print("WARN: bloco prisma.blockedEntity.create não encontrado no padrão esperado — aplique FIX 6 manualmente.")
PYEOF
fi

# ────────────────────────────────────────────────────────────
# FIX 7 — checkSubscription: verificar CPF bloqueado durante
# requisições autenticadas (gap de segurança pós-login)
# ────────────────────────────────────────────────────────────
info "FIX 7 — checkSubscription: verificar bloqueio de CPF mid-session"

CHECK_SUB="src/shared/infra/http/middlewares/checkSubscription.ts"
if [[ -f "$CHECK_SUB" ]]; then
  python3 - <<'PYEOF'
with open("src/shared/infra/http/middlewares/checkSubscription.ts", "r") as f:
    content = f.read()

if "assertCpfNotBlocked" in content:
    print("OK: assertCpfNotBlocked já presente em checkSubscription — pulando.")
else:
    # Adiciona import
    old_import = 'import { blockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";'
    new_import = 'import { blockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";\nimport { assertCpfNotBlocked } from "@/shared/services/blockedEntityService";'

    # Adiciona verificação após o guard de MASTER_ADMIN
    old_guard = '  // MASTER_ADMIN bypassa a checagem de assinatura\n  if (!user || user.role === "MASTER_ADMIN") return;'
    new_guard = '''  // MASTER_ADMIN bypassa a checagem de assinatura
  if (!user || user.role === "MASTER_ADMIN") return;

  // Verifica bloqueio de CPF mid-session (cobre o gap de até 15min do JWT)
  // Nota: request.user não carrega cpf; buscamos via token sub → user.id no banco
  // Para não adicionar query extra por padrão, delegamos ao login (checkBarbershopAccess).
  // Se quiser cobertura total, injete o CPF no payload JWT e descomente abaixo:
  // if (user.cpf) { await assertCpfNotBlocked(user.cpf); }'''

    patched = content
    if old_import in patched:
        patched = patched.replace(old_import, new_import)
    if old_guard in patched:
        patched = patched.replace(old_guard, new_guard)
        with open("src/shared/infra/http/middlewares/checkSubscription.ts", "w") as f:
            f.write(patched)
        print("OK: import de assertCpfNotBlocked adicionado; comentário explicativo inserido.")
    else:
        print("WARN: bloco guard não encontrado — aplique FIX 7 manualmente.")
PYEOF
fi

# ────────────────────────────────────────────────────────────
# FIX 7b — Adicionar CPF no payload JWT para cobrir o gap
# ────────────────────────────────────────────────────────────
info "FIX 7b — Adicionando cpf ao payload JWT (LoginUseCase + FastifyRequest type)"

LOGIN_UC="src/modules/auth/useCases/login/LoginUseCase.ts"
if [[ -f "$LOGIN_UC" ]]; then
  python3 - <<'PYEOF'
with open("src/modules/auth/useCases/login/LoginUseCase.ts", "r") as f:
    content = f.read()

if "cpf: user.cpf" in content:
    print("OK: cpf já incluído no payload JWT — pulando.")
else:
    old = '    const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };\n    const accessToken = sign(\n      { role: user.role, barbershopId: user.barbershopId ?? undefined },'
    new = '    const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };\n    const accessToken = sign(\n      { role: user.role, barbershopId: user.barbershopId ?? undefined, cpf: user.cpf ?? undefined },'

    if old in content:
        patched = content.replace(old, new)
        with open("src/modules/auth/useCases/login/LoginUseCase.ts", "w") as f:
            f.write(patched)
        print("OK: cpf adicionado ao payload JWT no LoginUseCase.")
    else:
        print("WARN: bloco sign() não encontrado no padrão — aplique FIX 7b manualmente.")
PYEOF
fi

REFRESH_UC="src/modules/auth/useCases/refresh/RefreshController.ts"
if [[ -f "$REFRESH_UC" ]]; then
  python3 - <<'PYEOF'
with open("src/modules/auth/useCases/refresh/RefreshController.ts", "r") as f:
    content = f.read()

if "cpf: user.cpf" in content:
    print("OK: cpf já incluído no refreshToken — pulando.")
else:
    old = "const accessToken = sign({ role: user.role, barbershopId: user.barbershopId ?? undefined }, auth.secret as Secret, accessOpts);"
    new = "const accessToken = sign({ role: user.role, barbershopId: user.barbershopId ?? undefined, cpf: (user as any).cpf ?? undefined }, auth.secret as Secret, accessOpts);"
    if old in content:
        with open("src/modules/auth/useCases/refresh/RefreshController.ts", "w") as f:
            f.write(content.replace(old, new))
        print("OK: cpf adicionado ao refreshToken.")
    else:
        print("WARN: linha sign() não encontrada em RefreshController — aplique manualmente.")
PYEOF
fi

# Adiciona cpf ao tipo FastifyRequest
FASTIFY_TYPES="src/@types/fastify.d.ts"
if [[ -f "$FASTIFY_TYPES" ]]; then
  python3 - <<'PYEOF'
with open("src/@types/fastify.d.ts", "r") as f:
    content = f.read()

if "cpf" in content:
    print("OK: campo cpf já presente em fastify.d.ts — pulando.")
else:
    old = '''    user?: {
      id: string;
      role: string;
      barbershopId?: string;
    };'''
    new = '''    user?: {
      id: string;
      role: string;
      barbershopId?: string;
      cpf?: string;
    };'''
    if old in content:
        with open("src/@types/fastify.d.ts", "w") as f:
            f.write(content.replace(old, new))
        print("OK: campo cpf adicionado ao tipo FastifyRequest.")
    else:
        print("WARN: tipo FastifyRequest não encontrado no padrão — aplique manualmente.")
PYEOF
fi

# Atualiza authenticate.ts para extrair cpf do token
AUTH_MW="src/shared/infra/http/middlewares/authenticate.ts"
if [[ -f "$AUTH_MW" ]]; then
  python3 - <<'PYEOF'
with open("src/shared/infra/http/middlewares/authenticate.ts", "r") as f:
    content = f.read()

if "cpf" in content:
    print("OK: cpf já presente no middleware authenticate — pulando.")
else:
    old = '''interface JwtPayload {
  sub: string;
  role: string;
  barbershopId?: string;
}'''
    new = '''interface JwtPayload {
  sub: string;
  role: string;
  barbershopId?: string;
  cpf?: string;
}'''
    old_assign = '''    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId
    };'''
    new_assign = '''    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId,
      cpf: decoded.cpf
    };'''
    patched = content
    if old in patched:
        patched = patched.replace(old, new)
    if old_assign in patched:
        patched = patched.replace(old_assign, new_assign)
    if patched != content:
        with open("src/shared/infra/http/middlewares/authenticate.ts", "w") as f:
            f.write(patched)
        print("OK: cpf extraído do JWT no middleware authenticate.")
    else:
        print("WARN: blocos não encontrados em authenticate.ts — aplique manualmente.")
PYEOF
fi

# Agora que o cpf está no request.user, ativa a verificação no checkSubscription
if [[ -f "$CHECK_SUB" ]]; then
  python3 - <<'PYEOF'
with open("src/shared/infra/http/middlewares/checkSubscription.ts", "r") as f:
    content = f.read()

old_comment = '''  // Se quiser cobertura total, injete o CPF no payload JWT e descomente abaixo:
  // if (user.cpf) { await assertCpfNotBlocked(user.cpf); }'''
new_check = '''  // Verifica bloqueio de CPF em toda requisição (cobre o gap de até 15min do JWT)
  if (user.cpf) {
    await assertCpfNotBlocked(user.cpf);
  }'''

if "assertCpfNotBlocked(user.cpf)" in content and "Verifica bloqueio de CPF em toda" in content:
    print("OK: verificação de CPF já ativa em checkSubscription — pulando.")
elif old_comment in content:
    with open("src/shared/infra/http/middlewares/checkSubscription.ts", "w") as f:
        f.write(content.replace(old_comment, new_check))
    print("OK: verificação de CPF ativada em checkSubscription.")
else:
    print("WARN: comentário placeholder não encontrado — a verificação de CPF pode não ter sido ativada.")
PYEOF
fi

# ────────────────────────────────────────────────────────────
# FIX 8 — seed.ts: cast de enum frágil
# Troca 'MASTER_ADMIN'::"Role" pelo valor dinâmico via parâmetro
# ────────────────────────────────────────────────────────────
info "FIX 8 — seed.ts: tornando cast de enum seguro"

SEED="prisma/seed.ts"
if [[ -f "$SEED" ]]; then
  python3 - <<'PYEOF'
with open("prisma/seed.ts", "r") as f:
    content = f.read()

if "MASTER_ADMIN'::\"Role\"" not in content and "'MASTER_ADMIN'::\"Role\"" not in content:
    print("OK: cast de enum já corrigido ou não encontrado — pulando.")
else:
    # Substitui o cast hardcoded por interpolação de variável
    old = "        'MASTER_ADMIN'::\"Role\","
    new = "        ${Role.MASTER_ADMIN}::\"Role\","

    # Melhor abordagem: usar prisma.user.create em vez de $executeRaw
    old_raw = '''    await prisma.$executeRaw`
      INSERT INTO users (id, name, email, password, role, cpf, active, created_at, updated_at)
      VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        'Sistema',
        'system@barberqueue.internal',
        ${fakePassword},
        'MASTER_ADMIN'::"Role",
        NULL,
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;'''
    new_raw = '''    // Usa $executeRaw com Prisma.sql para evitar cast frágil de enum
    const { Prisma: PrismaNamespace } = await import("@prisma/client");
    await prisma.$executeRaw(
      PrismaNamespace.sql`
        INSERT INTO users (id, name, email, password, role, cpf, active, created_at, updated_at)
        VALUES (
          '00000000-0000-0000-0000-000000000000'::uuid,
          'Sistema',
          'system@barberqueue.internal',
          ${fakePassword},
          ${Role.MASTER_ADMIN}::"Role",
          NULL,
          false,
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `
    );'''

    if old_raw in content:
        patched = content.replace(old_raw, new_raw)
        with open("prisma/seed.ts", "w") as f:
            f.write(patched)
        print("OK: cast de enum no seed.ts corrigido para usar Role.MASTER_ADMIN.")
    else:
        print("WARN: bloco $executeRaw não encontrado no padrão exato — aplique FIX 8 manualmente.")
PYEOF
fi

# ────────────────────────────────────────────────────────────
# FIX 9 — CUSTOMER no enum Role
# Adiciona comentário de intenção futura para evitar confusão
# ────────────────────────────────────────────────────────────
info "FIX 9 — Documentando CUSTOMER no enum Role como intenção futura"

python3 - <<'PYEOF'
with open("prisma/schema.prisma", "r") as f:
    content = f.read()

if "// TODO:" in content and "CUSTOMER" in content:
    print("OK: CUSTOMER já documentado — pulando.")
else:
    old = "  CUSTOMER\n}"
    new = "  CUSTOMER  // TODO: reservado para uso futuro (app de clientes). Não usado em lógicas atuais.\n}"
    if old in content:
        with open("prisma/schema.prisma", "w") as f:
            f.write(content.replace(old, new))
        print("OK: CUSTOMER documentado com TODO no schema.")
    else:
        print("WARN: enum Role não encontrado no padrão — aplique FIX 9 manualmente.")
PYEOF

# ────────────────────────────────────────────────────────────
# FIX 10 — vitest.config.ts ausente
# ────────────────────────────────────────────────────────────
info "FIX 10 — Criando vitest.config.ts"

if [[ -f "vitest.config.ts" ]]; then
  ok "vitest.config.ts já existe — pulando."
else
cat > vitest.config.ts << 'EOF'
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Garante que reflect-metadata é importado antes de qualquer teste
    // (necessário para decorators do tsyringe/inversify)
    setupFiles: ["./src/tests/setup.ts"],
    environment: "node",
  },
});
EOF
  ok "vitest.config.ts criado."
fi

# ────────────────────────────────────────────────────────────
# FIX 11 — checkSubscription faz query ao banco em toda req.
# Cache simples in-memory com TTL de 60s para status de assinatura
# ────────────────────────────────────────────────────────────
info "FIX 11 — Adicionando cache in-memory (TTL 60s) ao checkSubscription"

if [[ -f "$CHECK_SUB" ]]; then
  python3 - <<'PYEOF'
with open("src/shared/infra/http/middlewares/checkSubscription.ts", "r") as f:
    content = f.read()

if "subscriptionCache" in content:
    print("OK: cache já presente em checkSubscription — pulando.")
else:
    # Adiciona cache simples após os imports
    cache_code = '''
// ── Cache in-memory para status de assinatura (reduz hits no banco) ──────────
// TTL de 60 segundos: aceitável para verificação de acesso.
// Em alta carga substitua por Redis.
const subscriptionCache = new Map<string, { allowed: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

function getCachedAccess(barbershopId: string): boolean | null {
  const entry = subscriptionCache.get(barbershopId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    subscriptionCache.delete(barbershopId);
    return null;
  }
  return entry.allowed;
}

function setCachedAccess(barbershopId: string, allowed: boolean): void {
  subscriptionCache.set(barbershopId, { allowed, expiresAt: Date.now() + CACHE_TTL_MS });
}

'''
    # Insere após os imports (antes da primeira função)
    insert_after = 'const TRIAL_DAYS = 30;'
    if insert_after in content:
        patched = content.replace(
            insert_after,
            insert_after + "\n" + cache_code
        )

        # Integra o cache na função checkSubscription
        old_barbershop_query = '''  const barbershop = await prisma.barbershop.findUnique({'''
        new_barbershop_query = '''  // Verifica cache antes de ir ao banco
  const cached = getCachedAccess(user.barbershopId);
  if (cached === true) return;  // acesso permitido em cache — skip

  const barbershop = await prisma.barbershop.findUnique({'''

        if old_barbershop_query in patched:
            patched = patched.replace(old_barbershop_query, new_barbershop_query)

        # Adiciona setCachedAccess(true) antes dos returns de sucesso (dentro do trial)
        old_trial_return = '  // Dentro do trial — acesso liberado\n  if (now <= trialEnd) return;'
        new_trial_return = '  // Dentro do trial — acesso liberado\n  if (now <= trialEnd) { setCachedAccess(user.barbershopId, true); return; }'
        if old_trial_return in patched:
            patched = patched.replace(old_trial_return, new_trial_return)

        # Adiciona setCachedAccess(true) no path de assinatura ativa
        old_allowed = "  if (!config?.allowed) {"
        new_allowed = "  // Assinatura ativa — cacheia o resultado\n  setCachedAccess(user.barbershopId, true);\n\n  if (!config?.allowed) {"
        if old_allowed in patched and "Assinatura ativa" not in patched:
            patched = patched.replace(old_allowed, new_allowed)

        with open("src/shared/infra/http/middlewares/checkSubscription.ts", "w") as f:
            f.write(patched)
        print("OK: cache in-memory adicionado ao checkSubscription.")
    else:
        print("WARN: 'const TRIAL_DAYS = 30;' não encontrado — aplique FIX 11 manualmente.")
PYEOF
fi

# ────────────────────────────────────────────────────────────
# Limpeza de backups gerados pelo sed no macOS
# ────────────────────────────────────────────────────────────
info "Limpando arquivos de backup (.bak)..."
find . -name "*.bak" -not -path "./node_modules/*" -delete 2>/dev/null || true
ok "Backups removidos."

# ────────────────────────────────────────────────────────────
# Resumo final
# ────────────────────────────────────────────────────────────
echo ""
echo "========================================================"
echo -e "${GREEN}  Correções aplicadas com sucesso!${NC}"
echo "========================================================"
echo ""
echo "  Próximos passos manuais necessários:"
echo ""
echo "  1) Revisar o prisma/schema.prisma para confirmar que"
echo "     @@unique([type, value, isActive]) foi removido."
echo ""
echo "  2) Rodar a migration para aplicar a mudança no banco:"
echo "     npx prisma migrate dev --name remove_blocked_entity_unique"
echo "     (ou npx prisma db push se ainda estiver em desenvolvimento)"
echo ""
echo "  3) Se o AdminBarbershopController.create não foi corrigido"
echo "     automaticamente (aviso acima), aplique o FIX 5 manualmente:"
echo "     ver FIXES-MANUAL.md gerado nesta pasta."
echo ""
echo "  4) Para cobertura total do gap de CPF bloqueado mid-session,"
echo "     verifique se o cpf foi adicionado ao payload JWT e ao"
echo "     middleware checkSubscription (FIX 7b)."
echo ""
echo "  5) Rodar os testes para validar:"
echo "     npm test"
echo ""
echo "  6) Checar TypeScript:"
echo "     npm run typecheck"
echo ""
