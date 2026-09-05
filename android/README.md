# Application Android — Suivi Annualisation

Coquille **TWA** (Trusted Web Activity) autour de la PWA hébergée sur
<https://annualisation.pages.dev>. L'APK n'embarque aucun code métier : il
affiche le site en plein écran, sans barre d'adresse. Toute mise à jour de
`index.html` déployée sur Cloudflare Pages est donc immédiatement visible dans
l'application, **sans avoir à republier l'APK**.

| Paramètre | Valeur |
|---|---|
| Nom du paquet | `fr.but.mag17.annualisation` |
| URL de lancement | `https://annualisation.pages.dev/index.html` |
| Empreinte SHA-256 de signature | `17:08:5A:E1:7C:DC:D6:F2:E5:01:D1:D3:4F:A2:59:17:BE:BA:7F:60:86:39:43:D1:6E:5F:89:E9:5D:2F:AE:0C` |
| Android minimum | 5.0 (API 21) |

Le fichier [`/.well-known/assetlinks.json`](../.well-known/assetlinks.json), servi
par Cloudflare Pages, contient déjà cette empreinte : c'est lui qui prouve à
Android que l'APK est autorisé à afficher le site sans barre d'URL.

---

## 1. Générer l'APK (méthode recommandée : GitHub Actions)

Aucune installation nécessaire, tout se compile chez GitHub.

### Une seule fois : enregistrer la clé de signature

1. Sur GitHub → **Settings** → **Secrets and variables** → **Actions** → *New repository secret* :
   - `ANDROID_KEYSTORE_BASE64` → contenu du fichier `keystore.base64.txt` (une seule longue ligne)
   - `ANDROID_KEYSTORE_PASSWORD` → le mot de passe du keystore
2. Conserve le fichier `annualisation-release.jks` et son mot de passe **hors du dépôt**
   (gestionnaire de mots de passe, clé USB). Sans lui, plus aucune mise à jour de
   l'application ne sera possible : Android refuse une app resignée avec une autre clé.

⚠️ Ne commite jamais le keystore : le dépôt est public.

### À chaque build

Onglet **Actions** → *Build APK Android (TWA)* → **Run workflow**, en renseignant
le nom de version (ex. `1.0.1`). À la fin, l'artefact `annualisation-android`
contient :

- `annualisation.apk` → installation directe sur les téléphones
- `annualisation.aab` → dépôt sur le Play Store (test interne)

Pour produire en plus une **release publique** avec un lien de téléchargement
direct (pratique pour l'envoi par mail) :

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Le lien du fichier est alors :
`https://github.com/y3n0-51100/suivi-annualisation/releases/download/v1.0.0/annualisation.apk`

---

## 2. Générer l'APK en local (alternative)

Prérequis : JDK 17, Android SDK (ou Android Studio), Gradle 8.7.

```bash
# Dans android/keystore.properties (fichier non versionné)
storeFile=/chemin/vers/annualisation-release.jks
storePassword=********
keyAlias=annualisation
keyPassword=********
```

```bash
cd android
gradle assembleRelease          # → app/build/outputs/apk/release/app-release.apk
```

---

## 3. Distribuer l'application

| Voie | Pour qui | Mise à jour |
|---|---|---|
| **APK par mail / lien direct** | Immédiat, gratuit, aucun compte | Renvoyer un lien à chaque nouvelle version de la coquille (rare) |
| **Play Store — test interne** | Jusqu'à 100 collaborateurs invités par e-mail, app invisible du public | Automatique |

Pour le Play Store : compte développeur (25 € une fois), envoi du `.aab`, piste
*Test interne*. Google resigne l'application avec sa propre clé — il faut alors
**ajouter l'empreinte SHA-256 fournie par la Play Console** dans le tableau
`sha256_cert_fingerprints` de `.well-known/assetlinks.json`, sinon la barre
d'adresse réapparaît.

---

## 4. Changer une version, une couleur, l'URL

| Quoi | Où |
|---|---|
| Nom affiché sous l'icône | `app/src/main/res/values/strings.xml` → `app_name` |
| URL du site | `strings.xml` → `launch_url`, `host_name`, `asset_statements` |
| Couleurs (barre d'état, splash) | `app/src/main/res/values/colors.xml` |
| Icône | `app/src/main/res/mipmap-*/` (régénérées depuis `/icons`) |
