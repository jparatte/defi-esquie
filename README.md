# Le Défi d’Esquie — la suite

The original stone challenge stays at the existing GitHub Pages address. The new mobile expedition lives in `expedition/`, with the supplied introduction and its own saved progress.

## Preserve the old accomplishments

The old localStorage key remains **`pierres_perdues_v1`**, with the same numeric stone identifiers. Deploying updated files at the same HTTPS address does not reset that save. The browser must still have its original storage; clearing site data or changing browsers will not transfer it.

`continuation-config.js` controls `archiveCompleted`. If enabled, all four stones and the original reveal display as completed even with an empty or partial browser save. This changes the displayed state only: the original stored record is never rewritten by the archive. A completed challenge no longer requests GPS access.

The expedition saves separately under **`roxane-expedition-v2:progress`**. This starts a fresh session for the GPS-gated field test; the previous intro test save (`roxane-expedition-v1:progress`) is retained. Its **Recommencer** button resets only the new expedition.

## Starting-point field test

After entering the password, the welcome screen displays distance to the starting point (46.39684880936414, 6.922843310544531). Tap **Activer la localisation** and allow location access. **Commencer l’expédition** appears once a fresh GPS fix is within **10 metres**. The destination remains hidden on the player screen, and reported GPS precision appears alongside the distance.

Starting-point coordinates and the radius are configured in `expedition/game-config.js` under `start`. Arrival stays unlocked despite GPS drift and reloads. Use **Recommencer → Oui, recommencer** to relock it for another test. An interrupted journey resumes its saved phase without requiring a return to the starting point. Removing `start` restores the original ungated welcome screen.

## Open the last challenge

The original page has **Démarrer le dernier défi**, followed by a password field. Set `continuation.passwordHash` to the SHA-256 digest of the normalized phrase. Case, accents and whitespace are ignored. An empty hash leaves access locked.

After a correct phrase, the browser records access only in sessionStorage. The same tab can enter `/expedition/`; the guard redirects direct visits back to the original page until unlocked. Closing the tab ends the unlock session. Changing the configured hash invalidates previous unlocks.

This prevents accidental spoilers. Since it runs on a public static site, it is not server authentication or a guarantee that technical visitors cannot inspect assets. The phrase is not stored as plaintext in the repository.

## Develop and publish

### Mode sans GPS

Pour tester toute l’expédition sans être sur place, ajouter **`?dev=1`** à l’adresse :

- `https://jparatte.github.io/defi-esquie/?dev=1` — saisir le mot de passe, puis commencer sans GPS.
- `https://jparatte.github.io/defi-esquie/expedition/?dev=1` — ouvrir le parcours de développement après déverrouillage.
- Les liens **Après l’intro**, **Étapes 1 à 4**, **Assemblage** et **Dernier trajet** dans la barre de développement donnent accès directement aux nouveaux écrans, sans sauvegarder ces aperçus.

Le mode de développement ne demande jamais la localisation. Les indications du trajet s’affichent avant chaque énigme soumise au GPS ; **Simuler l’arrivée** ouvre ensuite le dialogue et la saisie. Le dernier trajet se valide avec le même bouton pour accéder à la conclusion. L’étape 1 et l’assemblage restent directement accessibles, car ils n’ont pas de barrière GPS. Sa progression utilise une clé séparée (`roxane-expedition-v2:development:progress`). Revenir à l’adresse sans `dev=1` réactive les barrières GPS et la sauvegarde normale. Le mot de passe reste nécessaire dans les deux modes.

### Contenu actuel

Après la seconde vidéo d’introduction, Esquie annonce les quatre indices et Roxane choisit **C’est parti !**. L’étape 1 demande la date d’arrivée de la statue en chiffres romains et accepte **MCMXXV**, indépendamment des majuscules et espaces. Une erreur propose **Oui / Non** ; l’indice **1900 vaut MCM** est révélé uniquement si demandé. Une réussite affiche le message fourni, puis **Continuer**.

L’image d’Esquie existante est conservée en attendant les visuels de l’étape. La statue est configurée à **46.39685537641124, 6.923038051324952**. L’étape 1 utilise `requireArrival: false` : la saisie est immédiatement accessible, et la localisation sert uniquement à afficher la distance. Les futures étapes restent soumises au rayon GPS par défaut ; elles peuvent également utiliser cette option si nécessaire. Une quête peut utiliser `successMessage`, une `video`, ou les deux. Lorsque les deux sont fournis, le message précède la vidéo. Les quatre indices sont suivis d’une énigme d’assemblage, puis du dernier trajet.

L’étape 2 mène au point **46.39714887299815, 6.91910544643461**, avec un rayon de **10 mètres**. Les indications de déplacement sont affichées pendant le trajet ; le dialogue d’Esquie et l’extrait de Byron apparaissent à l’arrivée. La réponse accepte **île de Peilz** ou **l’île de Peilz**, sans distinction d’accents, de majuscules, d’espaces ni de ponctuation (`answerOptions.ignorePunctuation`). L’indice sur la carte topographique se révèle sur demande. L’image d’Esquie sert aussi de visuel provisoire pour cette étape.

Les étapes 3 et 4 gardent un rayon GPS de **10 mètres**, respectivement aux points **46.39616822118051, 6.92347277890112** et **46.3983942971335, 6.924729693696819**. L’étape 3 accepte **médicinal** et **médicinaux** ; **Simples** est uniquement un indice lié au panneau sur place. L’étape 4 accepte **Sion**. Les dialogues, indications de trajet, messages de réussite et indices sur demande sont configurés dans `game-config.js`.

L’assemblage vient après le quatrième indice et **avant le déplacement final**. Cette quête sans destination (`requireArrival: false`) affiche les quatre mots, puis la phrase d’assemblage et les quatre intervalles en dessous, sans tableau ni titres de colonnes. L’énigme est phonétique : **X, Peilz, di, Sion** (troisième intervalle : `[3,4]`) ; la réponse attendue est **Expédition**. Les accents, majuscules et espaces sont ignorés. La validation puis **Continuer** dévoilent les indications du dernier trajet.

La dernière destination est **46.39642852805132, 6.924606352128569**, avec un rayon de **10 mètres**. À l’arrivée, le final joue **outro_a.mp4**, puis affiche **outro_still.png** avec Roxane et deux réponses : **Euh, pas sûre ...** et **Je crois bien que oui**. Les deux réponses lancent **outro_b.mp4** ; l’expédition se termine uniquement à la fin de cette seconde vidéo. **Réécouter Esquie** rejoue la vidéo A puis revient au même dialogue. Le final utilise le type `finale`, les champs `firstVideo`, `secondVideo`, `image`, `speaker` et `choices` dans `expedition/game-config.js`.

Chaque phase du final est sauvegardée. Les anciennes arrivées `outro-pending` ou `outro-video` reprennent la vidéo A sans devoir retourner au point GPS. Les fichiers fournis sont copiés du dossier `scenes/` du projet parent vers `expedition/scenes/`, qui est publié sur GitHub Pages.

Les aperçus directs sont `expedition/?dev=1&preview=step2`, `step3`, `step4`, `assembly` et `arrival` (valeurs du paramètre `preview`), après déverrouillage. En mode normal, `?preview=arrival` permet de voir les indications du dernier trajet et de simuler l’arrivée ; en mode développement, les indications s’affichent également et **Simuler l’arrivée** ouvre la conclusion. Une sauvegarde ayant terminé le contenu précédent reprend à la nouvelle étape ajoutée, sans refaire l’introduction ou les indices déjà validés.

Run `npm start` in this repository and open http://127.0.0.1:4173. Use `npm test` for legacy-progress and password-gate regression checks. Configure real quest/finale content in `expedition/game-config.js`.

Publish the existing repository's `main` branch at its root through GitHub Pages. Keep its current domain/address. Asset paths are relative and require no build. The entry gate also applies to author previews such as `expedition/?preview=quest`; first unlock from the landing page.

`index.original.html` is the pre-existing local reference backup and is ignored. The parent `esquie_expedition` folder contains the standalone prototype; this repository is the continuation deployment.
