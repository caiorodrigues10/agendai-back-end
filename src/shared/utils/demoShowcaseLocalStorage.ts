/**
 * Storage local de DEV para o seed de showcase.
 *
 * Só é usado quando NÃO existem credenciais Cloudinary no ambiente — o app
 * exige Cloudinary para imagens (docs/CLOUDINARY_SETUP.md), então este provider
 * existe exclusivamente para o seed de demonstração rodar sem nuvem. Ele
 * implementa `IStorageProvider` escrevendo arquivos sob um diretório raiz e
 * expondo URLs `http://127.0.0.1:<porta>/...` servidas por um mini servidor
 * estático iniciado pelo CLI do seed (`serveDemoShowcaseLocalDevStorage`).
 *
 * O `publicId`/`objectName` segue o formato do app (`agendaja/{id}/logo/logo`),
 * sem extensão — igual ao Cloudinary — para `coverUrl.includes(coverPublicId)`
 * continuar verdadeiro nas validações do tema.
 */
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import type {
  ISignedUploadUrlResult,
  IStorageProvider,
  IUploadBufferOptions,
  IUploadBufferResult,
} from "@/shared/container/providers/StorageProvider/IStorageProvider";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/** Porta fixa para as URLs gravadas no banco continuarem válidas entre execuções. */
export const DEMO_SHOWCASE_LOCAL_STORAGE_PORT = 4319;

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export class DemoShowcaseLocalDevStorage implements IStorageProvider {
  constructor(
    private readonly root: string,
    private readonly port: number = DEMO_SHOWCASE_LOCAL_STORAGE_PORT,
  ) {}

  get storageRoot(): string {
    return this.root;
  }

  publicUrlFor(objectName: string): string {
    return `http://127.0.0.1:${this.port}/${objectName.split(path.sep).join("/")}`;
  }

  private resolveObjectPath(objectName: string): string {
    const normalized = objectName.replace(/\\/g, "/").replace(/^\/+/, "");
    const resolved = path.resolve(this.root, normalized);
    const rootWithSep = `${path.resolve(this.root)}${path.sep}`;
    if (resolved !== path.resolve(this.root) && !resolved.startsWith(rootWithSep)) {
      throw new Error(`ObjectName fora da raiz do storage local: ${objectName}`);
    }
    return resolved;
  }

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    _mimeType: string,
    _expiresInSeconds?: number,
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName.replace(/\.[^.]+$/, "")}`;
    return {
      uploadUrl: this.publicUrlFor(objectName),
      publicUrl: this.publicUrlFor(objectName),
      objectName,
      expiresInSeconds: _expiresInSeconds ?? 900,
    };
  }

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    _mimeType: string,
    options?: IUploadBufferOptions,
  ): Promise<IUploadBufferResult> {
    const objectName = options?.publicId ?? `${folder}/${fileName.replace(/\.[^.]+$/, "")}`;
    const extension = path.extname(fileName) || ".webp";
    const filePath = this.resolveObjectPath(`${objectName}${extension}`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { publicUrl: this.publicUrlFor(objectName), objectName, size: buffer.byteLength };
  }

  async deleteObject(objectName: string): Promise<void> {
    for (const suffix of ["", ".webp", ".png", ".jpg", ".jpeg"]) {
      const candidate = this.resolveObjectPath(`${objectName}${suffix}`);
      await rm(candidate, { force: true }).catch(() => undefined);
    }
  }

  extractObjectName(publicUrl: string): string | null {
    const prefix = `http://127.0.0.1:${this.port}/`;
    if (!publicUrl.startsWith(prefix)) return null;
    const objectName = decodeURIComponent(publicUrl.slice(prefix.length)).replace(
      /\.(webp|png|jpe?g|gif|svg)$/i,
      "",
    );
    return objectName || null;
  }
}

export interface DemoShowcaseLocalDevServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Serve a raiz do storage local via HTTP (GET/HEAD). Sem extensão no path,
 * tenta `.webp`, `.png`, `.jpg` — o mesmo caminho gravado pelo upload.
 */
export async function serveDemoShowcaseLocalDevStorage(
  root: string,
  port: number = DEMO_SHOWCASE_LOCAL_STORAGE_PORT,
): Promise<DemoShowcaseLocalDevServer> {
  const rootResolved = path.resolve(root);
  await mkdir(rootResolved, { recursive: true });

  const server: Server = createServer((request, response) => {
    void (async () => {
      try {
        const method = request.method ?? "GET";
        if (method !== "GET" && method !== "HEAD") {
          response.writeHead(405).end();
          return;
        }
        const requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
        const relative = requestPath.replace(/^\/+/, "");
        const base = path.resolve(rootResolved, relative);
        const rootWithSep = `${rootResolved}${path.sep}`;
        if (base !== rootResolved && !base.startsWith(rootWithSep)) {
          response.writeHead(403).end();
          return;
        }

        const candidates = [base, `${base}.webp`, `${base}.png`, `${base}.jpg`, `${base}.jpeg`];
        let filePath: string | null = null;
        for (const candidate of candidates) {
          const info = await stat(candidate).catch(() => null);
          if (info?.isFile()) {
            filePath = candidate;
            break;
          }
        }
        if (!filePath) {
          response.writeHead(404, { "content-type": "text/plain" }).end("not found");
          return;
        }

        const info = await stat(filePath);
        const headers: Record<string, string> = {
          "content-type": contentTypeFor(filePath),
          "content-length": String(info.size),
          "cache-control": "public, max-age=3600",
        };
        if (method === "HEAD") {
          response.writeHead(200, headers).end();
          return;
        }
        response.writeHead(200, headers);
        createReadStream(filePath).pipe(response);
      } catch {
        response.writeHead(500).end();
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  return {
    port,
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
