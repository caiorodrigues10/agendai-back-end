import { Storage } from "@google-cloud/storage";
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
 *   GCS_PROJECT_ID      — ID do projeto GCP  (opcional se usar ADC em GCE/Cloud Run)
 *   GCS_KEY_FILE_PATH   — caminho absoluto para o JSON de credenciais
 *                         (omita quando usar ADC / Workload Identity)
 *
 * IMPORTANTE — acesso público ao bucket:
 *   Buckets novos têm "Uniform Bucket-Level Access" ativo por padrão.
 *   Com esse modo, ACLs por objeto são IGNORADAS.
 *   O script scripts/setup-gcs.sh configura o IAM corretamente.
 *   NÃO use "x-goog-acl: public-read" em signed URLs — não funciona com UBA.
 */
export class GcsStorageProvider implements IStorageProvider {
  // Lazy — só instancia na primeira chamada real.
  // Isso evita que o servidor trave no startup por variável de ambiente ausente.
  private _storage: Storage | null = null;
  private _bucketName: string | null = null;

  // ─── Getters lazy ──────────────────────────────────────────────────────────

  private get bucketName(): string {
    if (!this._bucketName) {
      const name = process.env.GCS_BUCKET_NAME;
      if (!name) {
        throw new Error(
          "GCS_BUCKET_NAME não configurado nas variáveis de ambiente. " +
          "Defina a variável e reinicie o servidor."
        );
      }
      this._bucketName = name;
    }
    return this._bucketName;
  }

  private get storage(): Storage {
    if (!this._storage) {
      const keyFilePath = process.env.GCS_KEY_FILE_PATH;
      const projectId   = process.env.GCS_PROJECT_ID;

      // Se GCS_KEY_FILE_PATH estiver definido, autentica via service account key.
      // Caso contrário, usa ADC (gcloud auth application-default login,
      // Workload Identity no GKE, metadata server no Compute/Cloud Run).
      if (keyFilePath) {
        this._storage = new Storage({ keyFilename: keyFilePath, projectId });
      } else {
        this._storage = new Storage({ projectId });
      }
    }
    return this._storage;
  }

  // ─── Signed URL de upload (PUT direto cliente → GCS) ──────────────────────

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName}`;
    const file       = this.storage.bucket(this.bucketName).file(objectName);
    const expiresMs  = Date.now() + expiresInSeconds * 1000;

    // ATENÇÃO: NÃO incluir "x-goog-acl: public-read" aqui.
    // Buckets com Uniform Bucket-Level Access ignoram ACLs por objeto.
    // A visibilidade pública é configurada no bucket via IAM
    // (allUsers → roles/storage.objectViewer) pelo script setup-gcs.sh.
    const [uploadUrl] = await file.generateSignedUrl({
      version:     "v4",
      action:      "write",
      expires:     expiresMs,
      contentType: mimeType,
    });

    return {
      uploadUrl,
      publicUrl:        this.buildPublicUrl(objectName),
      objectName,
      expiresInSeconds,
    };
  }

  // ─── Upload de Buffer (multipart via backend → GCS) ────────────────────────

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<IUploadBufferResult> {
    const objectName = `${folder}/${fileName}`;
    const file       = this.storage.bucket(this.bucketName).file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        // Cache de 1 ano para assets estáticos (logos não mudam com frequência)
        cacheControl: "public, max-age=31536000",
      },
      // REMOVIDO: validation: "md5" — causa falhas intermitentes no SDK v7+
      // e é desnecessário para uploads pequenos (<5 MB).
      // O GCS já garante integridade via CRC32c internamente.
      resumable: false, // uploads pequenos não precisam de upload resumível
    });

    return {
      publicUrl: this.buildPublicUrl(objectName),
      objectName,
      size:      buffer.byteLength,
    };
  }

  // ─── Deleção (idempotente) ─────────────────────────────────────────────────

  async deleteObject(objectName: string): Promise<void> {
    try {
      await this.storage
        .bucket(this.bucketName)
        .file(objectName)
        .delete({ ignoreNotFound: true });
    } catch (err: any) {
      // Loga mas não interrompe o fluxo — deleção de logo antiga não é crítica
      console.warn(
        `[GcsStorageProvider] Falha ao deletar "${objectName}": ${err?.message ?? err}`
      );
    }
  }

  // ─── Extração de objectName a partir de URL pública ───────────────────────

  extractObjectName(publicUrl: string): string | null {
    // Suporta dois formatos de URL pública do GCS:
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

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private buildPublicUrl(objectName: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${objectName}`;
  }
}
