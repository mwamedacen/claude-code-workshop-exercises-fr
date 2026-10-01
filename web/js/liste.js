// « Mes réservations » : la liste, avec « Annuler » et « Je suis arrivé·e ».
import { etat, trouverSalle } from './etat.js';
import { dateCourte } from './dates.js';
import { api } from './api.js';
import { h, $ } from './dom.js';

export async function afficherMesReservations(app, erreur) {
  const liste = await api('GET', `/api/mes-reservations?employe=${encodeURIComponent(etat.moi)}`);
  const div = $('mes-reservations');
  const lignes = liste.map((r, i) => {
    const quoi = r.type === 'poste' ? `Poste ${h(r.ressource)}` : `Salle ${h((trouverSalle(r.ressource) || { name: r.ressource }).name)}, ${h(r.debut)} – ${h(r.fin)}`;
    const arrivee = r.arrivee_le
      ? '<span class="arrive">arrivé·e</span>'
      : `<button class="bouton petit secondaire" data-arrivee="${r.id}">Je suis arrivé·e</button>`;
    return `<li><span class="quand">${h(dateCourte(r.jour))}</span><span class="quoi">${quoi}</span><span class="actions">${arrivee}<button class="bouton petit danger" data-annuler="${i}">Annuler</button></span></li>`;
  });
  div.innerHTML = `
    <h2>Mes réservations</h2>
    ${lignes.length ? `<ul class="mes-liste">${lignes.join('')}</ul>` : '<p class="vide">Aucune réservation à venir.</p>'}
    ${erreur ? `<p class="message erreur">${h(erreur)}</p>` : ''}`;
  div.hidden = false;
  div.querySelectorAll('[data-annuler]').forEach((b) => b.addEventListener('click', () => annuler(app, Number(b.dataset.annuler))));
  div.querySelectorAll('[data-arrivee]').forEach((b) => b.addEventListener('click', () => arrivee(app, Number(b.dataset.arrivee))));
}

// Annule la réservation numéro « position » de MA liste.
export async function annuler(app, position) {
  try {
    await api('DELETE', `/api/mes-reservations/${position}?employe=${encodeURIComponent(etat.moi)}`);
    await app.chargerJour();
    await afficherMesReservations(app);
  } catch (e) {
    await afficherMesReservations(app, e.message);
  }
}

export async function arrivee(app, id) {
  try {
    await api('POST', `/api/reservations/${id}/arrivee`, { employe: etat.moi });
    await afficherMesReservations(app);
  } catch (e) {
    await afficherMesReservations(app, e.message);
  }
}
