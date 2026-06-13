#!/usr/bin/env bash
# GCP Keygen via gcloud CLI — Google l'autorise toujours
# 1) gcloud auth login → ouvre ton navigateur (session normale, pas de bot)
# 2) Crée N projets, active Gemini API, extrait les clés
# 3) Envoie tout sur v35-gemini-proxy via wrangler
set -euo pipefail

GCLOUD="/home/fredy/google-cloud-sdk/bin/gcloud"
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
WORKER="v35-gemini-proxy"
N_PROJETS=3

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}! $*${NC}"; }
err()  { echo -e "${RED}✗ $*${NC}"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GCP Keygen — Gemini 2.5 · $N_PROJETS projets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Étape 1 : Authentification ───────────────────
warn "Connexion Google (ton navigateur va s'ouvrir)..."
$GCLOUD auth login --no-launch-browser 2>&1 | grep -v "^$" || true
# Fallback interactif
if ! $GCLOUD auth print-access-token &>/dev/null; then
  $GCLOUD auth login
fi
ok "Connecté à Google Cloud"

# ── Étape 2 : Activer l'API keys service ─────────
$GCLOUD services enable apikeys.googleapis.com \
  cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com 2>/dev/null || true

# ── Étape 3 : Boucle projets ─────────────────────
KEYS=()
for i in $(seq 1 $N_PROJETS); do
  NAME="v35-gemini-$(printf '%02d' $i)"
  echo ""
  echo "── Projet $i/$N_PROJETS : $NAME ──────────────────"

  # Créer le projet (ignore si déjà existant)
  warn "Création du projet..."
  $GCLOUD projects create "$NAME" --name="$NAME" 2>&1 | grep -v "^$" || true

  # Définir comme projet actif
  $GCLOUD config set project "$NAME" 2>/dev/null

  # Activer Generative Language API
  warn "Activation Generative Language API..."
  $GCLOUD services enable generativelanguage.googleapis.com \
    --project="$NAME" 2>&1 | tail -1

  # Activer API Keys API
  $GCLOUD services enable apikeys.googleapis.com \
    --project="$NAME" 2>/dev/null || true

  sleep 3

  # Créer la clé API
  warn "Création de la clé API..."
  KEY_OUTPUT=$($GCLOUD alpha services api-keys create \
    --project="$NAME" \
    --display-name="v35-key" \
    --allowed-api="generativelanguage.googleapis.com" \
    --format="value(keyString)" 2>/dev/null || \
    $GCLOUD services api-keys create \
    --project="$NAME" \
    --display-name="v35-key" \
    --format="value(keyString)" 2>/dev/null || echo "")

  if [[ -n "$KEY_OUTPUT" ]] && [[ "$KEY_OUTPUT" == AIza* ]]; then
    KEYS+=("$KEY_OUTPUT")
    ok "Clé: ${KEY_OUTPUT:0:12}… (total: ${#KEYS[@]})"
  else
    # Lister les clés existantes
    EXISTING=$($GCLOUD alpha services api-keys list \
      --project="$NAME" \
      --format="value(keyString)" 2>/dev/null | head -1 || echo "")
    if [[ -n "$EXISTING" ]]; then
      KEYS+=("$EXISTING")
      ok "Clé existante: ${EXISTING:0:12}… (total: ${#KEYS[@]})"
    else
      err "Pas de clé pour $NAME — continue"
    fi
  fi
done

# ── Étape 4 : Envoyer sur Cloudflare ─────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ ${#KEYS[@]} -eq 0 ]]; then
  err "Aucune clé récupérée"
  exit 1
fi

ok "${#KEYS[@]} clé(s) collectée(s)"
KEYS_CSV=$(IFS=','; echo "${KEYS[*]}")

warn "Envoi sur $WORKER..."
export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
echo "$KEYS_CSV" | npx wrangler secret put GEMINI_KEYS --name "$WORKER"
ok "GEMINI_KEYS configuré !"

echo ""
ok "Terminé ! Teste sur build.zenithlab.net → Traduction → Proxy CF"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
