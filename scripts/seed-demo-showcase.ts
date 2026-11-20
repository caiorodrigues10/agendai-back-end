/**
 * Seed de showcase de demonstração — 16 negócios com logo/capa reais do
 * manifesto `agendaja-materiais/manifest.json`.
 *
 * Fluxo:
 *   1. lê e valida o manifest (exatamente 16 negócios; falha se arquivo faltar);
 *   2. resolve os arquivos por comparação NFC (macOS NFD) — nunca abre imagem;
 *   3. processa logo/banner com `sharp` (logo 512×512 `contain` com fundo do
 *      pixel do canto; banner largura 1600 mantendo proporção) para um
 *      diretório FORA do Git (`tmp/demo-showcase-images/` na raiz do projeto);
 *   4. cria os 16 tenants idempotentes (UUIDs fixos) + serviços/equipa/clientes/
 *      agendamentos de hoje/amanhã + tema com `coverOverlay = 40` e accent
 *      calculado das estatísticas do banner;
 *   5. sobe logo/capa pelo storage da aplicação (Cloudinary; fallback local de
 *      dev somente sem credenciais).
 *
 * Uso:
 *   npm run prisma:seed:demo-showcase                     # seed idempotente
 *   npm run prisma:seed:demo-showcase -- --verify         # DB + API + HTTP
 *   npm run prisma:seed:demo-showcase -- --purge          # DRY-RUN
 *   npm run prisma:seed:demo-showcase -- --purge --confirm
 *   npm run prisma:seed:demo-showcase -- --only=barbearia # só 1 negócio/segmento
 *   npm run prisma:seed:demo-showcase -- --list           # mapeamento estático
 *
 * Opcionais: `--materials=<dir>` `--output=<dir>` `--api=<baseUrl>` (com `/api`).
 * `--only=<id|SEGMENTO>` filtra seed/verify/purge (id do manifest ou segmento,
 * sem diferenciar maiúsculas). `--list` imprime a tabela id → nome → e-mail do
 * dono sem tocar em banco/env (apenas manifest).
 * Senha da equipe: `SEED_DEMO_SHOWCASE_PASSWORD` (obrigatória, só via env).
 * Guardas: `SEED_DEMO=true` + banco local; recusa produção.
 */
import "reflect-metadata";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { BcryptHashProvider } from "../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider";
import { CloudinaryStorageProvider } from "../src/shared/container/providers/StorageProvider/implementations/CloudinaryStorageProvider";
import type { IStorageProvider } from "../src/shared/container/providers/StorageProvider/IStorageProvider";
import {
  COVER_IMAGE_SPEC,
  LOGO_IMAGE_SPEC,
  imageSpecFolder,
  imageSpecPublicId,
} from "../src/shared/constants/imageSpecs";
import {
  DemoShowcaseLocalDevStorage,
  serveDemoShowcaseLocalDevStorage,
  type DemoShowcaseLocalDevServer,
} from "../src/shared/utils/demoShowcaseLocalStorage";
import {
  assertDemoShowcaseOutputIsOutsideGit,
  assertSafeDemoShowcaseFileName,
  copyDemoShowcaseAssetFile,
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
} from "../src/shared/utils/demoShowcaseAssets";
import {
  assertDemoShowcaseSeedAllowed,
  demoShowcaseBusinessEmails,
  demoShowcaseDisplayName,
  demoShowcaseUuid,
  filterDemoShowcaseBusinesses,
  purgeDemoShowcase,
  seedDemoShowcase,
  seedDemoShowcaseImages,
  verifyDemoShowcase,
} from "../src/shared/utils/demoShowcaseSeed";
import type {
  DemoShowcaseManifest,
  DemoShowcaseManifestBusiness,
  DemoShowcaseManifestJson,
  ProcessedDemoShowcaseAsset,
} from "../src/shared/utils/demoShowcaseAssets";
import type {
  DemoShowcaseBusinessCounts,
  DemoShowcasePrivateScreen,
  DemoShowcaseVerificationReport,
} from "../src/shared/utils/demoShowcaseSeed";

export interface DemoShowcaseArgs {
  mode: "seed" | "verify" | "purge";
  confirm: boolean;
  list: boolean;
  refresh: boolean;
  only?: string;
  materials?: string;
  output?: string;
  api?: string;
  imageMode?: "swap" | "replace";
  imageBusinessId?: string;
  logoSource?: string;
  bannerSource?: string;
}

function requiredOptionValue(argument: string, name: string): string {
  const value = argument.slice(name.length).trim();
  if (!value) throw new Error(`${name} exige um valor não vazio`);
  return value;
}

export function parseDemoShowcaseArgs(argv: string[]): DemoShowcaseArgs {
  const args: DemoShowcaseArgs = {
    mode: "seed",
    confirm: false,
    list: false,
    refresh: false,
  };
  let verify = false;
  let purge = false;
  let swapImages: string | undefined;
  let images: string | undefined;

  for (const arg of argv) {
    if (arg === "--verify") verify = true;
    else if (arg === "--purge") purge = true;
    else if (arg === "--confirm") args.confirm = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--refresh") args.refresh = true;
    else if (arg.startsWith("--only=")) {
      args.only = requiredOptionValue(arg, "--only=");
    } else if (arg.startsWith("--materials=")) {
      args.materials = requiredOptionValue(arg, "--materials=");
    } else if (arg.startsWith("--output=")) {
      args.output = requiredOptionValue(arg, "--output=");
    } else if (arg.startsWith("--api=")) {
      args.api = requiredOptionValue(arg, "--api=");
    } else if (arg.startsWith("--swap-images=")) {
      swapImages = requiredOptionValue(arg, "--swap-images=");
    } else if (arg.startsWith("--images=")) {
      images = requiredOptionValue(arg, "--images=");
    } else if (arg.startsWith("--logo=")) {
      args.logoSource = requiredOptionValue(arg, "--logo=");
    } else if (arg.startsWith("--banner=")) {
      args.bannerSource = requiredOptionValue(arg, "--banner=");
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  if (verify && purge) throw new Error("--verify e --purge são modos incompatíveis");
  if (verify) args.mode = "verify";
  if (purge) args.mode = "purge";
  if (swapImages && images) {
    throw new Error("--swap-images e --images são operações incompatíveis");
  }
  if (swapImages) {
    args.imageMode = "swap";
    args.imageBusinessId = swapImages;
  } else if (images) {
    args.imageMode = "replace";
    args.imageBusinessId = images;
  }

  if (args.imageMode) {
    if (args.mode !== "seed") {
      throw new Error("Modos de imagem só podem ser usados no seed");
    }
    if (args.only) throw new Error("--only não pode ser combinado com modos de imagem");
    if (args.refresh) throw new Error("--refresh não pode ser combinado com troca de imagens");
    if (args.imageMode === "replace" && !args.logoSource && !args.bannerSource) {
      throw new Error("--images exige --logo=<arquivo> e/ou --banner=<arquivo>");
    }
  }
  if (args.logoSource && !args.imageMode) {
    throw new Error("--logo exige --images=<id>");
  }
  if (args.bannerSource && !args.imageMode) {
    throw new Error("--banner exige --images=<id>");
  }
  if (args.refresh && args.mode !== "seed") {
    throw new Error("--refresh só pode ser usado com o seed");
  }
  if (args.confirm && args.mode !== "purge") {
    throw new Error("--confirm só faz sentido com --purge");
  }
  if (args.list && (verify || purge || args.refresh || args.imageMode || args.confirm)) {
    throw new Error("--list é estático e não pode ser combinado com outras operações");
  }
  return args;
}

/** `--only` como lista de termos (o seed/verify recebem o filtro como array). */
function onlyTerms(args: DemoShowcaseArgs): string[] {
  return args.only ? [args.only] : [];
}

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/** Raiz do monorepo (fora do worktree Git do backend) — saída e storage local. */
export function demoShowcaseWorkspaceRoot(): string {
  return path.resolve(__dirname, "../..");
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada");
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool as unknown as never);
  return new PrismaClient({ adapter: adapter as never } as never);
}

function requiredPassword(): string {
  const password = process.env.SEED_DEMO_SHOWCASE_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_DEMO_SHOWCASE_PASSWORD não definida. A senha dos 16 tenants demo vem só de variável de ambiente — não há valor fixo no código",
    );
  }
  return password;
}

async function prepareStorage(serveLocal = true): Promise<{
  storage: IStorageProvider;
  server: DemoShowcaseLocalDevServer | null;
}> {
  if (isCloudinaryConfigured()) {
    return { storage: new CloudinaryStorageProvider(), server: null };
  }
  console.warn(
    "[demo-showcase] Credenciais Cloudinary ausentes — usando storage LOCAL de dev " +
      "(URLs http://127.0.0.1 servidas durante a execução; sem nuvem).",
  );
  const root = path.join(demoShowcaseWorkspaceRoot(), "tmp", "demo-showcase-storage");
  const storage = new DemoShowcaseLocalDevStorage(root);
  const server = serveLocal ? await serveDemoShowcaseLocalDevStorage(root) : null;
  return { storage, server };
}

async function loadManifest(materialsOverride?: string) {
  const materialsDirectory =
    materialsOverride ?? (await locateDemoShowcaseMaterialsDirectory(demoShowcaseWorkspaceRoot()));
  const manifest = await readDemoShowcaseManifest(materialsDirectory);
  return { materialsDirectory, manifest };
}

function defaultApiBaseUrl(): string {
  const port = process.env.PORT || "3333";
  return `http://127.0.0.1:${port}/api`;
}

type DemoShowcaseCountRow = DemoShowcaseBusinessCounts & {
  id: string;
  name: string;
  segment: string;
  confirmar: boolean;
  logoUrl?: string;
  coverUrl?: string;
};

function printBusinessTable(rows: DemoShowcaseCountRow[]): void {
  console.log("");
  console.log(
    "| id | nome | segmento | confirmar | serviços | profissionais | clientes | agenda | hoje | amanhã | avaliações | receita mês | receita mês ant. | showcase |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of rows) {
    console.log(
      `| ${row.id} | ${row.name} | ${row.segment} | ${row.confirmar} | ${row.serviceCount} | ${row.professionalCount} | ${row.clientCount} | ${row.appointmentCount} | ${row.appointmentsToday} | ${row.appointmentsTomorrow} | ${row.reviewCount} | ${row.revenueCurrentMonth.toFixed(2)} | ${row.revenuePreviousMonth.toFixed(2)} | ${row.showcaseCount} |`,
    );
  }
  console.log("");
}

/** Contagens operacionais completas — uma linha por tenant. */
function printOperationalCountsTable(rows: DemoShowcaseCountRow[]): void {
  console.log("");
  console.log("### Contagens operacionais");
  console.log("");
  console.log(
    "| id | serviços | profissionais | clientes | agenda | concluídos | cancelados | faltas | hoje | amanhã | fila | metas | avaliações | convites | tráfego 30d | showcase |",
  );
  console.log(
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const row of rows) {
    console.log(
      `| ${row.id} | ${row.serviceCount} | ${row.professionalCount} | ${row.clientCount} | ${row.appointmentCount} | ${row.appointmentsByStatus.COMPLETED ?? 0} | ${row.appointmentsByStatus.CANCELLED ?? 0} | ${row.appointmentsByStatus.NO_SHOW ?? 0} | ${row.appointmentsToday} | ${row.appointmentsTomorrow} | ${row.queueCount} | ${row.goalCount} | ${row.reviewCount} | ${row.reviewInvitationCount} | ${row.trafficVisits30d} | ${row.showcaseCount} |`,
    );
  }
  console.log("");
}

/** Contagens financeiras, estoque, CRM e caixa — uma linha por tenant. */
function printFinancialCountsTable(rows: DemoShowcaseCountRow[]): void {
  console.log("");
  console.log("### Contagens financeiras, estoque e CRM");
  console.log("");
  console.log(
    "| id | ledger | comissões | despesas | produtos | vendas | linhas venda | movimentos estoque | fiados | pagamentos fiado | eventos CRM | pagamentos | fechamentos | receita atual | receita anterior |",
  );
  console.log(
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const row of rows) {
    console.log(
      `| ${row.id} | ${row.ledgerCount} | ${row.commissionCount} | ${row.expenseCount} | ${row.productCount} | ${row.retailSaleCount} | ${row.retailSaleLineCount} | ${row.stockMovementCount} | ${row.fiadoCount} | ${row.fiadoPaymentCount} | ${row.crmFinancialEventCount} | ${row.paymentCount} | ${row.dailyCloseoutCount} | ${row.revenueCurrentMonth.toFixed(2)} | ${row.revenuePreviousMonth.toFixed(2)} |`,
    );
  }
  console.log("");
}

function printAssetUrlsTable(
  rows: Array<{ id: string; name: string; logoUrl?: string; coverUrl?: string }>,
): void {
  console.log("");
  console.log("### URLs de logo e capa");
  console.log("");
  console.log("| negócio | nome | logo | capa |");
  console.log("|---|---|---|---|");
  for (const row of rows) {
    console.log(
      `| ${row.id} | ${row.name} | ${row.logoUrl ?? ""} | ${row.coverUrl ?? ""} |`,
    );
  }
  console.log("");
}

const PRIVATE_SCREEN_ORDER: DemoShowcasePrivateScreen[] = [
  "agenda",
  "crm",
  "caixa",
  "estoque",
  "vendas",
  "metas",
];

/** Matriz privada por negócio × tela. Célula = HTTP/itens; N/A = módulo bloqueado. */
function printPrivateScreensTable(reports: DemoShowcaseVerificationReport[]): void {
  console.log("");
  console.log("### Matriz das telas privadas (HTTP autenticado)");
  console.log("");
  console.log("| negócio | agenda | crm | caixa | estoque | vendas | metas | agenda viva | agenda cheia |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const report of reports) {
    const cells = PRIVATE_SCREEN_ORDER.map(screen => {
      const result = report.privateScreens.find(item => item.screen === screen);
      if (!result || !result.applicable) return "N/A";
      if (result.status !== 200) return `HTTP ${result.status ?? "?"}`;
      return `200 (${result.itemCount ?? 0})`;
    });
    console.log(
      `| ${report.id} | ${cells.join(" | ")} | ${report.liveDate} | ${report.fullDate} |`,
    );
  }
  console.log("");
}

function recommendationForBusiness(business: DemoShowcaseManifestBusiness): string {
  if (business.segmento === "LAW_FIRM") {
    return "Agenda → CRM → Caixa → Metas";
  }
  if (["BARBERSHOP", "PETSHOP"].includes(business.segmento)) {
    return "Agenda → Caixa → Estoque → Vendas";
  }
  return "Agenda → CRM → Caixa → Metas";
}

function printRecommendationsTable(businesses: DemoShowcaseManifestBusiness[]): void {
  console.log("");
  console.log("### Logins e roteiro recomendado");
  console.log("");
  console.log("| negócio | nome | login owner | roteiro de 5 minutos |");
  console.log("|---|---|---|---|");
  for (const business of businesses) {
    console.log(
      `| ${business.id} | ${demoShowcaseDisplayName(business)} | ${demoShowcaseBusinessEmails(business)[0]} | ${recommendationForBusiness(business)} |`,
    );
  }
  console.log("");
}

/** Tabela de logins (e-mail + papel) dos tenants do filtro atual. */
function printLoginTable(businesses: DemoShowcaseManifest["negocios"][number][]): void {
  console.log("");
  console.log("### Logins dos tenants demo");
  console.log("");
  console.log("| negócio | nome | e-mail | papel |");
  console.log("|---|---|---|---|");
  for (const business of businesses) {
    const emails = demoShowcaseBusinessEmails(business);
    console.log(`| ${business.id} | ${demoShowcaseDisplayName(business)} | ${emails[0]} | OWNER |`);
    for (let index = 1; index < emails.length; index += 1) {
      console.log(
        `| ${business.id} | ${demoShowcaseDisplayName(business)} | ${emails[index]} | EMPLOYEE |`,
      );
    }
  }
  console.log("");
  console.log(
    "Senha de TODOS os usuários acima: variável de ambiente `SEED_DEMO_SHOWCASE_PASSWORD` (nunca gravada em arquivo).",
  );
  console.log("");
}

/** Lista estática (manifest + e-mails) — sem banco e sem guards de env. */
function printShowcaseList(
  manifest: DemoShowcaseManifest,
  only: string[],
): void {
  const businesses = filterDemoShowcaseBusinesses(manifest.negocios, only);
  console.log("");
  console.log("| id | nome exibido | segmento | e-mail do dono |");
  console.log("|---|---|---|---|");
  for (const business of businesses) {
    const emails = demoShowcaseBusinessEmails(business);
    console.log(
      `| ${business.id} | ${demoShowcaseDisplayName(business)} | ${business.segmento} | ${emails[0]} |`,
    );
  }
  console.log("");
  console.log(`${businesses.length} de ${manifest.negocios.length} negócios.`);
}

interface DemoShowcaseFileBackup {
  destination: string;
  previous: Buffer | null;
}

async function readOptionalFile(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function copyCustomAsset(
  sourcePath: string,
  destinationDirectory: string,
): Promise<DemoShowcaseFileBackup> {
  const destinationName = assertSafeDemoShowcaseFileName(
    path.basename(sourcePath),
    "nome do arquivo de imagem fornecido",
  );
  const destination = path.join(destinationDirectory, destinationName);
  const previous = await readOptionalFile(destination);
  await copyDemoShowcaseAssetFile(sourcePath, destinationDirectory, {
    destinationFileName: destinationName,
    overwrite: true,
  });
  return { destination, previous };
}

async function restoreCustomAssets(backups: DemoShowcaseFileBackup[]): Promise<void> {
  const errors: string[] = [];
  for (const backup of [...backups].reverse()) {
    try {
      if (backup.previous) {
        await writeFile(backup.destination, backup.previous);
      } else {
        await rm(backup.destination, { force: true });
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      errors.push(`${backup.destination}: ${detail}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Falha ao restaurar arquivos de imagem: ${errors.join("; ")}`);
  }
}

async function runIsolatedImageUpdate(input: {
  args: DemoShowcaseArgs;
  client: PrismaClient;
  storage: IStorageProvider;
  materialsDirectory: string;
  manifest: DemoShowcaseManifest;
  outputDirectory: string;
}): Promise<void> {
  const { args, client, storage, materialsDirectory, manifest, outputDirectory } = input;
  const businessId = args.imageBusinessId;
  if (!businessId) throw new Error("Modo de imagem sem id do negócio");

  const business = manifest.negocios.find(item => item.id === businessId);
  if (!business) {
    throw new Error(`Negócio não encontrado no manifest.json: ${businessId}`);
  }

  const originalManifest = await readDemoShowcaseManifestJson(materialsDirectory);
  const backups: DemoShowcaseFileBackup[] = [];

  try {
    let updatedManifest: DemoShowcaseManifestJson;
    if (args.imageMode === "swap") {
      updatedManifest = swapDemoShowcaseBusinessAssetFilenames(originalManifest, businessId);
    } else {
      const businessDirectory = await resolveDemoShowcaseBusinessDirectory(
        materialsDirectory,
        business,
      );
      const filenames: { logo?: string; banner?: string } = {};

      if (args.logoSource) {
        const backup = await copyCustomAsset(args.logoSource, businessDirectory);
        backups.push(backup);
        filenames.logo = path.basename(backup.destination);
      }
      if (args.bannerSource) {
        const backup = await copyCustomAsset(args.bannerSource, businessDirectory);
        backups.push(backup);
        filenames.banner = path.basename(backup.destination);
      }
      if (filenames.logo && filenames.banner && filenames.logo === filenames.banner) {
        throw new Error(
          "Logo e banner personalizados precisam ter nomes de arquivo diferentes no manifest.",
        );
      }

      updatedManifest = replaceDemoShowcaseBusinessAssetFilenames(
        originalManifest,
        businessId,
        filenames,
      );
    }

    await writeDemoShowcaseManifest(materialsDirectory, updatedManifest);

    const updatedValidatedManifest = await readDemoShowcaseManifest(materialsDirectory);
    const updatedBusiness = updatedValidatedManifest.negocios.find(
      item => item.id === businessId,
    );
    if (!updatedBusiness) {
      throw new Error(`Negócio ausente do manifest após a troca: ${businessId}`);
    }

    // Processa e reenvia somente este tenant. Os outros 15 manifests e
    // arquivos não são lidos, processados ou enviados.
    const resolved = await resolveDemoShowcaseBusinessAssets(
      materialsDirectory,
      updatedBusiness,
    );
    const processed = await processDemoShowcaseAssets([resolved], outputDirectory);
    const asset = processed[0];
    if (!asset) throw new Error(`Asset processado ausente para ${businessId}`);

    const upload = await seedDemoShowcaseImages({
      client,
      storage,
      business: updatedBusiness,
      asset,
    });

    console.log("");
    console.log(`✅ Imagens atualizadas somente para ${businessId}.`);
    console.log(`Logo: ${upload.logoUrl}`);
    console.log(`Capa: ${upload.coverUrl}`);
    console.log(
      `Manifest: ${updatedBusiness.logo} (logo) | ${updatedBusiness.banner} (banner)`,
    );
    printLoginTable([updatedBusiness]);
  } catch (error: unknown) {
    const rollbackErrors: string[] = [];
    try {
      await writeDemoShowcaseManifest(materialsDirectory, originalManifest);
    } catch (rollbackError: unknown) {
      const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      rollbackErrors.push(`manifest: ${detail}`);
    }
    try {
      await restoreCustomAssets(backups);
    } catch (rollbackError: unknown) {
      const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      rollbackErrors.push(detail);
    }

    const originalMessage = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Falha ao trocar imagens de ${businessId}: ${originalMessage}. Rollback incompleto: ${rollbackErrors.join("; ")}`,
      );
    }
    throw new Error(
      `Falha ao trocar imagens de ${businessId}: ${originalMessage}. O manifest e os arquivos foram restaurados.`,
    );
  }
}

export async function runDemoShowcaseSeed(args: DemoShowcaseArgs): Promise<void> {
  if (args.list) {
    // Estático: só manifest (não toca banco, não exige SEED_DEMO).
    const { materialsDirectory, manifest } = await loadManifest(args.materials);
    console.log(`[demo-showcase] manifest: ${materialsDirectory} (${manifest.negocios.length} negócios)`);
    printShowcaseList(manifest, onlyTerms(args));
    return;
  }

  assertDemoShowcaseSeedAllowed();
  const { materialsDirectory, manifest } = await loadManifest(args.materials);
  console.log(`[demo-showcase] manifest: ${materialsDirectory} (${manifest.negocios.length} negócios)`);
  const selected = filterDemoShowcaseBusinesses(manifest.negocios, onlyTerms(args));
  if (selected.length === 0) {
    throw new Error(
      `Filtro --only sem correspondência no manifest (recebido: ${args.only}) — use --list para ver os ids`,
    );
  }
  if (args.only) {
    console.log(`[demo-showcase] filtro --only=${args.only}: ${selected.length} negócio(s)`);
  }

  const client = createClient();
  let server: DemoShowcaseLocalDevServer | null = null;
  try {
    if (args.mode === "purge") {
      const { storage } = await prepareStorage(false);
      const result = await purgeDemoShowcase(
        client,
        storage,
        selected,
        args.confirm,
      );
      if (result.purged > 0) {
        console.log(`✅ Purge concluído: ${result.purged} tenant(s) removido(s).`);
        if (Object.keys(result.leftovers).length > 0) {
          console.warn("⚠️ Resíduos por tenant após o purge (investigar):", result.leftovers);
        } else {
          console.log(
            "Sem resíduos: clientes, agenda, financeiro, reviews e tráfego removidos junto com o tenant.",
          );
        }
      } else {
        console.log(
          `DRY-RUN: ${result.skipped} tenant(s) seriam removidos. Adicione --confirm para apagar (somente local/teste).`,
        );
      }
      return;
    }

    if (args.mode === "verify") {
      // O servidor local só é necessário no fallback para o HEAD das URLs
      // persistidas. A API itself deve estar no ar em `args.api`.
      const { server: localServer } = await prepareStorage(true);
      server = localServer;
      const reports = await verifyDemoShowcase(
        client,
        manifest,
        args.api ?? defaultApiBaseUrl(),
        onlyTerms(args),
        requiredPassword(),
      );
      printBusinessTable(reports);
      printAssetUrlsTable(reports);
      printOperationalCountsTable(reports);
      printFinancialCountsTable(reports);
      printPrivateScreensTable(reports);
      printRecommendationsTable(selected);
      printLoginTable(selected);
      console.log(
        `✅ Verificação OK: ${reports.length} negócios (DB + agenda + API autenticada + HTTP HEAD).`,
      );
      for (const report of reports) {
        console.log(
          `  ${report.id}: logo ${report.logoHead.status} ${report.logoHead.contentType} | capa ${report.coverHead.status} ${report.coverHead.contentType} | agenda ${report.appointmentCount} (sem sobreposição) | receita mês ${report.revenueCurrentMonth.toFixed(2)} > anterior ${report.revenuePreviousMonth.toFixed(2)}`,
        );
      }
      return;
    }

    // ─── Seed ────────────────────────────────────────────────────────────
    const outputDirectory =
      args.output ?? path.join(demoShowcaseWorkspaceRoot(), "tmp", "demo-showcase-images");
    await mkdir(outputDirectory, { recursive: true });
    await assertDemoShowcaseOutputIsOutsideGit(outputDirectory, demoShowcaseWorkspaceRoot());

    if (args.imageMode) {
      const { storage } = await prepareStorage(false);
      await runIsolatedImageUpdate({
        args,
        client,
        storage,
        materialsDirectory,
        manifest,
        outputDirectory,
      });
      return;
    }

    // No refresh não há processamento de assets nem upload: as URLs já
    // publicadas são preservadas. O refresh também não exige senha.
    let assets: ProcessedDemoShowcaseAsset[] = [];
    if (!args.refresh) {
      const resolved = await resolveDemoShowcaseManifestAssets(materialsDirectory, manifest);
      console.log(`[demo-showcase] processando ${resolved.length} logos/banner com sharp…`);
      assets = await processDemoShowcaseAssets(resolved, outputDirectory);
      console.log(`[demo-showcase] imagens otimizadas em ${outputDirectory}`);
    } else {
      console.log("[demo-showcase] refresh: assets preservados (sem processamento e sem upload).");
    }

    const { storage } = await prepareStorage(false);
    const report = await seedDemoShowcase({
      client,
      hashProvider: new BcryptHashProvider(),
      storage,
      manifest,
      password: args.refresh ? undefined : requiredPassword(),
      assets,
      only: onlyTerms(args),
      refresh: args.refresh,
    });

    printBusinessTable(report.businesses);
    printAssetUrlsTable(report.businesses);
    printOperationalCountsTable(report.businesses);
    printFinancialCountsTable(report.businesses);
    console.log(`Storage: ${report.storageProvider}`);
    console.log(`Mapeamentos confirmados no manifest (confirmar: true): ${report.guessedAssets.length}`);
    for (const guessed of report.guessedAssets) {
      console.log(`  ✓ ${guessed.id} → ${guessed.name}`);
    }
    if (report.ignoredExtras.length > 0) {
      console.log("Extras do manifest NÃO usados como logo/banner selecionado:");
      for (const extra of report.ignoredExtras) {
        console.log(`  • ${extra.id}: ${extra.files.join(", ")}`);
      }
    }
    console.log(`\n✅ Showcase demo pronto: ${report.businesses.length} negócios aprovados.`);
    printRecommendationsTable(selected);
    printLoginTable(selected);
    console.log(
      "Detalhes de logo/capa por negócio: rode `-- --verify` com a API de dev no ar.",
    );
  } finally {
    await client.$disconnect().catch(() => undefined);
    if (server) await server.close().catch(() => undefined);
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return typeof entry === "string" && /seed-demo-showcase\.(ts|js|mts|cts|mjs)$/.test(entry);
}

if (isDirectExecution()) {
  const args = parseDemoShowcaseArgs(process.argv.slice(2));
  runDemoShowcaseSeed(args).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
