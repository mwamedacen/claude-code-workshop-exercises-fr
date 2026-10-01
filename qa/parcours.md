# Parcours de recette — Ma Place

Données fictives. Démarrez l'application sur son horloge simulée :

```
npm start -- --maintenant 2026-10-07T14:15
```

Avant chaque passage : arrêtez l'application, `npm run reset`, relancez-la avec la même horloge. Le navigateur Playwright reste isolé ; les captures vont dans `qa/rapport/` seulement.

## 1. Réserver un poste pour un autre jour

- Action : en tant que Camille Martin (`e001`), réservez un poste libre pour le 2026-10-08.
- Résultat attendu : la réservation est acceptée et le poste apparaît réservé ce jour-là.
- Preuve : le message de confirmation ou la ligne dans « Mes réservations ».

## 2. Libérer une salle restée vide

- Action : à 14h15, ouvrez la salle Seine, qui a une réunion 13h30–14h30 sans arrivée signalée.
- Résultat attendu : 10 minutes après le début sans arrivée, la réunion est marquée « libérée » et la salle redevient disponible.
- Preuve : la réunion 13h30–14h30 affichée « libérée » dans la salle Seine.

## 3. Proposer une salle adaptée

- Action : demandez la salle Garonne (8 places) pour 2 personnes.
- Résultat attendu : une salle plus petite et libre est suggérée, et Garonne reste réservable.
- Preuve : la suggestion affichée et la salle proposée.
