# Ma Place — repo des ateliers

Ma Place est une application fictive de flex office : vous réservez un poste pour la journée ou une salle de réunion sur un plan. Vous l'améliorerez au fil des ateliers Claude Code. Les personnes, les adresses `@ma-place.example` et les données d'utilisation sont fictives.

## Avant la formation

1. Installez Node.js avec `node:sqlite`, Git, GitHub CLI (`gh`), Chrome ou Edge, Python, VS Code avec les extensions Claude Code et Jupyter, ainsi que Claude Code connecté à votre abonnement. `npm run check -- setup` indique les versions minimales requises par les scripts du repo.
2. Sur [la page GitHub du modèle](https://github.com/mwamedacen/claude-code-training-fr), choisissez **Use this template**, puis **Create a new repository** pour créer votre propre repo. Il peut être privé. Évitez **Fork** : une pull request pourrait alors viser le repo de la formation. Clonez votre copie avec `git clone <URL de votre repo>` et ouvrez ce dossier.
3. Lancez `npm run check -- setup`. Chaque ✘ indique un élément à installer ou à corriger. Relancez la commande le matin de la formation.
4. Préparez Python pour l'atelier 4 avec `npm run python`. La commande crée `.venv` dans votre repo et installe pandas, matplotlib, ipykernel et nbconvert. Sélectionnez le kernel `.venv` dans VS Code. Vous pouvez le faire pendant une pause : le premier téléchargement peut prendre du temps.
5. Lancez `npm start`, puis ouvrez l'adresse affichée (à partir de `http://localhost:3000`, ou le premier port libre).

L'application Node n'a aucune dépendance npm à installer. Sa base SQLite de démonstration est créée au premier démarrage. La base d'utilisation de septembre, dans `analytics/`, est distincte et ne sert qu'à l'atelier 4.

## Ateliers du jour 1

| Après le bloc | Atelier | Guide |
|---|---|---|
| 1 | 1 · Les boutons manquants (35 min) | [W1](ateliers/W1.md) |
| 2 | 2 · Ça ne marche pas (55 min) | [W2](ateliers/W2.md) |
| 3 | 3 · Les règles, une fonction, un nouveau look (70 min) | [W3](ateliers/W3.md) |
| 4 | 4 · Ce que disent les données (56 min) | [W4](ateliers/W4.md) |

Chaque guide donne une mission, des étapes, des vérifications visibles et plusieurs niveaux pour avancer si vous finissez tôt. [BACKLOG.md](BACKLOG.md) propose d'autres cartes. Si Claude repère un défaut hors de l'étape en cours, notez-le et restez sur l'objectif de l'atelier.

## Checkpoints

Le repo de la formation possède une branche `reference` et des tags. Votre repo créé avec **Use this template** peut ne pas contenir ces tags : la commande `checkpoint` les récupère depuis le repo de la formation si nécessaire. Elle sauvegarde d'abord votre travail sur une branche `sauvegarde-…`, puis crée une branche de travail au point demandé.

| Point | État de référence |
|---|---|
| `w1-depart` | Application sans les quatre boutons de réservation |
| `w2-depart` | Quatre boutons (fin de l'atelier 1) |
| `w2-correctif` | Playwright et premier défaut corrigé avec un test |
| `w3-depart` | Cinq défauts corrigés (fin de l'atelier 2) |
| `w3-regles` | Règles du projet dans CLAUDE.md |
| `w3-fonction` | Fonction « Salle libre maintenant » |
| `w4-depart` | Nouvelle interface et skill « charte » (fin de l'atelier 3) |
| `w4-analyses` | Sous-agent, skill de données, notebook et cartes du backlog (fin de l'atelier 4) |

- `npm run checkpoint -- list` : afficher les checkpoints disponibles.
- `npm run checkpoint -- w3-fonction` : sauvegarder votre état et reprendre à ce point.
- `npm run check -- w3-fonction` : vérifier les éléments contrôlables de votre travail.

`/rewind` agit dans une session Claude Code ; les checkpoints du repo changent les fichiers Git. Ce sont deux mécanismes distincts.

## Commandes utiles

- `npm start` : démarrer l'application. `npm start -- --maintenant 2026-10-07T14:05` fixe l'heure pour les exercices qui en dépendent.
- `npm test` : lancer les tests de l'application.
- `npm run reset` : supprimer la base de démonstration ; le prochain démarrage la recrée.
- `npm run python` : préparer `.venv` pour le notebook.
- `npm run check -- setup` : vérifier votre machine avant la formation.
- `npm run check -- <point>` : vérifier le résultat d'un atelier.
- `npm run checkpoint -- <point>` : reprendre depuis une référence après sauvegarde.

Le plan des locaux appartient à l'équipe Facilities fictive : corrigez le code sans modifier `data/floor-plan.json`. Ces exercices n'utilisent pas le logo Ambient IT.
