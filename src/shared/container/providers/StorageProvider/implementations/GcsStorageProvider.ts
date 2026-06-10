import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import {
  IStorageProvider,
  ISignedUploadUrlResult,
  IUploadBufferResult,
} from "../IStorageProvider";

/**
 * Google Cloud Storage Provider
 *
 * Variáveis de ambiente necessárias:
 *   GCS_BUCKET_NAME     — nome do bucket (ex: barberqueue-assets)
 *   GCS_PROJECT_ID      — ID do projeto GCP
 *   GCS_KEY_FILE_PATH   — caminho absoluto para o JSON de credenciais
 *                         (pode ser omitido em ambiente GCE/Cloud Run com IAM)
 *
 * Em desenvolvimento local, use a ADC (Application Default Credentials):
 *   gcloud auth application-default login
 * ou aponte GCS_KEY_FILE_PATH para o JSON da service account.
 */
export class GcsStorageProvider implements IStorageProvider {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error(
        "GCS_BUCKET_NAME não configurado nas variáveis de ambiente"
      );
    }

    this.bucketName = bucketName;

    const keyFilePath = process.env.GCS_KEY_FILE_PATH;
    const projectId   = process.env.GCS_PROJECT_ID;

    // Se GCS_KEY_FILE_PATH estiver definido, usa autenticação por chave de serviço.
    // Caso contrário, usa ADC (Application Default Credentials) — funciona em
    // GCE, Cloud Run, e localmente com `gcloud auth application-default login`.
    if (keyFilePath) {
      this.storage = new Storage({ keyFilename: keyFilePath, projectId });
    } else {
      this.storage = new Storage({ projectId });
    }
  }

  // ---------------------------------------------------------------------------
  // Gera Signed URL de upload (PUT direto do cliente → GCS)
  // ---------------------------------------------------------------------------
  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName}`;
    const bucket     = this.storage.bucket(this.bucketName);
    const file       = bucket.file(objectName);

    const expiresMs = Date.now() + expiresInSeconds * 1000;

    const [uploadUrl] = await file.generateSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresMs,
      contentType: mimeType,
      // Força o objeto a ser público ao ser enviado
      extensionHeaders: {
        "x-goog-acl": "public-read",
      },
    });

    const publicUrl = this.buildPublicUrl(objectName);

    return {
      uploadUrl,
      publicUrl,
      objectName,
      expiresInSeconds,
    };
  }

  // ---------------------------------------------------------------------------
  // Upload de Buffer (multipart via backend → GCS)
  // ---------------------------------------------------------------------------
  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<IUploadBufferResult> {
    const objectName = `${folder}/${fileName}`;
    const bucket     = this.storage.bucket(this.bucketName);
    const file       = bucket.file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        // Cache de 1 ano para assets estáticos (logos não mudam com frequência)
        cacheControl: "public, max-age=31536000",
      },
      // Torna o objeto publicamente legível
      public: true,
      // Retorna apenas quando o upload estiver 100% confirmado
      validation: "md5",
    });

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? buffer.byteLength);

    return {
      publicUrl: this.buildPublicUrl(objectName),
      objectName,
      size,
    };
  }

  // ---------------------------------------------------------------------------
  // Deleção (idempotente — não lança erro se o arquivo não existir)
  // ---------------------------------------------------------------------------
  async deleteObject(objectName: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file   = bucket.file(objectName);
      await file.delete({ ignoreNotFound: true });
    } catch (err: any) {
      // Loga mas não interrompe o fluxo — deleção de logo antiga não é crítica
      console.warn(
        `[GcsStorageProvider] Falha ao deletar objeto "${objectName}": ${err?.message ?? err}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Extrai objectName de uma URL pública do bucket
  // ---------------------------------------------------------------------------
  extractObjectName(publicUrl: string): string | null {
    // Suporta dois formatos:
    //   https://storage.googleapis.com/{bucket}/{objectName}
    //   https://{bucket}.storage.googleapis.com/{objectName}
    const patterns = [
      new RegExp(`^https://storage\\.googleapis\\.com/${this.bucketName}/(.+)$`),
      new RegExp(`^https://${this.bucketName}\\.storage\\.googleapis\\.com/(.+)$`),
    ];

    for (const pattern of patterns) {
      const match = publicUrl.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------
  private buildPublicUrl(objectName: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${objectName}`;
  }
}
