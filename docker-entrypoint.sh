#!/bin/sh
set -eu

PROCESS_ROLE="${PROCESS_ROLE:-api}"
# A API é o único processo que pode aplicar migrations. Por padrão, aplique-as
# antes de iniciar: Render não injeta RUN_MIGRATIONS automaticamente e executar
# código Prisma novo contra um schema anterior torna a API indisponível.
# Workers e schedulers continuam exigindo a definição explícita `false`.
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
export PROCESS_ROLE

case "$PROCESS_ROLE" in
  api|worker|scheduler)
    ;;
  *)
    echo "Invalid PROCESS_ROLE: expected api, worker, or scheduler." >&2
    exit 64
    ;;
esac

case "$RUN_MIGRATIONS" in
  true|false)
    ;;
  *)
    echo "Invalid RUN_MIGRATIONS: expected true or false." >&2
    exit 64
    ;;
esac

if [ "$PROCESS_ROLE" != "api" ] && [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Refusing to run migrations from PROCESS_ROLE=$PROCESS_ROLE." >&2
  exit 64
fi

if [ "$PROCESS_ROLE" = "api" ] && [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Applying Prisma migrations (strict mode)..."
  npx prisma migrate deploy
  echo "Prisma migrations applied successfully."
else
  echo "Skipping Prisma migrations (PROCESS_ROLE=$PROCESS_ROLE, RUN_MIGRATIONS=$RUN_MIGRATIONS)."
fi

if [ "$#" -eq 0 ]; then
  set -- node dist/shared/infra/http/server.js
fi

echo "Starting AgendAI process (PROCESS_ROLE=$PROCESS_ROLE)..."
exec "$@"
