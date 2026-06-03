import { inject, injectable } from "tsyringe";
import { IUserRepository } from "../../repositories/IUserRepository";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { ICreateUserDTO } from "../../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../../dtos/IUserResponseDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class CreateUserUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) {}

  async execute(data: ICreateUserDTO): Promise<IUserResponseDTO> {
    const emailExists = await this.userRepository.findByEmail(data.email);
    if (emailExists) {
      throw new AppError("E-mail já cadastrado", 400);
    }
    const role = data.role ?? "EMPLOYEE";
    if (role === "MASTER_ADMIN" && data.barbershopId) {
      throw new AppError("Admins não devem possuir barbearia vinculada", 400);
    }
    if (role !== "MASTER_ADMIN" && !data.barbershopId) {
      throw new AppError("barbershopId é obrigatório para OWNER e EMPLOYEE", 400);
    }
    const hashedPassword = await this.hashProvider.hash(data.password);
    const user = await this.userRepository.create({
      ...data,
      role,
      password: hashedPassword
    });
    return user;
  }
}
