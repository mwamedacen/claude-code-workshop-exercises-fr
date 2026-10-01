# Ma Place

Réservation de postes et de salles de réunion pour un étage en flex office. Données fictives (atelier de formation).

## Commandes

- `npm start` : lance l'application sur le premier port libre à partir de 3000. `npm start -- --maintenant 2026-10-07T09:05` fixe l'horloge (utile pour tout ce qui dépend de l'heure).
- `npm test` : tous les tests (`node --test`). À lancer avant de dire qu'une tâche est terminée.
- `npm run reset` : efface la base ; elle est recréée, avec ses réservations de démonstration, au prochain lancement.

## Architecture

- `server/index.js` : serveur HTTP et toutes les routes `/api/...`. `server/db.js` : base SQLite (`node:sqlite`) et données de démonstration. `server/dates.js` : jours et heures.
- `web/` : l'interface, sans framework ni étape de build. `web/js/` : un module par partie de l'écran (`plan.js`, `panneau.js`, `liste.js`, `salle-libre.js`, `entete.js`), reliés par `main.js`. Le look suit le skill « charte ».
- `data/floor-plan.json` : le plan de l'étage. `data/employees.json` : les personnes (fictives).

## Règles (tirées de nos erreurs)

- Heures : on compare des minutes (`enMinutes()` de `server/dates.js`), jamais des textes : « 9h30 » > « 10h00 » en ordre alphabétique.
- Jours : une clé « AAAA-MM-JJ » à l'heure de Paris, via `cleDuJour()`. Jamais `toISOString()` pour un jour : il passe en UTC et recule d'un jour.
- La capacité d'une salle est le champ `capacite` de `data/floor-plan.json`. On n'invente pas de champ.
- Une action sur « mes réservations » ne touche que les réservations de la personne qui la demande.
- Toute correction commence par un test qui échoue, puis qui passe.
- Aucune donnée personnelle (nom, e-mail) dans un export ou un journal : on utilise l'identifiant de la personne.
- `data/floor-plan.json` appartient aux Services généraux : on ne le modifie jamais, on corrige le code.
- Les tests de `test/acceptation/` fixent le contrat d'une carte : on retire le `todo`, on ne change pas l'assertion.
