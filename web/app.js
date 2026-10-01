// Ma Place - interface
// (c) équipe interne. Ne pas toucher à l'ordre des fonctions, ça marche comme ça.

var plan = null;
var info = null;
var personas = [];
var reservationsDuJour = [];
var jourChoisi = null; // "AAAA-MM-JJ"
var selectedItem = null; // { type: 'poste' | 'salle', id }
var moi = localStorage.getItem('maplace.qui') || 'e001';
var DEBUG = false;

// ---------------------------------------------------------------------------
// Dates (il y en a aussi dans le serveur)
// ---------------------------------------------------------------------------

function toKey(d) {
  var m = d.getMonth() + 1;
  var j = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (j < 10 ? '0' + j : j);
}

function fmtDate(cle) {
  // "2026-10-07" -> "07/10/2026"
  var p = cle.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

var JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function dateFr(cle) {
  var p = cle.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return JOURS_SEMAINE[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
}

function cleVersDate(cle) {
  var p = cle.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

// ---------------------------------------------------------------------------
// Appels au serveur
// ---------------------------------------------------------------------------

function api(methode, chemin, corps) {
  var options = { method: methode, headers: {} };
  if (corps) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(corps);
  }
  return fetch(chemin, options).then(function (r) {
    return r.text().then(function (t) {
      var donnees = null;
      try {
        donnees = t ? JSON.parse(t) : null;
      } catch (e) {
        donnees = t;
      }
      if (!r.ok) {
        var message = donnees && donnees.erreur ? donnees.erreur : 'Erreur ' + r.status;
        throw new Error(message);
      }
      return donnees;
    });
  });
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

function demarrage() {
  Promise.all([api('GET', '/api/info'), api('GET', '/api/plan'), api('GET', '/api/employes')])
    .then(function (res) {
      info = res[0];
      plan = res[1];
      personas = res[2];
      jourChoisi = info.reference;
      afficherEntete();
      afficherJours();
      afficherQui();
      return chargerJour();
    })
    .catch(function (e) {
      document.getElementById('plan').innerHTML = '<p class="erreur">Impossible de charger le plan : ' + e.message + '</p>';
    });
}

function afficherEntete() {
  if (info.simule) {
    var d = new Date(info.maintenant);
    document.getElementById('horloge').textContent =
      'Horloge simulée : ' + dateFr(toKey(d)) + ' ' + d.getHours() + 'h' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  if (info.branche) document.getElementById('branche').textContent = '[branche : ' + info.branche + ']';
  document.getElementById('etage').textContent = plan.etage;
  document.getElementById('btn-mes-reservations').addEventListener('click', afficherMesReservations);
  document.getElementById('agenda').addEventListener('click', function (e) {
    e.preventDefault(); // pas encore disponible
  });
}

function afficherJours() {
  // les 10 jours ouvrés : cette semaine et la suivante
  var ref = cleVersDate(info.reference);
  var lundi = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ((ref.getDay() + 6) % 7));
  var html = 'Jour : ';
  for (var i = 0; i < 12; i++) {
    var d = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i);
    if (d.getDay() == 0 || d.getDay() == 6) continue;
    var cle = toKey(d);
    html +=
      '<a href="#" data-jour="' + cle + '"' + (cle == jourChoisi ? ' class="choisi"' : '') + '>' +
      JOURS_SEMAINE[d.getDay()].substring(0, 3) + '. ' + d.getDate() + '/' + (d.getMonth() + 1) + '</a>';
  }
  var div = document.getElementById('jours');
  div.innerHTML = html;
  var liens = div.querySelectorAll('a');
  for (var k = 0; k < liens.length; k++) {
    liens[k].addEventListener('click', function (e) {
      e.preventDefault();
      jourChoisi = this.getAttribute('data-jour');
      afficherJours();
      chargerJour();
    });
  }
}

function afficherQui() {
  var select = document.getElementById('qui');
  var html = '';
  for (var i = 0; i < personas.length; i++) {
    var p = personas[i];
    html += '<option value="' + p.id + '"' + (p.id == moi ? ' selected' : '') + '>' + p.first_name + ' ' + p.last_name + ' (' + nomEquipe(p.team) + ')</option>';
  }
  select.innerHTML = html;
  select.addEventListener('change', function () {
    moi = this.value;
    localStorage.setItem('maplace.qui', moi);
    dessinerPlan();
    if (selectedItem) afficherPanneau();
  });
}

function nomEquipe(id) {
  if (id == 'finance') return 'Finance';
  if (id == 'rh') return 'RH';
  if (id == 'tech') return 'Tech';
  if (id == 'marketing') return 'Marketing';
  return id;
}

function chargerJour() {
  return api('GET', '/api/reservations?jour=' + jourChoisi).then(function (lignes) {
    reservationsDuJour = lignes;
    dessinerPlan();
    if (selectedItem) afficherPanneau();
  });
}

// ---------------------------------------------------------------------------
// Le plan (SVG)
// ---------------------------------------------------------------------------

function reservationPoste(id) {
  for (var i = 0; i < reservationsDuJour.length; i++) {
    var r = reservationsDuJour[i];
    if (r.type == 'poste' && r.ressource == id) return r;
  }
  return null;
}

function reservationsSalle(id) {
  var liste = [];
  for (var i = 0; i < reservationsDuJour.length; i++) {
    if (reservationsDuJour[i].type == 'salle' && reservationsDuJour[i].ressource == id) liste.push(reservationsDuJour[i]);
  }
  return liste;
}

function dessinerPlan() {
  if (!plan) return;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + plan.largeur + ' ' + plan.hauteur + '" width="100%" role="group" aria-label="Plan du ' + plan.etage + '">';
  for (var z = 0; z < plan.zones.length; z++) {
    var zone = plan.zones[z];
    svg += '<rect class="zone" x="' + zone.x + '" y="' + zone.y + '" width="' + zone.w + '" height="' + zone.h + '"></rect>';
    svg += '<text class="zone-nom" x="' + (zone.x + 8) + '" y="' + (zone.y + 18) + '">' + zone.label + '</text>';
  }
  for (var d = 0; d < plan.decor.length; d++) {
    var dc = plan.decor[d];
    svg += '<rect class="decor" x="' + dc.x + '" y="' + dc.y + '" width="' + dc.w + '" height="' + dc.h + '"></rect>';
    svg += '<text x="' + (dc.x + dc.w / 2) + '" y="' + (dc.y + dc.h / 2 + 4) + '" text-anchor="middle">' + dc.label + '</text>';
  }
  for (var s = 0; s < plan.salles.length; s++) {
    var salle = plan.salles[s];
    var nb = reservationsSalle(salle.id).length;
    var classe = 'salle' + (nb >= 3 ? ' pleine' : '');
    var label = 'Salle ' + salle.name + ', ' + salle.capacite + ' places, ' + (nb == 0 ? 'aucune réunion' : nb + ' réunion' + (nb > 1 ? 's' : '')) + ' ce jour';
    svg += '<g class="' + classe + '" data-type="salle" data-id="' + salle.id + '" role="button" tabindex="0" aria-label="' + label + '">';
    svg += '<rect x="' + salle.x + '" y="' + salle.y + '" width="' + salle.w + '" height="' + salle.h + '"' + (selectedItem && selectedItem.id == salle.id ? ' class="selection"' : '') + '></rect>';
    svg += '<text x="' + (salle.x + 8) + '" y="' + (salle.y + 18) + '">' + salle.name + '</text>';
    svg += '<text x="' + (salle.x + 8) + '" y="' + (salle.y + 34) + '">' + salle.capacite + ' pl.</text>';
    svg += '</g>';
  }
  for (var p = 0; p < plan.postes.length; p++) {
    var poste = plan.postes[p];
    var r = reservationPoste(poste.id);
    var etat = !r ? 'libre' : r.employe_id == moi ? 'moi' : 'occupe';
    var aria = 'Poste ' + poste.id + ', zone ' + nomEquipe(poste.zone) + ', ' + (etat == 'libre' ? 'libre' : etat == 'moi' ? 'réservé par vous' : 'réservé par ' + r.qui);
    svg += '<rect class="poste ' + etat + (selectedItem && selectedItem.id == poste.id ? ' selection' : '') + '" data-type="poste" data-id="' + poste.id + '" x="' + poste.x + '" y="' + poste.y + '" width="' + poste.w + '" height="' + poste.h + '" role="button" tabindex="0" aria-label="' + aria + '"></rect>';
    svg += '<text x="' + (poste.x + poste.w / 2) + '" y="' + (poste.y + poste.h / 2 + 4) + '" text-anchor="middle" pointer-events="none">' + poste.id + '</text>';
  }
  svg += '</svg>';
  var div = document.getElementById('plan');
  div.innerHTML = svg;
  var cliquables = div.querySelectorAll('[data-type]');
  for (var c = 0; c < cliquables.length; c++) {
    cliquables[c].addEventListener('click', selectionner);
    cliquables[c].addEventListener('keydown', function (e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        selectionner.call(this, e);
      }
    });
  }
  document.getElementById('legende').innerHTML =
    '<span class="legende-case" style="background:#b3e5b3"></span>libre' +
    '<span class="legende-case" style="background:#f2a7a7"></span>réservé' +
    '<span class="legende-case" style="background:#9ec5fe"></span>à vous' +
    '<span class="legende-case" style="background:#f9d6a5"></span>salle très demandée';
}

function selectionner(e) {
  selectedItem = { type: this.getAttribute('data-type'), id: this.getAttribute('data-id') };
  dessinerPlan();
  afficherPanneau();
}

// ---------------------------------------------------------------------------
// Le panneau de droite
// ---------------------------------------------------------------------------

function trouverSalle(id) {
  for (var i = 0; i < plan.salles.length; i++) if (plan.salles[i].id == id) return plan.salles[i];
  return null;
}

function trouverPoste(id) {
  for (var i = 0; i < plan.postes.length; i++) if (plan.postes[i].id == id) return plan.postes[i];
  return null;
}

function optionsHeures(defaut) {
  var html = '';
  for (var h = 8; h <= 19; h++) {
    for (var m = 0; m < 60; m += 30) {
      if (h == 19 && m > 0) continue;
      var t = h + 'h' + (m == 0 ? '00' : m);
      html += '<option' + (t == defaut ? ' selected' : '') + '>' + t + '</option>';
    }
  }
  return html;
}

function afficherPanneau() {
  var div = document.getElementById('panneau');
  if (!selectedItem) {
    div.innerHTML = '<p><i>Cliquez sur un poste ou une salle du plan.</i></p>';
    return;
  }
  var html = '';
  if (selectedItem.type == 'poste') {
    var poste = trouverPoste(selectedItem.id);
    var r = reservationPoste(poste.id);
    html += '<h3>Poste ' + poste.id + '</h3>';
    html += '<table>';
    html += '<tr><th>Zone</th><td>' + nomEquipe(poste.zone) + '</td></tr>';
    html += '<tr><th>Jour</th><td>' + dateFr(jourChoisi) + '</td></tr>';
    html += '<tr><th>État</th><td>' + (!r ? 'Libre' : r.employe_id == moi ? 'Réservé par vous' : 'Réservé par ' + r.qui) + '</td></tr>';
    html += '</table>';
    if (!r) html += '<p><button id="btn-reserver" onclick="reserver()">Réserver</button></p>';
  } else {
    var salle = trouverSalle(selectedItem.id);
    var liste = reservationsSalle(salle.id);
    html += '<h3>Salle ' + salle.name + '</h3>';
    html += '<table>';
    html += '<tr><th>Capacité</th><td>' + salle.capacite + ' personnes</td></tr>';
    html += '<tr><th>Équipements</th><td>' + (salle.equipements.length ? salle.equipements.join(', ') : 'aucun') + '</td></tr>';
    html += '<tr><th>Accessible</th><td>' + (salle.accessible ? 'oui' : 'non') + '</td></tr>';
    html += '<tr><th>Jour</th><td>' + dateFr(jourChoisi) + '</td></tr>';
    html += '</table>';
    html += '<p><b>Réunions ce jour :</b></p>';
    if (liste.length == 0) html += '<p><i>Aucune.</i></p>';
    else {
      html += '<table>';
      for (var i = 0; i < liste.length; i++) {
        html += '<tr><td>' + liste[i].debut + ' - ' + liste[i].fin + '</td><td>' + liste[i].nb_personnes + ' pers.</td><td>' + liste[i].qui + '</td></tr>';
      }
      html += '</table>';
    }
    html += '<p><b>Nouvelle réunion :</b><br>';
    html += 'Début <select id="debut">' + optionsHeures('9h00') + '</select> ';
    html += 'Fin <select id="fin">' + optionsHeures('10h00') + '</select><br>';
    html += 'Personnes <input id="nb" type="number" min="1" value="2" style="width:50px"></p>';
    html += '<p><button id="btn-reserver" onclick="reserver()">Réserver</button></p>';
  }
  html += '<div id="message"></div>';
  div.innerHTML = html;
}

function message(texte, ok) {
  var m = document.getElementById('message');
  if (m) m.innerHTML = '<p class="' + (ok ? 'ok' : 'erreur') + '">' + texte + '</p>';
}

// ---------------------------------------------------------------------------
// Fonctions prêtes mais pas encore branchées à l'écran
// ---------------------------------------------------------------------------

// Réserver le poste ou la salle sélectionnés (bouton « Réserver » du panneau)
function reserver() {
  if (!selectedItem) return;
  var corps = { type: selectedItem.type, ressource: selectedItem.id, employe: moi, jour: jourChoisi };
  if (selectedItem.type == 'salle') {
    corps.debut = document.getElementById('debut').value;
    corps.fin = document.getElementById('fin').value;
    corps.nb = Number(document.getElementById('nb').value);
  }
  return api('POST', '/api/reservations', corps)
    .then(function () {
      return chargerJour().then(function () {
        message('Réservation enregistrée.', true);
        if (document.getElementById('mes-reservations').style.display == 'block') afficherMesReservations();
      });
    })
    .catch(function (e) {
      message(e.message, false);
    });
}

// Afficher mes réservations (bouton « Mes réservations » de l'en-tête)
function afficherMesReservations() {
  return api('GET', '/api/mes-reservations?employe=' + moi).then(function (liste) {
    var div = document.getElementById('mes-reservations');
    var html = '<h3>Mes réservations</h3>';
    if (liste.length == 0) html += '<p><i>Aucune réservation à venir.</i></p>';
    else {
      html += '<table>';
      for (var i = 0; i < liste.length; i++) {
        var r = liste[i];
        var quoi = r.type == 'poste' ? 'Poste ' + r.ressource : 'Salle ' + (trouverSalle(r.ressource) || { name: r.ressource }).name + ' ' + r.debut + ' - ' + r.fin;
        html += '<tr><td>' + fmtDate(r.jour) + '</td><td>' + quoi + '</td><td>' + (r.arrivee_le ? 'arrivé·e' : '<button onclick="arrivee(' + r.id + ')">Je suis arrivé·e</button>') + '</td>' +
          '<td><button onclick="annuler(' + i + ')">Annuler</button></td></tr>';
      }
      html += '</table>';
    }
    div.innerHTML = html;
    div.style.display = 'block';
  });
}

function erreurListe(texte) {
  var div = document.getElementById('mes-reservations');
  div.innerHTML += '<p class="erreur">' + texte + '</p>';
}

// Annuler la réservation numéro "position" de MA liste (bouton « Annuler »)
function annuler(position) {
  return api('DELETE', '/api/mes-reservations/' + position + '?employe=' + moi)
    .then(function () {
      return chargerJour();
    })
    .then(function () {
      return afficherMesReservations();
    })
    .catch(function (e) {
      erreurListe(e.message);
    });
}

// Signaler mon arrivée (bouton « Je suis arrivé·e »)
function arrivee(id) {
  return api('POST', '/api/reservations/' + id + '/arrivee', { employe: moi })
    .then(function () {
      return afficherMesReservations();
    })
    .catch(function (e) {
      erreurListe(e.message);
    });
}

// ---------------------------------------------------------------------------
// Ancien code (garder au cas où)
// ---------------------------------------------------------------------------

function ancienAffichageListe(liste) {
  var t = '';
  for (var i = 0; i < liste.length; i++) t += liste[i].ressource + ' (' + liste[i].jour + ')\n';
  if (DEBUG) console.log(t);
  return t;
}

demarrage();
