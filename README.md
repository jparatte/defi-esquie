# Le Défi d’Esquie — la suite

The original stone challenge stays at the existing GitHub Pages address. The new mobile expedition lives in `expedition/`, with the supplied introduction and its own saved progress.

## Preserve the old accomplishments

The old localStorage key remains **`pierres_perdues_v1`**, with the same numeric stone identifiers. Deploying updated files at the same HTTPS address does not reset that save. The browser must still have its original storage; clearing site data or changing browsers will not transfer it.

`continuation-config.js` controls `archiveCompleted`. If enabled, all four stones and the original reveal display as completed even with an empty or partial browser save. This changes the displayed state only: the original stored record is never rewritten by the archive. A completed challenge no longer requests GPS access.

The expedition saves separately under **`roxane-expedition-v1:progress`**. Its **Recommencer** button resets only the new expedition.

## Open the last challenge

The original page has **Démarrer le dernier défi**, followed by a password field. Set `continuation.passwordHash` to the SHA-256 digest of the normalized phrase. Case, accents and whitespace are ignored. An empty hash leaves access locked.

After a correct phrase, the browser records access only in sessionStorage. The same tab can enter `/expedition/`; the guard redirects direct visits back to the original page until unlocked. Closing the tab ends the unlock session. Changing the configured hash invalidates previous unlocks.

This prevents accidental spoilers. Since it runs on a public static site, it is not server authentication or a guarantee that technical visitors cannot inspect assets. The phrase is not stored as plaintext in the repository.

## Develop and publish

Run `npm start` in this repository and open http://127.0.0.1:4173. Use `npm test` for legacy-progress and password-gate regression checks. Configure real quest/finale content in `expedition/game-config.js`.

Publish the existing repository's `main` branch at its root through GitHub Pages. Keep its current domain/address. Asset paths are relative and require no build. The entry gate also applies to author previews such as `expedition/?preview=quest`; first unlock from the landing page.

`index.original.html` is the pre-existing local reference backup and is ignored. The parent `esquie_expedition` folder contains the standalone prototype; this repository is the continuation deployment.
