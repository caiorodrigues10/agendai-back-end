/**
 * Migra imagens legadas do GCS para o Cloudinary (sob demanda).
 *
 * Escopo: users.avatarUrl, barbershops.logoUrl/logoPublicId,
 * barbershop_page_theme.cover_url/cover_public_id, products.imageUrl,
 * post_media.url/objectName e feed_posts.imageUrl/imageAssetName/videoUrl
 * (o public_id do asset também é gravado em imageAssetName p/ não deixar órfão
 * ao editar/excluir o post).
 * URLs que já são do Cloudinary (res.cloudinary.com) ou data-URLs são puladas.
 *
 * Download pelo URL pública do objeto (bucket legado precisa ser legível);
 * upload no Cloudinary com public_id determinístico (overwrite), atualização
 * do banco e (com --delete-source) remoção do objeto antigo no GCS via SDK.
 *
 * Dry-run por padrão (só relata). Aplicar:
 *   npm run images:migrate-cloudinary -- --apply
 *   npm run images:migrate-cloudinary -- --apply --barbershop=<uuid>
 *   npm run images:migrate-cloudinary -- --apply --limit=50 --delete-source
 *
 * Env: DATABASE_URL, CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET
 *      (GCS_KEY_FILE_PATH/GCS_CREDENTIALS_JSON/GCS_BUCKET_NAME só com --delete-source).
 */
import "reflect-metadata";
import "dotenv/config";
import { prisma } from "../src/libs/prismaClient";
import { CloudinaryStorageProvider } from "../src/shared/container/providers/StorageProvider/implementations/CloudinaryStorageProvider";
import { GcsStorageProvider } from "../src/shared/container/providers/StorageProvider/implementations/GcsStorageProvider";
import {
  COVER_IMAGE_SPEC,
  LOGO_IMAGE_SPEC,
  imageSpecPublicId,
} from "../src/shared/constants/imageSpecs";

type Flags = {
  apply: boolean;
  deleteSource: boolean;
  barbershopId?: string;
  limit?: number;
};

function parseFlags(argv: string[]): Flags {
  const barbershop = argv.find((a) => a.startsWith("--barbershop="))?.split("=")[1];
  const limitRaw = argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  if (limitRaw && (!Number.isFinite(limit) || (limit as number) <= 0)) {
    console.error("--limit deve ser um inteiro positivo.");
    process.exit(1);
  }
  return {
    apply: argv.includes("--apply"),
    deleteSource: argv.includes("--delete-source"),
    barbershopId: barbershop,
    limit,
  };
}

type Asset = {
  kind: "avatar" | "logo" | "cover" | "product" | "post-media" | "post-image" | "post-video";
  id: string;
  barbershopId: string | null;
  url: string;
  /** public_id determinístico no Cloudinary */
  publicId: string;
  folder: string;
  fileName: string;
  mimeType: string;
  /** atualiza o banco apontando também o campo de public_id, quando existir */
  setPublicIdField?: "logoPublicId" | "coverPublicId" | "objectName" | "imageAssetName";
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function guessMime(url: string, fallback: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? fallback;
}

function isCloudinaryUrl(url: string): boolean {
  return url.startsWith("https://res.cloudinary.com/");
}

function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

function isGcsUrl(url: string): boolean {
  return url.includes("storage.googleapis.com/") || url.includes("/storage/v1/");
}

async function collectAssets(barbershopId?: string): Promise<Asset[]> {
  const shopFilter = barbershopId ? { barbershopId } : {};
  const assets: Asset[] = [];

  const users = await prisma.user.findMany({
    where: { avatarUrl: { not: null } },
    select: { id: true, avatarUrl: true },
  });
  for (const u of users) {
    if (!u.avatarUrl || isCloudinaryUrl(u.avatarUrl) || isDataUrl(u.avatarUrl)) continue;
    assets.push({
      kind: "avatar",
      id: u.id,
      barbershopId: null,
      url: u.avatarUrl,
      publicId: `avatars/user-${u.id}`,
      folder: "avatars",
      fileName: `user-${u.id}`,
      mimeType: guessMime(u.avatarUrl, "image/jpeg"),
    });
  }

  const shops = await prisma.barbershop.findMany({
    where: { ...(barbershopId ? { id: barbershopId } : {}), logoUrl: { not: null } },
    select: { id: true, logoUrl: true, logoPublicId: true },
  });
  for (const s of shops) {
    if (!s.logoUrl || isCloudinaryUrl(s.logoUrl) || isDataUrl(s.logoUrl)) continue;
    if (s.logoPublicId && isCloudinaryUrl(s.logoUrl)) continue;
    assets.push({
      kind: "logo",
      id: s.id,
      barbershopId: s.id,
      url: s.logoUrl,
      publicId: imageSpecPublicId(s.id, LOGO_IMAGE_SPEC),
      folder: `agendaja/${s.id}/logo`,
      fileName: LOGO_IMAGE_SPEC.cloudinaryPublicId,
      mimeType: guessMime(s.logoUrl, "image/jpeg"),
      setPublicIdField: "logoPublicId",
    });
  }

  const themes = await prisma.barbershopPageTheme.findMany({
    where: { ...shopFilter, coverUrl: { not: null } },
    select: { barbershopId: true, coverUrl: true, coverPublicId: true },
  });
  for (const t of themes) {
    if (!t.coverUrl || isCloudinaryUrl(t.coverUrl) || isDataUrl(t.coverUrl)) continue;
    assets.push({
      kind: "cover",
      id: t.barbershopId,
      barbershopId: t.barbershopId,
      url: t.coverUrl,
      publicId: imageSpecPublicId(t.barbershopId, COVER_IMAGE_SPEC),
      folder: `agendaja/${t.barbershopId}/cover`,
      fileName: COVER_IMAGE_SPEC.cloudinaryPublicId,
      mimeType: guessMime(t.coverUrl, "image/jpeg"),
      setPublicIdField: "coverPublicId",
    });
  }

  const products = await prisma.product.findMany({
    where: { ...shopFilter, imageUrl: { not: null } },
    select: { id: true, barbershopId: true, imageUrl: true },
  });
  for (const p of products) {
    if (!p.imageUrl || isCloudinaryUrl(p.imageUrl) || isDataUrl(p.imageUrl)) continue;
    assets.push({
      kind: "product",
      id: p.id,
      barbershopId: p.barbershopId,
      url: p.imageUrl,
      publicId: `agendaja/${p.barbershopId}/products/${p.id}`,
      folder: `agendaja/${p.barbershopId}/products`,
      fileName: p.id,
      mimeType: guessMime(p.imageUrl, "image/jpeg"),
    });
  }

  const media = await prisma.postMedia.findMany({
    where: shopFilter,
    select: { id: true, barbershopId: true, url: true, mimeType: true },
  });
  for (const m of media) {
    if (isCloudinaryUrl(m.url) || isDataUrl(m.url)) continue;
    assets.push({
      kind: "post-media",
      id: m.id,
      barbershopId: m.barbershopId,
      url: m.url,
      publicId: `agendaja/${m.barbershopId}/posts-media/${m.id}`,
      folder: `agendaja/${m.barbershopId}/posts-media`,
      fileName: m.id,
      mimeType: m.mimeType || guessMime(m.url, "image/jpeg"),
      setPublicIdField: "objectName",
    });
  }

  const posts = await prisma.feedPost.findMany({
    where: shopFilter,
    select: { id: true, barbershopId: true, imageUrl: true, videoUrl: true },
  });
  for (const post of posts) {
    if (post.imageUrl && !isCloudinaryUrl(post.imageUrl) && !isDataUrl(post.imageUrl)) {
      assets.push({
        kind: "post-image",
        id: post.id,
        barbershopId: post.barbershopId,
        url: post.imageUrl,
        publicId: `agendaja/${post.barbershopId}/posts/${post.id}/image`,
        folder: `agendaja/${post.barbershopId}/posts/${post.id}`,
        fileName: "image",
        mimeType: guessMime(post.imageUrl, "image/jpeg"),
        setPublicIdField: "imageAssetName",
      });
    }
    if (post.videoUrl && !isCloudinaryUrl(post.videoUrl) && !isDataUrl(post.videoUrl)) {
      assets.push({
        kind: "post-video",
        id: post.id,
        barbershopId: post.barbershopId,
        url: post.videoUrl,
        publicId: `agendaja/${post.barbershopId}/posts/${post.id}/video`,
        folder: `agendaja/${post.barbershopId}/posts/${post.id}`,
        fileName: "video",
        mimeType: guessMime(post.videoUrl, "video/mp4"),
      });
    }
  }

  return assets;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`download falhou (${res.status}) para ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function updateDb(asset: Asset, newUrl: string, objectName: string): Promise<void> {
  switch (asset.kind) {
    case "avatar":
      await prisma.user.update({ where: { id: asset.id }, data: { avatarUrl: newUrl } });
      return;
    case "logo":
      await prisma.barbershop.update({
        where: { id: asset.id },
        data: { logoUrl: newUrl, logoPublicId: objectName },
      });
      return;
    case "cover":
      await prisma.barbershopPageTheme.update({
        where: { barbershopId: asset.id },
        data: { coverUrl: newUrl, coverPublicId: objectName },
      });
      return;
    case "product":
      await prisma.product.update({ where: { id: asset.id }, data: { imageUrl: newUrl } });
      return;
    case "post-media":
      await prisma.postMedia.update({
        where: { id: asset.id },
        data: { url: newUrl, objectName },
      });
      return;
    case "post-image":
      await prisma.feedPost.update({
        where: { id: asset.id },
        data: { imageUrl: newUrl, imageAssetName: objectName },
      });
      return;
    case "post-video":
      await prisma.feedPost.update({ where: { id: asset.id }, data: { videoUrl: newUrl } });
      return;
  }
}

async function deleteGcsSource(asset: Asset): Promise<void> {
  try {
    const gcs = new GcsStorageProvider();
    const objectName = gcs.extractObjectName(asset.url);
    if (objectName) await gcs.deleteObject(objectName);
  } catch (err) {
    console.warn(`  ! falha ao apagar origem GCS de ${asset.kind} ${asset.id}:`, (err as Error).message);
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const cloudinary = new CloudinaryStorageProvider();
  if (!(await cloudinary.isAvailable())) {
    console.error("Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET). Abortando.");
    process.exit(1);
  }

  const assets = await collectAssets(flags.barbershopId);
  const queue = flags.limit ? assets.slice(0, flags.limit) : assets;

  console.log(
    `${flags.apply ? "Aplicando" : "Dry-run"} migração GCS→Cloudinary: ${queue.length} asset(s)` +
      (flags.limit ? ` (limitado de ${assets.length})` : assets.length ? "" : " — nada a migrar"),
  );

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const asset of queue) {
    const label = `${asset.kind} ${asset.id} (${asset.url})`;
    if (!isGcsUrl(asset.url) && !asset.url.includes("http")) {
      console.log(`- pulo ${label}: URL não migrável`);
      skipped++;
      continue;
    }
    if (!flags.apply) {
      console.log(`- [dry-run] ${label} → public_id ${asset.publicId}`);
      ok++;
      continue;
    }
    try {
      const buffer = await download(asset.url);
      const uploaded = await cloudinary.uploadBuffer(asset.folder, asset.fileName, buffer, asset.mimeType, {
        overwrite: true,
        invalidate: true,
        publicId: asset.publicId,
      });
      await updateDb(asset, uploaded.publicUrl, uploaded.objectName);
      if (flags.deleteSource) await deleteGcsSource(asset);
      console.log(`✓ ${label} → ${uploaded.publicUrl}`);
      ok++;
    } catch (err) {
      console.error(`✗ ${label}:`, (err as Error).message);
      failed++;
    }
  }

  console.log(`Concluído: ${ok} ok, ${failed} falha(s), ${skipped} pulado(s).` + (flags.apply ? "" : " (dry-run: nada gravado)"));
  if (failed > 0) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erro fatal na migração:", err);
  process.exit(1);
});
