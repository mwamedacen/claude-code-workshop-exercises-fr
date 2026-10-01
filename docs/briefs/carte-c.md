# Brief · carte C · S'asseoir avec son équipe

## Objectif

Un bouton « Mon équipe » montre les collègues de mon équipe qui ont un poste le jour choisi et propose un poste libre près d'eux (`GET /api/equipe`).

## Chiffre

Les postes sont occupés à 92,4 % le mardi, mais seulement 27,0 % le vendredi ; en Marketing, 43,0 % des réservations sont dans la zone de l'équipe.

## Fichiers autorisés

`server/index.js`, `web/index.html`, `web/js/entete.js`, `web/js/etat.js`, `web/js/main.js`, `web/js/plan.js`, un nouveau `web/js/equipe.js`, `web/style.css`, `test/acceptation/carte-c.test.js` (seulement pour retirer le `todo`).

## Interdits

`CLAUDE.md`, `BACKLOG.md`, `data/floor-plan.json`, le test d'une autre carte, toute nouvelle dépendance.

## Contrôle

Retirer le `todo` de chaque test de `test/acceptation/carte-c.test.js` : rouge puis vert, puis `npm test`.

## À rendre

La sortie rouge puis verte, une capture du panneau « Mon équipe » et du plan dans `captures/` (ignoré par Git), les fichiers modifiés.
