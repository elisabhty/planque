# Planque

Coffre-fort chiffré pour iPhone, avec **Noisette**, l'écureuil qui planque tes photos.
Photos, vidéos et documents chiffrés en AES-256 sur l'iPhone. Pas de compte, pas de serveur, un schéma = un coffre (coffre leurre compris).

> Nom et mascotte provisoires : tout se change facilement (voir plus bas).

## Ce qui est fait

- **Onboarding** : bienvenue, trois choses à savoir, création du schéma (dessiné deux fois).
- **Verrouillage** : grille 5 × 5, Noisette dort, se réveille, suit le doigt des yeux, réfléchit, puis se réjouit. Même réaction pour tous les schémas.
- **Coffre** : galerie (miniatures chiffrées, chargées à la demande), import depuis Photos, l'appareil photo (sans passer par la pellicule) et Fichiers, visionneuse photo (balayage, double-tap pour zoomer), lecture vidéo et aperçu de documents natifs, sélection multiple, partage, suppression.
- **Après un import Photos** : proposition de supprimer les originaux de la pellicule (avec le rappel « Supprimés récemment »).
- **Réglages du coffre** : créer un coffre leurre, explication de la protection, effacer le coffre.
- **Sécurité** : voir [SECURITE.md](SECURITE.md).
- **Retours haptiques** sur chaque point du schéma, l'ouverture, la sélection.

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

## Structure

```
www/                      Interface (HTML/CSS/JS, sans framework)
  js/app.js               Écrans, galerie, import, visionneuse, réglages
  js/noisette.js          La mascotte (SVG animé, 5 états)
  js/pattern.js           Grille de schéma 5 × 5
  js/vault.js             Pont vers le plugin natif (ou la simulation)
  js/vault-web.js         Simulation pour le navigateur
ios/App/App/
  VaultPlugin.swift       Cœur : clés, chiffrement, import, aperçus, verrouillage
  MainViewController.swift Enregistre le plugin
SECURITE.md               Ce que le chiffrement protège, et ses limites
```

## Remplacer Noisette par tes propres visuels

Noisette est un SVG dessiné en code (`www/js/noisette.js`), avec des états animés en CSS (`.is-sleep`, `.is-awake`, `.is-think`, `.is-stash`, `.is-happy` dans `www/css/app.css`). Pour passer à tes vidéos ou images générées, remplace le contenu de `noisetteSVG()` par une balise `<video>`/`<img>` par état : le reste de l'appli appelle seulement `setNoisette(el, 'état')`.
L'icône, l'écran de lancement et le cache du sélecteur d'applis sont dans `ios/App/App/Assets.xcassets`.

## Étapes suivantes

1. **Phrase de récupération** (12 mots) pour retrouver l'accès en cas d'oubli du schéma ou de changement d'iPhone.
2. **Paywall** (gratuit jusqu'à un certain nombre de fichiers, puis abonnement), avec StoreKit ou RevenueCat.
3. **Sauvegarde iCloud chiffrée** propre à Planque (CloudKit, base privée de l'utilisateur).
4. **Partage d'un coffre** avec une personne de confiance.
5. **Site + guides SEO** (la méthode du post Vaultaire).

## App Store

- L'appli utilise du chiffrement : App Store Connect pose des questions de conformité à l'export, et la France a sa propre procédure de déclaration des moyens de cryptologie (ANSSI). **À vérifier avant la première soumission.**
- Textes de permission (Photos, appareil photo, micro) déjà rédigés dans `Info.plist`.
- iPhone uniquement, portrait.
