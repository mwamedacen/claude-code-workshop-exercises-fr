# Backlog de Ma Place

Les demandes de l'équipe, de la plus petite à la plus grande. Chaque carte dit **pourquoi** et **comment vérifier** que c'est fait : on ne la ferme que quand la vérification passe.

Dans chaque atelier, quand vous avez fini : prenez une carte et appliquez-lui ce que vous venez d'apprendre.

---

### 1. Mes postes favoris
- Pourquoi : chacun a ses deux ou trois postes préférés et les cherche sur le plan tous les matins.
- Quoi : une étoile dans la fiche d'un poste ; les favoris libres du jour apparaissent en haut du panneau.
- Vérification : je mets T07 en favori, je recharge la page, l'étoile est toujours là et T07 est proposé s'il est libre.

### 2. Le plan au clavier
- Pourquoi : certains collègues n'utilisent pas de souris.
- Quoi : les flèches passent d'un poste au poste voisin, Entrée ouvre sa fiche, puis réserve.
- Vérification : je réserve un poste libre sans toucher la souris.

### 3. Liste d'attente
- Pourquoi : les mardis et jeudis, il n'y a plus de poste libre dès 9h.
- Quoi : quand un jour est complet, « M'inscrire en liste d'attente » ; à la première annulation, la personne en tête est prévenue dans l'application.
- Vérification : un test remplit tous les postes d'un jour, inscrit quelqu'un, annule une réservation, et vérifie que la personne est prévenue.

### 4. Imprimer ma semaine
- Pourquoi : certains veulent leur semaine sur papier ou en PDF.
- Quoi : une vue « Ma semaine » imprimable, lisible en noir et blanc.
- Vérification : l'aperçu avant impression tient sur une page et reste lisible sans couleurs.

### 5. Qui est là aujourd'hui ?
- Pourquoi : savoir si l'équipe est au bureau avant de venir.
- Quoi : la liste des collègues de mon équipe qui ont un poste aujourd'hui (prénom et initiale).
- Vérification : la liste correspond aux postes de mon équipe sur le plan du jour.

### 6. Trouver un collègue
- Pourquoi : « Où est assise Léa aujourd'hui ? »
- Quoi : un champ de recherche ; le poste de la personne s'allume sur le plan.
- Vérification : je cherche « Hugo » un jour où il a réservé : son poste s'allume ; un jour où il n'a rien : « Pas de poste réservé ».

### 7. Choisir son thème
- Pourquoi : certains veulent le thème sombre même quand leur système est en clair.
- Quoi : un choix « Clair / Sombre / Système » qui survit au rechargement.
- Vérification : je choisis « Sombre », je recharge : la page reste sombre.

### 8. Réserver plusieurs jours d'un coup
- Pourquoi : beaucoup viennent les mêmes jours chaque semaine.
- Quoi : cocher plusieurs jours pour le même poste ; un jour déjà pris est signalé sans bloquer les autres.
- Vérification : je coche mardi, mercredi, jeudi : trois réservations ; si mercredi est pris, j'en ai deux et un message clair.

### 9. Une durée de réunion par défaut
- Pourquoi : on oublie de changer l'heure de fin.
- Quoi : quand on change le début, la fin se met à début + 1 heure.
- Vérification : je choisis 14h30 au début, la fin affiche 15h30.

### 10. Mon mois en chiffres
- Pourquoi : savoir combien de jours on est venu ce mois-ci.
- Quoi : un encart « Ce mois-ci : 9 jours au bureau, 4 réunions ».
- Vérification : les chiffres correspondent à « Mes réservations » du mois.

### 11. Plus de HTML fabriqué à la main
- Pourquoi : l'interface construit son HTML en collant des textes ; un nom contenant « <b> » serait interprété.
- Quoi : construire les éléments avec le DOM (`textContent`, `createElement`) ou échapper systématiquement.
- Vérification : un test (ou une démonstration) avec un nom contenant « <b>Test</b> » l'affiche tel quel.

### 12. Contrastes et focus
- Pourquoi : l'application doit être lisible par tous.
- Quoi : des contrastes au niveau AA, un contour visible sur l'élément qui a le focus clavier.
- Vérification : un outil de contraste passe sur les textes principaux ; la touche Tab montre toujours où l'on est.
