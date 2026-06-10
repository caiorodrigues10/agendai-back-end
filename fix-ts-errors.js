#!/usr/bin/env node
// fix-ts-errors.js — corrige os 5 erros de TypeScript reportados
// Execute na raiz do projeto: node fix-ts-errors.js

const fs = require("fs");
const path = require("path");

let ok = 0;
let fail = 0;

function write(filePath, content) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(path.dirname(abs))) {
    console.error(`❌  Diretório não encontrado: ${path.dirname(abs)}`);
    fail++;
    return;
  }
  fs.copyFileSync(abs, abs + ".bak"); // backup
  fs.writeFileSync(abs, content, "utf8");
  console.log(`✅  ${filePath}`);
  ok++;
}

// ─── 1. src/libs/prismaClient.ts ─────────────────────────────────────────────
// Erro: PrismaClient e Prisma não exportados pelo @prisma/client v7+
// Solução: importar do pacote interno gerado pelo prisma generate
write(
  "src/libs/prismaClient.ts",
  `import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma";
import type { Prisma } from "../generated/prisma";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);

export const prisma = new PrismaClient({ adapter: adapter as any } as any);
export type { Prisma };
`
);

// ─── 2. src/modules/queue/infra/repositories/QueueRepository.ts ──────────────
// Erros: QueueStatus não exportado pelo @prisma/client; parâmetro 'i' implícito
write(
  "src/modules/queue/infra/repositories/QueueRepository.ts",
  `import { prisma } from "@/libs/prismaClient";
import { IJoinQueueDTO } from "../../dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO, QueueStatus } from "../../dtos/IQueueItemResponseDTO";
import { IQueueRepository } from "../../repositories/IQueueRepository";

type PrismaQueueStatus = "WAITING" | "IN_CHAIR" | "COMPLETED" | "CANCELLED";

function toDTO(s: PrismaQueueStatus): QueueStatus {
  return s.toLowerCase() as QueueStatus;
}

function toPrisma(s: string): PrismaQueueStatus {
  return s.toUpperCase() as PrismaQueueStatus;
}

export class QueueRepository implements IQueueRepository {
  async create(data: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    const item = await prisma.queueItem.create({
      data: {
        barbershopId: data.barbershopId,
        serviceId:    data.serviceId,
        customerId:   data.customerId,
        customerName: data.customerName,
        whatsapp:     data.whatsapp,
        addedByStaff: data.addedByStaff ?? false,
        status:       "WAITING"
      },
      include: { service: true }
    });
    return this.mapToDTO(item);
  }

  async list(barbershopId?: string): Promise<IQueueItemResponseDTO[]> {
    const items = await prisma.queueItem.findMany({
      where:   barbershopId ? { barbershopId } : {},
      orderBy: { joinedAt: "asc" },
      include: { service: true }
    });
    return items.map((i: any) => this.mapToDTO(i));
  }

  async findById(id: string): Promise<IQueueItemResponseDTO | null> {
    const item = await prisma.queueItem.findUnique({
      where:   { id },
      include: { service: true }
    });
    return item ? this.mapToDTO(item) : null;
  }

  async updateStatus(
    id: string,
    status: string,
    details?: { completedBy?: string; finalPrice?: number }
  ): Promise<IQueueItemResponseDTO> {
    const prismaStatus = toPrisma(status);
    const data: Record<string, unknown> = { status: prismaStatus };

    if (prismaStatus === "COMPLETED") {
      data.completedAt = new Date();
      if (details?.completedBy)        data.completedBy = details.completedBy;
      if (details?.finalPrice != null) data.finalPrice  = details.finalPrice;
    }

    const item = await prisma.queueItem.update({
      where:   { id },
      data,
      include: { service: true }
    });
    return this.mapToDTO(item);
  }

  async delete(id: string): Promise<void> {
    await prisma.queueItem.delete({ where: { id } });
  }

  async countCompleted(barbershopId?: string): Promise<number> {
    return prisma.queueItem.count({
      where: {
        status: "COMPLETED",
        ...(barbershopId ? { barbershopId } : {})
      }
    });
  }

  private mapToDTO(item: any): IQueueItemResponseDTO {
    return {
      id:              item.id,
      barbershopId:    item.barbershopId,
      serviceId:       item.serviceId,
      customerId:      item.customerId,
      customerName:    item.customerName,
      whatsapp:        item.whatsapp,
      joinedAt:        item.joinedAt instanceof Date
                         ? item.joinedAt.getTime()
                         : Number(item.joinedAt),
      status:          toDTO(item.status),
      estimatedStartAt: item.estimatedStartAt instanceof Date
                         ? item.estimatedStartAt.getTime()
                         : (item.estimatedStartAt ?? null),
      addedByStaff:    item.addedByStaff,
      completedAt:     item.completedAt instanceof Date
                         ? item.completedAt.getTime()
                         : (item.completedAt ?? null),
      completedBy:     item.completedBy  ?? null,
      finalPrice:      item.finalPrice   ?? null,
      serviceName:     item.service?.name ?? null
    };
  }
}
`
);

// ─── 3. src/modules/users/useCases/createUser/CreateUserUseCase.ts ────────────
// Erro: cpf: string | null não é atribuível a string | undefined
// Solução: usar undefined em vez de null quando o cpf não existe
write(
  "src/modules/users/useCases/createUser/CreateUserUseCase.ts",
  `import { inject, injectable } from "tsyringe";
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
      throw new AppError("Admins não devem possuir barbearia vinculada", 400);
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
`
);

// ─── 4. GcsStorageProvider.ts ─────────────────────────────────────────────────
write(
  "src/shared/container/providers/StorageProvider/implementations/GcsStorageProvider.ts",
  `import { Storage } from "@google-cloud/storage";
import {
  IStorageProvider,
  ISignedUploadUrlResult,
  IUploadBufferResult,
} from "../IStorageProvider";

export class GcsStorageProvider implements IStorageProvider {
  private _storage: Storage | null = null;
  private _bucketName: string | null = null;

  private get bucketName(): string {
    if (!this._bucketName) {
      const name = process.env.GCS_BUCKET_NAME;
      if (!name) {
        throw new Error(
          "GCS_BUCKET_NAME não configurado nas variáveis de ambiente."
        );
      }
      this._bucketName = name;
    }
    return this._bucketName;
  }

  private get storage(): Storage {
    if (!this._storage) {
      const keyFilePath = process.env.GCS_KEY_FILE_PATH;
      const projectId   = process.env.GCS_PROJECT_ID;
      if (keyFilePath) {
        this._storage = new Storage({ keyFilename: keyFilePath, projectId });
      } else {
        this._storage = new Storage({ projectId });
      }
    }
    return this._storage;
  }

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = \`\${folder}/\${fileName}\`;
    const file       = this.storage.bucket(this.bucketName).file(objectName);
    const expires    = Date.now() + expiresInSeconds * 1000;

    const [uploadUrl] = await file.getSignedUrl({
      version:     "v4",
      action:      "write",
      expires,
      contentType: mimeType,
    });

    return {
      uploadUrl,
      publicUrl:        this.buildPublicUrl(objectName),
      objectName,
      expiresInSeconds,
    };
  }

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<IUploadBufferResult> {
    const objectName = \`\${folder}/\${fileName}\`;
    const file       = this.storage.bucket(this.bucketName).file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType:  mimeType,
        cacheControl: "public, max-age=31536000",
      },
      resumable: false,
    });

    return {
      publicUrl: this.buildPublicUrl(objectName),
      objectName,
      size:      buffer.byteLength,
    };
  }

  async deleteObject(objectName: string): Promise<void> {
    try {
      await this.storage
        .bucket(this.bucketName)
        .file(objectName)
        .delete({ ignoreNotFound: true });
    } catch (err: any) {
      console.warn(
        \`[GcsStorageProvider] Falha ao deletar "\${objectName}": \${err?.message ?? err}\`
      );
    }
  }

  extractObjectName(publicUrl: string): string | null {
    const patterns = [
      new RegExp(\`^https://storage\\\\.googleapis\\\\.com/\${this.bucketName}/(.+)$\`),
      new RegExp(\`^https://\${this.bucketName}\\\\.storage\\\\.googleapis\\\\.com/(.+)$\`),
    ];
    for (const pattern of patterns) {
      const match = publicUrl.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  }

  private buildPublicUrl(objectName: string): string {
    return \`https://storage.googleapis.com/\${this.bucketName}/\${objectName}\`;
  }
}
`
);

// ─── Resultado ────────────────────────────────────────────────────────────────
console.log("");
console.log(`Concluído: ${ok} arquivo(s) corrigido(s), ${fail} falha(s).`);
console.log("");

if (ok > 0) {
  console.log("Próximos passos:");
  console.log("  1. npx prisma generate          (regera o client Prisma)");
  console.log("  2. npx tsc --noEmit             (confirma que não há mais erros)");
  console.log("");
  console.log("Se ainda aparecer erro no prismaClient.ts sobre o caminho");
  console.log("'../generated/prisma', verifique onde o prisma generate salva");
  console.log("os arquivos no seu projeto e ajuste o import manualmente.");
  console.log("Geralmente fica em src/generated/prisma ou node_modules/@prisma/client.");
}
