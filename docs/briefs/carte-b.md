# Brief · carte B · Proposer la bonne taille

## Objectif

Quand la salle choisie a plus du double des places nécessaires, le panneau propose la plus petite salle libre qui suffit sur le même créneau (`GET /api/bonne-taille`). La salle choisie reste réservable.

## Chiffre

92 réservations sur 231 dans les salles de huit places ou plus étaient pour une ou deux personnes.

## Fichiers autorisés

`server/index.js`, `web/js/panneau.js`, `web/style.css`, `test/acceptation/carte-b.test.js` (seulement pour retirer le `todo`).

## Interdits

`CLAUDE.md`, `BACKLOG.md`, `data/floor-plan.json`, le test d'une autre carte, toute nouvelle dépendance.

## Contrôle

Retirer le `todo` de chaque test de `test/acceptation/carte-b.test.js` : rouge puis vert, puis `npm test`.

## À rendre

La sortie rouge puis verte, une capture du panneau d'une grande salle avec la suggestion dans `captures/` (ignoré par Git), les fichiers modifiés.
