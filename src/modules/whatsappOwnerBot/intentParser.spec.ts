import { describe, expect, it } from "vitest";
import { parseOwnerBotIntent } from "./intentParser";

describe("parseOwnerBotIntent", () => {
  it("reconhece o código de vínculo", () => {
    expect(parseOwnerBotIntent("VINCULAR A1B2C3")).toEqual({ type: "LINK_CODE", code: "A1B2C3" });
    expect(parseOwnerBotIntent("a1b2c3")).toEqual({ type: "LINK_CODE", code: "A1B2C3" });
  });

  it("não confunde palavra comum com código", () => {
    expect(parseOwnerBotIntent("ajudar").type).not.toBe("LINK_CODE");
    expect(parseOwnerBotIntent("cancelar").type).not.toBe("LINK_CODE");
  });

  it("reconhece confirmação e recusa", () => {
    expect(parseOwnerBotIntent("sim").type).toBe("CONFIRM");
    expect(parseOwnerBotIntent("s").type).toBe("CONFIRM");
    expect(parseOwnerBotIntent("não").type).toBe("DENY");
    expect(parseOwnerBotIntent("nunca").type).toBe("DENY");
  });

  it("trata número como escolha de lista (o contexto decide 1-Sim/2-Não)", () => {
    expect(parseOwnerBotIntent("1")).toEqual({ type: "SELECT", index: 1 });
    expect(parseOwnerBotIntent("2")).toEqual({ type: "SELECT", index: 2 });
  });

  it("separa o comando cancelar da recusa", () => {
    expect(parseOwnerBotIntent("cancelar").type).toBe("CANCEL");
  });

  it("reconhece os comandos principais", () => {
    expect(parseOwnerBotIntent("agenda").type).toBe("AGENDA");
    expect(parseOwnerBotIntent("agendar").type).toBe("SCHEDULE");
    expect(parseOwnerBotIntent("cancelar").type).toBe("CANCEL");
    expect(parseOwnerBotIntent("remarcar").type).toBe("RESCHEDULE");
    expect(parseOwnerBotIntent("check-in").type).toBe("CHECK_IN");
    expect(parseOwnerBotIntent("encerrar").type).toBe("COMPLETE");
    expect(parseOwnerBotIntent("não compareceu").type).toBe("NO_SHOW");
    expect(parseOwnerBotIntent("encaixe").type).toBe("WALK_IN");
    expect(parseOwnerBotIntent("desvincular").type).toBe("UNLINK");
    expect(parseOwnerBotIntent("trocar de unidade").type).toBe("SWITCH_SHOP");
    expect(parseOwnerBotIntent("ajuda").type).toBe("HELP");
    expect(parseOwnerBotIntent("olá").type).toBe("GREETING");
  });

  it("devolve desconhecido quando não entende", () => {
    expect(parseOwnerBotIntent("xyz abc").type).toBe("UNKNOWN");
  });
});
