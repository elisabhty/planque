# Planque

Coffre-fort chiffré pour iPhone, avec **Noisette**, l'écureuil qui planque tes photos.
Photos, vidéos et documents chiffrés en AES-256 sur l'iPhone. La clé vient de la **combinaison du cadran de coffre-fort** (4 nombres de 0 à 99) et de la **puce de sécurité** de l'iPhone. Pas de compte, pas de serveur ; une combinaison = un coffre (coffre leurre compris) ; une **carte-clé QR** de secours par coffre ; Face ID en option.

> Nom et mascotte provisoires : tout se change facilement (voir plus bas).

## Ce qui est fait

- **Onboarding** : bienvenue, ce qu'il faut savoir, choix de la combinaison (deux fois), carte-clé de secours.
- **Le cadran** : molette de coffre-fort à 100 crans qu'on tourne au doigt (vibration à chaque cran), nombre courant au centre, on touche le centre pour valider. 4 nombres = 100 millions de combinaisons. Combinaisons évidentes refusées. Même réaction pour toutes les combinaisons, « clac » à l'ouverture.
- **Frein aux essais** : attente croissante après 5 essais ratés (compteur dans le trousseau).
- **Carte-clé de secours** : QR code + les 12 mots équivalents (BIP39, liste française), à imprimer. On la scanne (ou on tape les mots) si on oublie sa combinaison ou si on change d'iPhone.
- **Ouvrir avec Face ID** (option) : ouvre directement le coffre où il est activé ; la combinaison reste demandée une fois par semaine.
- **Ne rien perdre** : sauvegarde chiffrée en un fichier `.planque` (à ranger dans Fichiers / iCloud Drive), restauration sur n'importe quel iPhone avec la carte-clé, « Supprimés récemment » pendant 30 jours, remise dans Photos avec les fichiers d'origine, rappel de sauvegarde.
- **Comme Photos** : dates de prise de vue d'origine, galerie groupée par mois, albums.
- **Fouineurs et discrétion** : journal des dernières ouvertures du coffre, « Changer de combinaison », verrouillage en retournant l'iPhone, icônes discrètes (Lune, Sapin).
- **Coffre** : galerie (miniatures chiffrées, chargées à la demande), import depuis Photos, l'appareil photo (sans passer par la pellicule) et Fichiers, visionneuse photo (balayage, double-tap pour zoomer), lecture vidéo et aperçu de documents natifs, sélection multiple, partage, suppression.
- **Après un import Photos** : proposition de supprimer les originaux de la pellicule (avec le rappel « Supprimés récemment »).
- **Réglages du coffre** : créer un coffre leurre, explication de la protection, effacer le coffre.
- **Sécurité** : voir [SECURITE.md](SECURITE.md).
- **Retours haptiques** à chaque cran du cadran, à chaque nombre validé, à l'ouverture, à la sélection.

## Lancer sur ton iPhone

```bash
npm install
npx cap sync ios
npx cap open ios
```

Dans Xcode :
1. Cible **App** › *Signing & Capabilities* › choisis ton équipe (Team). L'identifiant est `com.hormend.planque` : change-le si tu veux.
2. Branche ton iPhone, sélectionne-le en haut, puis ▶︎.

Les dépendances Swift (Capacitor, Haptics) se téléchargent toutes seules au premier build (Swift Package Manager, pas de CocoaPods).

## Aperçu dans le navigateur

```bash
npx serve www
```

L'interface tourne avec un coffre **simulé** (WebCrypto + IndexedDB, mêmes règles de chiffrement). Pratique pour travailler le design ; le vrai chiffrement, c'est le plugin Swift sur iPhone.

## Mettre en ligne l'aperçu (GitHub Pages)

Avant chaque mise en ligne : `python3 tools/version.py`. Il ajoute un numéro de version à la feuille de style et à chaque fichier JavaScript : sans ça, Safari peut mélanger d'anciens fichiers en cache avec la nouvelle page (écran noir). Si l'appli ne démarre pas au bout de 6 secondes, un bouton « Recharger » s'affiche.

## Structure

```
www/                      Interface (HTML/CSS/JS, sans framework)
  js/app.js               Écrans, galerie, import, visionneuse, réglages
  js/noisette.js          La mascotte (3 expressions superposées, 5 états animés)
  img/noisette/           awake.webp, sleep.webp, joy.webp (fond transparent, 480 px)
  js/dial.js              Le cadran de coffre-fort (dessin, rotation, validation des nombres)
  js/vendor/qrcode.js     Générateur de QR code (Kazuhiko Arase, licence MIT)
  js/mnemonic.js          Les 12 mots de la carte-clé (BIP39) ; js/words-fr.js : la liste de mots
  js/vault.js             Pont vers le plugin natif (ou la simulation)
  js/vault-web.js         Simulation pour le navigateur
ios/App/App/
  VaultPlugin.swift       Cœur : puce de sécurité, clés, chiffrement, récupération, import, aperçus
  Cadran.swift            Frein aux essais, Face ID, carte-clé (scan et impression)
  SharedVaults.swift      Coffres partagés iCloud chiffrés de bout en bout (en cours : pas encore dans l'interface)
  App.entitlements        iCloud / CloudKit, pour les coffres partagés (pas encore branché dans la compilation)
  MainViewController.swift Enregistre le plugin
SECURITE.md               Ce que le chiffrement protège, et ses limites
```

## Remplacer Noisette par tes propres visuels

Noisette, c'est trois images détourées de la même illustration (`www/img/noisette/` : yeux ouverts, endormie, contente), empilées dans `noisetteHTML()` (`www/js/noisette.js`). Les états sont en CSS (`.is-sleep`, `.is-awake`, `.is-think`, `.is-stash`, `.is-happy` dans `www/css/app.css`) : l'état choisit l'expression visible et l'animation (respiration et « z », clignement, tête penchée, mâchonnement, petit saut). Pour passer à des vidéos animées, ajoute une balise `<video>` par état dans `noisetteHTML()` : le reste de l'appli appelle seulement `setNoisette(el, 'état')`. L'icône, l'écran de lancement et le cache de confidentialité utilisent la même illustration.
L'icône, l'écran de lancement et le cache du sélecteur d'applis sont dans `ios/App/App/Assets.xcassets`.

## Étapes suivantes

1. **Paywall** (gratuit jusqu'à un certain nombre de fichiers, puis abonnement), avec StoreKit ou RevenueCat.
2. **Sauvegarde iCloud chiffrée** propre à Planque (CloudKit, base privée de l'utilisateur).
3. **Coffres partagés** (en cours) : synchro iCloud chiffrée de bout en bout, droits par invité (regarder, ou ajouter et supprimer), clé donnée par QR code. Le code iPhone est écrit (`SharedVaults.swift`) ; il reste l'interface et la simulation navigateur.
4. **Site + guides SEO** (la méthode du post Vaultaire).

> Sur le simulateur iOS (pas de puce de sécurité), la clé de l'appareil est logicielle. Teste la sécurité sur un vrai iPhone.

## App Store

- L'appli utilise du chiffrement : App Store Connect pose des questions de conformité à l'export, et la France a sa propre procédure de déclaration des moyens de cryptologie (ANSSI). **À vérifier avant la première soumission.**
- Textes de permission (Photos, appareil photo, micro, Face ID) déjà rédigés dans `Info.plist`.
- iPhone uniquement, portrait.
