import { injectable } from "tsyringe";
import { PaymentRepository } from "../../repositories/infra/repositories/PaymentRepository"
import { IPaymentResponseDTO } from "../../dtos/IPaymentDTO";

@injectable()
export class ListPaymentsUseCase {
  private paymentRepo: PaymentRepository;

  constructor() {
    this.paymentRepo = new PaymentRepository();
  }

  async execute(
    barbershopId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number; page: number; limit: number }> {
    const result = await this.paymentRepo.findByBarbershopId(
      barbershopId,
      page,
      limit
    );

    return {
      data: result.data,
      total: result.total,
      page,
      limit
    };
  }
}