import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "@prisma/client";
import { BcryptHashProvider } from "../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter: adapter as any } as any);

async function main() {
  const hashProvider = new BcryptHashProvider();
  const adminEmail = "admin@barberqueue.local";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const password = await hashProvider.hash("admin123");
    await prisma.user.create({
      data: {
        name: "Administrador",
        email: adminEmail,
        password,
        role: Role.MASTER_ADMIN,
        active: true
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed concluído");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
