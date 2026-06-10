export interface ISignedUploadUrlResult {
  /** URL para o cliente fazer PUT direto no GCS */
  uploadUrl: string;
  /** URL pública final que será salva no banco após o upload */
  publicUrl: string;
  /** Nome do objeto dentro do bucket (para deleção futura) */
  objectName: string;
  /** Expiração da signed URL em segundos */
  expiresInSeconds: number;
}

export interface IStorageProvider {
  /**
   * Gera uma signed URL de upload (PUT).
   * O cliente faz PUT direto no GCS sem passar pelo backend.
   *
   * @param folder   Pasta lógica dentro do bucket (ex: "logos")
   * @param fileName Nome do arquivo (ex: "barbershop-uuid.jpg")
   * @param mimeType MIME type do arquivo (ex: "image/jpeg")
   * @param expiresInSeconds Tempo de validade da URL (padrão: 900s = 15 min)
   */
  generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds?: number
  ): Promise<ISignedUploadUrlResult>;

  /**
   * Deleta um objeto do storage pelo nome completo do objeto.
   * Não lança erro se o objeto não existir (idempotente).
   */
  deleteObject(objectName: string): Promise<void>;

  /**
   * Extrai o objectName de uma URL pública do GCS.
   * Retorna null se a URL não pertencer a este bucket.
   */
  extractObjectName(publicUrl: string): string | null;
}