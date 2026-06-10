import { inject, injectable } from "tsyringe";
import { IUserRepository } from "../../repositories/IUserRepository";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { ICreateUserDTO } from "../../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../../dtos/IUserResponseDTO";
import { AppError } from "@/shared/errors/AppError";
import { assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
import { normalizeCpf } from "@/shared/utils/cpfUtils";
import { prisma } from "@/libs/prismaClient";

@injectable()
export class CreateUserUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) { }

  async execute(data: ICreateUserDTO): Promise<IUserResponseDTO> {
    // 1. Email duplicado
    const emailExists = await this.userRepository.findByEmail(data.email);
    if (emailExists) {
      throw new AppError("E-mail já cadastrado", 400);
    }

    // 2. Regras de role
    const role = data.role ?? "EMPLOYEE";
    if (role === "MASTER_ADMIN" && data.barbershopId) {
      throw new AppError("Admins não devem possuir barbearia vinculada", 400);
    }
    if (role !== "MASTER_ADMIN" && !data.barbershopId) {
      throw new AppError("barbershopId é obrigatório para OWNER e EMPLOYEE", 400);
    }

    // 3. CPF — obrigatório para OWNER e EMPLOYEE
    if (role !== "MASTER_ADMIN" && !data.cpf) {
      throw new AppError("CPF é obrigatório para OWNER e EMPLOYEE", 400);
    }

    const normalizedCpf = data.cpf ? normalizeCpf(data.cpf) : undefined;

    if (normalizedCpf) {
      // CPF já cadastrado por outro usuário?
      const cpfInUse = await prisma.user.findFirst({ where: { cpf: normalizedCpf } });
      if (cpfInUse) {
        throw new AppError("CPF já cadastrado", 400);
      }

      // CPF bloqueado por inadimplência?
      await assertCpfNotBlocked(normalizedCpf);
    }

    // 4. Hash da senha
    const hashedPassword = await this.hashProvider.hash(data.password);

    // 5. Cria o usuário
    const user = await this.userRepository.create({
      ...data,
      role,
      cpf: normalizedCpf,
      password: hashedPassword
    });

    return user;
  }
}