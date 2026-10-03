/// <reference types="vitest/globals" />

import {
  getCorrelationId,
  jobCorrelationId,
  newCorrelationId,
  resolveCorrelationId,
  runWithCorrelationId,
  withCorrelationScope,
  withCronCorrelation,
} from "./correlationContext";
import { withCorrelationLogs } from "./logger";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PADRAO = /^[A-Za-z0-9._:-]{8,100}$/;

describe("correlationContext", () => {
  it("sem escopo, getCorrelationId retorna undefined", () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it("propaga síncrono e assíncrono dentro do escopo e não vaza depois", async () => {
    const resultado = await runWithCorrelationId("req-abcdef12", async () => {
      const sincrono = getCorrelationId();
      await new Promise((resolve) => setImmediate(resolve));
      const assincrono = getCorrelationId();
      return { sincrono, assincrono };
    });

    expect(resultado.sincrono).toBe("req-abcdef12");
    expect(resultado.assincrono).toBe("req-abcdef12");
    expect(getCorrelationId()).toBeUndefined();
  });

  it("escopo interno prevalece e o externo volta ao final", () => {
    runWithCorrelationId("externo-0001", () => {
      expect(getCorrelationId()).toBe("externo-0001");
      runWithCorrelationId("interno-0002", () => {
        expect(getCorrelationId()).toBe("interno-0002");
      });
      expect(getCorrelationId()).toBe("externo-0001");
    });
    expect(getCorrelationId()).toBeUndefined();
  });

  it("withCorrelationScope gera id autônomo válido", () => {
    const id = withCorrelationScope("dispatcher", () => getCorrelationId());
    expect(id).toBeDefined();
    expect(id).toMatch(PADRAO);
    expect(id).toMatch(/^dispatcher:/);
    expect(getCorrelationId()).toBeUndefined();
  });

  describe("resolveCorrelationId", () => {
    it("mantém header válido", () => {
      expect(resolveCorrelationId("abc.DEF-123_x:9")).toBe("abc.DEF-123_x:9");
    });

    it("gera UUID para valor curto, longo ou com caracteres inválidos", () => {
      expect(resolveCorrelationId("curto")).toMatch(UUID);
      expect(resolveCorrelationId("x".repeat(101))).toMatch(UUID);
      expect(resolveCorrelationId("id com espaço")).toMatch(UUID);
      expect(resolveCorrelationId(undefined)).toMatch(UUID);
      expect(resolveCorrelationId(42)).toMatch(UUID);
    });
  });

  describe("newCorrelationId", () => {
    it("gera ids únicos dentro do padrão aceito pelo header", () => {
      const um = newCorrelationId("job:fila:a1");
      const dois = newCorrelationId("job:fila:a1");
      expect(um).toMatch(PADRAO);
      expect(dois).toMatch(PADRAO);
      expect(um).not.toBe(dois);
      expect(um.startsWith("job:fila:a1:")).toBe(true);
    });

    it("saneia caracteres inválidos do prefixo", () => {
      const id = newCorrelationId("meu prefixo!");
      expect(id).toMatch(PADRAO);
      expect(id.startsWith("meu-prefixo-")).toBe(true);
    });
  });

  describe("jobCorrelationId", () => {
    it("prefere o correlationId herdado quando é válido", () => {
      expect(jobCorrelationId("email", "j1", "herdado-0001")).toBe(
        "herdado-0001",
      );
    });

    it("gera id rastreável pela fila sem herança ou com herança inválida", () => {
      const semHeranca = jobCorrelationId("email", "j1");
      expect(semHeranca).toMatch(PADRAO);
      expect(semHeranca).toContain("job:email:j1");

      const curto = jobCorrelationId("email", "j1", "x");
      expect(curto).toMatch(PADRAO);
      expect(curto).toContain("job:email:j1");

      const invalido = jobCorrelationId("email", undefined, "tem espaço!");
      expect(invalido).toMatch(PADRAO);
      expect(invalido).toContain("job:email:sem-id");
    });
  });

  describe("withCronCorrelation", () => {
    it("envolve o handler com correlationId próprio e repassa argumentos", async () => {
      let idVisto: string | undefined;
      const handler = vi.fn((a: number, b: number) => {
        idVisto = getCorrelationId();
        return a + b;
      });
      const envolvido = withCronCorrelation("diario", handler);

      const soma = await envolvido(2, 3);
      expect(soma).toBe(5);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(idVisto).toMatch(/^cron:diario:/);

      const idDentro = withCronCorrelation(
        "diario",
        () => getCorrelationId(),
      )();
      expect(idDentro).toMatch(/^cron:diario:/);
      expect(idDentro).toMatch(PADRAO);
      expect(getCorrelationId()).toBeUndefined();
    });

    it("dois handlers na mesma execução não compartilham o mesmo id", () => {
      const idA = withCronCorrelation("a", () => getCorrelationId())();
      const idB = withCronCorrelation("b", () => getCorrelationId())();
      expect(idA).not.toBe(idB);
    });
  });
});

describe("withCorrelationLogs", () => {
  function novoLogger() {
    const info = vi.fn();
    const erro = vi.fn();
    const filho: any = { info, error: erro, child: vi.fn(() => filho) };
    const raiz: any = { info, error: erro, child: vi.fn(() => filho) };
    return { raiz, filho, info, erro };
  }

  it("injeta correlationId do contexto em chamadas com string", () => {
    const { raiz, info } = novoLogger();
    const envolvido = withCorrelationLogs(raiz);

    runWithCorrelationId("log-ctx-01", () => envolvido.info("mensagem"));
    expect(info).toHaveBeenCalledWith({ correlationId: "log-ctx-01" }, "mensagem");
  });

  it("reescreve Error como { err, correlationId } (equivalente ao pino)", () => {
    const { raiz, erro } = novoLogger();
    const envolvido = withCorrelationLogs(raiz);
    const falha = new Error("boom");

    runWithCorrelationId("log-ctx-02", () => envolvido.error(falha, "falhou"));
    expect(erro).toHaveBeenCalledWith(
      { err: falha, correlationId: "log-ctx-02" },
      "falhou",
    );
  });

  it("correlationId explícito do chamador tem prioridade sobre o do contexto", () => {
    const { raiz, info } = novoLogger();
    const envolvido = withCorrelationLogs(raiz);

    runWithCorrelationId("log-ctx-03", () =>
      envolvido.info({ correlationId: "explicito-9", bar: 1 }, "msg"),
    );
    expect(info).toHaveBeenCalledWith(
      { correlationId: "explicito-9", bar: 1 },
      "msg",
    );
  });

  it("sem contexto de correlação não altera os argumentos", () => {
    const { raiz, info } = novoLogger();
    const envolvido = withCorrelationLogs(raiz);

    envolvido.info("sem contexto");
    expect(info).toHaveBeenCalledWith("sem contexto");
  });

  it("envolve loggers retornados por child", () => {
    const { raiz, info } = novoLogger();
    const envolvido = withCorrelationLogs(raiz);

    runWithCorrelationId("log-ctx-04", () =>
      envolvido.child({ module: "x" }).info("do filho"),
    );
    expect(raiz.child).toHaveBeenCalledWith({ module: "x" });
    expect(info).toHaveBeenCalledWith(
      { correlationId: "log-ctx-04" },
      "do filho",
    );
  });

  it("é idempotente: envolver de novo devolve a mesma referência", () => {
    const { raiz } = novoLogger();
    const uma = withCorrelationLogs(raiz);
    const duas = withCorrelationLogs(uma);
    expect(duas).toBe(uma);
  });
});
