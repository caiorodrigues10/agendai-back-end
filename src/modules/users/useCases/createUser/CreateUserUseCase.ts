import { inject, injectable } from "tsyringe";
import { IUserRepository }   from "../../repositories/IUserRepository";
import { IHashProvider }     from "@/shared/container/providers/HashProvider/IHashProvider";
import { ICreateUserDTO }    from "../../dtos/ICreateUserDTO";
import { IUserResponseDTO }  from "../../dtos/IUserResponseDTO";
import { AppError }          from "@/shared/errors/AppError";
import { assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
import { normalizeCpf }      from "@/shared/utils/cpfUtils";

@injectable()
export class CreateUserUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) {}

  async execute(data: ICreateUserDTO): Promise<IUserResponseDTO> {
    // 1. Email duplicado
    const emailExists = await this.userRepository.findByEmail(data.email);
    if (emailExists) throw new AppError("E-mail já cadastrado", 400);

    // 2. Regras de role
    const role = data.role ?? "EMPLOYEE";
    if (role === "MASTER_ADMIN" && data.barbershopId) {
      throw new AppError("Admins não devem possuir salão vinculado", 400);
    }
    if (role !== "MASTER_ADMIN" && !data.barbershopId) {
      throw new AppError("barbershopId é obrigatório para OWNER e EMPLOYEE", 400);
    }

    // 3. CPF obrigatório para OWNER e EMPLOYEE
    if (role !== "MASTER_ADMIN" && !data.cpf) {
      throw new AppError("CPF é obrigatório para OWNER e EMPLOYEE", 400);
    }

    const normalizedCpf = data.cpf ? normalizeCpf(data.cpf) : undefined;

    if (normalizedCpf) {
      const cpfInUse = await this.userRepository.findByCpf(normalizedCpf);
      if (cpfInUse) throw new AppError("CPF já cadastrado", 400);

      await assertCpfNotBlocked(normalizedCpf);
    }

    // 4. Hash da senha
    const hashedPassword = await this.hashProvider.hash(data.password);

    // 5. Cria o usuário
    return this.userRepository.create({
      ...data,
      role,
      cpf: normalizedCpf,   // undefined quando não informado (compatível com ICreateUserDTO)
      password: hashedPassword
    });
  }
}
