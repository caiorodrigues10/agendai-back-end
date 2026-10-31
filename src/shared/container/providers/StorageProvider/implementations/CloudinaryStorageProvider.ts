import { injectable } from 'tsyringe'
import { AppError } from '@/shared/errors/AppError'
import {
  IStorageProvider,
  ISignedUploadUrlResult,
  IUploadBufferOptions,
  IUploadBufferResult,
} from '../IStorageProvider'

type CloudinaryV2 = typeof import('cloudinary').v2

const CLOUDINARY_SETUP_HINT =
  'Configure o Cloudinary: veja docs/CLOUDINARY_SETUP.md (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).'

/**
 * Cloudinary Storage Provider (provedor reserva / fallback)
 *
 * Variáveis de ambiente necessárias:
 *   CLOUDINARY_CLOUD_NAME  — nome do cloud (ex: dxkxxxxx)
 *   CLOUDINARY_API_KEY     — API key
 *   CLOUDINARY_API_SECRET  — API secret
 *
 * NOTA: Este provider NÃO é registrado como primário no container.
 * Ele é usado pelo FallbackStorageProvider como reserva quando o GCS falha.
 *
 * Diferenças em relação ao GCS:
 *   - generateSignedUploadUrl: Cloudinary suporta signed uploads via URL,
 *     mas o modelo é diferente (upload preset + folder). O método gera
 *     uma URL de upload assinada usando o upload preset configurado.
 *   - extractObjectName: retorna o public_id do Cloudinary a partir da URL.
 */
@injectable()
export class CloudinaryStorageProvider implements IStorageProvider {
  private _configured = false
  private _cloudinary: CloudinaryV2 | null = null

  private async getCloudinary(): Promise<CloudinaryV2> {
    if (this._cloudinary) return this._cloudinary
    const mod = await import('cloudinary')
    this._cloudinary = mod.v2
    return this._cloudinary
  }

  private get cloudName(): string {
    const name = process.env.CLOUDINARY_CLOUD_NAME
    if (!name) {
      throw new AppError(`CLOUDINARY_CLOUD_NAME não configurado. ${CLOUDINARY_SETUP_HINT}`, 503)
    }
    return name
  }

  private async assertConfigured(): Promise<void> {
    if (this._configured) return
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET
    if (!apiKey || !apiSecret) {
      throw new AppError(
        `Credenciais Cloudinary incompletas (faltam CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET). ${CLOUDINARY_SETUP_HINT}`,
        503,
      )
    }
    const cloudinary = await this.getCloudinary()
    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    })
    this._configured = true
  }

  /**
   * Verifica se o Cloudinary está configurado (sem lançar erro).
   * Usado pelo FallbackStorageProvider para saber se pode usar este provider.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.assertConfigured()
      return true
    } catch {
      return false
    }
  }

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900,
  ): Promise<ISignedUploadUrlResult> {
    await this.assertConfigured()
    const cloudinary = await this.getCloudinary()
    const publicId = `${folder}/${fileName.replace(/\.[^.]+$/, '')}`
    const timestamp = Math.floor(Date.now() / 1000)

    // public_id é o caminho absoluto (sem `folder` separado) — enviar os dois
    // faria o Cloudinary aninhar agendaja/.../agendaja/....
    const paramsToSign: Record<string, string | number> = {
      timestamp,
      public_id: publicId,
      overwrite: 1,
      invalidate: 1,
    }
    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!)

    const uploadUrl =
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload` +
      `?api_key=${process.env.CLOUDINARY_API_KEY}` +
      `&timestamp=${timestamp}` +
      `&public_id=${encodeURIComponent(publicId)}` +
      `&overwrite=1` +
      `&invalidate=1` +
      `&signature=${encodeURIComponent(signature)}`

    const publicUrl = `https://res.cloudinary.com/${this.cloudName}/image/upload/${publicId}`

    return { uploadUrl, publicUrl, objectName: publicId, expiresInSeconds }
  }

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    options?: IUploadBufferOptions,
  ): Promise<IUploadBufferResult> {
    await this.assertConfigured()
    const cloudinary = await this.getCloudinary()

    const publicId = options?.publicId ?? `${folder}/${fileName.replace(/\.[^.]+$/, '')}`

    const result = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: mimeType.startsWith('video/') ? 'video' : 'image',
            type: 'upload',
            cache_control: options?.cacheControl ?? 'public, max-age=31536000',
            overwrite: options?.overwrite ?? false,
            invalidate: options?.invalidate ?? false,
            ...(options?.transformation?.length ? { transformation: options.transformation } : {}),
          },
          (error, result) => {
            if (error) {
              // Normaliza o erro cru do SDK ({ message, http_code }) em Error com
              // mensagem legível para o chamador mapear (ex.: "Invalid image file").
              const message = (error as { message?: string })?.message ?? 'upload failed'
              const wrapped = new Error(message) as Error & { http_code?: number }
              wrapped.http_code = (error as { http_code?: number })?.http_code
              reject(wrapped)
            } else resolve(result as Record<string, unknown>)
          },
        )
        uploadStream.end(buffer)
      },
    )

    if (!result || result.error) {
      const err = result?.error as { message?: string } | undefined
      throw new AppError(
        `Cloudinary upload failed: ${err?.message ?? 'resultado indefinido'}`,
        502,
      )
    }

    return {
      publicUrl: result.secure_url as string,
      objectName: result.public_id as string,
      size: result.bytes as number,
    }
  }

  async deleteObject(objectName: string): Promise<void> {
    await this.assertConfigured()
    const cloudinary = await this.getCloudinary()
    try {
      await cloudinary.uploader.destroy(objectName)
    } catch (err: unknown) {
      const code = (err as { error?: { http_code?: number } })?.error?.http_code
      if (code === 404) return
      throw err
    }
  }

  extractObjectName(publicUrl: string): string | null {
    try {
      const url = new URL(publicUrl)
      const segments = url.pathname.split('/').filter(Boolean)
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || segments[0] !== this.cloudName || !['image', 'video'].includes(segments[1]) || segments[2] !== 'upload') return null
      const objectName = segments.slice(3).join('/').replace(/^v\d+\//, '')
      if (!objectName) return null
      // O public_id do Cloudinary não carrega extensão de arquivo; a URL sim
      // (ex.: /upload/v1/folder/id.png → public_id "folder/id"). Destroy com a
      // extensão retorna "not found" e deixa o asset órfão.
      const decoded = decodeURIComponent(objectName).replace(/\.(jpe?g|png|webp|gif|avif|svg|bmp|mp4|mov|webm)$/i, '')
      return decoded || null
    } catch {
      return null
    }
  }
}
