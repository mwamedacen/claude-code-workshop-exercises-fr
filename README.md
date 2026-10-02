# Ma Place — repo des ateliers

Ma Place est une application fictive de flex office : vous réservez un poste pour la journée ou une salle de réunion sur un plan. Vous l'améliorerez au fil des ateliers Claude Code. Les personnes, les adresses `@ma-place.example` et les données d'utilisation sont fictives.

## Avant la formation

1. Installez Node.js avec `node:sqlite`, Git, GitHub CLI (`gh`), Chrome ou Edge, Python, VS Code avec les extensions Claude Code et Jupyter, ainsi que Claude Code connecté à votre abonnement. `npm run check -- setup` indique les versions minimales requises par les scripts du repo.
2. Sur [la page GitHub du modèle](https://github.com/mwamedacen/claude-code-workshop-exercises-fr), choisissez **Use this template**, puis **Create a new repository** pour créer votre propre repo. Il peut être privé. Évitez **Fork** : une pull request pourrait alors viser le repo de la formation. Clonez votre copie avec `git clone <URL de votre repo>` et ouvrez ce dossier.
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

## Ateliers du jour 2

| Après le bloc | Atelier | Guide | Départ |
|---|---|---|---|
| 5 | 5 · Trois fonctions en même temps (60 min) | [W5](ateliers/W5.md) | `w5-depart` |
| 6 | 6 · L'agent de recette (55 min) | [W6](ateliers/W6.md) | `w6-depart` |
| 7 | 7 · Une règle devient un mur (55 min) | [W7](ateliers/W7.md) | `w7-depart` |
| 8 | 8 · Confier une tâche au cloud (10 + 30 min) | [W8](ateliers/W8.md) | `w8-depart` |

**À 09h00**, lancez ces cinq commandes à la racine de votre repo :

- `npm run checkpoint -- w5-depart` : sauvegarde votre travail du jour 1 et charge le départ du jour 2.
- `npm ci --prefix qa` : installe l'Agent SDK pour l'atelier 6.
- `git push -u origin HEAD` : publie votre branche de travail sur GitHub, ce qu'exige l'atelier 8.
- `npm run check -- w5-depart` : vérifie le départ du jour 2.
- `claude --cloud "Lance npm test et dis combien de tests passent. Ne modifie rien."` : teste la connexion GitHub, votre abonnement et Node dans le cloud. Si la commande signale GitHub, lancez `/web-setup` dans une session Claude (il utilise votre `gh`). Si elle échoue encore, signalez-le : vous ferez l'atelier 8 en binôme.

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
| `w5-depart` | Départ du jour 2 : les cartes A à D, un test d'acceptation en attente par carte, l'agent de recette à brancher |
| `w5-fusion` | Trois briefs ; la commande crée aussi les branches `carte-a`, `carte-b` et `carte-c`, prêtes à fusionner |
| `w6-depart` | Cartes A, B et C fusionnées, test A×B actif (fin de l'atelier 5) |
| `w6-commande` | Trois parcours de recette et le sous-agent `qa-visiteur` |
| `w7-depart` | Programme Agent SDK et page de rapport (fin de l'atelier 6) |
| `w7-mur` | Hook `PreToolUse` qui protège le plan des locaux |
| `w8-depart` | Verrou `Stop` sur les tests, les deux hooks commités (fin de l'atelier 7) |
| `final` | Carte D, « Ajouter à mon agenda » (fin de l'atelier 8) |

- `npm run checkpoint -- list` : afficher les checkpoints disponibles.
- `npm run checkpoint -- w3-fonction` : sauvegarder votre état et reprendre à ce point.
- `npm run check -- w3-fonction` : vérifier les éléments contrôlables de votre travail.

`/rewind` agit dans une session Claude Code ; les checkpoints du repo changent les fichiers Git. Ce sont deux mécanismes distincts.

## Commandes utiles

- `npm start` : démarrer l'application. `npm start -- --maintenant 2026-10-07T14:05` fixe l'heure pour les exercices qui en dépendent.
- `npm test` : lancer les tests de l'application.
- `npm run reset` : supprimer la base de démonstration ; le prochain démarrage la recrée.
- `npm run python` : préparer `.venv` pour le notebook.
- `npm run sabotage` : introduire une régression volontaire pour l'atelier 6 ; `npm run sabotage -- --annuler` la retire.
- `npm run qa:commande` et `npm run qa:programme` : lancer l'agent de recette par `claude -p` ou par l'Agent SDK. Si l'application n'est pas sur `http://localhost:3000`, ajoutez `-- --url <adresse>`.
- `npm run check -- setup` : vérifier votre machine avant la formation.
- `npm run check -- <point>` : vérifier le résultat d'un atelier.
- `npm run checkpoint -- <point>` : reprendre depuis une référence après sauvegarde.

Le plan des locaux appartient à l'équipe Facilities fictive : corrigez le code sans modifier `data/floor-plan.json`. Ces exercices n'utilisent pas le logo Ambient IT.
