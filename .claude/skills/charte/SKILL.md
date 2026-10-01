---
name: charte
description: Charte graphique de Ma Place. À utiliser pour toute modification de l'interface (web/) : nouvel écran, bouton, panneau, couleur, texte affiché.
---

# Charte graphique de Ma Place

Le look de l'application a été refait à l'atelier 3. Tout nouvel élément d'interface doit s'y fondre, en clair comme en sombre.

## Couleurs

- Uniquement les variables CSS de `web/style.css` (`--fond`, `--carte`, `--texte`, `--texte-doux`, `--bord`, `--marque`, `--libre`, `--pris`, `--moi`, `--alerte`, `--succes`…). Jamais une couleur écrite en dur.
- Le thème sombre suit le système (`prefers-color-scheme`) : chaque nouvelle variable a sa valeur dans les deux blocs `:root`.
- Plan : libre = vert (`--libre`), réservé = rouge (`--pris`), à vous = bleu (`--moi`), salle proposée = contour vert (`--suggestion`).

## Composants

- Bouton principal : `class="bouton"` (pilule bleue). Secondaire : `bouton secondaire`. Petit : `bouton petit`. Action destructrice : `bouton danger`.
- Bloc de contenu : `class="carte"` (fond `--carte`, bord, arrondi `--rayon`, ombre `--ombre`).
- Fiche de détails : `<dl class="fiche">` ; étiquettes courtes : `<span class="puce">`.
- Message après une action : `<p id="message" class="message ok|erreur">`.

## Règles

- Textes de l'interface en français, phrases courtes, sans majuscules de titre (« Mes réservations », pas « Mes Réservations »).
- Sur le plan, chaque élément cliquable a `role="button"`, `tabindex="0"` et un `aria-label` qui dit ce qu'il est et son état.
- Tout texte inséré dans du HTML passe par `h()` (`web/js/dom.js`).
- Un nouvel écran ou panneau va dans son propre module de `web/js/`, relié par `main.js`.
- Avant de dire « terminé » : vérifier le rendu en clair et en sombre dans le navigateur.
