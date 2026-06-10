import { Storage } from "@google-cloud/storage";
import { injectable } from "tsyringe";
import {
  IStorageProvider,
  ISignedUploadUrlResult,
} from "../IStorageProvider";

/**
 * GCS Storage Provider
 *
 * Variáveis de ambiente obrigatórias:
 *   GCS_BUCKET_NAME          — nome do bucket (ex: "barberqueue-assets")
 *   GCS_PROJECT_ID           — ID do projeto GCP
 *
 * Autenticação (uma das duas opções):
 *   GCS_KEY_FILE_PATH        — caminho para o JSON da service account
 *   GCS_CREDENTIALS_JSON     — JSON completo da service account (base64 ou string)
 *
 * Variáveis opcionais:
 *   GCS_PUBLIC_BASE_URL      — URL base pública (padrão: https://storage.googleapis.com/<bucket>)
 *
 * Para desenvolvimento local sem credenciais reais, use o emulador:
 *   STORAGE_EMULATOR_HOST=localhost:4443
 */
@injectable()
export class GcsStorageProvider implements IStorageProvider {
  private storage: Storage;
  private bucket: ReturnType<Storage["bucket"]>;
  private bucketName: string;
  private publicBaseUrl: string;

  constructor() {
    this.bucketName = this.requireEnv("GCS_BUCKET_NAME");
    const projectId = this.requireEnv("GCS_PROJECT_ID");

    const keyFilePath = process.env.GCS_KEY_FILE_PATH;
    const credentialsJson = process.env.GCS_CREDENTIALS_JSON;

    let storageOptions: ConstructorParameters<typeof Storage>[0] = { projectId };

    if (keyFilePath) {
      storageOptions.keyFilename = keyFilePath;
    } else if (credentialsJson) {
      try {
        // Suporta tanto base64 quanto JSON puro
        const raw = credentialsJson.startsWith("{")
          ? credentialsJson
          : Buffer.from(credentialsJson, "base64").toString("utf-8");
        storageOptions.credentials = JSON.parse(raw);
      } catch {
        throw new Error(
          "GCS_CREDENTIALS_JSON inválido — forneça um JSON válido ou base64 de um JSON."
        );
      }
    }
    // Se nenhum dos dois for fornecido, o SDK usa Application Default Credentials (ADC),
    // que funciona automaticamente em GKE, Cloud Run e outras infras GCP.

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(this.bucketName);

    this.publicBaseUrl =
      process.env.GCS_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
      `https://storage.googleapis.com/${this.bucketName}`;
  }

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName}`;
    const file = this.bucket.file(objectName);

    const [uploadUrl] = await file.generateSignedPostPolicyV4({
      expires: Date.now() + expiresInSeconds * 1000,
      conditions: [
        ["content-length-range", 0, 5 * 1024 * 1024], // máx 5 MB
        ["eq", "$Content-Type", mimeType],
      ],
      fields: {
        "Content-Type": mimeType,
      },
    });

    const publicUrl = `${this.publicBaseUrl}/${objectName}`;

    return {
      uploadUrl: uploadUrl.url,
      publicUrl,
      objectName,
      expiresInSeconds,
    };
  }

  /**
   * Usa uma signed URL simples (PUT) em vez de POST policy.
   * Mais simples de usar do lado do cliente (apenas fetch PUT).
   */
  async generateSignedPutUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName}`;
    const file = this.bucket.file(objectName);

    const [uploadUrl] = await file.generateSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + expiresInSeconds * 1000,
      contentType: mimeType,
    });

    const publicUrl = `${this.publicBaseUrl}/${objectName}`;

    return {
      uploadUrl,
      publicUrl,
      objectName,
      expiresInSeconds,
    };
  }

  async deleteObject(objectName: string): Promise<void> {
    try {
      await this.bucket.file(objectName).delete();
    } catch (err: any) {
      // 404 = objeto já não existe — comportamento idempotente esperado
      if (err?.code === 404) return;
      throw err;
    }
  }

  extractObjectName(publicUrl: string): string | null {
    const prefix = `${this.publicBaseUrl}/`;
    if (!publicUrl.startsWith(prefix)) return null;
    return publicUrl.slice(prefix.length);
  }

  private requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(
        `Variável de ambiente "${key}" é obrigatória para o GcsStorageProvider.`
      );
    }
    return value;
  }
}