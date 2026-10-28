import { describe, expect, it } from "vitest";
import {
  buildSocialLinksUpdate,
  normalizeSocialLink,
  orderSocialLinks,
} from "./socialLinks";

describe("normalizeSocialLink — Instagram", () => {
  it("aceita @usuario, usuario e URL com/sem esquema", () => {
    expect(normalizeSocialLink("instagram", "@meubarbeiro")).toEqual({
      ok: true,
      url: "https://instagram.com/meubarbeiro",
    });
    expect(normalizeSocialLink("instagram", "meubarbeiro")).toEqual({
      ok: true,
      url: "https://instagram.com/meubarbeiro",
    });
    expect(normalizeSocialLink("instagram", "instagram.com/meubarbeiro")).toEqual({
      ok: true,
      url: "https://instagram.com/meubarbeiro",
    });
    expect(normalizeSocialLink("instagram", "www.instagram.com/meubarbeiro/")).toEqual({
      ok: true,
      url: "https://instagram.com/meubarbeiro",
    });
  });

  it("normaliza https e aceita http convertendo para https", () => {
    expect(normalizeSocialLink("instagram", "https://instagram.com/loja/")).toEqual({
      ok: true,
      url: "https://instagram.com/loja",
    });
    expect(normalizeSocialLink("instagram", "http://instagram.com/loja")).toEqual({
      ok: true,
      url: "https://instagram.com/loja",
    });
  });

  it("recusa host de outra rede com mensagem clara", () => {
    expect(normalizeSocialLink("instagram", "facebook.com/x")).toEqual({
      ok: false,
      error: "O link do Instagram precisa ser de instagram.com",
    });
  });

  it("recusa esquemas perigosos (javascript/data) e ftp", () => {
    for (const raw of ["javascript:alert(1)", "data:text/html,x", "ftp://instagram.com/u"]) {
      expect(normalizeSocialLink("instagram", raw)).toEqual({
        ok: false,
        error: "O link do Instagram precisa ser de instagram.com",
      });
    }
  });

  it("recusa IPs, localhost e porta não padrão", () => {
    for (const raw of ["127.0.0.1", "@127.0.0.1", "localhost", "http://127.0.0.1/u", "https://instagram.com:8080/u"]) {
      expect(normalizeSocialLink("instagram", raw).ok).toBe(false);
    }
  });

  it("recusa URL só com host (sem usuário) e entrada vazia", () => {
    expect(normalizeSocialLink("instagram", "https://instagram.com")).toMatchObject({
      ok: false,
      error: "Informe o usuário do Instagram (ex.: @seuusuario).",
    });
    expect(normalizeSocialLink("instagram", "   ")).toMatchObject({
      ok: false,
      error: "Informe o usuário ou o link do Instagram.",
    });
  });

  it("recusa entrada acima de 300 caracteres", () => {
    expect(normalizeSocialLink("instagram", "a".repeat(301))).toMatchObject({
      ok: false,
      error: "O link do Instagram está muito longo (máximo 300 caracteres).",
    });
  });
});

describe("normalizeSocialLink — por rede", () => {
  it("TikTok: monta URL com @ canônico", () => {
    expect(normalizeSocialLink("tiktok", "@barbearia")).toEqual({
      ok: true,
      url: "https://tiktok.com/@barbearia",
    });
    expect(normalizeSocialLink("tiktok", "tiktok.com/@barbearia")).toEqual({
      ok: true,
      url: "https://tiktok.com/@barbearia",
    });
  });

  it("X: twitter.com vira x.com; handle acima de 15 caracteres é recusado", () => {
    expect(normalizeSocialLink("x", "@fulano")).toEqual({ ok: true, url: "https://x.com/fulano" });
    expect(normalizeSocialLink("x", "twitter.com/fulano")).toEqual({
      ok: true,
      url: "https://x.com/fulano",
    });
    expect(normalizeSocialLink("x", "@nomecompleto_extenso")).toMatchObject({
      ok: false,
      error: "O usuário do X aceita até 15 letras, números e _",
    });
  });

  it("YouTube: aceita @handle e /channel/, recusa watch?v=", () => {
    expect(normalizeSocialLink("youtube", "@seucanal")).toEqual({
      ok: true,
      url: "https://youtube.com/@seucanal",
    });
    expect(normalizeSocialLink("youtube", "youtube.com/channel/UC123abc")).toEqual({
      ok: true,
      url: "https://youtube.com/channel/UC123abc",
    });
    expect(normalizeSocialLink("youtube", "youtube.com/watch?v=abc")).toMatchObject({
      ok: false,
      error: "Informe o link do canal do YouTube (ex.: youtube.com/@seucanal)",
    });
  });

  it("Facebook: aceita página; recusa profile.php", () => {
    expect(normalizeSocialLink("facebook", "@suapagina")).toEqual({
      ok: true,
      url: "https://facebook.com/suapagina",
    });
    expect(normalizeSocialLink("facebook", "facebook.com/pages/Barbearia/123")).toEqual({
      ok: true,
      url: "https://facebook.com/pages/Barbearia/123",
    });
    expect(normalizeSocialLink("facebook", "facebook.com/profile.php?id=1")).toMatchObject({
      ok: false,
      error: "Informe a página do Facebook (ex.: facebook.com/suapagina)",
    });
  });

  it("rede desconhecida gera erro claro", () => {
    expect(normalizeSocialLink("kwai", "@x")).toEqual({
      ok: false,
      error: "Rede social desconhecida: kwai.",
    });
  });
});

describe("buildSocialLinksUpdate", () => {
  it("ordena pelas redes conhecidas e remove entradas vazias", () => {
    const { links, errors } = buildSocialLinksUpdate({
      x: "@fulano",
      instagram: "@meubarbeiro",
      tiktok: "",
      facebook: "   ",
    });
    expect(errors).toEqual({});
    expect(links).toEqual({
      instagram: "https://instagram.com/meubarbeiro",
      x: "https://x.com/fulano",
    });
    expect(Object.keys(links as Record<string, string>)).toEqual(["instagram", "x"]);
  });

  it("tudo vazio resulta em null (limpa o JSON)", () => {
    expect(buildSocialLinksUpdate({ instagram: "", tiktok: null }).links).toBeNull();
  });

  it("chave desconhecida vira erro sem derrubar as válidas", () => {
    const { links, errors } = buildSocialLinksUpdate({ instagram: "@ok", kwai: "@x" });
    expect(links).toEqual({ instagram: "https://instagram.com/ok" });
    expect(errors).toEqual({ kwai: "Rede social desconhecida: kwai." });
  });
});

describe("orderSocialLinks", () => {
  it("só redes conhecidas, só strings não vazias, ordem fixa", () => {
    expect(
      orderSocialLinks({
        facebook: "https://facebook.com/p",
        junk: "https://evil.com",
        instagram: "https://instagram.com/i",
        x: "",
        tiktok: null,
      })
    ).toEqual({
      instagram: "https://instagram.com/i",
      facebook: "https://facebook.com/p",
    });
  });

  it("null/array/string/corrompido viram null", () => {
    expect(orderSocialLinks(null)).toBeNull();
    expect(orderSocialLinks([])).toBeNull();
    expect(orderSocialLinks("x")).toBeNull();
    expect(orderSocialLinks({})).toBeNull();
  });
});
