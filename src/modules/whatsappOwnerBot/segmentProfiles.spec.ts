/// <reference types="vitest/globals" />
import { BusinessSegment } from "@prisma/client";
import {
  OWNER_BOT_SEGMENT_PROFILES,
  getOwnerBotSegmentProfile,
  ownerBotHasCategory,
  ownerBotSupports,
} from "./segmentProfiles";
import {
  buildOwnerBotSegmentCatalog,
  ownerBotCommandExamples,
  ownerBotCommandsForSegment,
} from "./commands/catalog";
import { OWNER_BOT_COMMANDS } from "./commands/registry";
import { matchOwnerBotCommand } from "./commands/matcher";

describe("perfis do assistente por segmento", () => {
  it("a tabela cobre todos os valores do enum", () => {
    const segments = Object.values(BusinessSegment).filter(
      (value) => typeof value === "string"
    );
    for (const segment of segments) {
      expect(
        OWNER_BOT_SEGMENT_PROFILES[segment],
        `segmento ${segment} sem perfil do assistente`
      ).toBeDefined();
      expect(
        OWNER_BOT_SEGMENT_PROFILES[segment].vocabulary.todayNoun,
        `${segment}: todayNoun`
      ).toBeTruthy();
      expect(
        OWNER_BOT_SEGMENT_PROFILES[segment].vocabulary.ticketUnit,
        `${segment}: ticketUnit`
      ).toBeTruthy();
    }
  });

  it("advocacia usa o vocabulário do escritório", () => {
    const profile = getOwnerBotSegmentProfile("LAW_FIRM");
    expect(profile.vocabulary.todayNoun).toBe("atendimentos de hoje");
    expect(profile.vocabulary.ticketUnit).toBe("atendimento");
    expect(profile.vocabulary.clientsOfDay).toBe("clientes de hoje");
    expect(profile.vocabulary.hearingNoun).toBe("audiência");
  });

  it("advocacia tem check-in e encerramento de atendimento, sem fila", () => {
    const profile = getOwnerBotSegmentProfile("LAW_FIRM");
    expect(ownerBotSupports("LAW_FIRM", "CHECK_IN")).toBe(true);
    expect(ownerBotSupports("LAW_FIRM", "COMPLETE")).toBe(true);
    expect(ownerBotSupports("LAW_FIRM", "WALK_IN")).toBe(false);
  });

  it("advocacia não tem menu de marketing nem comandos de campanha/avaliação", () => {
    expect(ownerBotHasCategory("LAW_FIRM", "MARKETING")).toBe(false);
    const commands = ownerBotCommandsForSegment(OWNER_BOT_COMMANDS, "LAW_FIRM");
    const ids = commands.map((command) => command.id);
    expect(ids).not.toContain("campaign.inactive");
    expect(ids).not.toContain("rep.request");
    expect(ids).not.toContain("rep.rating");
    expect(ids).not.toContain("rep.reviews");
  });

  it("advocacia não esconde a consulta interna de clientes que não voltam", () => {
    const ids = ownerBotCommandsForSegment(OWNER_BOT_COMMANDS, "LAW_FIRM").map(
      (command) => command.id
    );
    expect(ids).toContain("client.inactive");
  });

  it("advocacia esconde fila, lista de espera, comissão e cupom", () => {
    const ids = ownerBotCommandsForSegment(OWNER_BOT_COMMANDS, "LAW_FIRM").map(
      (command) => command.id
    );
    expect(ids).not.toContain("queue.status");
    expect(ids).not.toContain("waitlist.list");
    expect(ids).not.toContain("fin.commissions");
    expect(ids).not.toContain("team.commission");
    expect(ids).not.toContain("fin.vouchers");
  });

  it("texto de campanha ou nota média não casa comando no escritório", () => {
    const commands = ownerBotCommandsForSegment(OWNER_BOT_COMMANDS, "LAW_FIRM");
    expect(matchOwnerBotCommand("qual minha nota", commands, "LAW_FIRM").best).toBeUndefined();
    expect(
      matchOwnerBotCommand("campanha para clientes sumidos", commands, "LAW_FIRM").best
    ).toBeUndefined();
  });

  it("a ajuda do escritório fala em audiências e honors, não em corte e fila", () => {
    const catalog = buildOwnerBotSegmentCatalog(OWNER_BOT_COMMANDS, "LAW_FIRM");
    const agenda = catalog.categories.find((category) => category.id === "AGENDA");
    const week = agenda?.commands.find((command) => command.id === "agenda.week");
    expect(week?.description).toBe("Ver as audiências da semana");
    expect(week?.examples[0]).toBe("audiências da semana");
    expect(catalog.categories.some((category) => category.id === "MARKETING")).toBe(false);
  });

  it("exemplos por comando são os do segmento quando existem", () => {
    const schedule = OWNER_BOT_COMMANDS.find(
      (command) => command.id === "appointment.schedule"
    )!;
    expect(ownerBotCommandExamples(schedule, "LAW_FIRM")[0]).toBe("agendar um horário");
    expect(ownerBotCommandExamples(schedule, "BARBERSHOP")[0]).toBe(schedule.examples[0]);
  });

  it("barbearia continua com marketing, nota média e campanha", () => {
    const ids = ownerBotCommandsForSegment(OWNER_BOT_COMMANDS, "BARBERSHOP").map(
      (command) => command.id
    );
    expect(ids).toContain("campaign.inactive");
    expect(ids).toContain("rep.rating");
    expect(ownerBotHasCategory("BARBERSHOP", "MARKETING")).toBe(true);
  });
});
