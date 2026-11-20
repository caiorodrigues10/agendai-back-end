import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_SHOWCASE_BUSINESS_COUNT,
  DEMO_SHOWCASE_SEGMENTS_WITHOUT_IMAGES,
  assertDemoShowcaseOutputIsOutsideGit,
  copyDemoShowcaseAssetFile,
  demoShowcaseFingerprint,
  locateDemoShowcaseMaterialsDirectory,
  processDemoShowcaseAssets,
  readDemoShowcaseManifest,
  readDemoShowcaseManifestJson,
  replaceDemoShowcaseBusinessAssetFilenames,
  resolveDemoShowcaseBusinessAssets,
  resolveDemoShowcaseBusinessDirectory,
  resolveDemoShowcaseManifestAssets,
  swapDemoShowcaseBusinessAssetFilenames,
  writeDemoShowcaseManifest,
} from "./demoShowcaseAssets";

const SEGMENTS_WITHOUT_IMAGES = [
  "HAIR_SALON",
  "BEAUTY_STUDIO",
  "AESTHETICS",
  "VETERINARY",
  "COACHING",
  "PRIVATE_CLASSES",
  "TECH_SUPPORT",
  "OTHER",
];

function businessEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "barbearia",
    segmento: "BARBERSHOP",
    pasta: "Barbearia",
    logo: "logo.png",
    banner: "banner.png",
    confirmar: true,
    extras: [],
    ...overrides,
  };
}

function validManifest() {
  return {
    pastaRaiz: "materiais",
    negocios: Array.from({ length: DEMO_SHOWCASE_BUSINESS_COUNT }, (_, index) =>
      businessEntry({ id: `negocio-${index}` }),
    ),
  };
}

async function writeManifest(root: string, manifest: unknown): Promise<void> {
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest), "utf8");
}

describe("demoShowcaseAssets", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "demo-showcase-assets-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it("mantém a lista de segmentos sem imagem exatamente com os 8 excluídos", () => {
    expect([...DEMO_SHOWCASE_SEGMENTS_WITHOUT_IMAGES].sort()).toEqual(
      [...SEGMENTS_WITHOUT_IMAGES].sort(),
    );
    expect(DEMO_SHOWCASE_SEGMENTS_WITHOUT_IMAGES).toHaveLength(8);
  });

  it("gera fingerprint estável (sha256 hex)", () => {
    expect(demoShowcaseFingerprint("abc")).toBe(demoShowcaseFingerprint("abc"));
    expect(demoShowcaseFingerprint("abc")).toMatch(/^[0-9a-f]{64}$/u);
    expect(demoShowcaseFingerprint("abc")).not.toBe(demoShowcaseFingerprint("abd"));
  });

  describe("readDemoShowcaseManifest", () => {
    it("lê um manifest válido com exatamente 16 negócios", async () => {
      await writeManifest(root, validManifest());
      const manifest = await readDemoShowcaseManifest(root);
      expect(manifest.negocios).toHaveLength(16);
      expect(manifest.negocios[0].id).toBe("negocio-0");
      expect(manifest.negocios[0].confirmar).toBe(true);
    });

    it("falha quando o manifest.json não existe", async () => {
      await expect(readDemoShowcaseManifest(root)).rejects.toThrow(/manifest\.json não encontrado/u);
    });

    it("falha com JSON inválido", async () => {
      await writeFile(path.join(root, "manifest.json"), "{ nope", "utf8");
      await expect(readDemoShowcaseManifest(root)).rejects.toThrow(/manifest\.json inválido/u);
    });

    it("falha quando há menos de 16 negócios", async () => {
      const manifest = validManifest();
      manifest.negocios = manifest.negocios.slice(0, 15);
      await writeManifest(root, manifest);
      await expect(readDemoShowcaseManifest(root)).rejects.toThrow(/esperado 16 negócios/u);
    });

    it("falha com id duplicado", async () => {
      const manifest = validManifest();
      manifest.negocios[1] = { ...manifest.negocios[1], id: manifest.negocios[0].id };
      await writeManifest(root, manifest);
      await expect(readDemoShowcaseManifest(root)).rejects.toThrow(/id duplicado/u);
    });

    it("falha com id fora do padrão slug seguro", async () => {
      const manifest = validManifest();
      manifest.negocios[0] = { ...manifest.negocios[0], id: "../escape" };
      await writeManifest(root, manifest);
      await expect(readDemoShowcaseManifest(root)).rejects.toThrow(/id deve conter/u);
    });

    it("falha com segmento desconhecido", async () => {
      const manifest = validManifest();
      manifest.negocios[0] = { ...manifest.negocios[0], segmento: "NADA_EXISTE" };
      await writeManifest(root, manifest);
      await expect(readDemoShowcaseManifest(root)).rejects.toThrow(/segmento/u);
    });
  });

  describe("resolveDemoShowcaseManifestAssets", () => {
    // NFC (manifesto) vs NFD (disco do macOS): "Cílios" e "lógo".
    const NFC_PASTA = "C\u00EDlios";
    const NFD_PASTA = "Ci\u0301lios";
    const NFC_LOGO = "l\u00F3go.png";
    const NFD_LOGO = "lo\u0301go.png";

    async function materialize(count: number, options: { nfdOnDisk?: boolean } = {}) {
      const manifest = {
        negocios: Array.from({ length: count }, (_, index) =>
          businessEntry({
            id: `negocio-${index}`,
            pasta: NFC_PASTA,
            logo: NFC_LOGO,
            banner: "banner.png",
          }),
        ),
      };
      await writeManifest(root, manifest);
      const dirName = options.nfdOnDisk ? NFD_PASTA : NFC_PASTA;
      const logoName = options.nfdOnDisk ? NFD_LOGO : NFC_LOGO;
      for (let index = 0; index < count; index += 1) {
        const dir = path.join(root, dirName);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, logoName), Buffer.from([1, 2, 3]));
        await writeFile(path.join(dir, "banner.png"), Buffer.from([4, 5, 6]));
      }
      return manifest;
    }

    it("resolve arquivos do manifest (NFC) mesmo com nomes em NFD no disco", async () => {
      const manifest = await materialize(1, { nfdOnDisk: true });
      const resolved = await resolveDemoShowcaseManifestAssets(
        root,
        manifest as Awaited<ReturnType<typeof readDemoShowcaseManifest>>,
      );
      expect(resolved).toHaveLength(1);
      expect(path.basename(resolved[0].logoPath)).toBe(NFD_LOGO);
      expect(resolved[0].logoPath).toContain(NFD_PASTA);
    });

    it("resolve normalmente quando disco e manifest usam o mesmo formato", async () => {
      const manifest = await materialize(1);
      const resolved = await resolveDemoShowcaseManifestAssets(
        root,
        manifest as Awaited<ReturnType<typeof readDemoShowcaseManifest>>,
      );
      expect(resolved).toHaveLength(1);
      expect(path.basename(resolved[0].logoPath)).toBe(NFC_LOGO);
    });

    it("falha com mensagem clara quando um arquivo do manifest falta", async () => {
      const manifest = await materialize(1);
      const dir = path.join(root, NFC_PASTA);
      await rm(path.join(dir, NFC_LOGO));
      await expect(
        resolveDemoShowcaseManifestAssets(
          root,
          manifest as Awaited<ReturnType<typeof readDemoShowcaseManifest>>,
        ),
      ).rejects.toThrow(
        new RegExp(`Arquivo\\(s\\) do manifest não encontrado\\(s\\) para negocio-0.*${NFC_LOGO}`, "u"),
      );
    });

    it("ignora .DS_Store e __MACOSX ao listar a pasta", async () => {
      const manifest = await materialize(1);
      const dir = path.join(root, NFC_PASTA);
      await writeFile(path.join(dir, ".DS_Store"), Buffer.from([0]));
      await mkdir(path.join(dir, "__MACOSX"), { recursive: true });
      const resolved = await resolveDemoShowcaseManifestAssets(
        root,
        manifest as Awaited<ReturnType<typeof readDemoShowcaseManifest>>,
      );
      expect(resolved).toHaveLength(1);
    });
  });

  describe("processDemoShowcaseAssets", () => {
    it("gera logo quadrada 512 com fundo do canto e banner 1600 preservando proporção", async () => {
      const businessDir = path.join(root, "Barbearia");
      await mkdir(businessDir, { recursive: true });
      // Logo 100×60 com canto superior esquerdo vermelho puro (resto azul).
      await sharp({
        create: { width: 100, height: 60, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="10" height="10"><rect width="10" height="10" fill="#ff0000"/></svg>`,
            ),
            left: 0,
            top: 0,
          },
        ])
        .png()
        .toFile(path.join(businessDir, "logo.png"));
      await sharp({
        create: { width: 800, height: 400, channels: 3, background: { r: 20, g: 120, b: 200, alpha: 1 } },
      })
        .png()
        .toFile(path.join(businessDir, "banner.png"));

      const manifest = {
        negocios: [businessEntry({ id: "barbearia", pasta: "Barbearia", logo: "logo.png" })],
      };
      const resolved = await resolveDemoShowcaseManifestAssets(
        root,
        manifest as Awaited<ReturnType<typeof readDemoShowcaseManifest>>,
      );

      const output = path.join(root, "out");
      const processed = await processDemoShowcaseAssets(resolved, output);
      expect(processed).toHaveLength(1);

      const logo = processed[0].logo;
      expect(logo.width).toBe(512);
      expect(logo.height).toBe(512);
      expect(logo.backgroundColor).toBe("#FF0000");

      const banner = processed[0].banner;
      expect(banner.width).toBe(1600);
      expect(banner.height).toBe(800); // proporção 2:1 preservada, sem corte
      expect(banner.accentColor).toMatch(/^#[0-9A-F]{6}$/u);

      // Arquivos WebP gravados no diretório de saída.
      const metadata = await sharp(logo.path).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(512);
      const bannerMetadata = await sharp(banner.path).metadata();
      expect(bannerMetadata.format).toBe("webp");
      expect(bannerMetadata.width).toBe(1600);
    });
  });

  describe("mutações isoladas do manifest e cópia de assets", () => {
    it("troca logo/banner sem mutar o manifest recebido", () => {
      const original = validManifest();
      const swapped = swapDemoShowcaseBusinessAssetFilenames(original, "negocio-3");

      expect(original.negocios[3].logo).toBe("logo.png");
      expect(original.negocios[3].banner).toBe("banner.png");
      expect(swapped.negocios[3].logo).toBe("banner.png");
      expect(swapped.negocios[3].banner).toBe("logo.png");
      expect(swapped.negocios[4]).toEqual(original.negocios[4]);
    });

    it("substitui somente os filenames informados", () => {
      const original = validManifest();
      const replaced = replaceDemoShowcaseBusinessAssetFilenames(original, "negocio-2", {
        logo: "logo-custom.png",
      });

      expect(replaced.negocios[2].logo).toBe("logo-custom.png");
      expect(replaced.negocios[2].banner).toBe("banner.png");
      expect(original.negocios[2].logo).toBe("logo.png");
    });

    it("persiste JSON canônico preservando campos desconhecidos", async () => {
      const manifest = {
        ...validManifest(),
        campoDesconhecido: { preservado: true },
        negocios: validManifest().negocios.map((business, index) => ({
          ...business,
          metadado: index,
        })),
      };
      await writeDemoShowcaseManifest(root, manifest);

      const raw = await readFile(path.join(root, "manifest.json"), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw).toContain('  "negocios"');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.campoDesconhecido).toEqual({ preservado: true });
      expect((parsed.negocios as Array<{ metadado: number }>)[5].metadado).toBe(5);
    });

    it("copia um asset pelo basename e recusa destination com traversal", async () => {
      const source = path.join(root, "source", "logo custom.png");
      await mkdir(path.dirname(source), { recursive: true });
      await writeFile(source, Buffer.from("imagem"));

      const destination = path.join(root, "business");
      const copied = await copyDemoShowcaseAssetFile(source, destination);
      expect(path.basename(copied)).toBe("logo custom.png");
      expect(await readFile(copied, "utf8")).toBe("imagem");

      await expect(
        copyDemoShowcaseAssetFile(source, destination, {
          destinationFileName: "../escape.png",
        }),
      ).rejects.toThrow(/nome do arquivo de destino inválido/u);
    });

    it("resolve a pasta e os dois assets de um único negócio", async () => {
      const manifest = validManifest();
      await writeManifest(root, manifest);
      const businessDir = path.join(root, "Barbearia");
      await mkdir(businessDir, { recursive: true });
      await writeFile(path.join(businessDir, "logo.png"), Buffer.from([1]));
      await writeFile(path.join(businessDir, "banner.png"), Buffer.from([2]));

      const validated = await readDemoShowcaseManifest(root);
      const business = validated.negocios[0];
      expect(await resolveDemoShowcaseBusinessDirectory(root, business)).toBe(businessDir);

      const resolved = await resolveDemoShowcaseBusinessAssets(root, business);
      expect(resolved.business.id).toBe("negocio-0");
      expect(path.basename(resolved.logoPath)).toBe("logo.png");
      expect(path.basename(resolved.bannerPath)).toBe("banner.png");
    });
  });

  describe("assertDemoShowcaseOutputIsOutsideGit", () => {
    it("aceita um diretório fora de qualquer worktree", async () => {
      const output = path.join(root, "out");
      await mkdir(output, { recursive: true });
      await expect(assertDemoShowcaseOutputIsOutsideGit(output, root)).resolves.toBeUndefined();
    });

    it("recusa um diretório dentro de um worktree Git", async () => {
      const output = path.join(root, "repo", "out");
      await mkdir(path.join(root, "repo", ".git"), { recursive: true });
      await mkdir(output, { recursive: true });
      await expect(assertDemoShowcaseOutputIsOutsideGit(output, root)).rejects.toThrow(
        /fora de qualquer worktree Git/u,
      );
    });

    it("falha quando o diretório não existe", async () => {
      await expect(
        assertDemoShowcaseOutputIsOutsideGit(path.join(root, "nope"), root),
      ).rejects.toThrow(/não encontrado/u);
    });
  });

  describe("locateDemoShowcaseMaterialsDirectory", () => {
    it("localiza a pasta agend*materiais* sob a raiz do projeto", async () => {
      const project = path.join(root, "projeto");
      await mkdir(path.join(project, "agendaja-materiais"), { recursive: true });
      const found = await locateDemoShowcaseMaterialsDirectory(project);
      expect(found).toBe(path.join(project, "agendaja-materiais"));
    });

    it("falha quando não há pasta de materiais", async () => {
      const project = path.join(root, "vazio");
      await mkdir(project, { recursive: true });
      await expect(locateDemoShowcaseMaterialsDirectory(project)).rejects.toThrow(
        /Pasta de materiais não encontrada/u,
      );
    });
  });
});
