# Planque — comment le coffre est protégé

Ce document décrit ce que fait vraiment le code (`ios/App/App/VaultPlugin.swift`), et ce qu'il ne fait pas. Il sert de base à l'audit à faire avant toute communication du type « inviolable ».

## Clés

1. **Schéma** : grille 5 × 5, au moins 4 points, sans répétition.
2. **Poivre de l'appareil** : 32 octets aléatoires, créés au premier lancement et rangés dans le trousseau iOS (`kSecAttrAccessibleAfterFirstUnlock`, synchronisé par le trousseau iCloud, chiffré de bout en bout). Une empreinte non secrète est gardée dans `meta.json` pour détecter un poivre manquant (écran « La clé de cet iPhone est introuvable ») plutôt que d'en recréer un.
3. **Dérivation** : PBKDF2-HMAC-SHA256, 600 000 tours, mot de passe = schéma, sel = poivre → 64 octets.
   - octets 0 à 31 : **clé d'enveloppe** (KEK) ;
   - octets 32 à 63 : **localisateur** → SHA-256 → nom du dossier du coffre (32 caractères hexadécimaux).
4. **Clé maîtresse** : 256 bits aléatoires par coffre, enveloppée par la KEK en AES-256-GCM (`key.bin`). Changer de schéma n'imposera donc pas de rechiffrer les fichiers.

## Données

| Élément | Protection |
|---|---|
| Fichiers (photos, vidéos, documents) | AES-256-GCM par blocs de 1 Mo ; l'identifiant du fichier, le numéro de bloc et un drapeau « dernier bloc » sont authentifiés, ce qui bloque la troncature, la permutation et l'échange de fichiers |
| Miniatures | Chiffrées de la même façon (`t/<id>`) |
| Index (noms, dates, tailles, dimensions, réglages) | Un seul bloc AES-256-GCM (`index.bin`) |
| Noms sur le disque | UUID aléatoires : aucun nom d'origine |
| Protection iOS | Tous les fichiers en `NSFileProtectionComplete` (illisibles quand l'iPhone est verrouillé) |

Aucune cryptographie maison : CryptoKit (AES-GCM, SHA-256), CommonCrypto (PBKDF2), Security (trousseau, aléa).

## Coffres multiples et leurre

- Chaque schéma mène à son propre dossier. Un schéma inconnu ouvre un coffre **vide en mémoire**, sans message d'erreur ; il n'est écrit sur le disque qu'au premier import, après une deuxième saisie du schéma.
- Même déroulé, même durée minimale (700 ms) et même animation de Noisette pour tous les schémas.
- L'interface n'affiche jamais le nombre de coffres.

## Pendant l'utilisation

- Le coffre se verrouille dès que l'appli passe en arrière-plan : clés effacées de la session, fichiers temporaires supprimés, fenêtres natives fermées.
- Un cache opaque masque l'appli dans le sélecteur d'applis. En version publiée (Release), il masque aussi l'appli pendant un enregistrement ou un partage d'écran (désactivé en version de développement pour filmer des démos).
- L'import depuis Photos chiffre le fichier fourni par iOS **sans copie en clair** ; les copies temporaires de l'appareil photo et de Fichiers sont supprimées juste après le chiffrement.
- Les photos s'affichent depuis la mémoire. Les vidéos et les documents sont déchiffrés dans un dossier temporaire protégé, supprimé à la fermeture de l'aperçu ou au verrouillage.

## Limites connues (à assumer ou à traiter)

- **Appareil compromis ou déverrouillé** : un logiciel malveillant ou quelqu'un qui a l'iPhone ouvert et le coffre ouvert voit ce que l'utilisateur voit. Les clés sont en mémoire tant que le coffre est ouvert.
- **Regard par-dessus l'épaule** : le schéma se dessine à l'écran.
- **Essais sur l'appareil** : pas de blocage après X essais (ce serait un indice pour le leurre). Chaque essai coûte environ 0,3 à 1 s de calcul. Avec au moins 4 points sur 5 × 5, l'espace est grand, mais un schéma court reste plus faible : l'appli conseille un schéma long.
- **Analyse technique du conteneur** : le nombre de dossiers de coffres, leur taille et le nombre de fichiers chiffrés sont visibles par quelqu'un qui extrait les fichiers de l'appli. Le leurre résiste à la contrainte humaine (« ouvre l'appli »), pas à une expertise judiciaire.
- **Schéma oublié = données perdues.** **Poivre perdu** (nouvel iPhone sans trousseau iCloud, ni sauvegarde chiffrée) **= données perdues.** La phrase de récupération (étape suivante) répond à ces deux cas.
- **Sauvegarde** : les coffres (chiffrés) sont inclus dans la sauvegarde iCloud / Finder de l'iPhone. Pas encore de sauvegarde Planque dédiée.
- **Fichiers ouverts dans une autre appli** : ce que l'utilisateur partage ou enregistre hors du coffre n'est plus protégé.

## Avant de communiquer

Faire relire `VaultPlugin.swift` par un spécialiste en sécurité iOS avant d'écrire « même nous ne pouvons rien voir » ou « inviolable » sur le site ou l'App Store. La première phrase est vraie par construction (aucun serveur, aucune clé chez nous) ; la seconde n'est vraie pour aucune appli.
