import {
  IStorageProvider,
  ISignedUploadUrlResult,
} from "../IStorageProvider";

/**
 * Mock do StorageProvider para uso em testes unitários.
 * Não faz chamadas reais ao GCS.
 */
export class MockStorageProvider implements IStorageProvider {
  /** Objetos "deletados" durante os testes */
  public deletedObjects: string[] = [];

  /** URLs geradas durante os testes */
  public generatedUrls: Array<{
    objectName: string;
    publicUrl: string;
  }> = [];

  private bucketName = "mock-bucket";

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName}`;
    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${objectName}`;

    this.generatedUrls.push({ objectName, publicUrl });

    return {
      uploadUrl: `https://storage.googleapis.com/upload/mock?object=${encodeURIComponent(objectName)}&sig=mock`,
      publicUrl,
      objectName,
      expiresInSeconds,
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