# Suivi Annualisation — version 3

Outil RH du magasin : plannings, compteur des 1607 heures, congés et demandes d'absence, emprunt de la camionnette.
Une seule application, qui s'adapte à l'ordinateur et au téléphone (PWA installable). Accès réservé aux comptes créés par la direction.

## Essayer sans toucher aux données réelles

Ajouter `?demo=1` à l'adresse : l'application démarre sur un magasin fictif, entièrement en mémoire (rien n'est envoyé au serveur).

- Direction : `admin` / `demo`
- Collaborateur : `camille.martin` / `demo`

`?demo=reset` repart d'un jeu de données neuf. « Quitter le mode démonstration » se trouve dans *Mon profil*.

## Fonctionnalités

| Collaborateur | Direction |
|---|---|
| Accueil : compteur, soldes, semaine, prochaine absence | Tableau de bord : présents / absents, demandes à traiter, effectif à 14 jours, alertes |
| Planning en calendrier ou saisie rapide, modification commentée | Planning équipe (semaine / mois / exercice) éditable, effectif minimum par jour |
| Demande d'absence avec solde et impact affichés avant envoi | Décision en un clic avec analyse d'impact, message de réponse, saisie directe d'une absence |
| Annulation d'une absence (heures d'origine rétablies) | Calendrier des absences, archives, filtres |
| Emprunt de la camionnette, créneaux réservés visibles | Collaborateurs : fiches, compteurs, planning type, prorata d'entrée |
| Export agenda (.ics), impression | Alertes annualisation, congés, durée du travail (10 h / 48 h / repos hebdo / 44 h sur 12 sem.) |
| Guide des 1607 h | Rapports : Excel, CSV paie, vérification feuille d'heures, feuilles à signer |
| Thème clair / sombre, changement de mot de passe | Paramètres : période, fériés, dimanches ouverts, verrouillages, sauvegardes, historique, sécurité |

## Structure

```
index.html          coquille (connexion + application)
app.html            redirection (point d'entrée de l'application Android)
css/app.css         design system (clair / sombre, mobile, impression)
js/config.js        identifiants Firebase / EmailJS, valeurs par défaut
js/core.js          moteur métier pur (période, compteurs, absences, alertes) — testé
js/store.js         état + accès Firestore (mêmes collections que la v2)
js/backend.js       Firestore réel ou base de démonstration
js/demo.js          base de démonstration (données fictives)
js/ui.js, nav.js    composants d'interface, navigation
js/views/*.js       un fichier par écran
sw.js               service worker (réseau d'abord, coquille hors ligne)
tests/              tests du moteur (node) et de bout en bout (Playwright)
```

Aucune étape de build : le dépôt est servi tel quel (Cloudflare Pages).

## Développement et tests

```
npm start                       # http://localhost:3000  (démo : /?demo=1)
npm test                        # 19 tests du moteur métier
PORT=4173 node server.js &      # puis :
node tests/e2e.cjs              # 86 vérifications dans un navigateur (nécessite Playwright)
```

## Données

Les collections Firestore sont inchangées (`users`, `schedules`, `absenceRequests`, `vanRequests`, `announcements`, `auditLog`, `snapshots`, `settings/*`) : la v3 lit directement les données de la v2.
Ajouts, tous facultatifs et ignorés par la v2 : `settings/store` (nom du magasin, effectif minimum, décompte des CP), champ `poste` des collaborateurs, champs `prev` / `absType` des journées d'absence (restauration à l'identique), `managerComment` des demandes.

## Installer sur téléphone

- iPhone : ouvrir dans **Safari** › Partager › **Sur l'écran d'accueil**.
- Android : ouvrir dans **Chrome** › menu ⋮ › **Installer l'application** (ou l'APK du dossier `android/`, qui ouvre la même interface).
