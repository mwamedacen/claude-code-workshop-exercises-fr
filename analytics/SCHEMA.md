# Données d'usage de « Ma Place » — septembre 2026

`analytics/ma-place-2026-09.db` est une base SQLite contenant un mois d'usage fictif de l'application : réservations, arrivées confirmées, badges d'entrée et événements de navigation. Les personnes sont pseudonymisées par un identifiant et une équipe. **Interrogez la base ; ne collez pas ses lignes dans la conversation.**

- Période : jours ouvrés du 1er au 30 septembre 2026.
- Heures locales de Paris, sans fuseau dans les champs : jour `YYYY-MM-DD`, heure `HH:MM`, horodatage `YYYY-MM-DDTHH:MM:SS`.
- Une ligne de `bookings` est un enregistrement, pas nécessairement une réservation distincte. Vérifiez l'unité de vos calculs.

## Tables

### `people` — comptes

| Colonne | Type | Sens |
|---|---|---|
| `person_id` | TEXT, clé primaire | Identifiant pseudonymisé, par exemple `p0042` |
| `team` | TEXT | `finance`, `rh`, `tech` ou `marketing` |

### `desks` — les 50 postes

| Colonne | Type | Sens |
|---|---|---|
| `desk_id` | TEXT, clé primaire | Identifiant sur le plan, par exemple `M07` |
| `zone` | TEXT | Zone de l'équipe à laquelle appartient le poste |

### `rooms` — les huit salles

| Colonne | Type | Sens |
|---|---|---|
| `room_id` | TEXT, clé primaire | Identifiant, par exemple `garonne` |
| `name` | TEXT | Nom affiché, par exemple `Garonne` |
| `capacity` | INTEGER | Nombre de places |
| `equipment` | TEXT | Équipements séparés par des virgules : `visio`, `ecran`, `tableau` ; chaîne vide si aucun |

### `bookings` — réservations enregistrées

Une réservation annulée est supprimée de l'application ; son événement reste dans `app_events`.

| Colonne | Type | Sens |
|---|---|---|
| `booking_id` | INTEGER, clé primaire | Identifiant attribué à l'enregistrement |
| `person_id` | TEXT | Auteur de la réservation (`people.person_id`) |
| `kind` | TEXT | `desk` ou `room` |
| `resource_id` | TEXT | `desks.desk_id` si `desk`, `rooms.room_id` si `room` |
| `day` | TEXT | Jour réservé, `YYYY-MM-DD` |
| `start_time` | TEXT | Début de réunion, `HH:MM` ; `NULL` pour un poste |
| `end_time` | TEXT | Fin de réunion, `HH:MM` ; `NULL` pour un poste |
| `attendees` | INTEGER | Effectif annoncé ; `NULL` pour un poste |
| `created_at` | TEXT | Date de création, parfois en août pour une réservation de septembre |
| `channel` | TEXT | `web`, `mobile` ou `api` |

### `checkins` — bouton « Je suis arrivé·e »

| Colonne | Type | Sens |
|---|---|---|
| `booking_id` | INTEGER, clé primaire | Réservation confirmée (`bookings.booking_id`) |
| `checked_in_at` | TEXT | Heure de confirmation |

### `badge_entries` — entrée dans l'immeuble

Une ligne par personne et par jour où elle a badgé, avec sa première entrée. Cette trace existe indépendamment de la réservation.

| Colonne | Type | Sens |
|---|---|---|
| `person_id` | TEXT | Personne (`people.person_id`) |
| `day` | TEXT | Jour |
| `first_entry` | TEXT | Première entrée, `HH:MM` |

### `app_events` — usage de l'interface

| Colonne | Type | Sens |
|---|---|---|
| `event_id` | INTEGER, clé primaire | Ordre de l'événement |
| `ts` | TEXT | Horodatage |
| `person_id` | TEXT | Personne (`people.person_id`) |
| `event` | TEXT | Type d'événement |
| `detail` | TEXT | Détail dépendant du type, parfois `NULL` |

| `event` | Sens de `detail` |
|---|---|
| `page_view` | `plan` ou `mes-reservations` |
| `open_panel` | Identifiant du poste ou de la salle |
| `search` | Texte saisi |
| `booking_attempt` | Identifiant de la ressource |
| `booking_ok` | Identifiant de la ressource |
| `booking_error` | `conflict`, `capacity` ou `other` |
| `cancel` | Identifiant de la ressource |
| `checkin` | Identifiant de la ressource |
| `agenda_click_disabled` | `NULL` : clic sur « Ajouter à mon agenda (bientôt) », sans action pour le moment |

## Jointures

- `bookings.person_id`, `badge_entries.person_id`, `app_events.person_id` → `people.person_id`.
- `bookings.resource_id` → `desks.desk_id` ou `rooms.room_id`, selon `kind`.
- `checkins.booking_id` → `bookings.booking_id`.
- Une journée d'une personne : `bookings` et `badge_entries` par (`person_id`, `day`).

## Vocabulaire métier

- **Poste** : espace réservé pour la journée ; une personne peut en avoir un par jour.
- **Salle** : espace réservé pour un créneau entre 08:00 et 19:00.
- **Zone** : partie de l'étage attribuée à une équipe.
- **Check-in** : confirmation du titulaire dans l'application. L'absence de confirmation ne prouve pas à elle seule l'absence physique.
- **Badge** : première entrée dans l'immeuble, indépendante de l'application.
- **Réunion fantôme** : réservation de salle sans check-in.
- **Occupation** : nombre de postes distincts réservés un jour donné, divisé par 50 ; moyenne des jours pour comparer les jours de semaine.
- **Canal** : `web`, `mobile` ou `api`. Ne supposez pas que toutes les réservations `api` viennent de comptes de test.
