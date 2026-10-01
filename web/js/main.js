// Point d'entrée de l'interface : charge le plan, puis relie les modules entre eux.
import { etat } from './etat.js';
import { api } from './api.js';
import { h, $ } from './dom.js';
import { afficherEntete, afficherJours, afficherQui } from './entete.js';
import { dessinerPlan } from './plan.js';
import { afficherPanneau, panneauVide } from './panneau.js';
import { afficherMesReservations } from './liste.js';
import { demanderSalleLibre } from './salle-libre.js';
import { afficherEquipe } from './equipe.js';

const app = {
  async chargerJour() {
    etat.reservationsDuJour = await api('GET', `/api/reservations?jour=${etat.jourChoisi}`);
    app.redessiner();
  },
  redessiner() {
    dessinerPlan(app);
    if (etat.selection) afficherPanneau(app);
  },
  selectionner(type, id) {
    etat.selection = { type, id };
    etat.suggestions = [];
    app.redessiner();
  },
  async choisirJour(jour) {
    etat.jourChoisi = jour;
    etat.equipe = null;
    afficherJours(app);
    await app.chargerJour();
  },
  async apresReservation() {
    await app.chargerJour();
    if (!$('mes-reservations').hidden) await afficherMesReservations(app);
  },
  afficherMesReservations: () => afficherMesReservations(app),
  demanderSalleLibre: () => demanderSalleLibre(app),
  afficherEquipe: () => afficherEquipe(app),
};

async function demarrage() {
  try {
    [etat.info, etat.plan, etat.personas] = await Promise.all([api('GET', '/api/info'), api('GET', '/api/plan'), api('GET', '/api/employes')]);
    etat.jourChoisi = etat.info.reference;
    afficherEntete(app);
    afficherQui(app);
    afficherJours(app);
    panneauVide();
    await app.chargerJour();
  } catch (e) {
    $('plan').innerHTML = `<p class="message erreur">Impossible de charger le plan : ${h(e.message)}</p>`;
  }
}

demarrage();
