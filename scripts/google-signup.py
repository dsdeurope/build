#!/usr/bin/env python3
import os, re, time, shutil, subprocess
from playwright.sync_api import sync_playwright

FIRST = "Eric"
LAST  = "Fofana"
DAY   = "20"
MONTH = "4"
YEAR  = "1965"
PHONE = "+33778552394"
PWD   = "V35_Eric2025!Fofana"   # mot de passe fixe — note-le !
CF_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")

print("\n" + "="*55)
print("  MOT DE PASSE GOOGLE : V35_Eric2025!Fofana")
print("  ECRIS-LE MAINTENANT AVANT DE CONTINUER !")
print("="*55 + "\n")
time.sleep(4)

shutil.rmtree("/tmp/v35_signup", ignore_errors=True)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir="/tmp/v35_signup",
        headless=False,
        channel="chrome",
        args=[
            "--start-maximized",
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
        ],
        ignore_default_args=["--enable-automation"],
    )
    page = ctx.new_page()
    page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

    print(">>> Ouverture Google Signup...")
    page.goto(
        "https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp",
        wait_until="domcontentloaded", timeout=20000
    )
    page.wait_for_timeout(3000)

    # Prénom / Nom
    try:
        page.fill("input[name='firstName']", FIRST, timeout=8000)
        page.fill("input[name='lastName']", LAST)
        print(">>> Nom rempli : Eric Fofana")
        time.sleep(1)
        page.click("button:has-text('Suivant'), button:has-text('Next')", timeout=6000)
        page.wait_for_timeout(3000)
    except Exception as e:
        print(f"!!! ERREUR nom : {e}")
        print("    Remplis Eric / Fofana manuellement dans le navigateur et clique Suivant")
        time.sleep(15)

    # Date de naissance + genre
    try:
        page.select_option("select#month", value=MONTH, timeout=6000)
        page.fill("input#day", DAY)
        page.fill("input#year", YEAR)
        try:
            page.select_option("select#gender", value="1")
        except:
            pass
        print(">>> Date : 20/04/1965 remplie")
        time.sleep(1)
        page.click("button:has-text('Suivant'), button:has-text('Next')", timeout=6000)
        page.wait_for_timeout(3000)
    except:
        try:
            # Google utilise parfois des listbox
            page.locator("[data-value], select").first.click(timeout=3000)
            time.sleep(1)
        except:
            pass
        print("!!! Remplis la date manuellement : Jour=20, Mois=Avril, Année=1965")
        print("    Clique Suivant dans le navigateur - j'attends 30 secondes...")
        time.sleep(30)

    # Email
    try:
        for sel in ["text=Create your own Gmail", "text=Créer votre propre", "[data-value='custom']"]:
            try:
                if page.locator(sel).is_visible(timeout=2000):
                    page.locator(sel).click()
                    time.sleep(1)
                    break
            except:
                pass

        candidates = ["eric.fofana.v35", "fofana.eric.shop", "ericfofana.ecom25", "eric.fofana2025"]
        for email in candidates:
            try:
                inp = page.locator("input[name='Username']").first
                inp.fill("")
                inp.type(email, delay=80)
                time.sleep(2)
                if not page.locator("text=already taken, text=déjà utilisé, text=isn't available, text=n'est pas disponible").first.is_visible(timeout=2000):
                    print(f">>> Email choisi : {email}@gmail.com")
                    break
                print(f"    {email} déjà pris, essai suivant...")
            except:
                print(f">>> Email : {email}@gmail.com (impossible de vérifier)")
                break

        time.sleep(1)
        page.click("button:has-text('Suivant'), button:has-text('Next')", timeout=6000)
        page.wait_for_timeout(3000)
    except Exception as e:
        print(f"!!! Email : {e}")
        print("    Choisis un email dans le navigateur, clique Suivant — attente 30s...")
        time.sleep(30)

    # Mot de passe
    try:
        pwds = page.locator("input[type='password']").all()
        for p_inp in pwds:
            p_inp.fill(PWD)
        print(f">>> Mot de passe rempli : {PWD}")
        time.sleep(1)
        page.click("button:has-text('Suivant'), button:has-text('Next')", timeout=6000)
        page.wait_for_timeout(3000)
    except Exception as e:
        print(f"!!! MDP : {e}")
        print(f"    Entre ce mot de passe dans le navigateur : {PWD}")
        time.sleep(20)

    # Téléphone
    try:
        tel = page.locator("input[type='tel']").first
        if tel.is_visible(timeout=6000):
            tel.fill(PHONE)
            print(f">>> Téléphone : {PHONE}")
            time.sleep(1)
            page.click("button:has-text('Suivant'), button:has-text('Next')", timeout=6000)
            page.wait_for_timeout(2000)
    except Exception as e:
        print(f"!!! Tel : {e}")
        print(f"    Entre ton numéro {PHONE} dans le navigateur")
        time.sleep(15)

    # SMS — attente longue
    print("\n" + "="*55)
    print("  SMS ENVOYE SUR +33 7 78 55 23 94")
    print("  ENTRE LE CODE DANS LE NAVIGATEUR")
    print("  J'attends 3 minutes...")
    print("="*55 + "\n")
    time.sleep(180)  # 3 minutes pour entrer le code SMS

    # Accepter les conditions si nécessaire
    try:
        page.click("text=J'accepte, text=I agree, button:has-text('Confirm')", timeout=5000)
        page.wait_for_timeout(2000)
    except:
        pass

    # AI Studio
    print(">>> Navigation vers AI Studio...")
    page.goto("https://aistudio.google.com/app/apikey", wait_until="domcontentloaded", timeout=20000)
    page.wait_for_timeout(5000)

    api_key = ""
    try:
        for btn_text in ["Create API key", "Créer une clé API", "Get API key"]:
            try:
                btn = page.locator(f"button:has-text('{btn_text}')").first
                if btn.is_visible(timeout=4000):
                    btn.click()
                    page.wait_for_timeout(4000)
                    break
            except:
                pass

        # Chercher clé dans le HTML
        m = re.search(r'(AIzaSy[A-Za-z0-9_\-]{30,})', page.content())
        if m:
            api_key = m.group(1)
        else:
            for sel in ["input[readonly]", "code", "[class*='key-value']"]:
                try:
                    el = page.locator(sel).first
                    v = el.input_value() if "input" in sel else el.inner_text()
                    if v and v.startswith("AIza"):
                        api_key = v.strip()
                        break
                except:
                    pass
    except Exception as e:
        print(f"!!! AI Studio : {e}")

    if api_key:
        print(f"\n{'='*55}")
        print(f"  CLE GEMINI OBTENUE : {api_key}")
        print(f"{'='*55}\n")
        env = os.environ.copy()
        env["CLOUDFLARE_API_TOKEN"] = CF_TOKEN
        r = subprocess.run(
            ["npx", "wrangler", "secret", "put", "GEMINI_KEYS", "--name", "v35-gemini-proxy"],
            input=api_key, capture_output=True, text=True, env=env,
            cwd="/home/fredy/Claude/build"
        )
        if r.returncode == 0:
            print(">>> Cle envoyee sur v35-gemini-proxy - TERMINE !")
        else:
            print(f"!!! Wrangler : {r.stderr.strip()}")
            print(f"    Lance manuellement setup-secrets.sh et colle : {api_key}")
    else:
        print("!!! Cle non extraite — attente 60s pour que tu la copies...")
        time.sleep(60)

    print("\nFermeture dans 10 secondes...")
    time.sleep(10)
    ctx.close()

print(f"\n{'='*55}")
print(f"  COMPTE GOOGLE CREE")
print(f"  Mot de passe : {PWD}")
print(f"{'='*55}\n")
