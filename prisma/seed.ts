import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "@prisma/client";
import { BcryptHashProvider } from "../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter: adapter as any } as any);

const defaultPlans = [
  {
    name: "Mensal",
    description: "Acesso completo à plataforma com cobrança mensal.",
    price: 20.0,
    maxEmployees: 5,
    features: [
      "Fila digital ilimitada",
      "Agendamentos online",
      "Até 5 funcionários",
      "Relatórios básicos",
      "Suporte via e-mail"
    ]
  },
  {
    name: "Anual",
    description: "Acesso completo à plataforma com cobrança anual. Economia de R$ 40,00 por ano.",
    price: 200.0,
    maxEmployees: 5,
    features: [
      "Fila digital ilimitada",
      "Agendamentos online",
      "Até 5 funcionários",
      "Relatórios básicos",
      "Suporte via e-mail",
      "2 meses grátis em relação ao plano mensal"
    ]
  }
];

async function main() {
  const hashProvider = new BcryptHashProvider();

  // ── Admin real ──────────────────────────────────────────────────────────────
  const adminEmail = "admin@barberqueue.local";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const password = await hashProvider.hash("admin123");
    await prisma.user.create({
      data: {
        name:     "Administrador",
        email:    adminEmail,
        password,
        role:     Role.MASTER_ADMIN,
        cpf:      null,  // MASTER_ADMIN não precisa de CPF
        active:   true
      }
    });
    console.log("✅ Admin criado");
  }

  // ── Usuário-sistema para AuditLogs de ações automáticas ─────────────────────
  // UUID fixo 00000000-...-0000 — não tem senha real, não pode fazer login.
  // $executeRaw porque o UUID fixo não pode ser gerado pelo @default(uuid()).
  const systemUser = await prisma.user.findUnique({
    where: { email: "system@barberqueue.internal" }
  });
  if (!systemUser) {
    const fakePassword = await hashProvider.hash(
      `system-${Date.now()}-${Math.random()}`
    );
    await prisma.$executeRaw`
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
    `;
    console.log("✅ Usuário-sistema criado");
  }

  // ── Planos padrão ────────────────────────────────────────────────────────────
  for (const plan of defaultPlans) {
    const existingPlan = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (!existingPlan) {
      await prisma.plan.create({ data: plan });
      console.log(`✅ Plano criado: ${plan.name}`);
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("✅ Seed concluído");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
