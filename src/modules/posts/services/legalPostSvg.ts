import { AppError } from '@/shared/errors/AppError'
import { TEMPLATE_VERSION } from './postTemplateVersion'
import metrics from './legalFontMetrics.json'
import {
	LEGAL_POST_TEMPLATES,
	legalTemplateIndex,
	type LegalPostData,
} from './legalPostTemplates'

type Font = keyof typeof metrics
type Input = {
	templateKey?: string
	format?: 'square' | 'portrait' | 'story'
	paletteKey?: string
	title: string
	ctaText: string
	shopName: string
	logoUrl?: string | null
	primaryImageUrl?: string | null
	designOptions?: { legalPost?: LegalPostData }
}
type Theme = {
	bg: string
	ink: string
	muted: string
	accent: string
	rule: string
	panel: string
}
type Area = LegalPostData['areas'][number]
const xml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&apos;',
			})[c]!,
	)
const fontNames: Record<Font, string> = {
	serif: 'Cormorant Garamond',
	italic: 'Cormorant Garamond',
	sans: 'Inter',
	sansBold: 'Inter',
}
const tooLong = () =>
	new AppError(
		'O texto ficou longo para uma leitura confortável. Encurte o título ou os blocos, ou escolha Retrato ou Story.',
		400,
	)
function advance(
	value: string,
	size: number,
	font: Font = 'sans',
	tracking = 0,
): number {
	const glyphs = metrics[font].advance as Record<string, number>
	return Array.from(value).reduce(
		(w, c) =>
			w + (glyphs[String(c.codePointAt(0))] ?? 1) * size * 1.025 + tracking,
		0,
	)
}

/** Metrics from the exact bundled fonts; a small safety margin covers kerning. */
export function legalTextLines(
	text: string,
	width: number,
	size: number,
	font: Font = 'sans',
	tracking = 0,
): string[] {
	const lines: string[] = []
	for (const paragraph of text.trim().split(/\n/)) {
		const words = paragraph.trim().split(/\s+/).filter(Boolean)
		let row = ''
		for (const word of words) {
			if (row && advance(row + ' ' + word, size, font, tracking) > width) {
				lines.push(row)
				row = ''
			}
			if (advance(word, size, font, tracking) > width) throw tooLong()
			row = row ? row + ' ' + word : word
		}
		if (row) lines.push(row)
	}
	if (
		(font === 'serif' || font === 'italic') &&
		lines.length === 2 &&
		!text.includes('\n')
	) {
		const words = text.trim().split(/\s+/)
		let best = lines
		let diff = Infinity
		for (let at = 1; at < words.length; at++) {
			const candidate = [
				words.slice(0, at).join(' '),
				words.slice(at).join(' '),
			]
			if (candidate.some((line) => /^(e|o|a|de|do|da)$/i.test(line))) continue
			const widths = candidate.map((line) => advance(line, size, font))
			if (
				Math.max(...widths) <= width &&
				Math.abs(widths[0] - widths[1]) < diff
			) {
				best = candidate
				diff = Math.abs(widths[0] - widths[1])
			}
		}
		return best
	}
	return lines
}
const lh = (size: number, font: Font) =>
	size * (font === 'serif' || font === 'italic' ? 1.04 : 1.3)
function textHeight(
	value: string,
	width: number,
	size: number,
	font: Font = 'sans',
) {
	return value.trim()
		? legalTextLines(value, width, size, font).length * lh(size, font)
		: 0
}
function fitTitle(
	value: string,
	width: number,
	maxHeight: number,
	target: number,
	font: Font = 'serif',
) {
	for (let size = target; size >= 66; size -= 2) {
		try {
			const lines = legalTextLines(value, width, size, font)
			if (
				lines.length <= 4 &&
				!lines.some((line) => /^(e|o|a|de|do|da)$/i.test(line)) &&
				lines.length * lh(size, font) <= maxHeight
			)
				return size
		} catch {
			/* Try a smaller heading, never a smaller body. */
		}
	}
	throw tooLong()
}
function themeFor(index: number, palette?: string): Theme {
	const dark = [1, 6].includes(index) && palette !== 'clara'
	const hue =
		palette === 'rose'
			? '#482D38'
			: palette === 'oceano'
				? '#183D50'
				: '#193C34'
	if (index === 7 && palette !== 'clara')
		return {
			bg: '#493039',
			ink: '#FFF8ED',
			muted: '#F0E4D9',
			accent: '#E6CAAA',
			rule: '#997D7E',
			panel: '#5D424A',
		}
	return dark
		? {
				bg: hue,
				ink: '#FAF7EE',
				muted: '#DEE5DC',
				accent: '#E6CD9D',
				rule: '#688276',
				panel: '#294C43',
			}
		: {
				bg: [3, 5].includes(index) ? '#E9EDE4' : '#F7F3EB',
				ink: '#203A32',
				muted: '#40584E',
				accent:
					palette === 'rose'
						? '#764556'
						: palette === 'oceano'
							? '#2F5C72'
							: '#886037',
				rule: '#B9BDAE',
				panel: '#E4E8DE',
			}
}
function initials(name: string) {
	const words = name
		.trim()
		.split(/\s+/)
		.filter(
			(w) => !/^(de|da|do|dos|das|e|advocacia|advogados|escritório)$/i.test(w),
		)
	return (
		(words.length > 1 ? [words[0], words[words.length - 1]] : words)
			.map((w) => Array.from(w)[0])
			.join('')
			.toUpperCase()
			.slice(0, 2) || 'A'
	)
}
class Art {
	nodes: string[] = []
	rect(x: number, y: number, w: number, h: number, fill: string, radius = 0) {
		this.nodes.push(
			`<rect x="${x}" y="${y}" width="${w}" height="${Math.max(0, h)}" rx="${radius}" fill="${fill}"/>`,
		)
	}
	line(
		x: number,
		y: number,
		x2: number,
		y2: number,
		color: string,
		stroke = 2,
	) {
		this.nodes.push(
			`<path d="M${x} ${y}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`,
		)
	}
	text(
		value: string,
		x: number,
		y: number,
		w: number,
		size: number,
		color: string,
		font: Font = 'sans',
		role = 'body',
		align: 'left' | 'center' = 'left',
	): number {
		if (!value.trim()) return y
		const lines = legalTextLines(value, w, size, font)
		const height = lines.length * lh(size, font)
		this.nodes.push(
			`<g data-legal-role="${role}" data-x="${x}" data-y="${y}" data-width="${w}" data-height="${height}">`,
		)
		lines.forEach((row, i) =>
			this.nodes.push(
				`<text x="${align === 'center' ? x + w / 2 : x}"${align === 'center' ? ' text-anchor="middle"' : ''} y="${y + size * (font === 'serif' || font === 'italic' ? 0.79 : 0.84) + i * lh(size, font)}" fill="${color}" font-family="${fontNames[font]}" font-size="${size}" font-weight="${font === 'sansBold' ? 700 : font === 'sans' ? 400 : 500}" font-style="${font === 'italic' ? 'italic' : 'normal'}">${xml(row)}</text>`,
			),
		)
		this.nodes.push('</g>')
		return y + height
	}
	photo(
		url: string | null | undefined,
		x: number,
		y: number,
		w: number,
		h: number,
		id: string,
		fallback: string,
		position = 'xMidYMid',
	) {
		this.nodes.push(
			`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${Math.max(0, h)}"/></clipPath>`,
		)
		if (url?.startsWith('data:image'))
			this.nodes.push(
				`<image href="${xml(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${position} slice" clip-path="url(#${id})"/>`,
			)
		else {
			this.rect(x, y, w, h, fallback)
			for (let i = 0; i < 5; i++)
				this.line(x + (i * w) / 4, y, x + (i * w) / 4, y + h, '#9DAE9E', 2)
		}
	}
	mark(
		name: string,
		x: number,
		y: number,
		size: number,
		theme: Theme,
		logo?: string | null,
	) {
		if (logo?.startsWith('data:image'))
			this.nodes.push(
				`<image href="${xml(logo)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`,
			)
		else {
			this.rect(x, y, size, size, theme.panel, 2)
			this.text(
				initials(name),
				x + 10,
				y + (size - lh(size * 0.46, 'sansBold')) / 2,
				size - 20,
				size * 0.46,
				theme.ink,
				'sansBold',
				'monogram',
				'center',
			)
		}
	}
	brand(
		name: string,
		registration: string,
		top: number,
		theme: Theme,
		logo?: string | null,
		omitRepeatedName = false,
	) {
		const textH = (omitRepeatedName ? 0 : textHeight(name, 840, 42, 'sansBold') + 12) + textHeight(registration, 840, 39)
		const blockH = Math.max(88, textH)
		this.mark(name, 64, top + (blockH - 88) / 2, 88, theme, logo)
		const textTop = top + (blockH - textH) / 2
		const end = omitRepeatedName ? textTop - 12 : this.text(
			name,
			176,
			textTop,
			840,
			42,
			theme.ink,
			'sansBold',
			'brand',
		)
		this.text(
			registration,
			176,
			end + 12,
			840,
			39,
			theme.muted,
			'sans',
			'registration',
		)
		return top + blockH
	}
}

type Footer = {
	lines: { value: string; size: number; role: string }[]
	height: number
}
function footerPlan(data: LegalPostData | undefined, cta: string): Footer {
	const lines = [
		{
			value: cta?.trim() || 'Converse com o escritório',
			size: 39,
			role: 'cta',
		},
	]
	const contact = data?.contact?.trim()
	const website = data?.website?.trim()
	const address = data?.address?.trim()
	if (data?.contactLayout === 'essential') {
		if (contact) lines.push({ value: contact, size: 42, role: 'contact' })
		else if (website) lines.push({ value: website, size: 42, role: 'contact' })
		else if (address) lines.push({ value: address, size: 39, role: 'address' })
	} else if (contact && website && advance(contact + '  ·  ' + website, 42) <= 952)
		lines.push({
			value: contact + '  ·  ' + website,
			size: 42,
			role: 'contact',
		})
	else {
		if (contact) lines.push({ value: contact, size: 42, role: 'contact' })
		if (website) lines.push({ value: website, size: 42, role: 'contact' })
	}
	if (address && data?.contactLayout !== 'essential') lines.push({ value: address, size: 39, role: 'address' })
	return {
		lines,
		height:
			36 +
			lines.reduce(
				(sum, row) =>
					sum +
					textHeight(
						row.value,
						952,
						row.size,
						row.role === 'cta' ? 'sansBold' : 'sans',
					) +
					(row.role === 'cta' ? 20 : 12),
				0,
			),
	}
}
function drawFooter(art: Art, plan: Footer, y: number, theme: Theme) {
	art.line(64, y, 1016, y, theme.rule)
	let rowY = y + 36
	for (const row of plan.lines)
		rowY =
			art.text(
				row.value,
				64,
				rowY,
				952,
				row.size,
				row.role === 'cta' ? theme.accent : theme.ink,
				row.role === 'cta' ? 'sansBold' : 'sans',
				'footer-' + row.role,
			) + (row.role === 'cta' ? 20 : 12)
}

type ListStyle = 'plain' | 'check' | 'steps' | 'document' | 'map'
function listHeight(
	items: Area[],
	w: number,
	body: number,
	style: ListStyle,
	gap: number,
) {
	const indent = style === 'plain' ? 0 : style === 'map' ? 12 : 86
	const labelSize = body + 2
	const heights = items.map(
		(a) =>
			textHeight(a.title, w - indent, labelSize, 'sansBold') +
			(a.description ? 12 + textHeight(a.description, w - indent, body) : 0),
	)
	return {
		heights,
		height:
			heights.reduce((sum, h) => sum + h, 0) +
			Math.max(0, items.length - 1) * gap,
		indent,
		labelSize,
	}
}
function drawList(
	art: Art,
	items: Area[],
	x: number,
	y: number,
	w: number,
	available: number,
	body: number,
	theme: Theme,
	style: ListStyle,
	spacious: boolean,
) {
	const minGap = spacious ? 56 : 32
	const plan = listHeight(items, w, body, style, minGap)
	if (plan.height > available + 1) throw tooLong()
	const gap =
		items.length > 1
			? Math.min(
					spacious ? 168 : 96,
					minGap + Math.max(0, available - plan.height) / (items.length - 1),
				)
			: 0
	let rowY = y
	items.forEach((area, i) => {
		const labelH = textHeight(area.title, w - plan.indent, plan.labelSize, 'sansBold')
		const iconY = rowY + (labelH - (style === 'document' ? 61 : style === 'check' ? 54 : 56)) / 2
		if (style === 'steps') {
			if (i < items.length - 1)
				art.line(
					x + 28,
					iconY + 56,
					x + 28,
					rowY + plan.heights[i] + gap,
					theme.rule,
					2,
				)
			art.rect(x, iconY, 56, 56, theme.ink, 28)
			art.text(
				String(i + 1).padStart(2, '0'),
				x,
				iconY + (56 - lh(33, 'sansBold')) / 2,
				56,
				33,
				theme.bg,
				'sansBold',
				'step-number',
				'center',
			)
		} else if (style === 'check') {
			art.rect(x, iconY, 54, 54, theme.ink, 6)
			art.nodes.push(
				`<path d="M${x + 12} ${iconY + 27}l10 10 20-22" fill="none" stroke="${theme.bg}" stroke-width="4"/>`,
			)
		} else if (style === 'document') {
			art.nodes.push(
				`<path d="M${x + 4} ${iconY}h32l15 16v43H4Z M${x + 36} ${iconY}v17h15 M${x + 15} ${iconY + 30}h25 M${x + 15} ${iconY + 42}h18" transform="translate(0 0)" fill="none" stroke="${theme.accent}" stroke-width="2.5"/>`.replace(
					'v43H4Z',
					`v43H${x + 4}Z`,
				),
			)
		} else if (style === 'map')
			art.line(x, rowY + 1, x, rowY + plan.heights[i], theme.accent, 3)
		const tx = x + plan.indent
		let end = art.text(
			area.title,
			tx,
			rowY,
			w - plan.indent,
			plan.labelSize,
			theme.ink,
			'sansBold',
		)
		if (area.description)
			end = art.text(
				area.description,
				tx,
				end + 12,
				w - plan.indent,
				body,
				theme.muted,
			)
		rowY = end + gap
	})
	return items.length ? rowY - gap : y
}
function drawGrid(
	art: Art,
	items: Area[],
	x: number,
	y: number,
	w: number,
	available: number,
	body: number,
	theme: Theme,
	spacious: boolean,
) {
	const colW = items.length === 1 ? w : (w - 56) / 2
	const rows: number[] = []
	for (let i = 0; i < items.length; i += 2)
		rows.push(
			Math.max(
				...items
					.slice(i, i + 2)
					.map((a) => listHeight([a], colW, body, 'plain', 0).height),
			),
		)
	const minGap = spacious ? 72 : 32
	const total =
		rows.reduce((n, h) => n + h + 20, 0) + Math.max(0, rows.length - 1) * minGap
	if (total > available + 1) throw tooLong()
	let ry = y
	rows.forEach((rh, row) => {
		items.slice(row * 2, row * 2 + 2).forEach((a, c) => {
			const ax = x + c * (colW + 56)
			art.line(ax, ry, ax + 60, ry, theme.accent, 3)
			drawList(art, [a], ax, ry + 20, colW, rh + 2, body, theme, 'plain', false)
		})
		ry += rh + 20 + minGap
	})
	return rows.length ? ry - minGap : y
}

export function buildLegalPostSvg(input: Input): string {
	const index = Math.max(0, legalTemplateIndex(input.templateKey))
	const story = input.format === 'story'
	const square = !input.format || input.format === 'square'
	const height = story ? 1920 : square ? 1080 : 1350
	const top = story ? 178 : square ? 48 : 60
	const bottom = story ? 206 : square ? 48 : 52
	const theme = themeFor(index, input.paletteKey)
	const data = input.designOptions?.legalPost
	const essential = data?.contactLayout === 'essential'
	const name = data?.professionalName.trim() || input.shopName
	const registration = data?.registration.trim() || 'Inscrição profissional'
	const areas = data?.areas.filter((a) => a.title.trim()).slice(0, 4) ?? []
	const summary = data?.summary?.trim() || ''
	const highlight = data?.highlight?.trim() || ''
	const defaultKickers = [
		'O ESCRITÓRIO',
		'ÁREAS DE ATUAÇÃO',
		'DÚVIDA & RESPOSTA',
		'CHECKLIST PRÁTICO',
		'COMO FUNCIONA',
		'GUIA DE DOCUMENTOS',
		'CONTATO SEGURO',
		'PAUTA ABERTA',
		'QUEM ATENDE VOCÊ',
		'AVISO DO ESCRITÓRIO',
	]
	const kicker = data?.eyebrow?.trim() || (essential ? '' : defaultKickers[index])
	const title = input.title.trim() || LEGAL_POST_TEMPLATES[index][2]
	const art = new Art()
	art.rect(0, 0, 1080, height, theme.bg)
	const footer = footerPlan(data, input.ctaText)
	const footerTop = height - bottom - footer.height
	const repeatedProfileName = essential && index === 8 && title.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === name.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
	const brandEnd = art.brand(name, registration, top, theme, input.logoUrl, repeatedProfileName)
	const start = brandEnd + (story ? 80 : square ? 48 : 56)
	const end = footerTop - (story ? 72 : 48)
	// Narrow map columns keep their readable text scale even when labels are enlarged.
	const body = essential && index !== 1 ? (story ? 54 : square ? 44 : 48) : story ? ([2, 4, 5].includes(index) ? 52 : 48) : square ? 39 : 44
	const gap = story ? 64 : square ? 40 : 48
	let contentBottom = start
	const eyebrow = (x: number, y: number, w = 952) =>
		art.text(kicker, x, y, w, 39, theme.accent, 'sansBold', 'eyebrow')
	const heading = (
		x: number,
		y: number,
		w: number,
		maxH: number,
		target = story ? 126 : square ? 102 : 116,
		font: Font = 'serif',
		align: 'left' | 'center' = 'left',
	) =>
		art.text(
			title,
			x,
			y,
			w,
			fitTitle(title, w, maxH, target, font),
			theme.ink,
			font,
			'headline',
			align,
		)
	const sectionHeight = kicker ? textHeight(kicker, 952, 39, 'sansBold') + 32 : 0
	const sectionStart = () => eyebrow(64, start) + (kicker ? 32 : 0)
	const placeSection = (contentTop: number) => eyebrow(64, contentTop - sectionHeight)
	const intro = (y: number, width = 952, x = 64, size = body) =>
		summary
			? art.text(summary, x, y, width, size, theme.muted, 'sans', 'summary') +
				gap
			: y
	const hHeight = highlight
		? textHeight(highlight, 952, body + 6, 'sansBold') + gap
		: 0

	if (index === 0) {
		// Identity uses the office photograph as context; the name keeps a readable signature.
		let y = sectionStart()
		const listH = areas.length
			? listHeight(areas, 448, body, 'plain', 0).heights
			: []
		const rowH = listH.length
			? Math.max(...listH) * Math.ceil(areas.length / 2) +
				Math.ceil(areas.length / 2) * (story ? 72 : 32)
			: 0
		const summaryH = summary ? textHeight(summary, 952, body) + gap : 0
		let photoH = story ? 420 : square ? 230 : 290
		const target = story ? 132 : 104
		const titleBudget = () =>
			end - y - rowH - photoH - summaryH - gap * 2 - hHeight
		try {
			fitTitle(title, 952, titleBudget(), target)
		} catch {
			photoH = story ? 220 : square ? 130 : 180
		}
		y = heading(64, y, 952, titleBudget(), target) + gap
		y = intro(y)
		if (highlight)
			y =
				art.text(
					highlight,
					64,
					y,
					952,
					body + 4,
					theme.accent,
					'sansBold',
					'highlight',
				) + gap
		if (areas.length)
			y =
				drawGrid(
					art,
					areas,
					64,
					y,
					952,
					end - y - photoH - gap,
					body,
					theme,
					story,
				) + gap
		if (y + photoH > end + 1) throw tooLong()
		const actualPhotoH = Math.max(photoH, end - y)
		art.photo(
			input.primaryImageUrl,
			64,
			y,
			952,
			actualPhotoH,
			'legalOffice',
			theme.panel,
		)
		contentBottom = end
	} else if (index === 1) {
		// Independent practices are a map, never a numbered sequence.
		let y = sectionStart()
		const columns = areas.length > 1 ? 2 : 1
		const cardW = columns === 2 ? 458 : 952
		const innerW = cardW - 64
		const labelSize = essential ? (story ? 72 : square ? 56 : 64) : story ? 58 : square ? 42 : 50
		const labelTop = square ? 34 : 62
		const ruleTop = square ? 16 : 34
		const descriptionGap = square ? 12 : 18
		const rowGap = square ? 32 : 40
		const titleGap = gap
		const rows = Math.ceil(areas.length / columns)
		const minHeights = Array.from(
			{ length: rows },
			(_, r) =>
				Math.max(
					...areas
						.slice(r * columns, r * columns + columns)
						.map(
							(a) =>
								textHeight(a.title, innerW, labelSize, 'sansBold') +
								(a.description
									? descriptionGap + textHeight(a.description, innerW, body)
									: 0),
						),
				) + labelTop + 10,
		)
		const gridH =
			minHeights.reduce((n, h) => n + h, 0) + Math.max(0, rows - 1) * rowGap
		const sh = summary ? textHeight(summary, 952, body) + gap : 0
		y =
			heading(
				64,
				y,
				952,
				end - y - gridH - titleGap - sh - hHeight,
				story ? 150 : 116,
			) + titleGap
		y = intro(y)
		if (highlight)
			y =
				art.text(
					highlight,
					64,
					y,
					952,
					body + 6,
					theme.accent,
					'sansBold',
					'highlight',
				) + gap
		let rowY = y
		// Keep each row's measured minimum; distribute only genuinely unused space.
		const extraPerRow = Math.max(0, end - y - gridH) / Math.max(rows, 1)
		minHeights.forEach((minimum, r) => {
			const rowH = minimum + extraPerRow
			areas.slice(r * columns, r * columns + columns).forEach((a, c) => {
				const ax = 64 + c * (cardW + 36)
				art.rect(ax, rowY, cardW, rowH, theme.panel, 4)
				const contentH = textHeight(a.title, innerW, labelSize, 'sansBold') + (a.description ? descriptionGap + textHeight(a.description, innerW, body) : 0)
				const contentTop = essential ? rowY + (rowH - contentH - 31) / 2 : rowY + labelTop
				art.line(essential ? ax + (cardW - 66) / 2 : ax + 32, essential ? contentTop : rowY + ruleTop, essential ? ax + (cardW + 66) / 2 : ax + 98, essential ? contentTop : rowY + ruleTop, theme.accent, 3)
				let ay = art.text(
					a.title,
					ax + 32,
					essential ? contentTop + 31 : contentTop,
					innerW,
					labelSize,
					theme.ink,
					'sansBold',
					'body',
					essential ? 'center' : 'left',
				)
				if (a.description)
					art.text(a.description, ax + 32, ay + descriptionGap, innerW, body, theme.muted, 'sans', 'body', essential ? 'center' : 'left')
			})
			rowY += rowH + rowGap
		})
		contentBottom = rows ? rowY - rowGap : y
	} else if (index === 2) {
		// Q&A separates the answer from optional practical steps with a clear answer panel.
		let y = start + sectionHeight
		const answer = summary || highlight
		const answerSize = essential ? (story ? 76 : square ? 52 : 60) : story ? 54 : square ? 40 : 46
		const ah = answer ? textHeight(answer, 856, answerSize) + 96 : 0
		const listH = listHeight(areas, 952, body, 'plain', story ? 56 : 32).height
		const titleTarget = essential ? (story ? 166 : square ? 124 : 144) : story ? 124 : 102
		if (essential && !areas.length && answer && !(summary && highlight)) {
			const titleH = textHeight(title, 952, fitTitle(title, 952, end - y - ah - gap * 2, titleTarget), 'serif')
			y += Math.max(0, (end - y - titleH - ah - gap * 2) / 2)
		}
		placeSection(y)
		y =
			heading(64, y, 952, end - y - ah - listH - gap * 2, titleTarget) +
			gap
		if (answer) {
			art.rect(64, y, 952, ah, theme.panel, 4)
			art.rect(64, y, 6, ah, theme.accent)
			y =
				art.text(
					answer,
					112,
					y + 48,
					856,
					answerSize,
					theme.ink,
					'sans',
					'answer',
				) +
				48 +
				gap
		}
		if (summary && highlight)
			y =
				art.text(
					highlight,
					64,
					y,
					952,
					body + 2,
					theme.accent,
					'sansBold',
					'highlight',
				) + gap
		contentBottom = drawList(
			art,
			areas,
			64,
			y,
			952,
			end - y,
			body,
			theme,
			'plain',
			story,
		)
	} else if (index === 3 || index === 5) {
		let y = start + sectionHeight
		const style: ListStyle = index === 3 ? 'check' : 'document'
		const checkPad = square ? 0 : story ? 64 : 48
		const checkGap = square ? 32 : 40
		const titleGap = gap
		const checkPlan = listHeight(areas, 888, body, 'check', 0)
		const listH =
			index === 3
				? checkPlan.heights.reduce((sum, h) => sum + h + checkPad, 0) +
					Math.max(0, areas.length - 1) * checkGap
				: listHeight(areas, 952, body, style, story ? 56 : 32).height
		const sh = summary ? textHeight(summary, 952, body) + gap : 0
		if (essential && index === 5 && !summary && !highlight && areas.length) {
			const titleH = textHeight(title, 952, fitTitle(title, 952, end - y - listH - titleGap, story ? 140 : 118), 'serif')
			const balancedListH = listHeight(areas, 952, body, style, story ? 168 : 96).height
			y += Math.max(0, (end - y - titleH - titleGap - balancedListH) / 2)
		}
		placeSection(y)
		y =
			heading(
				64,
				y,
				952,
				end - y - listH - sh - titleGap - hHeight,
				story ? 140 : 118,
			) + titleGap
		y = intro(y)
		if (highlight)
			y =
				art.text(
					highlight,
					64,
					y,
					952,
					body + 6,
					theme.accent,
					'sansBold',
					'highlight',
				) + gap
		if (index === 3 && areas.length) {
			const plan = checkPlan
			const rowGap = checkGap
			const minTotal = listH
			if (minTotal > end - y + 1) throw tooLong()
			let rowY = y
			const extra = Math.max(0, end - y - minTotal) / areas.length
			areas.forEach((a, i) => {
				const rowH = plan.heights[i] + checkPad + extra
				if (square) {
					if (i > 0) art.line(64, rowY - rowGap / 2, 1016, rowY - rowGap / 2, theme.rule)
				} else art.rect(64, rowY, 952, rowH, '#F7F3EB', 4)
				const textY = rowY + (rowH - plan.heights[i]) / 2
				drawList(
					art,
					[a],
					96,
					textY,
					888,
					plan.heights[i] + 1,
					body,
					theme,
					'check',
					false,
				)
				rowY += rowH + rowGap
			})
			contentBottom = rowY - rowGap
		} else
			contentBottom = drawList(
				art,
				areas,
				64,
				y,
				952,
				end - y,
				body,
				theme,
				style,
				story,
			)
	} else if (index === 4) {
		// Connected timeline conveys sequence rather than a pair of service descriptions.
		let y = start + sectionHeight
		const listH = listHeight(areas, 952, body, 'steps', story ? 56 : 32).height
		if (essential && !summary && !highlight && areas.length) {
			const titleH = textHeight(title, 952, fitTitle(title, 952, end - y - listH - gap, story ? 126 : 104, 'italic'), 'italic')
			const balancedListH = listHeight(areas, 952, body, 'steps', story ? 168 : 96).height
			y += Math.max(0, (end - y - titleH - gap - balancedListH) / 2)
		}
		placeSection(y)
		y =
			heading(
				64,
				y,
				952,
				end -
					y -
					listH -
					gap -
					(summary ? textHeight(summary, 952, body) + gap : 0) -
					hHeight,
				story ? 126 : 104,
				'italic',
			) + gap
		y = intro(y)
		if (highlight)
			y =
				art.text(
					highlight,
					64,
					y,
					952,
					body + 6,
					theme.accent,
					'sansBold',
					'highlight',
				) + gap
		contentBottom = drawList(
			art,
			areas,
			64,
			y,
			952,
			end - y,
			body,
			theme,
			'steps',
			story,
		)
	} else if (index === 6) {
		// A clear document-sharing reminder uses an envelope, not an unrelated courthouse.
		let y = sectionStart()
		const illustrationH = story ? 330 : square ? 0 : 230
		const sh = summary ? textHeight(summary, 952, body) + gap : 0
		const listH = areas.length
			? Math.max(
					...listHeight(areas, areas.length > 1 ? 448 : 952, body, 'plain', 0)
						.heights,
				) *
					Math.ceil(areas.length / 2) +
				40
			: 0
		y =
			heading(
				64,
				y,
				952,
				end - y - listH - sh - illustrationH - gap * 2 - hHeight,
				story ? 148 : 118,
			) + gap
		if (highlight)
			y =
				art.text(
					highlight,
					64,
					y,
					952,
					body + 6,
					theme.accent,
					'sansBold',
					'highlight',
				) + gap
		y = intro(y)
		if (areas.length)
			y =
				drawGrid(
					art,
					areas,
					64,
					y,
					952,
					end - y - illustrationH - gap,
					body,
					theme,
					false,
				) + gap
		if (y + illustrationH > end + 1) throw tooLong()
		const panelH = illustrationH ? end - y : 72
		if (illustrationH) art.rect(64, y, 952, panelH, theme.panel, 4)
		const ew = illustrationH ? Math.min(420, panelH * 1.9) : 144
		const eh = ew * 0.49
		const ex = (1080 - ew) / 2
		const ey = y + ((illustrationH ? panelH : end - y) - eh) / 2
		if (illustrationH || end - y >= eh + 40) art.nodes.push(
			`<g data-legal-role="illustration" data-x="${ex}" data-y="${ey}" data-width="${ew}" data-height="${eh}" fill="none" stroke="${theme.accent}" stroke-width="3"><rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="5"/><path d="M${ex} ${ey}l${ew / 2} ${eh * 0.67} ${ew / 2}-${eh * 0.67} M${ex} ${ey + eh}l${ew * 0.34}-${eh * 0.52} M${ex + ew} ${ey + eh}l-${ew * 0.34}-${eh * 0.52}"/></g>`,
		)
		contentBottom = illustrationH ? end : y
	} else if (index === 7) {
		// An editorial invitation is not a quotation or a client testimonial.
		let y = start + sectionHeight
		const listH = listHeight(areas, 952, body, 'plain', story ? 56 : 32).height
		const sh = summary ? textHeight(summary, 952, body + 2) + gap : 0
		const quoteH = highlight
			? textHeight(highlight, 952, body + 8, 'italic') + gap
			: 0
		const titleTarget = essential ? (story ? 186 : square ? 146 : 166) : story ? 154 : 126
		if (essential && !areas.length && !highlight) {
			const titleH = textHeight(title, 952, fitTitle(title, 952, end - y - sh - gap, titleTarget, 'italic'), 'italic')
			y += Math.max(0, (end - y - titleH - sh - gap) / 2)
		}
		placeSection(y)
		y =
			heading(
				64,
				y,
				952,
				end - y - listH - sh - quoteH - gap,
				titleTarget,
				'italic',
			) + gap
		if (highlight)
			y =
				art.text(
					highlight,
					64,
					y,
					952,
					body + 8,
					theme.accent,
					'italic',
					'highlight',
				) + gap
		y = intro(y, 952, 64, body + 2)
		contentBottom = drawList(
			art,
			areas,
			64,
			y,
			952,
			end - y,
			body,
			theme,
			'plain',
			story,
		)
	} else if (index === 8) {
		// Profile has a portrait-sized photo, never a face cropped into a horizontal banner.
		let y = start + sectionHeight
		const rowH = Math.min(story ? 700 : square ? (areas.length ? 360 : 420) : 500, end - y)
		if (essential && !areas.length) y += Math.max(0, (end - y - rowH) / 2)
		placeSection(y)
		const sh = summary ? textHeight(summary, 466, body) + gap : 0
		const hh = highlight
			? textHeight(highlight, 466, body + 2, 'sansBold') + gap
			: 0
		const titleSize = fitTitle(title, 466, rowH - sh - hh - gap, story ? 124 : square ? 88 : 104)
		const textH = textHeight(title, 466, titleSize, 'serif') + sh + hh
		const textTop = y + Math.max(0, (rowH - textH) / 2)
		let textY =
			heading(
				64,
				textTop,
				466,
				rowH - sh - hh - gap,
				titleSize,
			)
		if (summary)
			textY =
				art.text(
					summary,
					64,
					textY + gap,
					466,
					body,
					theme.muted,
					'sans',
					'summary',
				)
		if (highlight)
			textY = art.text(
				highlight,
				64,
				textY + gap,
				466,
				body + 2,
				theme.accent,
				'sansBold',
				'highlight',
			)
		if (textY > y + rowH + 1) throw tooLong()
		const photoW = Math.min(430, rowH * 0.8)
		const photoX = 586 + (430 - photoW) / 2
		if (input.primaryImageUrl?.startsWith('data:image'))
			art.photo(
				input.primaryImageUrl,
				photoX,
				y,
				photoW,
				rowH,
				'legalPortrait',
				theme.panel,
				'xMidYMin',
			)
		else {
			art.rect(photoX, y, photoW, rowH, theme.panel)
			const s = Math.min(rowH - 40, 220)
			art.mark(
				name,
				photoX + (photoW - s) / 2,
				y + (rowH - s) / 2,
				s,
				theme,
				input.logoUrl,
			)
		}
		y += rowH + gap
		contentBottom = drawList(
			art,
			areas,
			64,
			y,
			952,
			end - y,
			body,
			theme,
			'plain',
			story,
		)
	} else {
		// The date and time, rather than a generic heading, lead an operational notice.
		let y = essential ? art.text(kicker, 64, start, 952, 39, theme.accent, 'sansBold', 'eyebrow', 'center') + (kicker ? 32 : 0) : sectionStart()
		if (highlight) {
			const dateSize = story ? 158 : square ? 86 : 120
			const timeSize = story ? 86 : square ? 50 : 66
			const compactSummary = summary && summary.length <= 60
			const dh =
				textHeight(highlight, 856, dateSize, 'sansBold') +
				(compactSummary ? textHeight(summary, 856, timeSize, 'sans') + 14 : 0) +
				(square ? 48 : 72)
			art.rect(64, y, 952, dh, theme.ink, 4)
			let dy = art.text(
				highlight,
				112,
				y + (square ? 22 : 34),
				856,
				dateSize,
				theme.bg,
				'sansBold',
				'highlight',
				essential ? 'center' : 'left',
			)
			if (compactSummary)
				art.text(
					summary,
					112,
					dy + 14,
					856,
					timeSize,
					theme.bg,
					'sans',
					'summary',
					essential ? 'center' : 'left',
				)
			y += dh + gap
		}
		const listH = listHeight(areas, 952, body, 'plain', story ? 56 : 32).height
		const outsideSummary = summary && (!highlight || summary.length > 60)
		const sh = outsideSummary ? textHeight(summary, 952, body + 2) + gap : 0
		y =
			heading(
				64,
				y,
				952,
				end - y - listH - sh - gap,
				story ? 166 : square ? 112 : 144,
				'serif',
				essential ? 'center' : 'left',
			) + gap
		if (outsideSummary) y = intro(y, 952, 64, body + 2)
		contentBottom = drawList(
			art,
			areas,
			64,
			y,
			952,
			end - y,
			body,
			theme,
			'plain',
			story,
		)
	}
	if (contentBottom > end + 2 || brandEnd > start) throw tooLong()
	drawFooter(art, footer, footerTop, theme)
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" data-template-key="${xml(input.templateKey || '')}" data-business-category="advocacia" data-legal-content-bottom="${contentBottom}" data-legal-footer-top="${footerTop}" data-template-version="${TEMPLATE_VERSION}">${art.nodes.join('')}</svg>`
}
