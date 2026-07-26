import {
	ICreateAppointmentDTO,
	IUpdateAppointmentDTO,
	IAppointmentResponseDTO,
	IListAppointmentsQuery,
	IAvailabilitySlotDTO,
} from '../dtos/IAppointmentDTO'

export interface IAppointmentRepository {
	create(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO>
	findById(id: string): Promise<IAppointmentResponseDTO | null>
	list(
		barbershopId: string,
		query: IListAppointmentsQuery,
	): Promise<{ data: IAppointmentResponseDTO[]; total: number }>
	update(
		id: string,
		data: IUpdateAppointmentDTO,
	): Promise<IAppointmentResponseDTO>
	delete(id: string): Promise<void>
	/** Slots ocupados (agendamentos CONFIRMED) de um dia, com duração do serviço. */
	getOccupiedSlots(
		barbershopId: string,
		date: string,
	): Promise<IAvailabilitySlotDTO[]>
}
