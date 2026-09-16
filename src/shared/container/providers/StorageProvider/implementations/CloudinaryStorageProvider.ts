import { injectable } from 'tsyringe'
import { AppError } from '@/shared/errors/AppError'
import {
  IStorageProvider,
  ISignedUploadUrlResult,
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

    const paramsToSign: Record<string, string | number> = {
      timestamp,
      folder,
      public_id: publicId,
      expiration: expiresInSeconds,
    }
    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!)

    const uploadUrl =
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload` +
      `?api_key=${process.env.CLOUDINARY_API_KEY}` +
      `&timestamp=${timestamp}` +
      `&folder=${encodeURIComponent(folder)}` +
      `&public_id=${encodeURIComponent(publicId)}` +
      `&expiration=${expiresInSeconds}` +
      `&signature=${encodeURIComponent(signature)}`

    const publicUrl = `https://res.cloudinary.com/${this.cloudName}/image/upload/${publicId}`

    return { uploadUrl, publicUrl, objectName: publicId, expiresInSeconds }
  }

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<IUploadBufferResult> {
    await this.assertConfigured()
    const cloudinary = await this.getCloudinary()

    const result = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: fileName.replace(/\.[^.]+$/, ''),
            resource_type: 'image',
            type: 'upload',
            cache_control: 'public, max-age=31536000',
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result as Record<string, unknown>)
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
    const pattern = new RegExp(`https://res\\.cloudinary\\.com/${this.cloudName}/image/upload/(.+)`)
    const match = publicUrl.match(pattern)
    return match ? decodeURIComponent(match[1]) : null
  }
}
