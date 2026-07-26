import { Storage } from '@google-cloud/storage'
import { injectable } from 'tsyringe'
import {
	IStorageProvider,
	ISignedUploadUrlResult,
	IUploadBufferResult,
} from '../IStorageProvider'

/**
 * Google Cloud Storage Provider
 *
 * Variáveis de ambiente necessárias:
 *   GCS_BUCKET_NAME          — nome do bucket (ex: barberqueue-assets)
 *   GCS_PROJECT_ID           — ID do projeto GCP
 *
 * Autenticação (uma das opções):
 *   GCS_KEY_FILE_PATH        — caminho para o JSON da service account
 *   GCS_CREDENTIALS_JSON     — JSON completo da service account (base64 ou string pura)
 *   (nenhuma)                — usa Application Default Credentials (ADC/Workload Identity)
 *
 * Opcional:
 *   GCS_PUBLIC_BASE_URL      — URL base pública (padrão: https://storage.googleapis.com/<bucket>)
 *
 * NOTA: A inicialização do Storage é lazy (ocorre na primeira chamada) para permitir
 * que o servidor suba mesmo sem as variáveis GCS configuradas em desenvolvimento.
 * O erro só ocorrerá ao tentar usar efetivamente o storage.
 */
@injectable()
export class GcsStorageProvider implements IStorageProvider {
	private _storage: Storage | null = null
	private _bucket: ReturnType<Storage['bucket']> | null = null

	// ── Lazy getters ────────────────────────────────────────────────────────────

	private get bucketName(): string {
		const name = process.env.GCS_BUCKET_NAME
		if (!name) {
			throw new Error(
				'GCS_BUCKET_NAME não configurado nas variáveis de ambiente.',
			)
		}
		return name
	}

	private get publicBaseUrl(): string {
		return (
			(process.env.GCS_PUBLIC_BASE_URL ?? '').replace(/\/$/, '') ||
			`https://storage.googleapis.com/${this.bucketName}`
		)
	}

	private get storage(): Storage {
		if (this._storage) return this._storage

		const projectId = process.env.GCS_PROJECT_ID
		const keyFilePath = process.env.GCS_KEY_FILE_PATH
		const credentialsJson = process.env.GCS_CREDENTIALS_JSON

		const storageOptions: ConstructorParameters<typeof Storage>[0] = {
			projectId,
		}

		if (keyFilePath) {
			storageOptions.keyFilename = keyFilePath
		} else if (credentialsJson) {
			try {
				const raw = credentialsJson.startsWith('{')
					? credentialsJson
					: Buffer.from(credentialsJson, 'base64').toString('utf-8')
				storageOptions.credentials = JSON.parse(raw)
			} catch {
				throw new Error(
					'GCS_CREDENTIALS_JSON inválido — forneça JSON válido ou base64 de um JSON.',
				)
			}
		}

		this._storage = new Storage(storageOptions)
		return this._storage
	}

	private get bucket(): ReturnType<Storage['bucket']> {
		if (this._bucket) return this._bucket
		this._bucket = this.storage.bucket(this.bucketName)
		return this._bucket
	}

	// ── Signed URL de upload (PUT direto cliente → GCS) ──────────────────────

	async generateSignedUploadUrl(
		folder: string,
		fileName: string,
		mimeType: string,
		expiresInSeconds = 900,
	): Promise<ISignedUploadUrlResult> {
		const objectName = `${folder}/${fileName}`
		const file = this.bucket.file(objectName)

		const [uploadUrl] = await file.getSignedUrl({
			version: 'v4',
			action: 'write',
			expires: Date.now() + expiresInSeconds * 1000,
			contentType: mimeType,
		})

		return {
			uploadUrl,
			publicUrl: `${this.publicBaseUrl}/${objectName}`,
			objectName,
			expiresInSeconds,
		}
	}

	// ── Upload de Buffer (multipart via backend → GCS) ────────────────────────

	async uploadBuffer(
		folder: string,
		fileName: string,
		buffer: Buffer,
		mimeType: string,
	): Promise<IUploadBufferResult> {
		const objectName = `${folder}/${fileName}`
		const file = this.bucket.file(objectName)

		await file.save(buffer, {
			metadata: {
				contentType: mimeType,
				cacheControl: 'public, max-age=31536000',
			},
			resumable: false,
		})

		return {
			publicUrl: `${this.publicBaseUrl}/${objectName}`,
			objectName,
			size: buffer.byteLength,
		}
	}

	// ── Deleção (idempotente) ─────────────────────────────────────────────────

	async deleteObject(objectName: string): Promise<void> {
		try {
			await this.bucket.file(objectName).delete()
		} catch (err: any) {
			if (err?.code === 404) return
			throw err
		}
	}

	// ── Extração de objectName a partir de URL pública ────────────────────────

	extractObjectName(publicUrl: string): string | null {
		const prefix = `${this.publicBaseUrl}/`
		if (!publicUrl.startsWith(prefix)) return null
		return decodeURIComponent(publicUrl.slice(prefix.length))
	}
}
