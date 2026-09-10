import { WhatsAppAiRepository } from "./whatsappAiRepository";
import { AppError } from "@/shared/errors/AppError";

type IntentResult = {
  intent: string;
  confidence: number;
  entities: Record<string, unknown>;
};

const INTENT_KEYWORDS: Record<string, string[]> = {
  scheduling: ["agendar", "agendamento", "marcar", "horário", "horarios", "reservar", "reserva", "disponível", "disponiveis", "quer marcar", "quero agendar", "quero marcar"],
  pricing: ["preço", "preco", "valor", "quanto custa", "quanto é", "quanto faz", "tabela de preços", "tabela de preco"],
  hours: ["horário", "horario", "funcionamento", "que horas", "abre", "fecha", "aberto", "fechado", "funciona"],
  location: ["endereço", "endereco", "onde fica", "localização", "localizacao", "como chegar", "mapa", "rua"],
  human_transfer: ["atendente", "pessoa", "humano", "humana", "falar com", "falar com alguém", "quero falar com", "suporte"],
  greeting: ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "hello", "hi", "e aí", "eai", "fala"],
  farewell: ["tchau", "até mais", "ate mais", "obrigado", "obrigada", "valeu", "falou", "bye"],
};

const RESPONSE_TEMPLATES: Record<string, (entities: Record<string, unknown>) => string> = {
  scheduling: () =>
    "Olá! 😊 Que ótimo que quer agendar! Para prosseguir, você pode acessar nosso link de agendamento ou me informar:\n\n1️⃣ Qual serviço deseja?\n2️⃣ Qual dia e horário prefere?\n\nAssim consigo verificar a disponibilidade para você!",
  pricing: () =>
    "Claro! Nossos preços variam conforme o serviço. Para ver a tabela completa acesse nosso link de agendamento, ou me diga qual serviço te interessa que verifico o valor! 💰",
  hours: () =>
    "Nosso horário de funcionamento é:\n\n📅 Segunda a Sexta: 9h às 20h\n📅 Sábado: 9h às 18h\n📅 Domingo: Fechado\n\nPode agendar tranquilo! 😄",
  location: () =>
    "Estamos localizados na Rua Principal, 123 - Centro. Pode encontrar no Google Maps buscando 'AgendAI Barbershop'. 📍\n\nTem estacionamento na rua e próximo ao metrô!",
  human_transfer: () =>
    "Entendi! Vou transferir você para um de nossos atendentes. Por favor, aguarde um momento... 🙋‍♂️",
  greeting: () =>
    "Olá! 👋 Bem-vindo à AgendAI! Como posso te ajudar hoje? Posso auxiliar com:\n\n📅 Agendamento\n💰 Preços\n🕐 Horários\n📍 Localização",
  farewell: () =>
    "Obrigado pelo contato! 😊 Foi ótimo te atender. Qualquer coisa, é só chamar! Até mais! 👋",
  unknown: () =>
    "Desculpe, não consegui entender sua solicitação. Posso ajudar com:\n\n📅 Agendamento\n💰 Preços\n🕐 Horários\n📍 Localização\n\nOu posso te transferir para um atendente! 🙋‍♂️",
};

function detectIntent(content: string): IntentResult {
  const normalized = content.toLowerCase().trim();
  const entities: Record<string, unknown> = {};

  let bestIntent = "unknown";
  let bestConfidence = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let matches = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        matches++;
      }
    }
    if (matches > 0) {
      const confidence = Math.min(0.5 + matches * 0.15, 0.95);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestIntent = intent;
      }
    }
  }

  if (bestIntent === "unknown") {
    bestConfidence = 0.3;
  }

  return { intent: bestIntent, confidence: bestConfidence, entities };
}

function generateResponse(intent: string, entities: Record<string, unknown>): string {
  const template = RESPONSE_TEMPLATES[intent] ?? RESPONSE_TEMPLATES.unknown;
  return template(entities);
}

export class WhatsAppAiUseCases {
  private repo = new WhatsAppAiRepository();

  async processIncomingMessage(barbershopId: string, phone: string, content: string) {
    const conversation = await this.repo.findOrCreateConversation(barbershopId, phone);

    await this.repo.createMessage({
      conversationId: conversation.id,
      direction: "INBOUND",
      content,
    });

    await this.repo.updateConversationLastMessage(conversation.id);

    const { intent, confidence, entities } = detectIntent(content);

    const shouldTransfer = intent === "human_transfer" || confidence < 0.5;

    const responseContent = generateResponse(intent, entities);

    const aiMessage = await this.repo.createMessage({
      conversationId: conversation.id,
      direction: "OUTBOUND",
      content: responseContent,
      intent,
      entities,
      confidence,
    });

    await this.repo.createIntentLog({
      barbershopId,
      phone,
      intent,
      entities,
      confidence,
      handledBy: shouldTransfer ? "HYBRID" : "AI",
      resolution: shouldTransfer ? "Transferência solicitada" : "Resposta automática",
    });

    if (shouldTransfer) {
      await this.repo.transferToHuman(conversation.id);
    }

    return {
      conversationId: conversation.id,
      message: aiMessage,
      intent,
      confidence,
      transferredToHuman: shouldTransfer,
    };
  }

  async listConversations(barbershopId: string, filters?: { status?: string; page?: number; limit?: number }) {
    return this.repo.listByBarbershop(barbershopId, filters);
  }

  async getConversationDetail(id: string, barbershopId: string) {
    const conversation = await this.repo.findById(id);
    if (!conversation) throw new AppError("Conversa não encontrada", 404);
    if (conversation.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);

    const messages = await this.repo.getMessages(id);
    return { ...conversation, messages };
  }

  async getIntentLogs(barbershopId: string, filters?: { intent?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    return this.repo.getIntentLogs(barbershopId, filters);
  }

  async getIntentStats(barbershopId: string) {
    return this.repo.getIntentStats(barbershopId);
  }

  async transferToHuman(id: string, barbershopId: string) {
    const conversation = await this.repo.findById(id);
    if (!conversation) throw new AppError("Conversa não encontrada", 404);
    if (conversation.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
    if (conversation.status !== "ACTIVE") throw new AppError("Conversa já finalizada", 400);

    return this.repo.transferToHuman(id);
  }
}
