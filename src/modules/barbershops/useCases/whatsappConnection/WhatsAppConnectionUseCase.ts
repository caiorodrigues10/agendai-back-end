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
  fetchEvolutionPairingCode,
  fetchEvolutionConnectionState,
  fetchEvolutionQr,
  isEvolutionServerConfigured,
  logoutEvolutionInstance,
  normalizeWhatsAppPhone,
} from "@/shared/services/evolutionApiService";

export type ShopWhatsAppStatus = "disconnected" | "connecting" | "open";

export interface ShopWhatsAppDto {
  status: ShopWhatsAppStatus;
  connected: boolean;
  qrcodeBase64: string | null;
  method: "qr" | "pairing_code" | null;
  pairingCode: string | null;
}

export type WhatsAppConnectInput =
  | { method: "qr" }
  | { method: "pairing_code"; phoneNumber: string };

function assertShopAccess(
  barbershopId: string,
  user: { role: string; barbershopId?: string }
): void {
  if (user.role === "MASTER_ADMIN") return;
  if (user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}

function detachEvolutionInstanceWithTimeout(instanceName: string): Promise<void> {
  const timeoutMs = 5_000;
  const run = (fn: () => Promise<void>) =>
    Promise.race([
      fn().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);

  return Promise.all([
    run(() => logoutEvolutionInstance(instanceName)),
    run(() => deleteEvolutionInstance(instanceName)),
  ]).then(() => undefined);
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
      return { status: "disconnected", connected: false, qrcodeBase64: null, method: null, pairingCode: null };
    }

    const state = await fetchEvolutionConnectionState(stored);
    if (state === "open") {
      return { status: "open", connected: true, qrcodeBase64: null, method: null, pairingCode: null };
    }

    return {
      status: state === "connecting" ? "connecting" : "disconnected",
      connected: false,
      qrcodeBase64: null,
      method: null,
      pairingCode: null,
    };
  }

  async connect(
    barbershopId: string,
    user: { role: string; barbershopId?: string },
    input: WhatsAppConnectInput = { method: "qr" }
  ): Promise<ShopWhatsAppDto> {
    assertShopAccess(barbershopId, user);
    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);
    if (!isEvolutionServerConfigured()) throw evolutionNotConfiguredError();

    const instanceName = shopEvolutionInstanceName(barbershopId);
    const created = await createEvolutionInstance(instanceName);

    if (shop.evolutionInstanceName !== instanceName) {
      await this.barbershopRepository.update(barbershopId, {
        evolutionInstanceName: instanceName,
      });
    }

    const state = await fetchEvolutionConnectionState(instanceName);
    if (state === "open") {
      return { status: "open", connected: true, qrcodeBase64: null, method: null, pairingCode: null };
    }

    if (input.method === "pairing_code") {
      const phoneNumber = normalizeWhatsAppPhone(input.phoneNumber);
      if (!/^(55)?\d{10,11}$/.test(phoneNumber)) {
        throw new AppError("Informe um número de WhatsApp válido com DDD.", 400);
      }
      const pairingCode = await fetchEvolutionPairingCode(instanceName, phoneNumber);
      if (!pairingCode) {
        throw new AppError("A Evolution não disponibilizou o código de pareamento. Tente usar o QR Code.", 502);
      }
      return { status: "connecting", connected: false, qrcodeBase64: null, method: "pairing_code", pairingCode };
    }

    let qrcodeBase64 = extractQrBase64(created);
    if (!qrcodeBase64) qrcodeBase64 = await fetchEvolutionQr(instanceName);
    if (!qrcodeBase64) throw new AppError("Não foi possível gerar o QR Code do WhatsApp. Tente novamente.", 502);

    return {
      status: "connecting",
      connected: false,
      qrcodeBase64,
      method: "qr",
      pairingCode: null,
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

    if (isEvolutionServerConfigured()) {
      await detachEvolutionInstanceWithTimeout(stored);
    }

    await this.barbershopRepository.update(barbershopId, {
      evolutionInstanceName: null,
    });

    return { status: "disconnected", connected: false, qrcodeBase64: null, method: null, pairingCode: null };
  }
}
