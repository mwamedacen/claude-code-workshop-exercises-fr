---
name: donnees-ma-place
description: Définitions métier et méthode d'analyse pour les données d'usage fictives de Ma Place.
---

# Données Ma Place

La référence détaillée est `analytics/SCHEMA.md`. Le fichier `analytics/ma-place-2026-09.db` couvre les jours ouvrés de septembre 2026. Interroge-le avec SQLite ; ne colle pas ses lignes dans la conversation. Tous les horaires sont locaux à Paris, stockés comme texte `YYYY-MM-DD`, `HH:MM` ou `YYYY-MM-DDTHH:MM:SS`.

- `people(person_id, team)` : comptes pseudonymisés. `desks(desk_id, zone)` : 50 postes. `rooms(room_id, name, capacity, equipment)` : huit salles.
- `bookings(booking_id, person_id, kind, resource_id, day, start_time, end_time, attendees, created_at, channel)` : enregistrements de réservation. `kind` vaut `desk` ou `room`; `start_time`, `end_time` et `attendees` sont nuls pour un poste.
- `checkins(booking_id, checked_in_at)` : arrivées confirmées dans l'application. `badge_entries(person_id, day, first_entry)` : entrée dans l'immeuble, indépendante du check-in.
- `app_events(event_id, ts, person_id, event, detail)` : événements de navigation ; `booking_error` porte une raison dans `detail`, `agenda_click_disabled` marque un clic sans action.

Une **réunion fantôme** est une réservation de salle sans check-in. Ce n'est pas une preuve d'absence physique. Une salle **trop grande** est ici une salle d'au moins huit places réservée pour une ou deux personnes ; cette catégorie sert à proposer une option, pas à interdire la réservation. L'**occupation** d'un jour est le nombre de postes distincts réservés divisé par 50. Pour comparer les jours de semaine, calcule d'abord chaque jour puis la moyenne.

Annonce toujours l'unité : lignes, réservations distinctes, personnes ou jours. Vérifie les envois répétés avant de compter les réservations ; vérifie le rôle des comptes avant de compter les personnes. Ne déduis pas qu'une réservation `api` est un compte de service : de vraies personnes utilisent aussi ce canal. Donne numérateur, dénominateur et limite d'interprétation pour chaque taux.
