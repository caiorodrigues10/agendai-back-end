import { readFileSync } from 'node:fs'
import { Storage } from '@google-cloud/storage'
import { injectable } from 'tsyringe'
import { AppError } from '@/shared/errors/AppError'
import {
	IStorageProvider,
	ISignedUploadUrlResult,
	IUploadBufferResult,
} from '../IStorageProvider'

const GCS_SETUP_HINT =
	'Configure o GCS: veja docs/GCS_SETUP.md (scripts/create-service-account.sh + setup-gcs.sh).'

/**
 * Google Cloud Storage Provider
 *
 * Variáveis de ambiente necessárias:
 *   GCS_BUCKET_NAME          — nome do bucket (ex: agendai-assets)
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
	private _credentialsChecked = false

	// ── Lazy getters ────────────────────────────────────────────────────────────

	private get bucketName(): string {
		const name = process.env.GCS_BUCKET_NAME
		if (!name) {
			throw new AppError(
				`GCS_BUCKET_NAME não configurado. ${GCS_SETUP_HINT}`,
				503,
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

	/**
	 * Garante que a chave não é placeholder / JSON inválido antes de falar com o GCS.
	 * ADC (sem key file nem JSON) é permitido — validação fica a cargo do SDK.
	 */
	private assertValidCredentials(): void {
		if (this._credentialsChecked) return

		const keyFilePath = process.env.GCS_KEY_FILE_PATH
		const credentialsJson = process.env.GCS_CREDENTIALS_JSON

		if (keyFilePath) {
			let raw: string
			try {
				raw = readFileSync(keyFilePath, 'utf-8')
			} catch {
				throw new AppError(
					`Não foi possível ler GCS_KEY_FILE_PATH (${keyFilePath}). ${GCS_SETUP_HINT}`,
					503,
				)
			}
			this.assertServiceAccountJson(raw, `arquivo ${keyFilePath}`)
		} else if (credentialsJson) {
			const raw = credentialsJson.startsWith('{')
				? credentialsJson
				: Buffer.from(credentialsJson, 'base64').toString('utf-8')
			this.assertServiceAccountJson(raw, 'GCS_CREDENTIALS_JSON')
		}

		this._credentialsChecked = true
	}

	private assertServiceAccountJson(raw: string, source: string): void {
		let parsed: Record<string, unknown>
		try {
			parsed = JSON.parse(raw) as Record<string, unknown>
		} catch {
			throw new AppError(
				`Credenciais GCS inválidas (${source}): JSON malformado. ${GCS_SETUP_HINT}`,
				503,
			)
		}

		if (parsed._placeholder === true) {
			throw new AppError(
				`Credenciais GCS ainda são placeholder (${source}). ${GCS_SETUP_HINT}`,
				503,
			)
		}

		if (parsed.type !== 'service_account') {
			throw new AppError(
				`Credenciais GCS inválidas (${source}): esperado type "service_account". ${GCS_SETUP_HINT}`,
				503,
			)
		}

		if (typeof parsed.private_key !== 'string' || !parsed.private_key) {
			throw new AppError(
				`Credenciais GCS incompletas (${source}): falta private_key. ${GCS_SETUP_HINT}`,
				503,
			)
		}
	}

	private get storage(): Storage {
		if (this._storage) return this._storage

		this.assertValidCredentials()

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
				throw new AppError(
					`GCS_CREDENTIALS_JSON inválido — forneça JSON válido ou base64. ${GCS_SETUP_HINT}`,
					503,
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
