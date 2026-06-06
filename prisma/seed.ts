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
    price: 20.00,
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
    price: 200.00,
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

  const adminEmail = "admin@barberqueue.local";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const password = await hashProvider.hash("admin123");
    await prisma.user.create({
      data: { name: "Administrador", email: adminEmail, password, role: Role.MASTER_ADMIN, active: true }
    });
    console.log("✅ Admin criado");
  }

  for (const plan of defaultPlans) {
    const existingPlan = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (!existingPlan) {
      await prisma.plan.create({ data: plan });
      console.log(`✅ Plano criado: ${plan.name}`);
    }
  }
}

main()
  .then(async () => { await prisma.$disconnect(); console.log("Seed concluído"); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });