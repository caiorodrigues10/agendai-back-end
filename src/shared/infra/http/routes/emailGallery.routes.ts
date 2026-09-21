import { FastifyInstance } from "fastify";

/**
 * Galeria de desenvolvimento para todos os templates de e-mail.
 * Só disponível em `NODE_ENV=development` — em produção retorna 404.
 */
const sampleUser = { ownerName: "Caio Silva", email: "caio@exemplo.com" };
const samplePlan = { name: "Pro", price: 79.9 };

function getBodyFn(template: string): string {
  const apps = getAppointmentSamples();
  const today = new Date().toISOString().slice(0, 10);

  switch (template) {
    case "welcome":
      return sampleWelcome();
    case "verify_email":
      return sampleVerifyEmail();
    case "forgot_password":
      return sampleForgotPassword();
    case "password_changed":
      return samplePasswordChanged();
    case "payment_approved":
      return samplePaymentApproved();
    case "payment_failed":
      return samplePaymentFailed();
    case "subscription_trial_ending":
      return sampleTrialEnding();
    case "subscription_trial_ended":
      return sampleTrialEnded();
    case "subscription_canceled":
      return sampleSubscriptionCanceled();
    case "subscription_renewed":
      return sampleSubscriptionRenewed();
    case "subscription_renewal_failed":
      return sampleRenewalFailed();
    case "daily_digest":
      return sampleDigest(getAppointmentSamples(), today);
    case "appointment_urgent_cancelled":
      return sampleUrgentCancelled();
    case "appointment_urgent_rescheduled":
      return sampleUrgentRescheduled();
    case "welcome_staff":
      return sampleWelcomeStaff();
    default:
      return "<p>Template não encontrado.</p>";
  }
}

function sampleWelcome(): string {
  return `<p>Olá, <strong>${sampleUser.ownerName.split(" ")[0]}</strong>!</p>
<p>Seu salão <strong>Bela Arte Studio</strong> está no ar.</p>
<p>30 dias de Pro — em qualquer plano. Teste a fila, a agenda e tudo mais.</p>`;
}

function sampleVerifyEmail(): string {
  return `<p>Olá, <strong>Caio</strong>!</p>
<p>Confirme seu e-mail para ativar sua conta.</p>
<p style="font-size:12px;color:#4D5F55;">Este link expira em breve.</p>`;
}

function sampleForgotPassword(): string {
  return `<p>Ignore se não solicitou.</p>
<p>Este link expira em 1 hora.</p>`;
}

function samplePasswordChanged(): string {
  return `<p>Olá, <strong>Caio</strong>!</p>
<p>Sua senha foi alterada com sucesso. Se não foi você, redefina imediatamente.</p>`;
}

function samplePaymentApproved(): string {
  const price = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(samplePlan.price);
  return `<p>Olá, <strong>Caio</strong>!</p>
<p>Pagamento aprovado do plano <strong>${samplePlan.name}</strong>.</p>
<table style="width:100%;margin:12px 0;background:#F4F7F4;border-radius:8px;"><tr><td style="padding:12px 16px;"><p style="margin:0;font-size:13px;color:#4D5F55;">Período</p><p style="margin:4px 0 0;font-weight:700;">Agosto/2026</p></td><td style="padding:12px 16px;text-align:right;"><p style="margin:0;font-size:13px;color:#4D5F55;">Valor</p><p style="margin:4px 0 0;font-weight:700;font-size:18px;">${price}</p></td></tr></table>`;
}

function samplePaymentFailed(): string {
  return `<p>Olá, <strong>Caio</strong>.</p>
<p>Não conseguimos processar a cobrança do plano <strong>Pro</strong>.</p>
<p>Tente novamente pela aba Planos.</p>`;
}

function sampleTrialEnding(): string {
  return `<p>Olá, <strong>Caio</strong>!</p>
<p>Seu período grátis termina em <strong>3 dias</strong>.</p>
<div style="margin:12px 0;padding:16px;border-radius:8px;background:#F4F7F4;"><p style="margin:0;">Para continuar, confira o plano <strong>Pro — R$ 79,90/mês</strong>.</p></div>`;
}

function sampleTrialEnded(): string {
  return `<p>Olá, <strong>Caio</strong>.</p>
<p>Seu período grátis acabou.</p>
<div style="margin:12px 0;padding:16px;border-radius:8px;background:#FEF3C7;color:#92400E;"><p style="margin:0;"><strong>Importante:</strong> você tem 3 dias de carência antes do bloqueio.</p></div>`;
}

function sampleSubscriptionCanceled(): string {
  return `<p>Olá, <strong>Caio</strong>.</p>
<p>Sua assinatura do plano Pro foi cancelada. Acesso até <strong>15/10/2026</strong>.</p>`;
}

function sampleSubscriptionRenewed(): string {
  return `<p>Olá, <strong>Caio</strong>!</p>
<p>Seu plano <strong>Pro</strong> foi renovado.</p>
<div style="margin:12px 0;padding:16px;border-radius:8px;background:#F4F7F4;text-align:center;"><p style="margin:0;"><strong>R$ 79,90</strong> aprovados. Próxima cobrança: <strong>21/10/2026</strong>.</p></div>`;
}

function sampleRenewalFailed(): string {
  return `<p>Olá, <strong>Caio</strong>.</p>
<p>Não conseguimos renovar seu plano <strong>Pro</strong>.</p>
<p>Cartão terminado em 4343 foi recusado. Regularize para manter o acesso.</p>`;
}

function sampleDigest(apps: Array<{ time: string; clientName: string; serviceName: string; price: number; staffName: string }>, today: string): string {
  const rows = apps.map((a: any, i: number) =>
    `<tr><td style="padding:8px 4px;border-bottom:${i < apps.length - 1 ? "1px solid #E2E8E2" : "none"};font-weight:700;white-space:nowrap;vertical-align:top;">${a.time}</td><td style="padding:8px 4px;border-bottom:${i < apps.length - 1 ? "1px solid #E2E8E2" : "none"};"><strong>${a.clientName}</strong><br/><span style="font-size:13px;color:#4D5F55;">${a.serviceName}${a.price ? " — " + new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(a.price) : ""}</span></td></tr>`
  ).join("");

  return `<p>Olá, <strong>Caio</strong>!</p>
<p>Você tem <strong>3 agendamentos</strong> hoje.</p>
<table style="width:100%;margin-top:12px;font-size:14px;">
  <thead><tr><th style="text-align:left;padding:4px 4px 8px;border-bottom:2px solid #1C7E61;font-size:12px;color:#4D5F55;">Horário</th><th style="text-align:left;padding:4px 0 8px;border-bottom:2px solid #1C7E61;font-size:12px;color:#4D5F55;">Cliente</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="margin-top:12px;font-size:13px;color:#4D5F55;">Horário em 14:00 já tem anotação — chegue 5 min antes.</p>`;
}

function sampleUrgentCancelled(): string {
  return `<p>O agendamento das <strong>14:00</strong> foi cancelado pelo cliente.</p>
<p>Cliente: <strong>Diego Silva</strong></p>
<p>Serviço: Corte</p>`;
}

function sampleUrgentRescheduled(): string {
  return `<p>O agendamento mudou de <strong>14:00</strong> para <strong>16:00</strong>.</p>
<div style="margin:12px 0;padding:16px;border-radius:8px;background:#F0F7F4;text-align:center;"><p style="margin:0;font-size:12px;color:#4D5F55;">Antes</p><p style="margin:4px 0;font-size:20px;font-weight:800;color:#1C7E61;text-decoration:line-through;">14:00</p><p style="margin:8px 0;font-size:12px;color:#4D5F55;">Agora</p><p style="margin:0;font-size:24px;font-weight:900;">16:00</p></div>`;
}

function sampleWelcomeStaff(): string {
  return `<p>Olá, <strong>Ana</strong>!</p>
<p>Você foi adicionada à equipe de <strong>Bela Arte Studio</strong>.</p>
<p>Configure sua senha pelo link abaixo.</p>`;
}

function getAppointmentSamples() {
  return [
    { time: "09:00", clientName: "Bruno Martins", serviceName: "Corte", price: 45, staffName: "Caio", notes: undefined as string | undefined },
    { time: "10:30", clientName: "Diego S.", serviceName: "Barba", price: 35, staffName: "Ana", notes: undefined as string | undefined },
    { time: "14:00", clientName: "Felipe K.", serviceName: "Corte + Barba", price: 70, staffName: "Caio", notes: "Cliente novo" as string | undefined },
  ];
}

export function emailGalleryRoutes(app: FastifyInstance) {
  app.get("/dev/email-templates", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ success: false, message: "Not found" });
    }

    // Retorna a lista com quanto HTML de exemplo cabe na tela.
    const templates = [
      { key: "welcome", label: "Boas-vindas", to: "caio@exemplo.com" },
      { key: "verify_email", label: "Verificar e-mail", to: "caio@exemplo.com" },
      { key: "forgot_password", label: "Redefinir senha", to: "caio@exemplo.com" },
      { key: "password_changed", label: "Senha alterada", to: "caio@exemplo.com" },
      { key: "payment_approved", label: "Pagamento aprovado", to: "caio@exemplo.com" },
      { key: "payment_failed", label: "Pagamento não processado", to: "caio@exemplo.com" },
      { key: "subscription_trial_ending", label: "Trial terminando (3d)", to: "caio@exemplo.com" },
      { key: "subscription_trial_ended", label: "Trial terminou", to: "caio@exemplo.com" },
      { key: "subscription_canceled", label: "Assinatura cancelada", to: "caio@exemplo.com" },
      { key: "subscription_renewed", label: "Assinatura renovada", to: "caio@exemplo.com" },
      { key: "subscription_renewal_failed", label: "Renovação falhou", to: "caio@exemplo.com" },
      { key: "daily_digest", label: "Resumo do dia", to: "caio@exemplo.com" },
      { key: "appointment_urgent_cancelled", label: "Cancelamento urgente", to: "caio@exemplo.com" },
      { key: "appointment_urgent_rescheduled", label: "Reagendamento urgente", to: "caio@exemplo.com" },
      { key: "welcome_staff", label: "Boas-vindas equipe", to: "caio@exemplo.com" },
    ].map(t => ({
      ...t,
      count: 1,
      previewUrl: `/dev/email-templates/${t.key}`,
    }));

    return reply.send({ success: true, data: templates });
  });

  app.get("/dev/email-templates/:template", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.status(404).send({ success: false, message: "Not found" });
    }

    const { template } = request.params as { template: string };
    const html = generateTemplateHtml(template);
    return reply.type("text/html").send(html);
  });
}

function generateTemplateHtml(key: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const apps = [
    { time: "09:00", clientName: "Bruno Martins", serviceName: "Corte", price: 45, staffName: "Caio" },
    { time: "10:30", clientName: "Diego S.", serviceName: "Barba", price: 35, staffName: "Ana" },
    { time: "14:00", clientName: "Felipe K.", serviceName: "Corte + Barba", price: 70, staffName: "Caio" },
  ];

  switch (key) {
    case "welcome":
      return wrapHtml("Boas-vindas", sampleWelcome(), "Ir para o meu painel", "/login");
    case "verify_email":
      return wrapHtml("Verifique seu e-mail", sampleVerifyEmail(), "Verificar e-mail", "http://localhost:3000/api/auth/verify-email?token=abc123");
    case "forgot_password":
      return wrapHtml("Redefinição de senha", sampleForgotPassword(), "Criar nova senha", "http://localhost:3000/reset-password?token=abc123");
    case "password_changed":
      return wrapHtml("Senha alterada", samplePasswordChanged(), "Ir para as configurações", "http://localhost:3000/app/config");
    case "payment_approved":
      return wrapHtml("Pagamento aprovado", samplePaymentApproved(), "Ver meu painel", "http://localhost:3000/app/painel");
    case "payment_failed":
      return wrapHtml("Pagamento não processado", samplePaymentFailed(), "Tentar novamente", "http://localhost:3000/app/planos");
    case "subscription_trial_ending":
      return wrapHtml("Seu teste acaba em 3 dias", sampleTrialEnding(), "Ver planos", "http://localhost:3000/app/planos");
    case "subscription_trial_ended":
      return wrapHtml("Seu teste acabou", sampleTrialEnded(), "Regularizar", "http://localhost:3000/app/planos");
    case "subscription_canceled":
      return wrapHtml("Assinatura cancelada", sampleSubscriptionCanceled(), "Ver planos", "http://localhost:3000/app/planos");
    case "subscription_renewed":
      return wrapHtml("Assinatura renovada", sampleSubscriptionRenewed(), "Ver meu painel", "http://localhost:3000/app/painel");
    case "subscription_renewal_failed":
      return wrapHtml("Renovação falhou", sampleRenewalFailed(), "Regularizar pagamento", "http://localhost:3000/app/planos");
    case "daily_digest":
      return wrapHtml("Resumo do dia — " + today, sampleDigest(apps, today), "Abrir agenda", "http://localhost:3000/app/agenda");
    case "appointment_urgent_cancelled":
      return wrapHtml("Cancelamento urgente", sampleUrgentCancelled(), "Abrir agenda", "http://localhost:3000/app/agenda");
    case "appointment_urgent_rescheduled":
      return wrapHtml("Agendamento remarcado", sampleUrgentRescheduled(), "Ver na agenda", "http://localhost:3000/app/agenda");
    case "welcome_staff":
      return wrapHtml("Bem-vindo à equipe — Bela Arte Studio", sampleWelcomeStaff(), "Configurar acesso", "http://localhost:3000/login?email=ana@exemplo.com");
    default:
      return `<html><body><p>Template "${key}" não encontrado.</p></body></html>`;
  }
}

function wrapHtml(title: string, body: string, ctaLabel: string, ctaUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:DM Sans,Arial,sans-serif;color:#171717;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e5e5e5;overflow:hidden;">
        <tr><td style="height:4px;background:#1C7E61;"></td></tr>
        <tr><td style="padding:20px 28px 8px;">
          <span style="display:inline-block;background:#2CB58A;color:#0F1E18;font-weight:900;font-size:20px;padding:2px 12px;border-radius:8px;">AgendAI</span>
          <h1 style="margin:16px 0 0;font-size:22px;line-height:1.25;font-weight:800;">${title}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;">
          <table role="presentation" width="100%" style="background:#F4F7F4;border-radius:8px;"><tr><td style="padding:16px 20px;font-size:15px;line-height:1.6;">
            ${body}
          </td></tr></table>
          ${ctaLabel ? `<div style="margin-top:20px;text-align:center;"><a href="${ctaUrl}" style="display:inline-block;background:#1C7E61;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px;font-family:inherit;">${ctaLabel}</a></div>` : ""}
        </td></tr>
        <tr><td style="padding:0 28px 28px;font-size:12px;color:#a3a3a3;">
          <p>Este é um e-mail transacional da plataforma AgendAI (agendai.app).</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
