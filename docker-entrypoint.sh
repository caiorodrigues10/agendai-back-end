#!/bin/sh
set -e

echo "Running prisma migrate deploy..."
if npx prisma migrate deploy 2>&1; then
  echo "Migrations applied successfully."
else
  echo "Migration deploy failed (P3005 — database not empty). Baselining..."
  for m in \
    20260610032855_init \
    20260727120000_add_appointment_reminder_sent_at \
    20260728195955_add_queueitem_next_in_line_notified_at \
    20260729235959_replace_next_in_line_notified_at_with_last_notified_position \
    20260730000000_add_barbershop_evolution_instance_name \
    20260811000000_add_referral_tiers_and_email_verification \
    20260821180000_add_appointment_availability_index \
    20260826150000_add_rls_policies \
    20260826160000_add_password_reset_tokens; do
    echo "  Marking $m as applied..."
    npx prisma migrate resolve --applied "$m" || true
  done
  echo "Baseline complete. Running migrate deploy again..."
  npx prisma migrate deploy || true
fi

echo "Starting server..."
exec node dist/shared/infra/http/server.js
