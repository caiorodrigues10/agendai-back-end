import { AppError } from "@/shared/errors/AppError";
import type { FeeInvoiceProvider } from "@prisma/client";

/**
 * Adaptadores de emissão de NFS-e.
 *
 * A emissão **manual** funciona sem credenciais (número digitado pelo
 * escritório). Os provedores externos (NFE.io e Focus NFe) exigem token de API
 * na env — sem ele, o adaptador lança erro claro em vez de falhar em silêncio.
 *
 * Para plugar um provedor real, implemente `FeeInvoiceAdapter` e registre no
 * mapa `ADAPTERS` abaixo; nada mais do código precisa mudar.
 */

export interface IssueFeeInvoiceCommand {
  description: string;
  amount: number;
  taxpayerId?: string | null;
  /** Número informado manualmente (só provider MANUAL). */
  invoiceNumber?: string | null;
}

export interface IssueFeeInvoiceResult {
  invoiceNumber?: string | null;
  externalId?: string | null;
  xmlUrl?: string | null;
}

export interface FeeInvoiceAdapter {
  readonly provider: FeeInvoiceProvider;
  /** Se o provedor tem credenciais configuradas na env. */
  isConfigured(): boolean;
  issue(command: IssueFeeInvoiceCommand): Promise<IssueFeeInvoiceResult>;
}

class ManualFeeInvoiceAdapter implements FeeInvoiceAdapter {
  readonly provider = "MANUAL" as const;

  isConfigured(): boolean {
    return true;
  }

  async issue(command: IssueFeeInvoiceCommand): Promise<IssueFeeInvoiceResult> {
    if (!command.invoiceNumber?.trim()) {
      throw new AppError(
        "Informe o número da NFS-e para emissão manual",
        400
      );
    }
    return { invoiceNumber: command.invoiceNumber.trim(), externalId: null };
  }
}

class NfeIoAdapter implements FeeInvoiceAdapter {
  readonly provider = "NFE_IO" as const;

  isConfigured(): boolean {
    return Boolean(process.env.NFEIO_API_TOKEN);
  }

  async issue(_command: IssueFeeInvoiceCommand): Promise<IssueFeeInvoiceResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        "Emissor NFE.io não configurado: defina NFEIO_API_TOKEN na env",
        400
      );
    }
    // Integração real fica pendente de credenciais do município/escritório.
    // O contrato do adaptador já está estabilizado para plugar o SDK aqui.
    throw new AppError(
      "Emissor NFE.io disponível apenas com credenciais ativas (ver .env.example)",
      501
    );
  }
}

class FocusNfeAdapter implements FeeInvoiceAdapter {
  readonly provider = "FOCUS" as const;

  isConfigured(): boolean {
    return Boolean(process.env.FOCUS_NFE_API_TOKEN);
  }

  async issue(_command: IssueFeeInvoiceCommand): Promise<IssueFeeInvoiceResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        "Emissor Focus NFe não configurado: defina FOCUS_NFE_API_TOKEN na env",
        400
      );
    }
    throw new AppError(
      "Emissor Focus NFe disponível apenas com credenciais ativas (ver .env.example)",
      501
    );
  }
}

const ADAPTERS: Record<FeeInvoiceProvider, FeeInvoiceAdapter> = {
  MANUAL: new ManualFeeInvoiceAdapter(),
  NFE_IO: new NfeIoAdapter(),
  FOCUS: new FocusNfeAdapter(),
};

/** Resolve o adaptador de emissão para o provedor informado. */
export function getFeeInvoiceAdapter(provider: FeeInvoiceProvider): FeeInvoiceAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new AppError(`Provedor de NFS-e desconhecido: ${provider}`, 400);
  }
  return adapter;
}
