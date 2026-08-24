const ACCENT = '#047857'

export function emailLayout(opts: {
	title: string
	bodyHtml: string
	ctaLabel?: string
	ctaUrl?: string
}): string {
	const cta =
		opts.ctaLabel && opts.ctaUrl
			? `<p style="margin:28px 0 0;">
          <a href="${opts.ctaUrl}"
             style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 22px;border-radius:10px;">
            ${opts.ctaLabel}
          </a>
        </p>`
			: ''

	return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:DM Sans,Segoe UI,Arial,sans-serif;color:#171717;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e5e5e5;overflow:hidden;">
        <tr><td style="height:4px;background:${ACCENT};"></td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.08em;color:${ACCENT};">AGENDAI</p>
          <h1 style="margin:12px 0 0;font-size:22px;line-height:1.25;font-weight:800;">${opts.title}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 32px;font-size:15px;line-height:1.55;color:#525252;">
          ${opts.bodyHtml}
          ${cta}
          <p style="margin:32px 0 0;font-size:12px;color:#a3a3a3;">
            Este é um e-mail transacional da plataforma AGENDAI.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function frontendUrl(path = ''): string {
	const base = (process.env.FRONTEND_URL || 'http://localhost:3002').replace(
		/\/$/,
		'',
	)
	if (!path) return base
	return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
