#!/usr/bin/env bash
# V35 Build Platform — Deploy automatique complet
# Usage : ./deploy.sh [worker-name|all]
# Exemples :
#   ./deploy.sh              → déploie TOUT
#   ./deploy.sh site-server  → déploie seulement v35-site-server
#   ./deploy.sh scraping     → déploie le groupe scraping
#
# Pré-requis : config/secrets.env (copier depuis config/secrets.env.example)

set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' NC='\033[0m' BOLD='\033[1m'
log()  { echo -e "${B}[V35]${NC} $*"; }
ok()   { echo -e "${G}  ✓${NC} $*"; }
warn() { echo -e "${Y}  ⚠${NC} $*"; }
err()  { echo -e "${R}  ✗${NC} $*"; }
step() { echo -e "\n${BOLD}${C}▶ $*${NC}"; }

# ── Secrets ───────────────────────────────────────────────────────────────────
SECRETS_FILE="config/secrets.env"
if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$SECRETS_FILE"; set +a
  ok "Secrets chargés depuis $SECRETS_FILE"
else
  warn "$SECRETS_FILE introuvable — copier depuis config/secrets.env.example"
fi

# Vérification token obligatoire
: "${CLOUDFLARE_API_TOKEN:?❌  CLOUDFLARE_API_TOKEN manquant dans $SECRETS_FILE}"
export CLOUDFLARE_API_TOKEN

WR="npx --yes wrangler"
FAILED=()
DEPLOYED=()
START=$(date +%s)

# ── Fonctions helpers ─────────────────────────────────────────────────────────
r2_ensure() {
  local bucket="$1"
  local out
  out=$($WR r2 bucket create "$bucket" 2>&1 || true)
  if echo "$out" | grep -qi "already exists\|already created\|Created bucket"; then
    ok "Bucket R2 : $bucket (ok)"
  elif echo "$out" | grep -qi "Created\|success"; then
    ok "Bucket R2 créé : $bucket"
  else
    warn "Bucket $bucket — $out"
  fi
}

deploy_worker() {
  local config="$1"
  local name; name=$(grep '^name' "$config" | head -1 | sed 's/name = "\(.*\)"/\1/')
  log "Déploiement $name…"
  if $WR deploy --config "$config" 2>&1 | grep -E '(Deployed|Published|✓|Current)' > /dev/null; then
    ok "$name"
    DEPLOYED+=("$name")
  else
    # Try without grep filter
    if $WR deploy --config "$config" 2>&1; then
      ok "$name"
      DEPLOYED+=("$name")
    else
      err "$name — échec"
      FAILED+=("$name")
    fi
  fi
}

set_secret() {
  local worker="$1" key="$2" value="$3"
  if [ -z "$value" ]; then warn "Secret $key ignoré (vide dans secrets.env)"; return; fi
  echo "$value" | $WR secret put "$key" --name "$worker" 2>/dev/null \
    && ok "Secret → $worker : $key" \
    || warn "Secret $key pour $worker — déjà existant ou erreur"
}

# ── Parse argument ────────────────────────────────────────────────────────────
TARGET="${1:-all}"

# ── Groupes de workers ────────────────────────────────────────────────────────
GROUP_SCRAPING=(
  "agents/supplier-resolver/wrangler.toml"
  "agents/build-scraper/wrangler.toml"
  "agents/clone-intel/wrangler.toml"
  "agents/site-discover/wrangler.toml"
  "agents/scrape-orchestrator/wrangler.toml"
)
GROUP_IMAGES=(
  "agents/image-processor/wrangler.toml"
)
GROUP_PLATFORM=(
  "agents/build-api/wrangler.toml"
  "agents/site-server/wrangler.toml"
  "agents/orchestrateur/wrangler.toml"
  "agents/platform-api/wrangler.toml"
)
GROUP_AI=(
  "agents/content-ai/wrangler.toml"
  "agents/gemini-proxy/wrangler.toml"
  "agents/seo-engine/wrangler.toml"
  "agents/market-intel/wrangler.toml"
  "agents/vault-init-worker/wrangler.toml"
)
GROUP_TOOLS=(
  "agents/fulfillment/wrangler.toml"
  "agents/shopify-push/wrangler.toml"
  "agents/color-palette/wrangler.toml"
  "agents/skeleton-builder/wrangler.toml"
  "agents/site-factory/wrangler.toml"
  "agents/data-store/wrangler.toml"
  "agents/aged-domain-finder/wrangler.toml"
  "agents/optimiseur/wrangler.toml"
)
GROUP_CRON=(
  # ⚠ Requiert Cloudflare Workers Paid ($5/mois) pour les cron triggers
  "agents/sentinelle/wrangler.toml"
  "agents/sequenceur/wrangler.toml"
)

echo ""
echo -e "${BOLD}${C}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${C}║   V35 Build Platform — Auto Deploy       ║${NC}"
echo -e "${BOLD}${C}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── R2 Buckets (toujours) ────────────────────────────────────────────────────
step "Buckets R2"
r2_ensure "v35-images"
r2_ensure "v35-scrape-outputs"

# ── Deploy selon la cible ─────────────────────────────────────────────────────
deploy_group() {
  local label="$1"; shift
  step "$label"
  for cfg in "$@"; do
    [ -f "$cfg" ] && deploy_worker "$cfg" || warn "Introuvable : $cfg"
  done
}

case "$TARGET" in
  all)
    deploy_group "Scraping"  "${GROUP_SCRAPING[@]}"
    deploy_group "Images"    "${GROUP_IMAGES[@]}"
    deploy_group "Platform"  "${GROUP_PLATFORM[@]}"
    deploy_group "AI / SEO"  "${GROUP_AI[@]}"
    deploy_group "Outils"    "${GROUP_TOOLS[@]}"
    warn "Workers CRON (sentinelle, sequenceur) — déploiement manuel requis si plan Workers Paid actif"
    warn "Pour les déployer : ./deploy.sh cron"
    ;;
  scraping)   deploy_group "Scraping"  "${GROUP_SCRAPING[@]}" ;;
  images)     deploy_group "Images"    "${GROUP_IMAGES[@]}" ;;
  platform)   deploy_group "Platform"  "${GROUP_PLATFORM[@]}" ;;
  ai)         deploy_group "AI / SEO"  "${GROUP_AI[@]}" ;;
  tools)      deploy_group "Outils"    "${GROUP_TOOLS[@]}" ;;
  cron)       deploy_group "CRON"      "${GROUP_CRON[@]}" ;;
  *)
    # Déploiement d'un worker spécifique par nom
    CFG=$(find agents -name "wrangler.toml" -exec grep -l "name = \"v35-${TARGET}\"" {} \; | head -1)
    if [ -n "$CFG" ]; then
      step "Worker ciblé : v35-${TARGET}"
      deploy_worker "$CFG"
    else
      err "Worker introuvable : v35-${TARGET}"
      exit 1
    fi
    ;;
esac

# ── Secrets ───────────────────────────────────────────────────────────────────
if [ "$TARGET" = "all" ] || [ "$TARGET" = "images" ] || [ "$TARGET" = "image-processor" ]; then
  step "Secrets — Image Processor"
  set_secret "v35-image-processor"  "WATERMARK_TEXT"    "${WATERMARK_TEXT:-}"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "scraping" ]; then
  step "Secrets — Scraping"
  set_secret "v35-build-scraper"    "SCRAPINGBEE_KEYS"  "${SCRAPINGBEE_KEYS:-}"
  set_secret "v35-build-scraper"    "ZENROWS_KEYS"      "${ZENROWS_KEYS:-}"
  set_secret "v35-supplier-resolver" "API_TOKEN"        "${API_TOKEN:-}"
  set_secret "v35-supplier-resolver" "SEED_SECRET"      "${SEED_SECRET:-}"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "ai" ]; then
  step "Secrets — AI / APIs"
  set_secret "v35-market-intel"     "RAPIDAPI_KEY"      "${RAPIDAPI_KEY:-}"
  set_secret "v35-gemini-proxy"     "GEMINI_KEYS"       "${GEMINI_KEYS:-}"
  set_secret "v35-content-ai"       "OPENAI_KEY"        "${OPENAI_KEY:-}"
  set_secret "v35-content-ai"       "GEMINI_KEYS"       "${GEMINI_KEYS:-}"
  set_secret "v35-content-ai"       "OPENROUTER_KEYS"   "${OPENROUTER_KEYS:-}"
  set_secret "v35-site-discover"    "OPENAI_KEY"        "${OPENAI_KEY:-}"
  set_secret "v35-vault-init"       "OR_KEY"            "${OR_KEY:-}"
fi

# ── Résumé ────────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START ))
echo ""
echo -e "${BOLD}${G}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${G}║   Déploiement terminé en ${ELAPSED}s             ║${NC}"
echo -e "${BOLD}${G}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${G}✓ Déployés  :${NC} ${#DEPLOYED[@]} workers — ${DEPLOYED[*]:-—}"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo -e "  ${R}✗ Échoués   :${NC} ${FAILED[*]}"
fi
echo ""
echo -e "  ${B}Platform${NC}  → https://v35-site-server.ernestpedanou.workers.dev"
echo -e "  ${B}Monitor${NC}   → /scrape-monitor.html"
echo -e "  ${B}Clone Intel${NC}→ /clone-intel.html"
echo ""
