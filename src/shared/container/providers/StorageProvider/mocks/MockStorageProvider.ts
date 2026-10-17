import {
  IStorageProvider,
  ISignedUploadUrlResult,
  IUploadBufferOptions,
  IUploadBufferResult,
} from "../IStorageProvider";

/**
 * Mock do StorageProvider para uso em testes unitários.
 * Não faz chamadas reais ao GCS.
 */
export class MockStorageProvider implements IStorageProvider {
  /** Objetos "deletados" durante os testes */
  public deletedObjects: string[] = [];

  /** URLs geradas por signed URL durante os testes */
  public generatedUrls: Array<{ objectName: string; publicUrl: string }> = [];

  /** Buffers enviados durante os testes */
  public uploadedBuffers: Array<{
    objectName: string;
    publicUrl: string;
    size: number;
    mimeType: string;
    options?: IUploadBufferOptions;
  }> = [];

  private bucketName = "mock-bucket";

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    // Imita o Cloudinary: public_id determinístico sem extensão (agendaja/{id}/logo/logo).
    const objectName = `${folder}/${fileName.replace(/\.[^.]+$/, "")}`;
    const publicUrl  = `https://storage.googleapis.com/${this.bucketName}/${objectName}`;

    this.generatedUrls.push({ objectName, publicUrl });

    return {
      uploadUrl: `https://storage.googleapis.com/upload/mock?object=${encodeURIComponent(objectName)}&sig=mock`,
      publicUrl,
      objectName,
      expiresInSeconds,
    };
  }

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    options?: IUploadBufferOptions
  ): Promise<IUploadBufferResult> {
    const objectName =
      options?.publicId ?? `${folder}/${fileName.replace(/\.[^.]+$/, "")}`;
    const publicUrl  = `https://storage.googleapis.com/${this.bucketName}/${objectName}`;

    this.uploadedBuffers.push({ objectName, publicUrl, size: buffer.byteLength, mimeType, options });

    return {
      publicUrl,
      objectName,
      size: buffer.byteLength,
    };
  }

  async deleteObject(objectName: string): Promise<void> {
    this.deletedObjects.push(objectName);
  }

  extractObjectName(publicUrl: string): string | null {
    const prefix = `https://storage.googleapis.com/${this.bucketName}/`;
    if (!publicUrl.startsWith(prefix)) return null;
    return publicUrl.slice(prefix.length);
  }
}
