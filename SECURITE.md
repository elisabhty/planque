# Planque — comment le coffre est protégé

Ce document décrit ce que fait vraiment le code (`ios/App/App/VaultPlugin.swift`), et ce qu'il ne fait pas. Il sert de base à l'audit à faire avant toute communication du type « inviolable ».

## Le secret : les cachettes de Noisette

- Une forêt illustrée avec **36 cachettes**. Le secret est la **suite ordonnée** des cachettes touchées : de 5 à 16 noisettes, et une cachette peut servir plusieurs fois.
- Espace : 36⁵ ≈ 60 millions de suites à 5 noisettes, 36⁶ ≈ 2,2 milliards à 6, 36⁸ ≈ 2 800 milliards à 8. L'appli recommande 6 noisettes ou plus, et Noisette signale les parcours trop simples (répétitions, même cachette deux fois de suite).
- Les numéros des cachettes font partie de la clé (`www/js/forest.js`) : on peut redessiner la forêt, mais **jamais renuméroter** les cachettes après la mise en ligne.

## Les clés

1. **Clé de l'appareil** : clé P-256 créée **dans la puce de sécurité** (Secure Enclave). Elle ne peut pas en sortir, n'est dans aucune sauvegarde et ne passe pas sur un autre iPhone. Le trousseau ne garde qu'une référence chiffrée que seule cette puce sait utiliser (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`).
2. **Dérivation, à chaque essai** :
   - PBKDF2-HMAC-SHA256, 600 000 tours (sel aléatoire propre à l'appareil) → `pre` ;
   - `pre` → clé P-256 éphémère → **accord ECDH avec la clé de la puce** → secret partagé ;
   - HKDF-SHA256(secret partagé, sel = `pre`) → 64 octets : clé d'enveloppe (KEK) + localisateur (→ SHA-256 → nom du dossier du coffre).

   Chaque essai doit donc passer par la puce de **cet** iPhone : une copie des fichiers ne permet pas de tester des cachettes ailleurs, même avec une ferme de serveurs.
3. **Clé maîtresse** : 256 bits aléatoires par coffre, enveloppée deux fois en AES-256-GCM :
   - par la KEK des cachettes (`key.bin`) ;
   - par la **phrase de secours** (`rec.bin`).

## La phrase de secours

- 12 mots, norme BIP39 (liste officielle française), soit 128 bits aléatoires et une somme de contrôle. Elle est créée pour chaque coffre et montrée **une seule fois**, avec une vérification de deux mots.
- HKDF(phrase) → clé d'enveloppe de secours + identifiant (`rid`, une empreinte qui ne révèle rien). La phrase ne dépend pas de l'appareil, et 128 bits sont hors de portée d'une attaque par force brute, même hors de l'iPhone.
- Elle sert à deux choses :
  - **cachettes oubliées** : on saisit la phrase, puis on choisit de nouvelles cachettes, et l'ancien parcours n'ouvre plus rien ;
  - **nouvel iPhone** : les coffres chiffrés arrivent avec la sauvegarde de l'iPhone, mais la clé de la puce ne suit pas. On rouvre chaque coffre avec sa phrase, et une nouvelle clé de puce est créée.
- On peut générer une **nouvelle phrase** depuis les réglages du coffre ; l'ancienne cesse alors de marcher.

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

- **Sauvegarde chiffrée** (fichier `.planque`) : copie telle quelle des fichiers chiffrés du coffre (clé enveloppée, phrase enveloppée, index, fichiers, miniatures), précédée d'un manifeste qui ne contient que des noms techniques (UUID) et des tailles. Aucun nom de photo, aucune date ni aucun album en clair. Le fichier se range où l'on veut (Fichiers, iCloud Drive, ordinateur) et ne s'ouvre qu'avec la **phrase de secours** (128 bits), sur n'importe quel iPhone. À la restauration, chaque chemin est vérifié (pas de sortie du dossier du coffre) et un coffre déjà présent n'est pas dupliqué.
- **Supprimés récemment** : un élément supprimé reste 30 jours dans le coffre, chiffré, avant d'être effacé à l'ouverture suivante. « Supprimer définitivement » et « Effacer ce coffre » ne passent pas par là.
- **Remettre dans Photos** : export des fichiers d'origine (dates et métadonnées conservées), après autorisation « ajout seulement » de Photos.
- **Rappel** dans la galerie quand il y a au moins 5 éléments et pas de sauvegarde depuis 30 jours (on peut le repousser de 7 jours).

## Coffres multiples et leurre

- Chaque parcours mène à son propre dossier. Un parcours inconnu ouvre un coffre **vide en mémoire**, sans erreur. Il n'est écrit sur le disque qu'au premier import, après un deuxième passage du même parcours.
- Même déroulé, même durée minimale (700 ms) et même animation de Noisette pour tous les parcours. Le nombre de coffres n'est affiché nulle part.

## Pendant l'utilisation

- Verrouillage dès que l'appli passe en arrière-plan : session et clés effacées, fichiers temporaires supprimés, fenêtres natives fermées.
- Cache opaque dans le sélecteur d'applis ; en version publiée (Release), aussi pendant un enregistrement ou un partage d'écran.
- **Verrouiller en retournant l'iPhone** (option) : écran posé contre la table, le coffre se ferme (accéléromètre, aucune autorisation demandée).
- **Journal des ouvertures** : les 30 dernières ouvertures de **ce** coffre, stockées dans son index chiffré (invisible depuis les autres coffres). Une ouverture inconnue signale que quelqu'un connaît le parcours ; **Changer mes cachettes** ré-enveloppe alors la clé maîtresse avec un nouveau parcours (l'ancien n'ouvre plus rien, les fichiers ne sont pas rechiffrés).
- **Icônes discrètes** (Lune, Sapin) via les icônes alternatives d'iOS. Le nom « Planque » reste affiché : iOS ne permet pas de le changer.
- **Face ID / code de l'iPhone** (option) : verrou d'accès **en plus** des cachettes, avant d'afficher la forêt. Il n'entre pas dans la clé : c'est un garde, pas une partie du chiffrement.
- À la saisie, une noisette apparaît brièvement sur la cachette touchée, sans laisser de trace du parcours (contrairement à un schéma dessiné).
- L'import depuis Photos chiffre le fichier fourni par iOS sans copie en clair. Les vidéos et les documents ouverts sont déchiffrés dans un dossier temporaire protégé, effacé à la fermeture ou au verrouillage.

## Limites connues

- **Appareil compromis ou coffre ouvert** : ce que l'utilisateur voit, un logiciel malveillant ou une personne qui tient l'iPhone ouvert peut le voir. Les clés sont en mémoire tant que le coffre est ouvert.
- **Regard par-dessus l'épaule** : quelqu'un qui filme ou regarde la saisie peut retenir le parcours.
- **Essais sur l'iPhone lui-même** : pas de blocage après X essais (ce serait un indice pour le leurre). Chaque essai coûte environ une demi-seconde à une seconde de calcul, plus le passage par la puce. Un parcours de 6 noisettes ou plus rend cette attaque irréaliste ; un parcours de 5 noisettes simples reste le point faible.
- **Date de modification de l'index** : chaque ouverture réécrit l'index du coffre (journal). Une expertise du conteneur peut donc voir quel dossier de coffre a servi récemment.
- **Analyse technique du conteneur** : le nombre de coffres, leur taille et le nombre de fichiers chiffrés sont visibles par quelqu'un qui extrait les fichiers de l'appli. Le leurre résiste à la contrainte humaine (« ouvre l'appli »), pas à une expertise judiciaire.
- **Cachettes ET phrase perdues = données perdues.** Personne ne peut les récupérer, nous compris.
- **Changement d'iPhone** : il faut la phrase de chaque coffre.
- **Fichiers sortis du coffre** (partage, enregistrement) : ils ne sont plus protégés.

## Avant de communiquer

Faire relire `VaultPlugin.swift` par un spécialiste en sécurité iOS avant d'écrire « inviolable » sur le site ou l'App Store. « Même nous ne pouvons pas voir tes photos » et « ta clé ne quitte jamais la puce de ton iPhone » sont vrais par construction.
