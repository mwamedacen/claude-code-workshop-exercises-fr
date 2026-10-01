# Backlog de Ma Place

## Cartes issues des données de septembre

Ces quatre cartes proviennent du notebook `analytics/septembre.ipynb`. Les nombres portent sur les réservations distinctes hors comptes de service ; ils justifient une hypothèse de travail, pas une décision automatique.

### A · Libérer une salle restée vide
- **Pourquoi :** 231 réunions sur 717 n'ont pas de check-in (32,2 %).
- **Quoi :** si personne ne confirme son arrivée dix minutes après le début, la salle redevient disponible ; la personne qui a réservé est avertie.
- **Vérification :** avec l'horloge simulée, une réunion sans check-in est libérée à +10 min ; une réunion confirmée reste réservée.

### B · Proposer la bonne taille
- **Pourquoi :** 92 réservations sur 231 dans les salles de huit places ou plus étaient pour une ou deux personnes.
- **Quoi :** suggérer une salle plus petite qui est libre sur le même créneau, sans interdire la salle choisie.
- **Vérification :** pour deux personnes, la suggestion affiche la plus petite salle libre ; si aucune ne convient, la réservation initiale reste possible.

### C · S'asseoir avec son équipe
- **Pourquoi :** les postes sont occupés à 92,4 % le mardi, mais seulement 27,0 % le vendredi ; en Marketing, 43,0 % des réservations sont dans la zone de l'équipe.
- **Quoi :** indiquer les jours de présence de l'équipe et les postes libres près de ses collègues.
- **Vérification :** le panneau montre le nombre de collègues présents dans chaque zone pour le jour choisi, et propose un poste libre à proximité sans masquer les autres.

### D · Ajouter à mon agenda
- **Pourquoi :** 1 131 clics sur le lien désactivé, venant de 76 des 108 personnes qui ont réservé.
- **Quoi :** télécharger un événement de calendrier pour sa propre réservation.
- **Vérification :** l'événement contient la bonne date, le bon créneau et le nom de la salle ou du poste ; aucune donnée d'un collègue n'y apparaît.

---

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
