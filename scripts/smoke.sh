#!/usr/bin/env bash
# Verifica que la base, la API y la interfaz respondan, que la inmutabilidad
# esté activa, y que los números del estudio salgan de la base.
set -uo pipefail

API=${API:-http://localhost:8010/api}
WEB=${WEB:-http://localhost:5180}
PROJECT=${PROJECT:-clinica-norte}
PARTICIPANT=${PARTICIPANT:-p-analista-01}

fail=0
ok()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }

echo "· servicios"

if docker exec echoreq-db pg_isready -U echoreq -d echoreq >/dev/null 2>&1; then
  ok "postgres acepta conexiones"
else
  bad "postgres no responde — probá: make db"
fi

if curl -sf "${API%/api}/health" >/dev/null 2>&1; then
  ok "api en ${API%/api}"
else
  bad "api no responde — probá: make api"
fi

if curl -sf "$WEB/" >/dev/null 2>&1; then
  ok "interfaz en $WEB"
else
  bad "interfaz no responde — probá: make web"
fi

if curl -sf "$WEB/api/projects/$PROJECT/drift" >/dev/null 2>&1; then
  ok "proxy /api de vite hacia la api"
else
  bad "el proxy de vite no llega a la api"
fi

echo
echo "· inmutabilidad"

trigger_out=$(docker exec echoreq-db psql -U echoreq -d echoreq -qtA \
  -c "UPDATE requirement_revisions SET content = 'x'" 2>&1)

if printf '%s' "$trigger_out" | grep -q "anexado"; then
  ok "la base rechaza UPDATE sobre el log de requisitos"
else
  bad "el trigger de inmutabilidad NO está activo"
fi

echo
echo "· datos del estudio"

if python3 scripts/study_report.py "$API" "$PROJECT" "$PARTICIPANT"; then
  ok "los números salen de la base"
else
  bad "faltan datos del estudio"
fi

echo
echo "· exportación"

hdr=$(curl -s -D - -o /dev/null "$API/projects/$PROJECT/export/revisions.csv" \
  | tr -d '\r' | grep -i '^content-type' | head -1)

case "$hdr" in
  *text/csv*) ok "revisions.csv se sirve como CSV" ;;
  *)          bad "revisions.csv devolvió: ${hdr:-sin cabecera}" ;;
esac

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32mtodo en orden\033[0m\n'
else
  printf '\033[31mhay fallas arriba\033[0m\n'
fi
exit "$fail"
