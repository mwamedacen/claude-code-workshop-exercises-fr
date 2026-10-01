# Brief · carte <lettre> · <titre>

## Objectif

*La fonction à livrer, en une phrase.*

## Chiffre

*Le chiffre de `BACKLOG.md` qui justifie la carte.*

## Fichiers autorisés

*Les seuls fichiers que l'agent peut créer ou modifier.*

## Interdits

`CLAUDE.md`, `BACKLOG.md`, `data/floor-plan.json`, le test d'une autre carte, toute nouvelle dépendance.

## Contrôle

Retirer le `todo` du test de la carte (`test/acceptation/carte-<lettre>.test.js`) : rouge puis vert, puis `npm test`.

## À rendre

La sortie rouge puis verte, une capture de l'écran dans `captures/` (ignoré par Git), les fichiers modifiés.
