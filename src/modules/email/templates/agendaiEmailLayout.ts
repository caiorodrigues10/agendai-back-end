/**
 * Layout base dos e-mails transacionais do AgendAI.
 *
 * Decisões de design (feitas deliberadamente):
 * - Paleta verde e neutra alinhada ao painel, com estilos compatíveis com e-mail.
 * - Dark mode via media query `prefers-color-scheme` quando o client suporta;
 *   de outra forma permanece claro.
 * - Imagens não são essenciais: logo é texto + cor, alt text presente sempre.
 * - Largura fixa 520px para compatibilidade desktop; `max-width` para mobile.
 * - Links absolutos HTTP/HTTPS validados antes da renderização.
 * - Conteúdo passa por escape no caller.
 * - Rodapé padrão inclui link de unsubscribe/preferências em e-mails de marketing
 *   — não incluído aqui para não vazar em transacionais onde não é exigido.
 */

const COLORS = {
	accent: '#1C7E61',
	accentFg: '#FFFFFF',
	bg: '#F8FAF8',
	bgDark: '#0F1110',
	card: '#FFFFFF',
	cardDark: '#1B1F1D',
	border: '#E2E8E2',
	borderDark: '#2C3330',
	text: '#161B18',
	textMuted: '#4D5F55',
	textMutedDark: '#8F9B93',
	textMutedDarkBg: '#8C998F',
	hero: '#0E1F17',
	heroAccent: '#2CB58A',
	danger: '#B91C1C',
} as const

const FONT = 'Arial, sans-serif'

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

function safeUrl(value: string): string {
 const url = new URL(value);
 if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
  throw new Error('URL inválida no e-mail');
 }
 return escapeHtml(url.href);
}

/** Tom que será desenhado no e-mail (não o tema do painel). */
export type EmailTheme = 'light' | 'dark'

/**
 * Layout base AgendAI: barra colorida no topo, cartão com titulo+e corpo,
 * CTA destacado, footer discreto com link para preferências quando especificado.
 */
export function agendaiEmailBase(opts: {
	title: string
	preheader?: string
	bodyHtml: string
	/** Botão de ação primária — omitir quando não houver CTA. */
	ctaLabel?: string
	ctaUrl?: string
	/** URL absoluta da logo/imagem opcional (alt sempre presente). */
	logoUrl?: string
	/** Legenda extra no top-line do card. */
	kicker?: string
	/** Aparência inicial; clientes compatíveis também respeitam prefers-color-scheme. */
	theme?: EmailTheme
	/** Link opcional para preferências. */
	preferencesUrl?: string
	/** Destinatário; escapado pelo layout. */
	receivedBy?: string
}): string {
	const {
		title,
		preheader,
		bodyHtml,
		ctaLabel,
		ctaUrl,
		logoUrl,
		kicker,
		theme = 'light',
		preferencesUrl,
		receivedBy,
	} = opts
	const isDark = theme === 'dark'
	const bg = isDark ? COLORS.bgDark : COLORS.bg
	const cardBg = isDark ? COLORS.cardDark : COLORS.card
	const innerBg = isDark ? COLORS.cardDark : '#F4F7F4'
	const borderColor = isDark ? COLORS.borderDark : COLORS.border
	const text = isDark ? '#E8F1ED' : COLORS.text
	const muted = isDark ? COLORS.textMutedDark : COLORS.textMuted
	const heroAccent = COLORS.heroAccent

	const ctaHtml = ctaLabel && ctaUrl
		? `<tr>
			<td style="padding:12px 28px 24px;">
				<a href="${safeUrl(ctaUrl)}" style="display:block;text-align:center;background:${COLORS.accent};color:${COLORS.accentFg};text-decoration:none;font-weight:700;font-size:15px;line-height:22px;padding:14px 20px;border-radius:12px;font-family:${FONT};">
					${escapeHtml(ctaLabel)}
				</a>
			</td>
		</tr>
		<tr>
			<td style="padding:0 28px 20px;">
				<p class="muted-text" style="margin:0;text-align:center;font-size:12px;line-height:1.5;color:${muted};">
					Se o botão não funcionar, acesse:<br />
					<a class="muted-text" href="${safeUrl(ctaUrl)}" style="color:${muted};word-break:break-all;">${safeUrl(ctaUrl)}</a>
				</p>
			</td>
		</tr>`
		: ''

	const preheaderHtml = preheader
		? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;font-family:${FONT};">
			 ${escapeHtml(preheader)}
		</div>`
		: ''

	const logoHtml = logoUrl
		? `<img
			src="${safeUrl(logoUrl)}"
			alt="AgendAI"
			width="120"
			height="28"
			style="display:block;height:28px;width:auto;max-width:120px;"
			border="0"
		/>`
		: `<span style="
			display:inline-block;
			background:${heroAccent};
			color:#0F1E18;
			font-weight:900;
			font-size:22px;
			line-height:28px;
			padding:2px 12px;
			border-radius:8px;
			font-family:${FONT};
		">AgendAI</span>`

	const prefsHtml = preferencesUrl
		? `<a href="${safeUrl(preferencesUrl)}" style="color:${muted};text-decoration:underline;">Preferências de e-mail</a>`
		: ''

	return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
	<meta charset="utf-8"/>
	<meta name="viewport" content="width=device-width,initial-scale=1"/>
	<meta name="color-scheme" content="light dark"/>
	<meta name="supported-color-schemes" content="light dark"/>
	<title>${escapeHtml(title)}</title>
	<style>
		:root { color-scheme: light dark; supported-color-schemes: light dark; }
		body { margin:0; padding:0; width:100% !important; }
		img { border:0; }
		@media (prefers-color-scheme: dark) {
			.body-bg { background-color:${COLORS.bgDark} !important; }
			.card-bg { background-color:${COLORS.cardDark} !important; }
			.card-border { border-color:${COLORS.borderDark} !important; }
			.body-text { color:#E8F1ED !important; }
            .muted-text { color:#AAB8B0 !important; }
            .email-content [style*="background:#F4F7F4"],
            .email-content [style*="background:#F0F7F4"] { background:#25312B !important; color:#E8F1ED !important; }
            .email-content [style*="color:#4D5F55"] { color:#AAB8B0 !important; }
            .email-content a { color:#5DCEA5 !important; }
		}
		body, table, td, p, a { font-family: ${FONT} !important; }
		a { color:${COLORS.accent}; }
		.footer a { color:${muted}; }
	</style>
	<!--[if mso]>
	<style>body,table,td,p,a { font-family: Arial, sans-serif !important; }</style>
	<![endif]-->
</head>
<body class="body-bg" style="margin:0;padding:0;background-color:${bg};">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="body-bg" style="background-color:${bg};">
	<tr>
		<td align="center" style="padding:24px 16px;">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
				<tr><td style="height:4px;background:${COLORS.accent};border-radius:4px 4px 0 0;"></td></tr>
				<tr><td class="card-bg card-border" style="background-color:${cardBg};border:1px solid ${borderColor};border-top:none;border-radius:0 0 8px 8px;">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
						<!-- Header / Logo -->
						<tr><td style="padding:20px 28px 12px;">
							<table role="presentation" cellpadding="0" cellspacing="0"><tr>
								<td>${logoHtml}</td>
								${kicker ? `<td style="padding-left:12px;font-size:11px;font-weight:700;color:${COLORS.accent};letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(kicker)}</td>` : ''}
							</tr></table>
							<h1 class="body-text" style="margin:16px 0 0;font-size:22px;line-height:1.3;font-weight:800;color:${text};font-family:${FONT};">
								${escapeHtml(title)}
							</h1>
						</td></tr>

						<!-- Corpo -->
						<tr><td style="padding:8px 28px 24px;">
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card-bg" style="background-color:${innerBg};border-radius:8px;">
								<tr><td class="email-content body-text" style="padding:16px 20px;font-size:15px;line-height:1.6;color:${text};font-family:${FONT};">
									${bodyHtml}
								</td></tr>
							</table>
						</td></tr>

						${ctaHtml}

						<tr><td class="muted-text" style="padding:0 28px 28px;font-size:12px;line-height:1.6;color:${muted};">
							${receivedBy ? `<p style="margin:0 0 12px 0;word-break:break-all;">Recebido por: ${escapeHtml(receivedBy)}</p>` : ''}
							<p style="margin:0;">Este e-mail é transacional da plataforma AgendAI.</p>
							${prefsHtml ? `<p style="margin:8px 0 0 0;">${prefsHtml}</p>` : ''}
						</td></tr>
					</table>
				</td></tr>
			</table>
		</td>
	</tr>
</table>
</body>
</html>`
}
