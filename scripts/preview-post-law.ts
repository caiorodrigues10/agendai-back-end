/** Local review artifact; never writes to the database or publishes a post. */
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { buildPostSvg } from '../src/modules/posts/services/postImageService'
import { renderSvgToPngSync } from '../src/modules/posts/services/postSvgRenderer'
import { loadPostStockImage } from '../src/modules/posts/services/postStockImages'
import {
	POST_TEMPLATES,
	listPostTemplates,
} from '../src/modules/posts/services/postTemplates'
import { LEGAL_POST_TEMPLATES } from '../src/modules/posts/services/legalPostTemplates'
import { LEGAL_POST_SAMPLES } from '../src/modules/posts/services/legalPostSamples.fixture'

function escapeHtml(text: string): string {
	return text.replace(
		/[&<>"']/g,
		(char) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				char
			]!,
	)
}

async function writeMobileProofs(out: string) {
	const audit = path.join(out, 'audit')
	await fs.mkdir(audit, { recursive: true })
	const formats = ['square', 'portrait', 'story'] as const
	const expectedHeights = { square: 1080, portrait: 1350, story: 1920 }
	const metrics: {
		templateKey: string
		format: string
		width: number
		height: number
		bytes: number
	}[] = []
	for (const [templateKey] of LEGAL_POST_TEMPLATES) {
		const layers: { input: Buffer; left: number; top: number }[] = []
		const labels = ['Quadrado · 360 px', 'Retrato · 360 px', 'Story · 360 px']
		layers.push({
			input: Buffer.from(
				`<svg xmlns="http://www.w3.org/2000/svg" width="1128" height="40">${labels.map((label, i) => `<text x="${i * 384 + 6}" y="24" font-family="Arial" font-size="14" fill="#263d35">${label}</text>`).join('')}</svg>`,
			),
			left: 0,
			top: 0,
		})
		for (const [i, format] of formats.entries()) {
			const png = await fs.readFile(
				path.join(out, `${templateKey}-${format}.png`),
			)
			const metadata = await sharp(png).metadata()
			if (
				metadata.width !== 1080 ||
				metadata.height !== expectedHeights[format]
			)
				throw new Error(`Dimensão inválida: ${templateKey}/${format}`)
			metrics.push({
				templateKey,
				format,
				width: metadata.width,
				height: metadata.height,
				bytes: png.length,
			})
			layers.push({
				input: await sharp(png).resize({ width: 360 }).png().toBuffer(),
				left: i * 384,
				top: 44,
			})
		}
		await sharp({
			create: { width: 1128, height: 708, channels: 4, background: '#e8e6df' },
		})
			.composite(layers)
			.png()
			.toFile(path.join(audit, `${templateKey}-mobile-360.png`))
	}
	await fs.writeFile(
		path.join(audit, 'metrics-360.json'),
		JSON.stringify(metrics, null, 2),
	)
}

async function main() {
	const args = process.argv.slice(2)
	const profileOption = args.indexOf('--profile-image')
	let profileImage: string | undefined
	if (profileOption !== -1) {
		const file = args[profileOption + 1]
		if (!file || file.startsWith('--'))
			throw new Error('Informe um caminho após --profile-image.')
		const image = await fs.readFile(path.resolve(file))
		const metadata = await sharp(image).metadata()
		if (!['jpeg', 'png', 'webp'].includes(metadata.format || ''))
			throw new Error('A foto de perfil precisa ser JPEG, PNG ou WebP.')
		profileImage = `data:image/${metadata.format};base64,${image.toString('base64')}`
		args.splice(profileOption, 2)
	}
	if (args.length > 1 || args[0]?.startsWith('--'))
		throw new Error(
			'Uso: preview-post-law.ts [diretório] [--profile-image caminho]',
		)
	const out = path.resolve(
		args[0] || path.join(__dirname, '../../artifacts/posts-law-v6'),
	)
	await fs.mkdir(out, { recursive: true })
	const cards: string[] = []
	const thumbs: { input: Buffer; left: number; top: number }[] = []
	for (let index = 0; index < LEGAL_POST_TEMPLATES.length; index++) {
		const [templateKey, name, , description] = LEGAL_POST_TEMPLATES[index]
		const sample = LEGAL_POST_SAMPLES.find(
			(item) => item.templateKey === templateKey,
		)
		if (!sample) throw new Error(`Amostra ausente para ${templateKey}.`)
		const template = POST_TEMPLATES.find((item) => item.key === templateKey)
		// A professional portrait is supplied deliberately for review, never chosen as stock.
		const primaryImageUrl =
			index === 8 ? profileImage : loadPostStockImage(template?.stockImageKey)
		for (const format of ['square', 'portrait', 'story'] as const) {
			const svg = buildPostSvg({
				templateKey,
				format,
				title: sample.title,
				ctaText: sample.ctaText,
				shopName: 'Bruno Azevedo Advocacia',
				postMode: 'appointments',
				todaySchedule: null,
				services: [],
				paletteKey: 'brand',
				primaryImageUrl,
				designOptions: { legalPost: sample.legalPost },
			})
			const png = renderSvgToPngSync(svg)
			const file = `${templateKey}-${format}.png`
			await fs.writeFile(path.join(out, file), png)
			await fs.writeFile(path.join(out, `${templateKey}-${format}.svg`), svg)
			cards.push(
				`<figure data-format="${format}"><a href="${file}" target="_blank" rel="noopener"><img loading="lazy" src="${file}" alt="${escapeHtml(name)} · ${format}"></a><figcaption><b>${String(index + 1).padStart(2, '0')} · ${escapeHtml(name)}</b><span>${format}</span></figcaption><p class="purpose">${escapeHtml(description)}</p></figure>`,
			)
			if (format === 'portrait') {
				const left = (index % 5) * 344,
					top = Math.floor(index / 5) * 446
				thumbs.push({
					input: await sharp(png).resize(320, 400).png().toBuffer(),
					left,
					top,
				})
				thumbs.push({
					input: Buffer.from(
						`<svg width="320" height="34"><text x="2" y="23" font-family="Arial" font-size="14" fill="#26352e">${String(index + 1).padStart(2, '0')} · ${escapeHtml(name)}</text></svg>`,
					),
					left,
					top: top + 404,
				})
			}
		}
	}
	await sharp({
		create: { width: 1696, height: 892, channels: 4, background: '#E8E6DF' },
	})
		.composite(thumbs)
		.png()
		.toFile(path.join(out, 'modelos-advocacia.png'))
	await fs.writeFile(
		path.join(out, 'catalog.json'),
		JSON.stringify(
			listPostTemplates().filter(
				(template) => template.businessCategory === 'advocacia',
			),
			null,
			2,
		),
	)
	await fs.writeFile(
		path.join(out, 'samples.json'),
		JSON.stringify(LEGAL_POST_SAMPLES, null, 2),
	)
	await writeMobileProofs(out)
	await fs.writeFile(
		path.join(out, 'index.html'),
		`<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Advocacia — dez funções editoriais</title>
<style>
*{box-sizing:border-box}body{font:16px system-ui;background:#e8e6df;color:#26352e;margin:0;padding:40px 24px}
header,main{max-width:1280px;margin:auto}header{margin-bottom:36px}h1{font:clamp(32px,5vw,58px) Georgia;margin:10px 0}
p{max-width:760px;line-height:1.6;color:#5b675e}nav{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap}
button{font:inherit;cursor:pointer;border:1px solid #a9b0a4;border-radius:6px;padding:12px 20px;background:transparent;color:inherit}
button[aria-pressed=true]{background:#263d33;color:#faf7eb}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 28px}
figure{margin:0}figure[hidden]{display:none}img{width:100%;height:auto;display:block;box-shadow:0 6px 20px #132a1a15}
figcaption{padding:14px 0 0;display:flex;gap:12px;justify-content:space-between}figcaption span{font-size:12px;color:#5b675e}
.purpose{font-size:14px;margin:8px 0 0}a:focus-visible,button:focus-visible{outline:3px solid #80623f;outline-offset:4px}
@media(max-width:760px){main{grid-template-columns:1fr}body{padding:24px 18px}}
</style>
<header><small>COLEÇÃO EDITORIAL · ADVOCACIA · V6</small><h1>Mais espaço para a mensagem.</h1>
<p>Dez modelos, três formatos e menos texto. Identificação e contato essencial em cada arte. Todos os dados e a foto são fictícios; o aviso de 23 de novembro de 2026 é uma amostra.</p>
<p>${profileImage ? 'A foto de perfil foi fornecida como fixture de revisão; não é incluída como retrato automático no produto.' : 'O perfil usa identificação tipográfica. Uma foto própria pode ser fornecida ao gerar esta galeria.'}</p>
<nav aria-label="Formato"><button data-filter="portrait" aria-pressed="true">Retrato · 4:5</button><button data-filter="square" aria-pressed="false">Quadrado · 1:1</button><button data-filter="story" aria-pressed="false">Story · 9:16</button></nav></header>
<main>${cards.join('')}</main>
<script>const show=f=>{document.querySelectorAll("figure").forEach(c=>c.hidden=c.dataset.format!==f);document.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.filter===f)))};document.querySelectorAll("button").forEach(b=>b.onclick=()=>show(b.dataset.filter));show("portrait");</script></html>`,
	)
	console.log(out)
}
main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
