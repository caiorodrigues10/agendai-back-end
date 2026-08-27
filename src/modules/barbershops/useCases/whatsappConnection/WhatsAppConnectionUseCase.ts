import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import {
  shopEvolutionInstanceName,
  evolutionNotConfiguredError,
} from "../../utils/shopEvolutionInstance";
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  extractQrBase64,
  fetchEvolutionConnectionState,
  fetchEvolutionQr,
  isEvolutionServerConfigured,
  logoutEvolutionInstance,
} from "@/shared/services/evolutionApiService";

export type ShopWhatsAppStatus = "disconnected" | "connecting" | "open";

export interface ShopWhatsAppDto {
  status: ShopWhatsAppStatus;
  connected: boolean;
  qrcodeBase64: string | null;
}

function assertShopAccess(
  barbershopId: string,
  user: { role: string; barbershopId?: string }
): void {
  if (user.role === "MASTER_ADMIN") return;
  if (user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}

@injectable()
export class WhatsAppConnectionUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}

  async status(
    barbershopId: string,
    user: { role: string; barbershopId?: string }
  ): Promise<ShopWhatsAppDto> {
    assertShopAccess(barbershopId, user);
    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);
    if (!isEvolutionServerConfigured()) throw evolutionNotConfiguredError();

    const stored = shop.evolutionInstanceName?.trim();
    if (!stored) {
      return { status: "disconnected", connected: false, qrcodeBase64: null };
    }

    const state = await fetchEvolutionConnectionState(stored);
    if (state === "open") {
      return { status: "open", connected: true, qrcodeBase64: null };
    }

    const qrcodeBase64 = await fetchEvolutionQr(stored);
    return {
      status: state === "connecting" ? "connecting" : "disconnected",
      connected: false,
      qrcodeBase64,
    };
  }

  async connect(
    barbershopId: string,
    user: { role: string; barbershopId?: string }
  ): Promise<ShopWhatsAppDto> {
    assertShopAccess(barbershopId, user);
    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);
    if (!isEvolutionServerConfigured()) throw evolutionNotConfiguredError();

    const instanceName = shopEvolutionInstanceName(barbershopId);
    const created = await createEvolutionInstance(instanceName);
    let qrcodeBase64 = extractQrBase64(created);
    if (!qrcodeBase64) {
      qrcodeBase64 = await fetchEvolutionQr(instanceName);
    }

    if (shop.evolutionInstanceName !== instanceName) {
      await this.barbershopRepository.update(barbershopId, {
        evolutionInstanceName: instanceName,
      });
    }

    const state = await fetchEvolutionConnectionState(instanceName);
    if (state === "open") {
      return { status: "open", connected: true, qrcodeBase64: null };
    }

    return {
      status: "connecting",
      connected: false,
      qrcodeBase64,
    };
  }

  async disconnect(
    barbershopId: string,
    user: { role: string; barbershopId?: string }
  ): Promise<ShopWhatsAppDto> {
    assertShopAccess(barbershopId, user);
    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);

    const stored =
      shop.evolutionInstanceName?.trim() || shopEvolutionInstanceName(barbershopId);

    try {
      await logoutEvolutionInstance(stored);
    } catch {
      /* instância pode já estar desligada */
    }
    try {
      await deleteEvolutionInstance(stored);
    } catch {
      /* idem */
    }

    await this.barbershopRepository.update(barbershopId, {
      evolutionInstanceName: null,
    });

    return { status: "disconnected", connected: false, qrcodeBase64: null };
  }
}
