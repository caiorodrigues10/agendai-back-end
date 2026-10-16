/**
 * População de demonstração da ÚLTIMA conta criada no painel.
 *
 * Alvo fixo: salão "Salão" (`SHOP_ID`, Diadema) da dona dirce vieira dos
 * santos (`OWNER_ID`). Preenche com dados brasileiros realistas:
 *   equipe (3 funcionários + horários + serviços), 15 clientes, catálogo
 *   expandido, agenda passada concluída/futura confirmada, fila do dia,
 *   produtos com estoque, recebimentos e vendas, despesas + caixa, fiados,
 *   avaliações, fidelidade e eventos do CRM (recomendações/relatórios).
 *
 * Idempotente por marcação: aborta se já existir cliente no salão (ou seja,
 * já populado), a menos que `--force`, que apaga os dados populados do salão
 * e recria do zero. Guard de produção (`looksLikeProductionEnvironment`).
 *
 * Uso:
 *   npm run prisma:seed:last-account
 *   npm run prisma:seed:last-account -- --force
 *
 * Logins da equipe criados (senha única, local): caio.barbosa@gmail.com,
 * diego.ramos@gmail.com e felipe.nogueira@gmail.com — senha
 * `SEED_LAST_ACCOUNT_PASSWORD` (default `SenhaForte#123`).
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { BcryptHashProvider } from "../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider";
import { recordLedgerEntry } from "../src/modules/financial/ledger/financialLedger";
import { isValidCpf } from "../src/shared/utils/cpfUtils";
import { looksLikeProductionEnvironment } from "../prisma/seed";

export const SHOP_ID = "d8122a7c-1312-4c1d-b86e-a00c1572137b";
export const OWNER_ID = "df2eb53c-4286-432f-a077-f9fc7d61e3ac";
export const STAFF_PASSWORD = process.env.SEED_LAST_ACCOUNT_PASSWORD ?? "SenhaForte#123";
const COMMISSION_PERCENT = 40;
const ROUND = (value: number) => Math.round(value * 100) / 100;

const STAFF_SEED = [
	{
		name: "Caio Barbosa",
		email: "caio.barbosa@gmail.com",
		cpfBase: "148392765",
		schedule: [
			{ day: 1, from: "09:00", to: "19:00" },
			{ day: 2, from: "09:00", to: "19:00" },
			{ day: 3, from: "09:00", to: "19:00" },
			{ day: 4, from: "09:00", to: "19:00" },
			{ day: 5, from: "09:00", to: "19:00" },
			{ day: 6, from: "09:00", to: "17:00" },
		],
	},
	{
		name: "Diego Ramos",
		email: "diego.ramos@gmail.com",
		cpfBase: "257048193",
		schedule: [
			{ day: 1, from: "10:00", to: "19:00" },
			{ day: 2, from: "10:00", to: "19:00" },
			{ day: 3, from: "10:00", to: "19:00" },
			{ day: 4, from: "10:00", to: "19:00" },
			{ day: 5, from: "10:00", to: "19:00" },
			{ day: 6, from: "09:00", to: "17:00" },
		],
	},
	{
		name: "Felipe Nogueira",
		email: "felipe.nogueira@gmail.com",
		cpfBase: "364120857",
		schedule: [
			{ day: 2, from: "08:00", to: "18:00" },
			{ day: 3, from: "08:00", to: "18:00" },
			{ day: 4, from: "08:00", to: "18:00" },
			{ day: 5, from: "08:00", to: "18:00" },
			{ day: 6, from: "08:00", to: "18:00" },
		],
	},
];

const CLIENT_SEED = [
	{ name: "Anderson Souza", phone: "11987650001", notes: "Cliente desde 2024. Prefere máquina 1, sem desenhos na nuca.", optIn: true },
	{ name: "Marcos Vinícius Ferreira", phone: "11987650002", notes: "Chega sempre 10 min antes. Gosta de degradê baixo.", optIn: true },
	{ name: "Thiago Oliveira", phone: "11987650003", notes: "Trabalha perto, agenda no horário de almoço.", optIn: false },
	{ name: "Juliana Prado", phone: "11987650004", notes: "Cliente do marido e dos dois filhos.", optIn: true },
	{ name: "Rafael Mendonça", phone: "11987650005", notes: "Já ficou sem pagar (fiado) — cobrar na próxima visita.", optIn: false },
	{ name: "Paulo Sérgio Ramos", phone: "11987650006", notes: "Alergia a produtos com álcool — usar linha suave.", optIn: false },
	{ name: "Lucas Andrade", phone: "11987650007", notes: "Indicou 3 clientes em 2026.", optIn: true },
	{ name: "Gabriel Fernandes", phone: "11987650008", notes: "Só atende com o Caio.", optIn: false },
	{ name: "Eduardo Tavares", phone: "11987650009", notes: "Corte social para o trabalho, toda quinzena.", optIn: true },
	{ name: "Vinícius Correia", phone: "11987650010", notes: "Prefere horário final do dia.", optIn: false },
	{ name: "Felipe Cardoso", phone: "11987650011", notes: "Barba longa, usa óleo como finalizador.", optIn: false },
	{ name: "Matheus Ribeiro", phone: "11987650012", notes: "Trouxe o irmão pela primeira vez em setembro.", optIn: true },
	{ name: "Renata Batista", phone: "11987650013", notes: "Agenda das filhas (corte infantil).", optIn: false },
	{ name: "Camila Duarte", phone: "11987650014", notes: "Prefere atendimento em fim de semana.", optIn: true },
	{ name: "Rodrigo Teixeira", phone: "11987650015", notes: "Torcedor do Corinthians, sempre comenta na cadeira.", optIn: false },
];

const NEW_SERVICES = [
	{ name: "Corte degradê", price: 55, time: 40, icon: "scissors", category: "Cortes" },
	{ name: "Corte infantil", price: 40, time: 30, icon: "scissors", category: "Cortes" },
	{ name: "Barba terapia", price: 45, time: 30, icon: "user", category: "Barba" },
	{ name: "Hidratação capilar", price: 60, time: 30, icon: "sparkles", category: "Tratamentos" },
	{ name: "Limpeza de pele", price: 70, time: 45, icon: "sparkles", category: "Tratamentos" },
];

const PRODUCT_SEED = [
	{ name: "Pomada modeladora premium 120g", price: 42.9, cost: 26.5, stock: 18, sku: "SAL001", category: "Finalizadores", type: "RETAIL" },
	{ name: "Cera matte forte 100g", price: 38.9, cost: 23.0, stock: 14, sku: "SAL002", category: "Finalizadores", type: "RETAIL" },
	{ name: "Gel fixador extra forte 250g", price: 24.9, cost: 14.0, stock: 22, sku: "SAL003", category: "Finalizadores", type: "RETAIL" },
	{ name: "Óleo para barba 30ml", price: 36.9, cost: 21.0, stock: 16, sku: "SAL004", category: "Finalizadores", type: "RETAIL" },
	{ name: "Balm pós-barba 100g", price: 39.9, cost: 24.0, stock: 12, sku: "SAL005", category: "Finalizadores", type: "RETAIL" },
	{ name: "Shampoo anti-queda 400ml", price: 34.9, cost: 19.5, stock: 15, sku: "SAL006", category: "Higiene", type: "RETAIL" },
	{ name: "Condicionador nutritivo 400ml", price: 32.9, cost: 18.5, stock: 12, sku: "SAL007", category: "Higiene", type: "RETAIL" },
	{ name: "Shampoo 2-em-1 masculino 200ml", price: 27.9, cost: 15.0, stock: 20, sku: "SAL008", category: "Higiene", type: "RETAIL" },
	{ name: "Talco corporal 100g", price: 14.9, cost: 8.2, stock: 24, sku: "SAL009", category: "Higiene", type: "RETAIL" },
	{ name: "Protetor solar facial FPS 60", price: 49.9, cost: 30.0, stock: 10, sku: "SAL010", category: "Higiene", type: "RETAIL" },
	{ name: "Lâmina de navalha (pack 10)", price: 12.9, cost: 6.0, stock: 30, sku: "SAL011", category: "Consumíveis", type: "CONSUMABLE" },
	{ name: "Toalha de papel descartável 50un", price: 9.9, cost: 4.5, stock: 25, sku: "SAL012", category: "Consumíveis", type: "CONSUMABLE" },
];

const EXPENSE_SEED = [
	{ title: "Aluguel do salão", amount: 3200, category: "Aluguel", type: "FIXED", recurrence: "MONTHLY", ref: -16, paid: -16, method: "pix", supplier: "Imobiliária Vila Nova" },
	{ title: "Energia elétrica (Enel SP)", amount: 380, category: null, type: "VARIABLE", recurrence: "MONTHLY", ref: -6, paid: -6, method: "credit_card", supplier: "Enel SP" },
	{ title: "Água e esgoto (Sabesp)", amount: 145, category: null, type: "VARIABLE", recurrence: "MONTHLY", ref: -8, paid: -8, method: "pix", supplier: "Sabesp" },
	{ title: "Internet fibra 500MB", amount: 129, category: null, type: "FIXED", recurrence: "MONTHLY", ref: -11, paid: -11, method: "credit_card", supplier: "Vivo Fibra" },
	{ title: "Compra de produtos — Distribuidora Bela Vista", amount: 890, category: "Compra de estoque", type: "VARIABLE", recurrence: "ONCE", ref: -9, paid: -9, method: "pix", supplier: "Distribuidora Bela Vista" },
	{ title: "Taxa da maquininha (Cielo)", amount: 156.4, category: "Impostos e taxas", type: "VARIABLE", recurrence: "MONTHLY", ref: -4, paid: -4, method: "cash", supplier: "Cielo" },
	{ title: "Impulsionamento no Instagram", amount: 200, category: "Marketing", type: "INVESTMENT", recurrence: "ONCE", ref: -5, paid: -5, method: "credit_card", supplier: "Meta Ads" },
	{ title: "Salário — Caio Barbosa", amount: 2400, category: "Salários", type: "FIXED", recurrence: "MONTHLY", ref: -11, paid: -11, method: "pix", supplier: null },
	{ title: "Imposto Simples Nacional", amount: 620, category: "Impostos e taxas", type: "FIXED", recurrence: "MONTHLY", ref: -1, paid: null, method: null, supplier: "Receita Federal" },
];

const REVIEWS = [
	{ rating: 5, comment: "Corte impecável, saí muito satisfeito. Atendimento rápido e ambiente limpo." },
	{ rating: 5, comment: "Barba alinhada perfeitamente, melhor atendimento da região." },
	{ rating: 4, comment: "Gostei do corte, só demorou um pouco na fila." },
	{ rating: 5, comment: "Sempre pontual e atencioso. Recomendo demais." },
	{ rating: 5, comment: "Melhor degradê de Diadema, já virou meu ponto fixo." },
	{ rating: 4, comment: "Bom atendimento, voltarei mês que vem." },
];

const PAST_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30", "16:00", "17:00", "18:00"];
const FUTURE_PLAN = [
	{ offset: 0, times: ["09:30", "10:30", "11:30", "14:00", "15:30", "17:00"] },
	{ offset: 1, times: ["09:00", "10:00", "11:00", "15:00"] },
	{ offset: 3, times: ["09:30", "14:00", "16:00"] },
	{ offset: 4, times: ["10:00", "15:00"] },
];
const PAY_METHODS = ["pix", "cash", "credit_card", "debit_card"];

function addDays(base: Date, days: number): Date {
	const copy = new Date(base);
	copy.setDate(copy.getDate() + days);
	return copy;
}

function atTime(day: Date, time: string): Date {
	const [hour, minute] = time.split(":").map(Number);
	return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

function cpfFromBase(base: string): string {
	const digits = base.split("").map(Number);
	const digit = (slice: number[]) => {
		const total = slice.reduce((acc, value, index) => acc + value * (slice.length + 1 - index), 0);
		const remainder = (total * 10) % 11;
		return remainder === 10 || remainder === 11 ? 0 : remainder;
	};
	digits.push(digit(digits));
	digits.push(digit(digits));
	return digits.join("");
}

export interface SeedArgs {
	force: boolean;
}

export function parseSeedArgs(argv: string[]): SeedArgs {
	const args: SeedArgs = { force: false };
	for (const arg of argv) {
		if (arg === "--force") args.force = true;
		else throw new Error(`Argumento desconhecido: ${arg}`);
	}
	return args;
}

type Tx = any;

async function wipe(tx: Tx): Promise<void> {
	await tx.clientReview.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.retailSale.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.commissionEntry.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.cashMovement.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.profitEntry.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.fiado.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.queueItem.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.appointment.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.crmFinancialEvent.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.inventoryReceipt.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.stockMovement.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.product.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.expense.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.loyaltyAccount.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.staffService.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.staffSchedule.deleteMany({ where: { barbershopId: SHOP_ID } });
	await tx.user.deleteMany({
		where: { barbershopId: SHOP_ID, email: { in: STAFF_SEED.map((member) => member.email) } },
	});
	await tx.service.deleteMany({ where: { barbershopId: SHOP_ID, name: { in: NEW_SERVICES.map((s) => s.name) } } });
	await tx.serviceCategory.deleteMany({ where: { barbershopId: SHOP_ID, name: "Tratamentos" } });
	await tx.productCategory.deleteMany({ where: { barbershopId: SHOP_ID, name: "Consumíveis" } });
	await tx.salonClient.deleteMany({ where: { barbershopId: SHOP_ID } });
}

type CrmKind = "SERVICE_COMPLETED" | "FIADO_CREATED" | "FIADO_PAYMENT" | "PRODUCT_SOLD";

async function crmEvent(
	tx: Tx,
	input: {
		kind: CrmKind;
		sourceType: string;
		sourceId: string;
		clientId: string;
		grossAmount?: number;
		receivedAmount?: number;
		outstandingDelta?: number;
		occurredAt: Date;
	},
): Promise<void> {
	await tx.crmFinancialEvent.upsert({
		where: {
			barbershopId_sourceType_sourceId_kind: {
				barbershopId: SHOP_ID,
				sourceType: input.sourceType,
				sourceId: input.sourceId,
				kind: input.kind,
			},
		},
		create: {
			barbershopId: SHOP_ID,
			clientId: input.clientId,
			kind: input.kind,
			sourceType: input.sourceType,
			sourceId: input.sourceId,
			grossAmount: input.grossAmount ?? 0,
			receivedAmount: input.receivedAmount ?? 0,
			outstandingDelta: input.outstandingDelta ?? 0,
			occurredAt: input.occurredAt,
			metadata: null,
		},
		update: {},
	});
}

async function run(client: any, hashProvider: BcryptHashProvider, args: SeedArgs) {
	if (looksLikeProductionEnvironment()) {
		throw new Error("Seed da última conta bloqueado em ambiente de produção");
	}
	const staffCpfs = STAFF_SEED.map((member) => cpfFromBase(member.cpfBase));
	staffCpfs.forEach((cpf) => {
		if (!isValidCpf(cpf)) throw new Error(`CPF gerado inválido: ${cpf}`);
	});

	const existingClients = await client.salonClient.count({ where: { barbershopId: SHOP_ID } });
	if (existingClients > 0 && !args.force) {
		throw new Error(
			`O salão já tem ${existingClients} cliente(s) — população já aplicada. Use --force para apagar e recriar.`,
		);
	}
	const owner = await client.user.findUnique({ where: { id: OWNER_ID } });
	if (!owner) throw new Error("Dona da conta não encontrada; confira OWNER_ID.");

	const passwordHash = await hashProvider.hash(STAFF_PASSWORD);

	await client.$transaction(
		async (tx: Tx) => {
			await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${SHOP_ID}, TRUE)`;
			if (args.force) await wipe(tx);

			await tx.barbershop.update({
				where: { id: SHOP_ID },
				data: { operationMode: "HYBRID" },
			});

			const staff: Array<{ id: string; name: string }> = [];
			for (const [index, member] of STAFF_SEED.entries()) {
				const created = await tx.user.create({
					data: {
						name: member.name,
						email: member.email,
						password: passwordHash,
						role: "EMPLOYEE",
						barbershopId: SHOP_ID,
						cpf: staffCpfs[index],
						emailVerified: true,
						active: true,
					},
				});
				staff.push({ id: created.id, name: member.name });
				await tx.staffSchedule.createMany({
					data: member.schedule.map((entry) => ({
						barbershopId: SHOP_ID,
						staffId: created.id,
						dayOfWeek: entry.day,
						startTime: entry.from,
						endTime: entry.to,
					})),
					skipDuplicates: true,
				});
			}

			const categories = await tx.serviceCategory.findMany({
				where: { barbershopId: SHOP_ID },
				select: { id: true, name: true },
			});
			const categoryByName = new Map(categories.map((row: any) => [row.name, row.id]));
			if (!categoryByName.has("Tratamentos")) {
				const created = await tx.serviceCategory.create({
					data: { barbershopId: SHOP_ID, name: "Tratamentos", icon: "sparkles" },
				});
				categoryByName.set("Tratamentos", created.id);
			}

			const services: Array<{ id: string; name: string; price: number }> = [];
			const existingServices = await tx.service.findMany({
				where: { barbershopId: SHOP_ID },
				select: { id: true, name: true, price: true },
			});
			for (const service of existingServices) {
				await tx.service.update({
					where: { id: service.id },
					data: { commissionPercent: COMMISSION_PERCENT, active: true },
				});
				services.push({ id: service.id, name: service.name, price: service.price });
			}
			for (const service of NEW_SERVICES) {
				const created = await tx.service.create({
					data: {
						barbershopId: SHOP_ID,
						name: service.name,
						price: service.price,
						avgTimeMinutes: service.time,
						icon: service.icon,
						commissionPercent: COMMISSION_PERCENT,
						categoryId: categoryByName.get(service.category) ?? null,
					},
				});
				services.push({ id: created.id, name: created.name, price: created.price });
			}

			for (const member of staff) {
				for (const service of services) {
					await tx.staffService.createMany({
						data: {
							barbershopId: SHOP_ID,
							staffId: member.id,
							serviceId: service.id,
							isActive: true,
						},
						skipDuplicates: true,
					});
				}
			}

			const today = new Date();
			const clients: Array<{ id: string; name: string; whatsapp: string }> = [];
			for (const [index, clientSeed] of CLIENT_SEED.entries()) {
				const registeredAt = addDays(today, -(42 + (index % 5) * 7));
				const created = await tx.salonClient.create({
					data: {
						barbershopId: SHOP_ID,
						name: clientSeed.name,
						whatsapp: clientSeed.phone,
						normalizedWhatsapp: clientSeed.phone,
						notes: clientSeed.notes,
						marketingOptIn: clientSeed.optIn,
						marketingOptInAt: clientSeed.optIn ? registeredAt : null,
						marketingOptInSource: clientSeed.optIn ? "cadastro_manual" : null,
						createdAt: registeredAt,
					},
				});
				clients.push({ id: created.id, name: created.name, whatsapp: created.whatsapp });
			}

			const stats = new Map<string, { total: number; completed: number; noShow: number; cancelled: number }>();
			const bump = (clientId: string, status: string) => {
				const entry = stats.get(clientId) ?? { total: 0, completed: 0, noShow: 0, cancelled: 0 };
				entry.total += 1;
				if (status === "COMPLETED") entry.completed += 1;
				if (status === "NO_SHOW") entry.noShow += 1;
				if (status === "CANCELLED") entry.cancelled += 1;
				stats.set(clientId, entry);
			};

			const completed: Array<{ id: string; clientId: string; staffId: string; completedAt: Date }> = [];
			let sequence = 0;
			for (let offset = 1; offset <= 29; offset += 1) {
				const day = addDays(today, -offset);
				if (day.getDay() === 0) continue;
				const perDay = offset % 4 === 0 ? 2 : 1;
				for (let slot = 0; slot < perDay; slot += 1) {
					const service = services[sequence % services.length];
					const client = clients[(sequence + slot * 5) % clients.length];
					const professional = staff[sequence % staff.length];
					const time = PAST_SLOTS[sequence % PAST_SLOTS.length];
					let status = "COMPLETED";
					if (offset === 8 && slot === 0) status = "NO_SHOW";
					if (offset === 9 && slot === 0) status = "CANCELLED";
					if (offset === 17 && slot === 0) status = "NO_SHOW";
					if (offset === 24 && slot === 0) status = "CANCELLED";

					const base = {
						barbershopId: SHOP_ID,
						serviceId: service.id,
						staffId: professional.id,
						clientId: client.id,
						customerName: client.name,
						whatsapp: client.whatsapp,
						date: day,
						time,
					};
					let appointment;
					if (status === "CANCELLED") {
						appointment = await tx.appointment.create({
							data: {
								...base,
								status: "CANCELLED",
								canceledAt: atTime(day, time),
								cancellationSource: offset === 24 ? "STAFF" : "CUSTOMER",
								cancellationReason:
									offset === 24 ? "Profissional indisponível no dia" : "Cliente remarcou para outra semana",
							},
						});
					} else if (status === "NO_SHOW") {
						appointment = await tx.appointment.create({
							data: {
								...base,
								status: "NO_SHOW",
								noShowMarkedAt: atTime(day, time),
								noShowMarkedById: professional.id,
							},
						});
					} else {
						const discount = sequence % 5 === 3 ? 10 : 0;
						const finalPrice = Math.max(10, service.price - discount);
						const paymentMethod = PAY_METHODS[sequence % PAY_METHODS.length];
						const completedAt = atTime(day, time);
						appointment = await tx.appointment.create({
							data: {
								...base,
								status: "COMPLETED",
								finalPrice,
								paymentMethod,
								completedAt,
								completedBy: professional.id,
							},
						});
						await recordLedgerEntry(tx, {
							barbershopId: SHOP_ID,
							kind: "SERVICE_SALE",
							amount: finalPrice,
							paymentMethod,
							sourceType: "APPOINTMENT",
							sourceId: appointment.id,
							occurredAt: completedAt,
							professionalId: professional.id,
							clientId: client.id,
							description: `Atendimento: ${service.name}`,
							createdBy: professional.id,
						});
						await tx.commissionEntry.create({
							data: {
								barbershopId: SHOP_ID,
								appointmentId: appointment.id,
								serviceId: service.id,
								professionalId: professional.id,
								percentage: COMMISSION_PERCENT,
								amount: ROUND(finalPrice * (COMMISSION_PERCENT / 100)),
								createdAt: completedAt,
							},
						});
						await tx.queueItem.create({
							data: {
								barbershopId: SHOP_ID,
								serviceId: service.id,
								customerId: randomUUID(),
								customerName: client.name,
								whatsapp: client.whatsapp,
								clientId: client.id,
								appointmentId: appointment.id,
								joinedAt: new Date(completedAt.getTime() - 20 * 60_000),
								calledAt: new Date(completedAt.getTime() - 5 * 60_000),
								status: "COMPLETED",
								addedByStaff: true,
								completedAt,
								completedBy: professional.id,
								finalPrice,
								paymentMethod,
							},
						});
						completed.push({
							id: appointment.id,
							clientId: client.id,
							staffId: professional.id,
							completedAt,
						});
						await crmEvent(tx, {
							kind: "SERVICE_COMPLETED",
							sourceType: "appointment",
							sourceId: appointment.id,
							clientId: client.id,
							grossAmount: finalPrice,
							receivedAmount: finalPrice,
							occurredAt: completedAt,
						});
					}
					bump(client.id, status);
					sequence += 1;
				}
			}

			for (const plan of FUTURE_PLAN) {
				const day = addDays(today, plan.offset);
				if (day.getDay() === 0) continue;
				for (const [index, time] of plan.times.entries()) {
					const service = services[(plan.offset + index) % services.length];
					const client = clients[(plan.offset * 3 + index) % clients.length];
					const professional = staff[index % staff.length];
					await tx.appointment.create({
						data: {
							barbershopId: SHOP_ID,
							serviceId: service.id,
							staffId: professional.id,
							clientId: client.id,
							customerName: client.name,
							whatsapp: client.whatsapp,
							date: day,
							time,
							status: "CONFIRMED",
						},
					});
					bump(client.id, "CONFIRMED");
				}
			}

			const now = Date.now();
			const minutes = (value: number) => new Date(now - value * 60_000);
			const queuePlan = [
				{ status: "COMPLETED", joined: 75, called: 60, done: 45, service: 0, client: 1, price: 45, method: "pix" },
				{ status: "COMPLETED", joined: 110, called: 95, done: 70, service: 2, client: 4, price: 65, method: "cash" },
				{ status: "IN_CHAIR", joined: 42, called: 6, done: 0, service: 1, client: 2, price: 30, method: null },
				{ status: "WAITING", joined: 28, called: 0, done: 0, service: 4, client: 6, price: 70, method: null },
				{ status: "WAITING", joined: 17, called: 0, done: 0, service: 3, client: 9, price: 60, method: null },
				{ status: "WAITING", joined: 9, called: 0, done: 0, service: 0, client: 12, price: 45, method: null },
			];
			for (const [index, item] of queuePlan.entries()) {
				const service = services[item.service];
				const client = clients[item.client];
				const professional = staff[index % staff.length];
				const joinedAt = minutes(item.joined);
				const data: Record<string, unknown> = {
					barbershopId: SHOP_ID,
					serviceId: service.id,
					customerId: randomUUID(),
					customerName: client.name,
					whatsapp: client.whatsapp,
					clientId: client.id,
					joinedAt,
					status: item.status,
					addedByStaff: item.status !== "WAITING",
				};
				if (item.called > 0) data.calledAt = minutes(item.called);
				if (item.status === "WAITING") data.estimatedStartAt = new Date(now + (15 + index * 20) * 60_000);
				if (item.status === "COMPLETED") {
					data.completedAt = minutes(item.done);
					data.completedBy = professional.id;
					data.finalPrice = item.price;
					data.paymentMethod = item.method;
				}
				const created = await tx.queueItem.create({ data });
				if (item.status === "COMPLETED") {
					const completedAt = minutes(item.done);
					await recordLedgerEntry(tx, {
						barbershopId: SHOP_ID,
						kind: "SERVICE_SALE",
						amount: item.price,
						paymentMethod: item.method ?? "cash",
						sourceType: "QUEUE_ITEM",
						sourceId: created.id,
						occurredAt: completedAt,
						professionalId: professional.id,
						clientId: client.id,
						description: `Atendimento: ${service.name}`,
						createdBy: professional.id,
					});
					await tx.commissionEntry.create({
						data: {
							barbershopId: SHOP_ID,
							queueItemId: created.id,
							serviceId: service.id,
							professionalId: professional.id,
							percentage: COMMISSION_PERCENT,
							amount: ROUND(item.price * (COMMISSION_PERCENT / 100)),
							createdAt: completedAt,
						},
					});
					await crmEvent(tx, {
						kind: "SERVICE_COMPLETED",
						sourceType: "queue",
						sourceId: created.id,
						clientId: client.id,
						grossAmount: item.price,
						receivedAmount: item.price,
						occurredAt: completedAt,
					});
				}
			}

			const productCategories = await tx.productCategory.findMany({
				where: { barbershopId: SHOP_ID },
				select: { id: true, name: true },
			});
			const productCategoryByName = new Map(productCategories.map((row: any) => [row.name, row.id]));
			if (!productCategoryByName.has("Consumíveis")) {
				const created = await tx.productCategory.create({
					data: { barbershopId: SHOP_ID, name: "Consumíveis" },
				});
				productCategoryByName.set("Consumíveis", created.id);
			}

			const products: Array<{ id: string; name: string; price: number; cost: number; stock: number }> = [];
			for (const seed of PRODUCT_SEED) {
				const created = await tx.product.create({
					data: {
						barbershopId: SHOP_ID,
						name: seed.name,
						sku: seed.sku,
						salePrice: seed.price,
						averageCost: seed.cost,
						stockQty: 0,
						minStock: 2,
						active: true,
						type: seed.type,
						trackStock: true,
						categoryId: productCategoryByName.get(seed.category) ?? null,
					},
				});
				products.push({ id: created.id, name: created.name, price: seed.price, cost: seed.cost, stock: seed.stock });
			}

			const receiptDate = addDays(today, -9);
			const receipt = await tx.inventoryReceipt.create({
				data: {
					barbershopId: SHOP_ID,
					supplierName: "Distribuidora Bela Vista",
					receivedAt: atTime(receiptDate, "10:00"),
					paymentMethod: "pix",
					total: ROUND(products.reduce((sum, product) => sum + product.cost * product.stock, 0)),
					notes: "Estoque inicial do salão",
					createExpense: false,
					skipExpenseReason: "Despesa já lançada manualmente",
					createdById: OWNER_ID,
				},
			});
			for (const product of products) {
				await tx.inventoryReceiptItem.create({
					data: {
						barbershopId: SHOP_ID,
						receiptId: receipt.id,
						productId: product.id,
						quantity: product.stock,
						unitCost: product.cost,
					},
				});
				await tx.product.update({
					where: { id: product.id },
					data: { stockQty: product.stock, averageCost: product.cost },
				});
				await tx.stockMovement.create({
					data: {
						barbershopId: SHOP_ID,
						productId: product.id,
						type: "PURCHASE_RECEIPT",
						quantity: product.stock,
						unitCost: product.cost,
						stockBefore: 0,
						stockAfter: product.stock,
						sourceType: "inventory_receipt",
						sourceId: receipt.id,
						createdById: OWNER_ID,
						createdAt: atTime(receiptDate, "10:00"),
					},
				});
			}

			const retailSales = [
				{ offset: -8, time: "16:20", method: "pix", lines: [[0, 1], [3, 1]] },
				{ offset: -4, time: "11:05", method: "cash", lines: [[5, 2]] },
				{ offset: -2, time: "18:40", method: "credit_card", lines: [[1, 1], [10, 1]] },
			];
			for (const [index, saleSeed] of retailSales.entries()) {
				const soldAt = atTime(addDays(today, saleSeed.offset), saleSeed.time);
				const lines = saleSeed.lines.map(([productIndex, quantity]) => ({
					product: products[productIndex],
					quantity,
				}));
				const total = ROUND(lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0));
				const totalCost = ROUND(lines.reduce((sum, line) => sum + line.product.cost * line.quantity, 0));
				const sale = await tx.retailSale.create({
					data: {
						barbershopId: SHOP_ID,
						soldById: staff[index % staff.length].id,
						paymentMethod: saleSeed.method,
						subtotal: total,
						discount: 0,
						total,
						totalCost,
						status: "COMPLETED",
						soldAt,
						idempotencyKey: `seed-conta-ultima-${index + 1}`,
					},
				});
				for (const line of lines) {
					await tx.retailSaleLine.create({
						data: {
							barbershopId: SHOP_ID,
							saleId: sale.id,
							productId: line.product.id,
							productName: line.product.name,
							quantity: line.quantity,
							unitPrice: line.product.price,
							unitCost: line.product.cost,
						},
					});
					const before = line.product.stock;
					const after = before - line.quantity;
					await tx.product.update({ where: { id: line.product.id }, data: { stockQty: after } });
					await tx.stockMovement.create({
						data: {
							barbershopId: SHOP_ID,
							productId: line.product.id,
							type: "SALE",
							quantity: -line.quantity,
							unitCost: line.product.cost,
							stockBefore: before,
							stockAfter: after,
							sourceType: "RETAIL_SALE",
							sourceId: sale.id,
							createdById: staff[index % staff.length].id,
							createdAt: soldAt,
						},
					});
					line.product.stock = after;
				}
				await recordLedgerEntry(tx, {
					barbershopId: SHOP_ID,
					kind: "PRODUCT_SALE",
					amount: total,
					paymentMethod: saleSeed.method,
					sourceType: "RETAIL_SALE",
					sourceId: sale.id,
					occurredAt: soldAt,
					professionalId: staff[index % staff.length].id,
					description: "Venda de produtos",
					createdBy: staff[index % staff.length].id,
				});
				const retailClient = clients[index % clients.length];
				await crmEvent(tx, {
					kind: "PRODUCT_SOLD",
					sourceType: "retail_sale",
					sourceId: sale.id,
					clientId: retailClient.id,
					grossAmount: total,
					receivedAmount: total,
					occurredAt: soldAt,
				});
			}

			const expenseCategories = await tx.expenseCategory.findMany({
				where: { OR: [{ barbershopId: SHOP_ID }, { barbershopId: null }] },
				select: { id: true, name: true },
			});
			const expenseCategoryByName = new Map(expenseCategories.map((row: any) => [row.name, row.id]));
			for (const seed of EXPENSE_SEED) {
				const referenceDate = addDays(today, seed.ref);
				const created = await tx.expense.create({
					data: {
						barbershopId: SHOP_ID,
						categoryId: seed.category ? expenseCategoryByName.get(seed.category) ?? null : null,
						title: seed.title,
						amount: seed.amount,
						type: seed.type,
						recurrence: seed.recurrence,
						referenceDate,
						paidAt: seed.paid === null ? null : addDays(today, seed.paid),
						dueDate: seed.paid === null ? addDays(today, 4) : null,
						paymentMethod: seed.method,
						supplierName: seed.supplier,
						createdById: OWNER_ID,
					},
				});
				if (seed.paid !== null) {
					await recordLedgerEntry(tx, {
						barbershopId: SHOP_ID,
						kind: "EXPENSE",
						amount: seed.amount,
						paymentMethod: seed.method,
						sourceType: "EXPENSE",
						sourceId: created.id,
						occurredAt: addDays(today, seed.paid),
						description: seed.title,
						createdBy: OWNER_ID,
					});
				}
			}

			const fiadoPlan = [
				{ client: 1, description: "Corte + barba e pigmentação — fim de setembro", original: 180, paid: 60, due: 4, created: -12, status: "PARTIAL" },
				{ client: 4, description: "Corte degradê e sobrancelha — dia 12", original: 120, paid: 0, due: 9, created: -5, status: "PENDING" },
			];
			for (const plan of fiadoPlan) {
				const client = clients[plan.client];
				const fiado = await tx.fiado.create({
					data: {
						barbershopId: SHOP_ID,
						customerName: client.name,
						whatsapp: client.whatsapp,
						clientId: client.id,
						description: plan.description,
						originalAmount: plan.original,
						paidAmount: plan.paid,
						status: plan.status,
						dueDate: addDays(today, plan.due),
						origin: "MANUAL",
						createdById: OWNER_ID,
						createdAt: addDays(today, plan.created),
					},
				});
				await crmEvent(tx, {
					kind: "FIADO_CREATED",
					sourceType: "fiado",
					sourceId: fiado.id,
					clientId: client.id,
					grossAmount: plan.original,
					outstandingDelta: plan.original,
					occurredAt: fiado.createdAt,
				});
				if (plan.paid > 0) {
					const paymentDate = addDays(today, -3);
					const payment = await tx.fiadoPayment.create({
						data: {
							fiadoId: fiado.id,
							amount: plan.paid,
							paymentMethod: "pix",
							notes: "Pagamento parcial via Pix",
							registeredById: OWNER_ID,
							createdAt: paymentDate,
						},
					});
					await recordLedgerEntry(tx, {
						barbershopId: SHOP_ID,
						kind: "FIADO_PAYMENT",
						amount: plan.paid,
						paymentMethod: "pix",
						sourceType: "FIADO_PAYMENT",
						sourceId: payment.id,
						relatedSourceId: fiado.id,
						occurredAt: paymentDate,
						professionalId: OWNER_ID,
						clientId: client.id,
						description: "Recebimento de fiado",
						createdBy: OWNER_ID,
					});
					await crmEvent(tx, {
						kind: "FIADO_PAYMENT",
						sourceType: "fiado_payment",
						sourceId: payment.id,
						clientId: client.id,
						receivedAmount: plan.paid,
						outstandingDelta: -plan.paid,
						occurredAt: paymentDate,
					});
				}
			}

			const reviewTargets = completed.slice(0, REVIEWS.length);
			for (const [index, review] of REVIEWS.entries()) {
				const target = reviewTargets[index];
				await tx.clientReview.create({
					data: {
						barbershopId: SHOP_ID,
						appointmentId: target.id,
						clientId: target.clientId,
						staffId: target.staffId,
						rating: review.rating,
						comment: review.comment,
						status: "PUBLISHED",
						createdAt: addDays(target.completedAt, 1),
					},
				});
			}

			const loyaltyPlan = [
				{ client: 0, visits: 8, rewards: 1 },
				{ client: 1, visits: 6, rewards: 0 },
				{ client: 3, visits: 5, rewards: 0 },
				{ client: 6, visits: 4, rewards: 1 },
				{ client: 9, visits: 3, rewards: 0 },
			];
			for (const plan of loyaltyPlan) {
				const client = clients[plan.client];
				const account = await tx.loyaltyAccount.create({
					data: {
						barbershopId: SHOP_ID,
						clientId: client.id,
						totalVisits: plan.visits,
						rewardCount: plan.rewards,
					},
				});
				await tx.loyaltyLedgerEntry.create({
					data: {
						barbershopId: SHOP_ID,
						accountId: account.id,
						type: "VISIT_EARNED",
						description: "Visita registrada",
						idempotencyKey: `seed-conta-ultima-visita-${plan.client}`,
					},
				});
				if (plan.rewards > 0) {
					await tx.loyaltyLedgerEntry.create({
						data: {
							barbershopId: SHOP_ID,
							accountId: account.id,
							type: "REWARD_REDEEMED",
							description: "Recompensa resgatada",
							idempotencyKey: `seed-conta-ultima-recompensa-${plan.client}`,
						},
					});
				}
			}

			for (const [clientId, entry] of stats.entries()) {
				const visits = entry.completed + entry.noShow + entry.cancelled;
				await tx.salonClient.update({
					where: { id: clientId },
					data: {
						totalAppointments: entry.total,
						totalNoShows: entry.noShow,
						totalCancellations: entry.cancelled,
						attendanceRate: visits > 0 ? ROUND((entry.completed / visits) * 100) : null,
					},
				});
			}
		},
		{ maxWait: 15_000, timeout: 180_000 },
	);
}

export async function countRows(client: any): Promise<Record<string, number>> {
	const tables = [
		"users",
		"salon_clients",
		"services",
		"service_categories",
		"appointments",
		"queue",
		"commission_entries",
		"cash_movements",
		"products",
		"inventory_receipts",
		"stock_movements",
		"retail_sales",
		"expenses",
		"fiados",
		"fiado_payments",
		"client_reviews",
		"loyalty_accounts",
		"crm_financial_events",
		"staff_schedules",
		"staff_services",
	];
	const counts: Record<string, number> = {};
	for (const table of tables) {
		const where =
			table === "fiado_payments"
				? `FROM ${table} fp JOIN fiados f ON f.id = fp."fiadoId" WHERE f."barbershopId" = $1`
				: `FROM ${table} WHERE "barbershopId" = $1`;
		const result: Array<{ count: string }> = await client.$queryRawUnsafe(
			`SELECT count(*)::text AS count ${where}`,
			SHOP_ID,
		);
		counts[table] = Number(result[0].count);
	}
	return counts;
}

function createClient() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("DATABASE_URL não configurada");
	const pool = new Pool({ connectionString });
	const adapter = new PrismaPg(pool as any);
	return new PrismaClient({ adapter: adapter as any } as any);
}

export function isDirectExecution(): boolean {
	const entry = process.argv[1];
	return typeof entry === "string" && /seed-last-account\.(ts|js|mts|cts|mjs)$/.test(entry);
}

async function main() {
	const args = parseSeedArgs(process.argv.slice(2));
	const client = createClient();
	const hashProvider = new BcryptHashProvider();
	try {
		await run(client, hashProvider, args);
		const counts = await countRows(client);
		console.log("✅ Conta populada com sucesso. Linhas por tabela:");
		for (const [table, count] of Object.entries(counts)) {
			console.log(`  ${table}: ${count}`);
		}
		console.log(`Equipe (senha única ${STAFF_PASSWORD}):`);
		for (const member of STAFF_SEED) console.log(`  - ${member.name} <${member.email}>`);
	} finally {
		await client.$disconnect();
	}
}

if (isDirectExecution()) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exit(1);
	});
}
