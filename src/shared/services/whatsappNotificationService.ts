/**
 * Gateway de WhatsApp do BarberQueue.
 * Implementação atual: Evolution API (substitui Z-API).
 * Mantém este arquivo e as exports para não quebrar imports existentes.
 */
export {
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
  isWhatsAppGatewayConfigured,
} from "./evolutionApiService";
