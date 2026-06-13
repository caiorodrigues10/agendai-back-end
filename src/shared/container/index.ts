import "reflect-metadata";
import { container } from "tsyringe";
import "@/shared/container/providers";

import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { UserRepository } from "@/modules/users/infra/repositories/UserRepository";

import { IServiceRepository } from "@/modules/services/repositories/IServiceRepository";
import { ServiceRepository } from "@/modules/services/infra/repositories/ServiceRepository";

import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { BarbershopRepository } from "@/modules/barbershops/infra/repositories/BarbershopRepository";

import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { QueueRepository } from "@/modules/queue/infra/repositories/QueueRepository";

import { IPaymentRepository } from "@/modules/payments/repositories/IPaymentRepository";
import { PaymentRepository } from "@/modules/payments/infra/repositories/PaymentRepository";

import { MercadoPagoService } from "@/modules/payments/services/MercadoPagoService";

import { IPlanRepository } from "@/modules/plans/repositories/IPlanRepository";
import { PlanRepository } from "@/modules/plans/infra/repositories/PlanRepository";

import { IFiadoRepository } from "../../modules/fiado/repositories/IFiadoRepository";
import { FiadoRepository } from "../../modules/fiado/repositories/FiadoRepository";

import { IExpenseRepository } from "@/modules/expenses/repositories/IExpenseRepository";
import { ExpenseRepository } from "@/modules/expenses/infra/repositories/ExpenseRepository";

container.registerSingleton<IUserRepository>("UserRepository", UserRepository);
container.registerSingleton<IServiceRepository>("ServiceRepository", ServiceRepository);
container.registerSingleton<IBarbershopRepository>("BarbershopRepository", BarbershopRepository);
container.registerSingleton<IQueueRepository>("QueueRepository", QueueRepository);
container.registerSingleton<IPaymentRepository>("PaymentRepository", PaymentRepository);
container.registerSingleton<MercadoPagoService>("MercadoPagoService", MercadoPagoService);
container.registerSingleton<IPlanRepository>("PlanRepository", PlanRepository);
container.registerSingleton<IFiadoRepository>("FiadoRepository", FiadoRepository);
container.registerSingleton<IExpenseRepository>("ExpenseRepository", ExpenseRepository);

