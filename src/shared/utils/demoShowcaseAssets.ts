import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BusinessSegment } from "@prisma/client";
import { z } from "zod";

export const DEMO_SHOWCASE_BUSINESS_COUNT = 16;
export const DEMO_SHOWCASE_COVER_OVERLAY = 40;
export const DEMO_SHOWCASE_LOGO_SIZE = 512;
export const DEMO_SHOWCASE_BANNER_WIDTH = 1600;

/** Segmentos que não recebem negócio porque não existe material de imagem. */
export const DEMO_SHOWCASE_SEGMENTS_WITHOUT_IMAGES: BusinessSegment[] = [
  "HAIR_SALON",
  "BEAUTY_STUDIO",
  "AESTHETICS",
  "VETERINARY",
  "COACHING",
  "PRIVATE_CLASSES",
  "TECH_SUPPORT",
  "OTHER",
];

const businessManifestSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, "id deve conter apenas letras minúsculas, números, _ ou -"),
    segmento: z.nativeEnum(BusinessSegment),
    pasta: z.string().min(1).max(200),
    logo: z.string().min(1).max(500),
    banner: z.string().min(1).max(500),
    confirmar: z.boolean().optional().default(false),
    extras: z.array(z.string().min(1).max(500)).optional().default([]),
  })
  .passthrough();

const manifestSchema = z
  .object({
    pastaRaiz: z.string().optional(),
    negocios: z.array(businessManifestSchema),
  })
  .passthrough()
  .superRefine((manifest, ctx) => {
    if (manifest.negocios.length !== DEMO_SHOWCASE_BUSINESS_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["negocios"],
        message: `esperado ${DEMO_SHOWCASE_BUSINESS_COUNT} negócios, recebido ${manifest.negocios.length}`,
      });
    }

    const seen = new Set<string>();
    manifest.negocios.forEach((business, index) => {
      if (seen.has(business.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["negocios", index, "id"],
          message: `id duplicado: ${business.id}`,
        });
      }
      seen.add(business.id);
    });
  });

export interface DemoShowcaseManifestBusiness {
  [key: string]: unknown;
  id: string;
  segmento: BusinessSegment;
  pasta: string;
  logo: string;
  banner: string;
  confirmar: boolean;
  extras: string[];
}

export interface DemoShowcaseManifest {
  [key: string]: unknown;
  pastaRaiz?: string;
  negocios: DemoShowcaseManifestBusiness[];
}

/** Estrutura JSON bruta usada nas mutações para preservar campos desconhecidos. */
export interface DemoShowcaseManifestJsonBusiness {
  [key: string]: unknown;
  id: string;
  logo: string;
  banner: string;
}

/** Manifesto JSON sem defaults de schema, preservando todos os campos originais. */
export interface DemoShowcaseManifestJson {
  [key: string]: unknown;
  negocios: DemoShowcaseManifestJsonBusiness[];
}

export interface DemoShowcaseBusinessAssetFilenames {
  logo?: string;
  banner?: string;
}

export type DemoShowcaseBusinessAssetUpdate =
  | { type: "swap" }
  | { type: "replace"; filenames: DemoShowcaseBusinessAssetFilenames };

export interface ResolvedManifestAsset {
  business: DemoShowcaseManifestBusiness;
  logoPath: string;
  bannerPath: string;
  extrasPaths: string[];
}

export interface ProcessedDemoShowcaseImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface ProcessedDemoShowcaseAsset {
  businessId: string;
  logo: ProcessedDemoShowcaseImage & {
    path: string;
    backgroundColor: string;
  };
  banner: ProcessedDemoShowcaseImage & {
    path: string;
    accentColor: string;
  };
  source: {
    logo: { width: number; height: number; format?: string };
    banner: { width: number; height: number; format?: string };
  };
}

export interface DemoShowcaseAssetReport extends ProcessedDemoShowcaseAsset {
  manifest: DemoShowcaseManifestBusiness;
}

function nfc(value: string): string {
  return value.normalize("NFC");
}

function normalizedKey(value: string): string {
  return nfc(value);
}

/**
 * Localiza a pasta de materiais pelo nome, sem assumir grafia/acento nem abrir
 * imagens. O nome pode estar em NFD no macOS.
 */
export async function locateDemoShowcaseMaterialsDirectory(projectRoot: string): Promise<string> {
  const candidates: string[] = [];

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 2) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__MACOSX") {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      const normalizedName = nfc(entry.name).toLocaleLowerCase("pt-BR");
      if (/^agend.*materiais$/u.test(normalizedName)) {
        candidates.push(fullPath);
        continue;
      }
      await visit(fullPath, depth + 1);
    }
  };

  await visit(projectRoot, 0);
  const uniqueCandidates = [...new Set(candidates.map((candidate) => path.resolve(candidate)))].sort();
  if (uniqueCandidates.length === 0) {
    throw new Error(
      `Pasta de materiais não encontrada sob ${projectRoot}. Esperado um diretório "agend*materiais*".`,
    );
  }
  if (uniqueCandidates.length > 1) {
    throw new Error(
      `Mais de uma pasta de materiais encontrada; informe --materials=<path>: ${uniqueCandidates.join(", ")}`,
    );
  }
  return uniqueCandidates[0];
}

interface DemoShowcaseManifestSource {
  manifestPath: string;
  parsed: unknown;
  validated: DemoShowcaseManifest;
}

async function readDemoShowcaseManifestSource(
  materialsDirectory: string,
): Promise<DemoShowcaseManifestSource> {
  const manifestPath = path.join(materialsDirectory, "manifest.json");
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`manifest.json não encontrado em ${materialsDirectory}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`manifest.json inválido em ${manifestPath}: ${detail}`);
  }

  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
      .join("; ");
    throw new Error(`manifest.json inválido em ${manifestPath}: ${detail}`);
  }
  return {
    manifestPath,
    parsed,
    validated: result.data as DemoShowcaseManifest,
  };
}

export async function readDemoShowcaseManifest(materialsDirectory: string): Promise<DemoShowcaseManifest> {
  const source = await readDemoShowcaseManifestSource(materialsDirectory);
  return source.validated;
}

/**
 * Lê o JSON bruto já validado. As mutações usam esta forma para não perder
 * campos desconhecidos nem adicionar defaults do schema ao persistir.
 */
export async function readDemoShowcaseManifestJson(
  materialsDirectory: string,
): Promise<DemoShowcaseManifestJson> {
  const source = await readDemoShowcaseManifestSource(materialsDirectory);
  return source.parsed as DemoShowcaseManifestJson;
}

function assertValidDemoShowcaseManifest(
  value: unknown,
  context = "manifest.json",
): asserts value is DemoShowcaseManifestJson {
  const result = manifestSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${context} inválido: ${detail}`);
  }
}

function selectedBusinessIndex(
  manifest: DemoShowcaseManifestJson,
  businessId: string,
): number {
  const index = manifest.negocios.findIndex((business) => business.id === businessId);
  if (index < 0) {
    throw new Error(`Negócio não encontrado no manifest.json: ${businessId}`);
  }
  return index;
}

/**
 * Aceita somente um basename simples. Isso bloqueia caminhos absolutos,
 * separadores POSIX/Windows e segmentos "."/".." usados em path traversal.
 */
export function isSafeDemoShowcaseFileName(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  if (value === "." || value === "..") return false;
  if (value.includes("/") || value.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  if (path.posix.basename(value) !== value || path.win32.basename(value) !== value) return false;
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  return true;
}

export function assertSafeDemoShowcaseFileName(
  value: string,
  fieldName = "nome de arquivo",
): string {
  if (!isSafeDemoShowcaseFileName(value)) {
    throw new Error(
      `${fieldName} inválido: ${JSON.stringify(value)}. Use somente o nome do arquivo, sem caminho.`,
    );
  }
  return value;
}

export interface CopyDemoShowcaseAssetFileOptions {
  /** Nome final dentro do diretório de destino. Por padrão, usa o basename da origem. */
  destinationFileName?: string;
  /** Permite substituir um arquivo já existente no destino. */
  overwrite?: boolean;
}

/**
 * Copia um arquivo para a pasta do negócio sem permitir que a origem escape do
 * destino. A origem pode ser absoluta; o nome final, porém, sempre é um
 * basename simples. A cópia passa por um arquivo temporário e um rename, para
 * que leitores nunca observem um arquivo parcialmente gravado.
 */
export async function copyDemoShowcaseAssetFile(
  sourcePath: string,
  destinationDirectory: string,
  options: CopyDemoShowcaseAssetFileOptions = {},
): Promise<string> {
  const source = path.resolve(sourcePath);
  const sourceStat = await stat(source).catch(() => null);
  if (!sourceStat?.isFile()) {
    throw new Error(`Arquivo de origem não encontrado ou não é um arquivo regular: ${sourcePath}`);
  }

  const requestedName = options.destinationFileName ?? path.basename(source);
  const destinationName = assertSafeDemoShowcaseFileName(
    requestedName,
    "nome do arquivo de destino",
  );
  const destinationRoot = path.resolve(destinationDirectory);
  const destination = path.resolve(destinationRoot, destinationName);
  if (path.dirname(destination) !== destinationRoot) {
    throw new Error(
      `Destino inválido para o asset: ${JSON.stringify(destinationName)}. Use somente um basename.`,
    );
  }

  await mkdir(destinationRoot, { recursive: true });
  if (!options.overwrite) {
    const destinationStat = await stat(destination).catch(() => null);
    if (destinationStat) {
      throw new Error(`Arquivo de destino já existe: ${destination}`);
    }
  }

  const temporaryPath = path.join(
    destinationRoot,
    `.${destinationName}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await copyFile(source, temporaryPath);
    await rename(temporaryPath, destination);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return destination;
}

/** Troca logo e banner do negócio selecionado sem mutar o objeto recebido. */
export function swapDemoShowcaseBusinessAssetFilenames(
  manifest: DemoShowcaseManifestJson,
  businessId: string,
): DemoShowcaseManifestJson {
  assertValidDemoShowcaseManifest(manifest);
  const index = selectedBusinessIndex(manifest, businessId);
  const business = manifest.negocios[index];
  const logo = assertSafeDemoShowcaseFileName(
    business.logo,
    `nome de arquivo do logo do negócio ${businessId}`,
  );
  const banner = assertSafeDemoShowcaseFileName(
    business.banner,
    `nome de arquivo do banner do negócio ${businessId}`,
  );

  return {
    ...manifest,
    negocios: manifest.negocios.map((currentBusiness, currentIndex) =>
      currentIndex === index
        ? { ...currentBusiness, logo: banner, banner: logo }
        : { ...currentBusiness },
    ),
  };
}

/** Substitui logo, banner ou ambos no negócio selecionado, sem mutar a entrada. */
export function replaceDemoShowcaseBusinessAssetFilenames(
  manifest: DemoShowcaseManifestJson,
  businessId: string,
  filenames: DemoShowcaseBusinessAssetFilenames,
): DemoShowcaseManifestJson {
  assertValidDemoShowcaseManifest(manifest);
  if (filenames.logo === undefined && filenames.banner === undefined) {
    throw new Error("Informe pelo menos um novo nome de arquivo para logo ou banner.");
  }

  const index = selectedBusinessIndex(manifest, businessId);
  const business = manifest.negocios[index];
  const logo = assertSafeDemoShowcaseFileName(
    filenames.logo ?? business.logo,
    `nome de arquivo do logo do negócio ${businessId}`,
  );
  const banner = assertSafeDemoShowcaseFileName(
    filenames.banner ?? business.banner,
    `nome de arquivo do banner do negócio ${businessId}`,
  );

  return {
    ...manifest,
    negocios: manifest.negocios.map((currentBusiness, currentIndex) =>
      currentIndex === index
        ? { ...currentBusiness, logo, banner }
        : { ...currentBusiness },
    ),
  };
}

/** Formato canônico: JSON com indentação de dois espaços e newline final. */
export function formatDemoShowcaseManifestJson(manifest: DemoShowcaseManifestJson): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Persiste o manifesto por arquivo temporário + rename no mesmo diretório.
 * O rename torna visível a troca completa do arquivo, sem JSON parcial.
 */
export async function writeDemoShowcaseManifest(
  materialsDirectory: string,
  manifest: DemoShowcaseManifestJson,
): Promise<void> {
  const manifestPath = path.join(materialsDirectory, "manifest.json");
  assertValidDemoShowcaseManifest(manifest, `manifest.json em ${manifestPath}`);
  const serialized = formatDemoShowcaseManifestJson(manifest);

  await mkdir(materialsDirectory, { recursive: true });
  const temporaryPath = path.join(
    materialsDirectory,
    `.manifest.json.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, manifestPath);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Releem o manifesto atual, validam a invariante dos 16 negócios e aplicam a
 * mutação antes de persistir atomicamente.
 */
export async function updateDemoShowcaseManifestBusinessAssets(
  materialsDirectory: string,
  businessId: string,
  update: DemoShowcaseBusinessAssetUpdate,
): Promise<DemoShowcaseManifestJson> {
  const manifest = await readDemoShowcaseManifestJson(materialsDirectory);
  selectedBusinessIndex(manifest, businessId);

  let updated: DemoShowcaseManifestJson;
  switch (update.type) {
    case "swap":
      updated = swapDemoShowcaseBusinessAssetFilenames(manifest, businessId);
      break;
    case "replace":
      updated = replaceDemoShowcaseBusinessAssetFilenames(
        manifest,
        businessId,
        update.filenames,
      );
      break;
    default:
      throw new Error(
        `Mutação de assets não suportada: ${String((update as { type: string }).type)}`,
      );
  }

  await writeDemoShowcaseManifest(materialsDirectory, updated);
  return updated;
}

export async function swapDemoShowcaseManifestBusinessAssets(
  materialsDirectory: string,
  businessId: string,
): Promise<DemoShowcaseManifestJson> {
  return updateDemoShowcaseManifestBusinessAssets(materialsDirectory, businessId, {
    type: "swap",
  });
}

export async function replaceDemoShowcaseManifestBusinessAssetFilenames(
  materialsDirectory: string,
  businessId: string,
  filenames: DemoShowcaseBusinessAssetFilenames,
): Promise<DemoShowcaseManifestJson> {
  return updateDemoShowcaseManifestBusinessAssets(materialsDirectory, businessId, {
    type: "replace",
    filenames,
  });
}

async function resolveDirectoryByNormalizedName(
  parent: string,
  expectedName: string,
  context: string,
): Promise<string> {
  let entries;
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Não foi possível ler ${context} em ${parent}: ${detail}`);
  }

  const expected = normalizedKey(expectedName);
  const matches = entries.filter(
    (entry) => entry.isDirectory() && normalizedKey(entry.name) === expected,
  );
  if (matches.length === 0) {
    throw new Error(`Pasta do manifest não encontrada (${context}): ${expectedName}`);
  }
  if (matches.length > 1) {
    throw new Error(`Pasta do manifest ambígua (${context}): ${expectedName}`);
  }
  return path.join(parent, matches[0].name);
}

/**
 * Resolve a pasta do negócio sem depender da normalização Unicode do macOS.
 * Usado pela troca de imagens para copiar arquivos fornecidos pelo usuário
 * exatamente na pasta que o manifesto referencia.
 */
export async function resolveDemoShowcaseBusinessDirectory(
  materialsDirectory: string,
  business: DemoShowcaseManifestBusiness,
): Promise<string> {
  return resolveDirectoryByNormalizedName(
    materialsDirectory,
    business.pasta,
    `negócio ${business.id}`,
  );
}

async function listFilesByNormalizedName(directory: string): Promise<Map<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === ".DS_Store" || entry.name === "__MACOSX") continue;
    const key = normalizedKey(entry.name);
    const existing = files.get(key);
    if (existing) {
      throw new Error(
        `Nomes duplicados após normalização Unicode em ${directory}: ${existing} e ${entry.name}`,
      );
    }
    files.set(key, path.join(directory, entry.name));
  }
  return files;
}

/**
 * Resolve logo, banner e extras de um único negócio comparando NFC dos dois
 * lados. Não usa a string do manifest diretamente no path: no macOS ela pode
 * estar NFD. Os modos de imagem usam esta função para não processar os outros
 * tenants do manifesto.
 */
export async function resolveDemoShowcaseBusinessAssets(
  materialsDirectory: string,
  business: DemoShowcaseManifestBusiness,
): Promise<ResolvedManifestAsset> {
  const businessDirectory = await resolveDemoShowcaseBusinessDirectory(
    materialsDirectory,
    business,
  );
  const files = await listFilesByNormalizedName(businessDirectory);
  const missing: string[] = [];

  const resolveFile = (fileName: string): string => {
    const filePath = files.get(normalizedKey(fileName));
    if (!filePath) missing.push(fileName);
    return filePath ?? "";
  };

  const logoPath = resolveFile(business.logo);
  const bannerPath = resolveFile(business.banner);
  const extrasPaths = business.extras.map((extra) => resolveFile(extra));

  if (missing.length > 0) {
    throw new Error(
      `Arquivo(s) do manifest não encontrado(s) para ${business.id} em ${businessDirectory}: ${missing.join(", ")}`,
    );
  }

  return { business, logoPath, bannerPath, extrasPaths };
}

/**
 * Resolve todos os arquivos citados pelo manifest comparando NFC dos dois lados.
 * Não usa a string do manifest diretamente no path: no macOS ela pode estar NFD.
 */
export async function resolveDemoShowcaseManifestAssets(
  materialsDirectory: string,
  manifest: DemoShowcaseManifest,
): Promise<ResolvedManifestAsset[]> {
  const resolved: ResolvedManifestAsset[] = [];

  for (const business of manifest.negocios) {
    resolved.push(await resolveDemoShowcaseBusinessAssets(materialsDirectory, business));
  }

  return resolved;
}

function rgbToHex(red: number, green: number, blue: number): string {
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
}

async function readCornerColor(imagePath: string): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(imagePath)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (data.length < 3 || info.channels < 3) {
    throw new Error(`Não foi possível ler o pixel do canto superior esquerdo de ${imagePath}`);
  }
  return { r: data[0], g: data[1], b: data[2] };
}

/**
 * Processa logo e banner somente por metadados/pixels. A logo fica quadrada
 * com `contain` (sem corte) e fundo igual ao canto superior esquerdo; o banner
 * mantém a proporção e recebe largura 1600. Os originais nunca são alterados.
 */
export async function processDemoShowcaseAssets(
  resolvedAssets: ResolvedManifestAsset[],
  outputDirectory: string,
): Promise<ProcessedDemoShowcaseAsset[]> {
  await mkdir(outputDirectory, { recursive: true });
  const processed: ProcessedDemoShowcaseAsset[] = [];

  for (const asset of resolvedAssets) {
    const logoMetadata = await sharp(asset.logoPath).metadata();
    const bannerMetadata = await sharp(asset.bannerPath).metadata();
    if (!logoMetadata.width || !logoMetadata.height) {
      throw new Error(`Dimensões inválidas para logo de ${asset.business.id}: ${asset.logoPath}`);
    }
    if (!bannerMetadata.width || !bannerMetadata.height) {
      throw new Error(`Dimensões inválidas para banner de ${asset.business.id}: ${asset.bannerPath}`);
    }

    const corner = await readCornerColor(asset.logoPath);
    const logoResult = await sharp(asset.logoPath)
      .resize(DEMO_SHOWCASE_LOGO_SIZE, DEMO_SHOWCASE_LOGO_SIZE, {
        fit: "contain",
        background: { ...corner, alpha: 1 },
        kernel: sharp.kernel.lanczos3,
      })
      .webp({ quality: 88, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const bannerResult = await sharp(asset.bannerPath)
      .resize({ width: DEMO_SHOWCASE_BANNER_WIDTH, fit: "inside" })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const bannerStats = await sharp(bannerResult.data).stats();
    const dominant = bannerStats.dominant;
    const accentColor = rgbToHex(dominant.r, dominant.g, dominant.b);

    const logoPath = path.resolve(outputDirectory, `${asset.business.id}-logo.webp`);
    const bannerPath = path.resolve(outputDirectory, `${asset.business.id}-banner.webp`);
    const outputRoot = path.resolve(outputDirectory);
    if (
      !logoPath.startsWith(`${outputRoot}${path.sep}`) ||
      !bannerPath.startsWith(`${outputRoot}${path.sep}`)
    ) {
      throw new Error(`Caminho de saída inválido para o negócio ${asset.business.id}`);
    }
    if (logoResult.data.byteLength > 2 * 1024 * 1024) {
      throw new Error(`Logo otimizada excede 2 MB para ${asset.business.id}`);
    }
    if (bannerResult.data.byteLength > 5 * 1024 * 1024) {
      throw new Error(`Banner otimizado excede 5 MB para ${asset.business.id}`);
    }
    await writeFile(logoPath, logoResult.data);
    await writeFile(bannerPath, bannerResult.data);

    processed.push({
      businessId: asset.business.id,
      logo: {
        buffer: logoResult.data,
        width: logoResult.info.width,
        height: logoResult.info.height,
        path: logoPath,
        backgroundColor: rgbToHex(corner.r, corner.g, corner.b),
      },
      banner: {
        buffer: bannerResult.data,
        width: bannerResult.info.width,
        height: bannerResult.info.height,
        path: bannerPath,
        accentColor,
      },
      source: {
        logo: {
          width: logoMetadata.width,
          height: logoMetadata.height,
          format: logoMetadata.format,
        },
        banner: {
          width: bannerMetadata.width,
          height: bannerMetadata.height,
          format: bannerMetadata.format,
        },
      },
    });
  }

  return processed;
}

export async function assertDemoShowcaseOutputIsOutsideGit(
  outputDirectory: string,
  _projectRoot: string,
): Promise<void> {
  const outputStat = await stat(outputDirectory).catch(() => null);
  if (!outputStat?.isDirectory()) {
    throw new Error(`Diretório de saída não encontrado: ${outputDirectory}`);
  }

  let current = path.resolve(outputDirectory);
  while (true) {
    const gitMarker = path.join(current, ".git");
    const gitStat = await stat(gitMarker).catch(() => null);
    if (gitStat) {
      throw new Error(
        `Saída otimizada deve ficar fora de qualquer worktree Git; recebido ${outputDirectory}`,
      );
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function demoShowcaseFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
