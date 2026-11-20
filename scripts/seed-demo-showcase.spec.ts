import { describe, expect, it } from "vitest";
import { parseDemoShowcaseArgs } from "./seed-demo-showcase";

describe("seed-demo-showcase — parser do CLI", () => {
  it("usa seed como modo padrão", () => {
    expect(parseDemoShowcaseArgs([])).toMatchObject({
      mode: "seed",
      confirm: false,
      list: false,
      refresh: false,
    });
  });

  it("interpreta verify, purge e refresh", () => {
    expect(parseDemoShowcaseArgs(["--verify"]).mode).toBe("verify");
    expect(parseDemoShowcaseArgs(["--purge"]).mode).toBe("purge");
    expect(parseDemoShowcaseArgs(["--purge", "--confirm"])).toMatchObject({
      mode: "purge",
      confirm: true,
    });
    expect(parseDemoShowcaseArgs(["--refresh"])).toMatchObject({
      mode: "seed",
      refresh: true,
    });
  });

  it("interpreta o filtro e as opções de paths", () => {
    expect(parseDemoShowcaseArgs(["--only=barbearia"])).toMatchObject({
      only: "barbearia",
    });
    expect(parseDemoShowcaseArgs(["--materials=/tmp/materiais", "--output=/tmp/saida"]))
      .toMatchObject({
        materials: "/tmp/materiais",
        output: "/tmp/saida",
      });
    expect(parseDemoShowcaseArgs(["--api=http://127.0.0.1:3333/api"]).api).toBe(
      "http://127.0.0.1:3333/api",
    );
  });

  it("interpreta a troca isolada de imagens", () => {
    expect(parseDemoShowcaseArgs(["--swap-images=barbearia"])).toMatchObject({
      mode: "seed",
      imageMode: "swap",
      imageBusinessId: "barbearia",
    });
    expect(
      parseDemoShowcaseArgs([
        "--images=barbearia",
        "--logo=/tmp/logo.png",
        "--banner=/tmp/banner.png",
      ]),
    ).toMatchObject({
      mode: "seed",
      imageMode: "replace",
      imageBusinessId: "barbearia",
      logoSource: "/tmp/logo.png",
      bannerSource: "/tmp/banner.png",
    });
  });

  it("rejeita combinações ambiguas ou incompatíveis", () => {
    expect(() => parseDemoShowcaseArgs(["--verify", "--purge"])).toThrow(
      /incompatíveis/u,
    );
    expect(() => parseDemoShowcaseArgs(["--swap-images=a", "--images=b"])).toThrow(
      /incompatíveis/u,
    );
    expect(() => parseDemoShowcaseArgs(["--images=barbearia"])).toThrow(
      /exige --logo/u,
    );
    expect(() => parseDemoShowcaseArgs(["--logo=/tmp/logo.png"])).toThrow(
      /exige --images/u,
    );
    expect(() => parseDemoShowcaseArgs(["--refresh", "--verify"])).toThrow(
      /--refresh/u,
    );
    expect(() => parseDemoShowcaseArgs(["--swap-images=a", "--only=b"])).toThrow(
      /--only/u,
    );
    expect(() => parseDemoShowcaseArgs(["--confirm"])).toThrow(/--confirm/u);
  });

  it("rejeita opções vazias e argumentos desconhecidos", () => {
    expect(() => parseDemoShowcaseArgs(["--only="])).toThrow(/--only/u);
    expect(() => parseDemoShowcaseArgs(["--swap-images="])).toThrow(/--swap-images/u);
    expect(() => parseDemoShowcaseArgs(["--images="])).toThrow(/--images/u);
    expect(() => parseDemoShowcaseArgs(["--desconhecido"])).toThrow(
      /Argumento desconhecido/u,
    );
  });
});
