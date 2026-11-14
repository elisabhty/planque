# Planque — comment le coffre est protégé

Ce document décrit ce que fait vraiment le code (`ios/App/App/VaultPlugin.swift` et `Cadran.swift`), et ce qu'il ne fait pas. Il sert de base à l'audit à faire avant toute communication du type « inviolable ».

## Le secret : la combinaison du cadran

- Un cadran de coffre-fort de **100 crans** (0 à 99). Le secret est une **combinaison de 4 nombres** : 100⁴ = **100 millions** de combinaisons (100 fois plus qu'un code à 6 chiffres).
- À la création, l'appli refuse les combinaisons évidentes : quatre fois le même nombre, suites régulières (10-20-30-40, 5-6-7-8…), motifs répétés (12-34-12-34).
- Chaîne dérivée : `plq3|cadran100|a-b-c-d`. Changer ce format rend les coffres existants illisibles : à ne pas modifier après la mise en ligne.

## Les clés

1. **Clé de l'appareil** : clé P-256 créée **dans la puce de sécurité** (Secure Enclave). Elle ne peut pas en sortir, n'est dans aucune sauvegarde et ne passe pas sur un autre iPhone. Le trousseau ne garde qu'une référence chiffrée que seule cette puce sait utiliser (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`).
2. **Dérivation, à chaque essai** :
   - PBKDF2-HMAC-SHA256, 600 000 tours (sel aléatoire propre à l'appareil) → `pre` ;
   - `pre` → clé P-256 éphémère → **accord ECDH avec la clé de la puce** → secret partagé ;
   - HKDF-SHA256(secret partagé, sel = `pre`) → 64 octets : clé d'enveloppe (KEK) + localisateur (→ SHA-256 → nom du dossier du coffre).

   Chaque essai doit donc passer par la puce de **cet** iPhone : une copie des fichiers ne permet pas de tester des combinaisons ailleurs, même avec une ferme de serveurs.
3. **Clé maîtresse** : 256 bits aléatoires par coffre, enveloppée deux fois en AES-256-GCM :
   - par la KEK de la combinaison (`key.bin`) ;
   - par la **clé de secours** de la carte-clé (`rec.bin`).

## Frein aux essais (sur l'iPhone)

- Une combinaison qui n'ouvre aucun coffre existant compte comme un essai raté. Le compteur est dans le **trousseau** (il survit à une désinstallation de l'appli).
- À partir de 5 essais ratés : attente de 30 s, puis 1 min, 5 min, 15 min, et 1 h par essai. Le compteur baisse d'un cran par heure sans essai raté.
- Ouvrir un coffre ne remet **pas** le compteur à zéro : alterner avec le coffre leurre ne permet pas de contourner le frein.
- Résultat : tester les 100 millions de combinaisons sur l'iPhone prendrait des milliers d'années ; hors de l'iPhone, c'est impossible (puce de sécurité).
- Le frein ne trahit pas le leurre : il ne se déclenche qu'après des combinaisons qui ont déjà affiché un coffre vide.

## La carte-clé de secours

- 128 bits aléatoires par coffre, présentés de deux façons sur une même carte (image à imprimer ou à ranger hors de l'iPhone) :
  - un **QR code** (`PLQR1.` + les 16 octets en base64url), scanné par l'appli ;
  - les **12 mots** BIP39 équivalents (liste officielle française), pour une saisie à la main.
- La carte est montrée **une seule fois**. L'enregistrement dans Photos est retiré de la feuille de partage (la pellicule finit souvent dans iCloud). Qui recopie les mots à la main passe une vérification de deux mots.
- HKDF(clé de secours) → clé d'enveloppe de secours + identifiant (`rid`, une empreinte qui ne révèle rien). Elle ne dépend pas de l'appareil, et 128 bits sont hors de portée d'une attaque par force brute.
- Elle sert à deux choses :
  - **combinaison oubliée** : on scanne la carte (ou on tape les mots), puis on choisit une nouvelle combinaison ; l'ancienne n'ouvre plus rien ;
  - **nouvel iPhone** : les coffres chiffrés arrivent avec la sauvegarde de l'iPhone, mais la clé de la puce ne suit pas. On rouvre chaque coffre avec sa carte, et une nouvelle clé de puce est créée.
- On peut générer une **nouvelle carte** depuis les réglages du coffre ; l'ancienne cesse alors de marcher.

## Les données

| Élément | Protection |
|---|---|
| Fichiers (photos, vidéos, documents) | AES-256-GCM par blocs de 1 Mo ; identifiant du fichier, numéro de bloc et drapeau « dernier bloc » authentifiés (pas de troncature, de permutation ni d'échange de fichiers) |
| Miniatures | Chiffrées de la même façon |
| Index (noms, dates, tailles, dimensions, réglages) | Un bloc AES-256-GCM |
| Noms sur le disque | UUID aléatoires |
| Protection iOS | `NSFileProtectionComplete` partout (illisible quand l'iPhone est verrouillé) |

Aucune cryptographie maison : CryptoKit (AES-GCM, ECDH P-256, HKDF, SHA-256, Secure Enclave), CommonCrypto (PBKDF2), Security (trousseau, aléa).

## Ne jamais perdre ses photos

- **Sauvegarde chiffrée** (fichier `.planque`) : copie telle quelle des fichiers chiffrés du coffre (clé enveloppée, clé de secours enveloppée, index, fichiers, miniatures), précédée d'un manifeste qui ne contient que des noms techniques (UUID) et des tailles. Aucun nom de photo, aucune date ni aucun album en clair. Le fichier se range où l'on veut (Fichiers, iCloud Drive, ordinateur) et ne s'ouvre qu'avec la **carte-clé** (128 bits), sur n'importe quel iPhone. À la restauration, chaque chemin est vérifié (pas de sortie du dossier du coffre) et un coffre déjà présent n'est pas dupliqué.
- **Supprimés récemment** : un élément supprimé reste 30 jours dans le coffre, chiffré, avant d'être effacé à l'ouverture suivante. « Supprimer définitivement » et « Effacer ce coffre » ne passent pas par là.
- **Remettre dans Photos** : export des fichiers d'origine (dates et métadonnées conservées), après autorisation « ajout seulement » de Photos.
- **Rappel** dans la galerie quand il y a au moins 5 éléments et pas de sauvegarde depuis 30 jours (on peut le repousser de 7 jours).

## Coffres multiples et leurre

- Chaque combinaison mène à son propre dossier. Une combinaison inconnue ouvre un coffre **vide en mémoire**, sans erreur. Il n'est écrit sur le disque qu'au premier import, après une deuxième saisie de la même combinaison.
- Même déroulé, même durée minimale (700 ms) et même animation pour toutes les combinaisons. Le nombre de coffres n'est affiché nulle part.

## Pendant l'utilisation

- Verrouillage dès que l'appli passe en arrière-plan : session et clés effacées, fichiers temporaires supprimés, fenêtres natives fermées.
- Cache opaque dans le sélecteur d'applis ; en version publiée (Release), aussi pendant un enregistrement ou un partage d'écran.
- **Verrouiller en retournant l'iPhone** (option) : écran posé contre la table, le coffre se ferme (accéléromètre, aucune autorisation demandée).
- **Journal des ouvertures** : les 30 dernières ouvertures de **ce** coffre, stockées dans son index chiffré (invisible depuis les autres coffres). Une ouverture inconnue signale que quelqu'un connaît la combinaison ; **Changer de combinaison** ré-enveloppe alors la clé maîtresse (l'ancienne n'ouvre plus rien, les fichiers ne sont pas rechiffrés).
- **Icônes discrètes** (Lune, Sapin) via les icônes alternatives d'iOS. Le nom « Planque » reste affiché : iOS ne permet pas de le changer.
- **Ouvrir avec Face ID** (option, par coffre) : la KEK du coffre où l'option est activée est rangée dans le trousseau avec un contrôle d'accès **biométrie actuelle uniquement** (`.biometryCurrentSet`, `WhenPasscodeSetThisDeviceOnly`) : pas de repli sur le code de l'iPhone, clé invalidée si les visages enregistrés changent ou si le code de l'iPhone est retiré. Face ID ouvre toujours ce coffre-là ; la combinaison leurre se tape au cadran. L'appli redemande la combinaison une fois par semaine (rappel, pour ne pas l'oublier).
- À la saisie, le nombre courant s'affiche au centre du cadran et les nombres validés deviennent des points, sans trace laissée à l'écran.
- L'import depuis Photos chiffre le fichier fourni par iOS sans copie en clair. Les vidéos et les documents ouverts sont déchiffrés dans un dossier temporaire protégé, effacé à la fermeture ou au verrouillage.

## Limites connues

- **Appareil compromis ou coffre ouvert** : ce que l'utilisateur voit, un logiciel malveillant ou une personne qui tient l'iPhone ouvert peut le voir. Les clés sont en mémoire tant que le coffre est ouvert.
- **Regard par-dessus l'épaule** : quelqu'un qui filme ou regarde la saisie peut retenir la combinaison.
- **Face ID sous la contrainte** : quelqu'un peut forcer à regarder l'écran. Ne pas activer Face ID si ce risque compte : la combinaison leurre ne marche qu'au cadran.
- **Carte-clé trouvée** : avec la carte et l'iPhone (ou une sauvegarde `.planque`), on peut rouvrir le coffre. Elle se range comme une clé de maison.
- **Date de modification de l'index** : chaque ouverture réécrit l'index du coffre (journal). Une expertise du conteneur peut donc voir quel dossier de coffre a servi récemment.
- **Analyse technique du conteneur** : le nombre de coffres, leur taille et le nombre de fichiers chiffrés sont visibles par quelqu'un qui extrait les fichiers de l'appli. Le leurre résiste à la contrainte humaine (« ouvre l'appli »), pas à une expertise judiciaire.
- **Combinaison ET carte-clé perdues = données perdues.** Personne ne peut les récupérer, nous compris.
- **Changement d'iPhone** : il faut la carte-clé de chaque coffre.
- **Fichiers sortis du coffre** (partage, enregistrement) : ils ne sont plus protégés.

## Avant de communiquer

Faire relire `VaultPlugin.swift` par un spécialiste en sécurité iOS avant d'écrire « inviolable » sur le site ou l'App Store. « Même nous ne pouvons pas voir tes photos » et « ta clé ne quitte jamais la puce de ton iPhone » sont vrais par construction.
