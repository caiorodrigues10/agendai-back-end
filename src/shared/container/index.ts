import 'reflect-metadata'
import { container } from 'tsyringe'
import '@/shared/container/providers'

import { IUserRepository } from '@/modules/users/repositories/IUserRepository'
import { UserRepository } from '@/modules/users/infra/repositories/UserRepository'

import { IServiceRepository } from '@/modules/services/repositories/IServiceRepository'
import { ServiceRepository } from '@/modules/services/infra/repositories/ServiceRepository'

import { IBarbershopRepository } from '@/modules/barbershops/repositories/IBarbershopRepository'
import { BarbershopRepository } from '@/modules/barbershops/infra/repositories/BarbershopRepository'

import { IQueueRepository } from '@/modules/queue/repositories/IQueueRepository'
import { QueueRepository } from '@/modules/queue/infra/repositories/QueueRepository'

import { IPaymentRepository } from '@/modules/payments/repositories/IPaymentRepository'
import { PaymentRepository } from '@/modules/payments/infra/repositories/PaymentRepository'

import { MercadoPagoService } from '@/modules/payments/services/MercadoPagoService'
import { AbacatePayService } from '@/modules/payments/services/AbacatePayService'
import { AsaasService } from '@/modules/payments/services/AsaasService'

import { IPlanRepository } from '@/modules/plans/repositories/IPlanRepository'
import { PlanRepository } from '@/modules/plans/infra/repositories/PlanRepository'

import { IFiadoRepository } from '@/modules/fiado/repositories/IFiadoRepository'
import { FiadoRepository } from '@/modules/fiado/infra/repositories/FiadoRepository'

import { IExpenseRepository } from '@/modules/expenses/repositories/IExpenseRepository'
import { ExpenseRepository } from '@/modules/expenses/infra/repositories/ExpenseRepository'

import {
	IServiceCategoryRepository,
	IExpenseCategoryRepository,
} from '@/modules/serviceCategories/repositories/ICategoryRepository'
import {
	ServiceCategoryRepository,
	ExpenseCategoryRepository,
} from '@/modules/serviceCategories/infra/repositories/CategoryRepository'

import { IAppointmentRepository } from '@/modules/appointments/repositories/IAppointmentRepository'
import { AppointmentRepository } from '@/modules/appointments/infra/repositories/AppointmentRepository'

import { ISalonClientRepository } from '@/modules/clients/repositories/ISalonClientRepository'
import { SalonClientRepository } from '@/modules/clients/infra/repositories/SalonClientRepository'

import { IServicePackageRepository } from '@/modules/packages/repositories/IServicePackageRepository'
import { ServicePackageRepository } from '@/modules/packages/infra/repositories/ServicePackageRepository'
import { IClientPackageRepository } from '@/modules/packages/repositories/IClientPackageRepository'
import { ClientPackageRepository } from '@/modules/packages/infra/repositories/ClientPackageRepository'

import { GetWeatherInsightsUseCase } from '@/modules/barbershops/useCases/getWeatherInsights/GetWeatherInsightsUseCase'

container.registerSingleton<IUserRepository>('UserRepository', UserRepository)
container.registerSingleton<IServiceRepository>(
	'ServiceRepository',
	ServiceRepository,
)
container.registerSingleton<IBarbershopRepository>(
	'BarbershopRepository',
	BarbershopRepository,
)
container.registerSingleton<IQueueRepository>(
	'QueueRepository',
	QueueRepository,
)
container.registerSingleton<IPaymentRepository>(
	'PaymentRepository',
	PaymentRepository,
)
container.registerSingleton<MercadoPagoService>(
	'MercadoPagoService',
	MercadoPagoService,
)
container.registerSingleton<AbacatePayService>(
	'AbacatePayService',
	AbacatePayService,
)
container.registerSingleton<AsaasService>('AsaasService', AsaasService)
container.registerSingleton<IPlanRepository>('PlanRepository', PlanRepository)
container.registerSingleton<IFiadoRepository>(
	'FiadoRepository',
	FiadoRepository,
)
container.registerSingleton<IExpenseRepository>(
	'ExpenseRepository',
	ExpenseRepository,
)
container.registerSingleton<IServiceCategoryRepository>(
	'ServiceCategoryRepository',
	ServiceCategoryRepository,
)
container.registerSingleton<IExpenseCategoryRepository>(
	'ExpenseCategoryRepository',
	ExpenseCategoryRepository,
)
container.registerSingleton<IAppointmentRepository>(
	'AppointmentRepository',
	AppointmentRepository,
)
container.registerSingleton<ISalonClientRepository>(
	'SalonClientRepository',
	SalonClientRepository,
)
container.registerSingleton<IServicePackageRepository>(
	'ServicePackageRepository',
	ServicePackageRepository,
)
container.registerSingleton<IClientPackageRepository>(
	'ClientPackageRepository',
	ClientPackageRepository,
)
container.registerSingleton('GetWeatherInsightsUseCase', GetWeatherInsightsUseCase)
