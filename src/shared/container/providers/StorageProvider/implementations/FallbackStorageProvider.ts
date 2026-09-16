import { injectable, inject } from 'tsyringe'
import {
  IStorageProvider,
  ISignedUploadUrlResult,
  IUploadBufferResult,
} from '../IStorageProvider'

/**
 * Storage Provider com fallback automático.
 *
 * Tenta o provider primário (GCS) primeiro. Se falhar, loga o erro
 * como aviso e tenta o provider reserva (Cloudinary). Se ambos falharem,
 * propaga o erro do provider reserva.
 *
 * Se o provider reserva não estiver configurado, o erro do primário
 * é propagado normalmente (sem fallback silencioso).
 */
@injectable()
export class FallbackStorageProvider implements IStorageProvider {
  constructor(
    @inject('GcsStorageProvider') private primary: IStorageProvider,
    @inject('CloudinaryStorageProvider') private fallback: IStorageProvider,
  ) {}

  private _lastGcsError: string | null = null
  private _gcsErrorCount = 0

  private logFallback(context: string, primaryErr: unknown, usedCloudinary: boolean): void {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    const errorKey = primaryMsg

    if (usedCloudinary) {
      // Sucesso via Cloudinary — se o erro do GCS é o mesmo, deduplica
      if (errorKey === this._lastGcsError) {
        this._gcsErrorCount++
        // Silent after first log — GCS indisponível é estado conhecido
        return
      }
      // Erro novo do GCS — loga uma vez
      this._lastGcsError = errorKey
      this._gcsErrorCount = 1
      console.warn(
        `[FallbackStorageProvider] GCS indisponível — operando com Cloudinary como provedor primário. ` +
        `Detalhe: ${primaryMsg}`,
      )
    } else {
      // Fallback falhou também
      console.warn(
        `[FallbackStorageProvider] ${context}: GCS falhou (${primaryMsg}), ` +
        `Cloudinary indisponível — sem fallback`,
      )
    }
  }

  private async tryFallback<T>(
    context: string,
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await primaryFn()
    } catch (primaryErr) {
      // Verifica se o fallback está disponível (pode ser sync ou async)
      const fallbackWithCheck = this.fallback as unknown as { isAvailable?: () => boolean | Promise<boolean> }
      const cloudinaryAvailable =
        typeof fallbackWithCheck.isAvailable === 'function'
          ? await fallbackWithCheck.isAvailable()
          : true

      if (!cloudinaryAvailable) {
        this.logFallback(context, primaryErr, false)
        throw primaryErr
      }

      // Tenta o fallback
      try {
        const result = await fallbackFn()
        this.logFallback(context, primaryErr, true)
        return result
      } catch (fallbackErr) {
        const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        // Ambos falharam — propaga o erro do fallback (mais recente)
        console.error(
          `[FallbackStorageProvider] ${context}: ambos os providers falharam. ` +
          `GCS: ${primaryMsg}. Cloudinary: ${fallbackMsg}.`,
        )
        throw fallbackErr
      }
    }
  }

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900,
  ): Promise<ISignedUploadUrlResult> {
    return this.tryFallback(
      'generateSignedUploadUrl',
      () => this.primary.generateSignedUploadUrl(folder, fileName, mimeType, expiresInSeconds),
      () => this.fallback.generateSignedUploadUrl(folder, fileName, mimeType, expiresInSeconds),
    )
  }

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<IUploadBufferResult> {
    return this.tryFallback(
      'uploadBuffer',
      () => this.primary.uploadBuffer(folder, fileName, buffer, mimeType),
      () => this.fallback.uploadBuffer(folder, fileName, buffer, mimeType),
    )
  }

  async deleteObject(objectName: string): Promise<void> {
    return this.tryFallback(
      'deleteObject',
      () => this.primary.deleteObject(objectName),
      () => this.fallback.deleteObject(objectName),
    )
  }

  extractObjectName(publicUrl: string): string | null {
    // Tenta extrair do primário primeiro
    const primaryResult = this.primary.extractObjectName(publicUrl)
    if (primaryResult) return primaryResult
    // Tenta extrair do fallback
    return this.fallback.extractObjectName(publicUrl)
  }
}
