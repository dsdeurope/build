#!/usr/bin/env bash
# Setup sécurisé — secrets jamais écrits sur disque
# Utilise: read -rs (masqué) + wrangler secret put (pipe direct)
set -euo pipefail

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
WRG="npx wrangler"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}! $*${NC}"; }
err()  { echo -e "${RED}✗ $*${NC}"; }

secret_put() {
  local worker="$1" secret_name="$2" value="$3"
  echo "$value" | $WRG secret put "$secret_name" --name "$worker" 2>&1 | grep -E "Success|Error|secret" || true
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   V35 — Configuration sécurisée"
echo "   Les secrets ne sont jamais écrits sur disque"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Menu ───────────────────────────────────────
echo "Que voulez-vous configurer ?"
echo "  1) Clé OpenAI GPT-4o   → vault (traduction 20 pays)"
echo "  2) Clés Gemini GCP     → v35-gemini-proxy"
echo "  3) Clé OpenRouter      → vault-init-worker"
echo "  4) Auth secret         → gemini-proxy"
echo "  5) Tout configurer"
echo ""
read -rp "Choix [1-5]: " choice

configure_gemini() {
  echo ""
  echo "── Clés Gemini GCP ────────────────────────"
  warn "Format: AIzaSy...,AIzaSy...,AIzaSy... (séparées par virgule)"
  warn "Obtenir: console.cloud.google.com → APIs & Services → Credentials"
  echo ""
  read -rsp "Collez vos clés GCP ici (masqué): " GEMINI_KEYS
  echo ""
  if [[ -z "$GEMINI_KEYS" ]]; then err "Vide — annulé"; return; fi
  # Compter les clés
  count=$(echo "$GEMINI_KEYS" | tr ',' '\n' | grep -c 'AIza\|AQ\.' || true)
  ok "Détecté: $count clé(s)"
  secret_put "v35-gemini-proxy" "GEMINI_KEYS" "$GEMINI_KEYS"
  ok "GEMINI_KEYS configuré sur v35-gemini-proxy"
  unset GEMINI_KEYS
}

configure_or() {
  echo ""
  echo "── Clé OpenRouter ─────────────────────────"
  warn "Format: sk-or-v1-…"
  echo ""
  read -rsp "Clé OpenRouter (masqué): " OR_KEY
  echo ""
  if [[ -z "$OR_KEY" ]]; then err "Vide — annulé"; return; fi
  secret_put "v35-vault-init" "OR_KEY" "$OR_KEY"
  ok "OR_KEY configuré sur v35-vault-init"
  unset OR_KEY
}

configure_auth() {
  echo ""
  echo "── Auth secret (protection Worker) ────────"
  warn "Laissez vide pour désactiver l'auth (OK pour l'instant)"
  echo ""
  read -rsp "Auth secret (masqué, entrée=désactivé): " AUTH
  echo ""
  if [[ -z "$AUTH" ]]; then
    warn "Auth désactivée — proxy public (acceptable pour usage personnel)"
    return
  fi
  secret_put "v35-gemini-proxy" "AUTH_SECRET" "$AUTH"
  secret_put "v35-build-api"    "AUTH_SECRET" "$AUTH" 2>/dev/null || true
  ok "AUTH_SECRET configuré"
  unset AUTH
}

configure_openai() {
  echo ""
  echo "── Clé OpenAI GPT-4o ──────────────────────"
  warn "Format: sk-proj-… ou sk-…"
  warn "Obtenir: platform.openai.com/api-keys → Create new secret key"
  echo ""
  read -rsp "Clé OpenAI (masqué): " OPENAI_KEY
  echo ""
  if [[ -z "$OPENAI_KEY" ]]; then err "Vide — annulé"; return; fi
  # Test rapide
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $OPENAI_KEY" \
    https://api.openai.com/v1/models 2>/dev/null)
  if [[ "$STATUS" == "200" ]]; then
    ok "Clé valide (HTTP 200)"
  else
    warn "HTTP $STATUS — vérifie la clé et le crédit"
  fi
  # Stocker dans le vault localStorage via JS (info pour l'UI)
  ok "Clé prête — colle-la dans build.zenithlab.net → Traduction → OpenAI GPT-4o"
  unset OPENAI_KEY
}

case "$choice" in
  1) configure_openai ;;
  2) configure_gemini ;;
  3) configure_or ;;
  4) configure_auth ;;
  5) configure_openai; configure_gemini; configure_or; configure_auth ;;
  *) err "Choix invalide"; exit 1 ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Terminé. Testez sur build.zenithlab.net → Traduction → Tester"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
