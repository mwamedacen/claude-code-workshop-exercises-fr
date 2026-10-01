# Brief · carte A · Libérer une salle restée vide

## Objectif

Une réunion du jour sans arrivée signalée 10 minutes après son début est libérée : la salle se réserve de nouveau et apparaît dans « Salle libre maintenant ». La personne qui a réservé voit « libérée » dans « Mes réservations ».

## Chiffre

231 réunions sur 717 n'ont pas de check-in (32,2 %).

## Fichiers autorisés

`server/config.js`, `server/index.js`, `web/js/panneau.js`, `web/js/liste.js`, `web/style.css`, `test/acceptation/carte-a.test.js` (seulement pour retirer le `todo`).

## Interdits

`CLAUDE.md`, `BACKLOG.md`, `data/floor-plan.json`, le test d'une autre carte, toute nouvelle dépendance.

## Contrôle

Retirer le `todo` de chaque test de `test/acceptation/carte-a.test.js` : rouge puis vert, puis `npm test`.

## À rendre

La sortie rouge puis verte, une capture du panneau d'une salle avec une réunion libérée dans `captures/` (ignoré par Git), les fichiers modifiés.
