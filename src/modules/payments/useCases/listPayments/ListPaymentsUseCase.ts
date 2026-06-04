import { inject, injectable } from "tsyringe";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO } from "../../dtos/IPaymentDTO";

@injectable()
export class ListPaymentsUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository
  ) {}

  async execute(
    barbershopId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number; page: number; limit: number }> {
    const result = await this.paymentRepo.findByBarbershopId(barbershopId, page, limit);
    return { data: result.data, total: result.total, page, limit };
  }
}
