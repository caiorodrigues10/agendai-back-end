const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

async function seed() {
  const shop = await prisma.barbershop.create({
    data: {
      id: randomUUID(),
      name: 'Barbearia Central',
      whatsapp: '11999999999',
      active: true,
      createdAt: new Date(),
    }
  });
  console.log('Barbearia:', shop.id);

  const svc1 = await prisma.service.create({
    data: {
      id: randomUUID(),
      barbershopId: shop.id,
      name: 'Corte',
      price: 45,
      avgTimeMinutes: 30,
      icon: 'Scissors',
      active: true,
    }
  });
  const svc2 = await prisma.service.create({
    data: {
      id: randomUUID(),
      barbershopId: shop.id,
      name: 'Barba',
      price: 30,
      avgTimeMinutes: 20,
      icon: 'Scissors',
      active: true,
    }
  });
  console.log('Servicos:', svc1.id, svc2.id);

  const staff = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: 'Carlos',
      email: 'carlos@test.com',
      password: 'hashed',
      role: 'OWNER',
      barbershopId: shop.id,
      active: true,
    }
  });
  console.log('Staff:', staff.id);

  console.log('\nAcesse http://localhost:5173/queue/' + shop.id);
}

seed().catch(console.error).finally(() => prisma.$disconnect());
