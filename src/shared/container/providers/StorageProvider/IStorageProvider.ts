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

export interface IUploadBufferResult {
  /** URL pública do objeto recém-enviado */
  publicUrl: string;
  /** Nome do objeto dentro do bucket */
  objectName: string;
  /** Tamanho em bytes do arquivo enviado */
  size: number;
}

export interface IUploadBufferOptions {
  /** Sobrescreve o objeto se já existir (public_id determinístico no Cloudinary). */
  overwrite?: boolean;
  /** Invalida CDN do Cloudinary após o upload. */
  invalidate?: boolean;
  /** public_id completo (sem extensão) no lugar de folder/fileName. */
  publicId?: string;
  /** Cache-Control do objeto (padrão do provider). */
  cacheControl?: string;
}

export interface IStorageProvider {
  /**
   * Gera uma signed URL de upload (PUT).
   * O cliente faz PUT direto no GCS sem passar pelo backend.
   *
   * @param folder          Pasta lógica dentro do bucket (ex: "logos")
   * @param fileName        Nome do arquivo (ex: "barbershop-uuid.jpg")
   * @param mimeType        MIME type do arquivo (ex: "image/jpeg")
   * @param expiresInSeconds Tempo de validade da URL (padrão: 900s = 15 min)
   */
  generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds?: number
  ): Promise<ISignedUploadUrlResult>;

  /**
   * Faz upload de um Buffer diretamente para o GCS.
   * Usado no endpoint multipart (upload via backend).
   *
   * @param folder    Pasta lógica dentro do bucket (ex: "logos")
   * @param fileName  Nome do arquivo
   * @param buffer    Conteúdo do arquivo em Buffer
   * @param mimeType  MIME type do arquivo
   * @param options   Opções do provedor (overwrite/publicId no Cloudinary)
   */
  uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    options?: IUploadBufferOptions
  ): Promise<IUploadBufferResult>;

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
