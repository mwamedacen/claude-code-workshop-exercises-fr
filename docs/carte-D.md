# Plan · carte D · Ajouter à mon agenda

## Objectif

Chaque ligne de « Mes réservations » propose « Ajouter à mon agenda » : un fichier de calendrier pour sa propre réservation. Le lien désactivé « Ajouter à mon agenda (bientôt) » de l'en-tête disparaît.

## Contrat

- `GET /api/reservations/:id/agenda.ics?employe=<id>` répond 200 avec un fichier `text/calendar` à la personne qui a réservé, 403 à toute autre personne, 404 pour une réservation inconnue.
- Un seul `VEVENT`. Une réunion : jour et heures exacts (heure de Paris avec `TZID=Europe/Paris`, ou UTC), nom de la salle. Un poste : toute la journée (`DTSTART;VALUE=DATE`), nom du poste.
- Aucun nom ni e-mail de collègue dans le fichier.

## Fichiers autorisés

`server/index.js`, `web/js/liste.js`, `web/js/entete.js`, `web/index.html`, `web/style.css`, `test/acceptation/carte-d.test.js` (seulement pour retirer le `todo`).

## Limites

`CLAUDE.md`, `BACKLOG.md`, `data/`, le test d'une autre carte, toute nouvelle dépendance. Pas de rappel ni de réservation récurrente.

## Contrôle

Retirer le `todo` de chaque test de `test/acceptation/carte-d.test.js` : rouge puis vert, puis `npm test`. Dans le navigateur, en Camille : « Mes réservations », un lien par ligne, le fichier s'ouvre dans l'agenda.
