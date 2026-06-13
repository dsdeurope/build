#!/usr/bin/env python3
"""
GCP API Key Generator via Google OAuth Device Flow
- Pas de Playwright, pas de browser automation
- OAuth device flow = Google l'autorise toujours
- Crée N projets GCP, active Gemini API, extrait les clés
- Envoie automatiquement sur v35-gemini-proxy via wrangler
"""
import json, os, subprocess, sys, time, webbrowser
import urllib.request, urllib.parse

CF_TOKEN  = os.environ.get("CLOUDFLARE_API_TOKEN", "")
WORKER    = "v35-gemini-proxy"
N_PROJETS = 3

# OAuth client pour device flow (client public Google Cloud SDK)
CLIENT_ID     = "32555940559.apps.googleusercontent.com"
CLIENT_SECRET = "ZmssLNjJy2998hD4CTg2ejr2"
SCOPES        = "https://www.googleapis.com/auth/cloud-platform"

TOKEN_FILE = os.path.expanduser("~/.v35_gcp_token.json")

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
def ok(m):   print(f"{GREEN}✓ {m}{NC}", flush=True)
def warn(m): print(f"{YELLOW}! {m}{NC}", flush=True)
def err(m):  print(f"{RED}✗ {m}{NC}", flush=True)

# ── OAuth ──────────────────────────────────────────────────────────

def api(method, url, data=None, token=None, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code}: {body[:300]}")

def device_auth():
    """OAuth Device Flow — Google l'autorise, pas de browser automation."""
    r = api("POST", "https://oauth2.googleapis.com/device/code", {
        "client_id": CLIENT_ID,
        "scope": SCOPES
    })
    device_code  = r["device_code"]
    user_code    = r["user_code"]
    verify_url   = r["verification_url"]
    interval     = r.get("interval", 5)

    print()
    print("━" * 55)
    print(f"  Ouvre ce lien dans ton navigateur:")
    print(f"  {verify_url}")
    print()
    print(f"  Entre le code:  {user_code}")
    print("━" * 55)
    print()
    webbrowser.open(verify_url)
    warn("En attente de ta confirmation dans le navigateur…")

    # Polling
    for _ in range(120):
        time.sleep(interval)
        try:
            tok = api("POST", "https://oauth2.googleapis.com/token", {
                "client_id":     CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "device_code":   device_code,
                "grant_type":    "urn:ietf:params:oauth:grant-type:device_code"
            })
            if "access_token" in tok:
                with open(TOKEN_FILE, "w") as f:
                    json.dump(tok, f)
                ok("Authentifié !")
                return tok["access_token"]
        except RuntimeError as e:
            if "authorization_pending" in str(e):
                continue
            raise

    raise RuntimeError("Timeout — relance le script")

def get_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            tok = json.load(f)
        # Rafraîchir si expiré
        if "refresh_token" in tok:
            try:
                r = api("POST", "https://oauth2.googleapis.com/token", {
                    "client_id":     CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "refresh_token": tok["refresh_token"],
                    "grant_type":    "refresh_token"
                })
                tok.update(r)
                with open(TOKEN_FILE, "w") as f:
                    json.dump(tok, f)
                ok("Token rafraîchi")
                return tok["access_token"]
            except Exception:
                pass
    return device_auth()

# ── GCP API ───────────────────────────────────────────────────────

def list_projects(token):
    r = api("GET", "https://cloudresourcemanager.googleapis.com/v3/projects", token=token)
    return r.get("projects", [])

def create_project(token, name):
    warn(f"Création du projet '{name}'…")
    try:
        op = api("POST", "https://cloudresourcemanager.googleapis.com/v3/projects", {
            "projectId":   name,
            "displayName": name
        }, token=token)
        # Attendre opération
        op_name = op.get("name", "")
        for _ in range(30):
            time.sleep(3)
            try:
                status = api("GET", f"https://cloudresourcemanager.googleapis.com/v3/{op_name}", token=token)
                if status.get("done"):
                    ok(f"Projet '{name}' créé")
                    return name
            except Exception:
                pass
        ok(f"Projet '{name}' — création lancée")
        return name
    except RuntimeError as e:
        if "already exists" in str(e) or "409" in str(e):
            ok(f"Projet '{name}' déjà existant")
            return name
        raise

def enable_api(token, project_id):
    warn(f"Activation Generative Language API sur '{project_id}'…")
    try:
        api("POST",
            f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services/generativelanguage.googleapis.com:enable",
            {}, token=token)
        time.sleep(5)
        ok("API activée")
    except RuntimeError as e:
        if "already" in str(e).lower() or "409" in str(e):
            ok("API déjà activée")
        else:
            raise

def create_api_key(token, project_id):
    warn(f"Création de la clé API sur '{project_id}'…")
    # Obtenir le numéro de projet
    proj = api("GET", f"https://cloudresourcemanager.googleapis.com/v3/projects/{project_id}", token=token)
    proj_number = proj.get("name", "").split("/")[-1]

    r = api("POST",
        f"https://apikeys.googleapis.com/v2/projects/{proj_number}/locations/global/keys",
        {"displayName": "v35-gemini-key", "restrictions": {
            "apiTargets": [{"service": "generativelanguage.googleapis.com"}]
        }}, token=token)

    op_name = r.get("name", "")
    for _ in range(20):
        time.sleep(3)
        try:
            status = api("GET", f"https://apikeys.googleapis.com/v2/{op_name}", token=token)
            if status.get("done") and "response" in status:
                key_name = status["response"].get("name", "")
                # Récupérer la valeur de la clé
                key_data = api("GET", f"https://apikeys.googleapis.com/v2/{key_name}/keyString", token=token)
                key_val = key_data.get("keyString", "")
                if key_val:
                    ok(f"Clé: {key_val[:12]}…")
                    return key_val
        except Exception:
            pass

    # Fallback: lister les clés existantes
    keys_list = api("GET",
        f"https://apikeys.googleapis.com/v2/projects/{proj_number}/locations/global/keys",
        token=token)
    for k in keys_list.get("keys", []):
        kd = api("GET", f"https://apikeys.googleapis.com/v2/{k['name']}/keyString", token=token)
        val = kd.get("keyString", "")
        if val:
            ok(f"Clé existante: {val[:12]}…")
            return val

    raise RuntimeError("Impossible de récupérer la clé")

def push_keys(keys):
    keys_csv = ",".join(keys)
    env = os.environ.copy()
    env["CLOUDFLARE_API_TOKEN"] = CF_TOKEN
    r = subprocess.run(
        ["npx", "wrangler", "secret", "put", "GEMINI_KEYS", "--name", WORKER],
        input=keys_csv, capture_output=True, text=True, env=env
    )
    if r.returncode == 0:
        ok(f"GEMINI_KEYS ({len(keys)} clés) → {WORKER}")
    else:
        err(f"Wrangler: {r.stderr.strip()}")
        print(f"\nClés (copie manuelle si besoin):\n{keys_csv}\n")

# ── Main ──────────────────────────────────────────────────────────

def main():
    print()
    print("━" * 55)
    print("  GCP Keygen — Gemini 2.5 gratuit")
    print(f"  Objectif: {N_PROJETS} projets × 1500 req/jour")
    print("━" * 55)

    token = get_token()
    keys  = []

    for i in range(1, N_PROJETS + 1):
        print(f"\n── Projet {i}/{N_PROJETS} ──────────────────────────")
        name = f"v35-gemini-{i:02d}"
        try:
            create_project(token, name)
            time.sleep(3)
            enable_api(token, name)
            time.sleep(5)
            key = create_api_key(token, name)
            keys.append(key)
            ok(f"Total clés: {len(keys)}")
        except Exception as e:
            err(f"Projet {i} échoué: {e}")
            warn("Passage au suivant…")

    print()
    print("━" * 55)
    if keys:
        ok(f"{len(keys)} clé(s) collectée(s)")
        push_keys(keys)
        ok("Terminé — teste sur build.zenithlab.net → Traduction → Proxy")
    else:
        err("Aucune clé — vérifie les droits GCP ou crée les clés manuellement")
    print("━" * 55)

if __name__ == "__main__":
    main()
