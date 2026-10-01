// Le panneau de droite : la fiche du poste ou de la salle sélectionnés, et le bouton « Réserver ».
import { etat, nomEquipe, nomEquipement, trouverPoste, trouverSalle, reservationPoste, reservationsSalle } from './etat.js';
import { dateLongue } from './dates.js';
import { api } from './api.js';
import { h, $ } from './dom.js';

function optionsHeures(defaut) {
  const options = [];
  for (let m = 8 * 60; m <= 19 * 60; m += 30) {
    const t = `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
    options.push(`<option${t === defaut ? ' selected' : ''}>${t}</option>`);
  }
  return options.join('');
}

// Carte A : prévenir quand des réunions ont été libérées faute d'arrivée.
function bandeauLiberation(reunions) {
  const n = reunions.filter((r) => r.liberee).length;
  if (!n) return '';
  return `<p class="bandeau info">${n} réunion${n > 1 ? 's' : ''} libérée${n > 1 ? 's' : ''} : personne n'a signalé son arrivée 10 minutes après le début.</p>`;
}

export function panneauVide() {
  $('panneau').innerHTML = '<h2>Bienvenue</h2><p class="vide">Choisissez un poste ou une salle sur le plan.</p>';
}

export function afficherPanneau(app) {
  const div = $('panneau');
  if (!etat.selection) return panneauVide();
  if (etat.selection.type === 'poste') {
    const poste = trouverPoste(etat.selection.id);
    const r = reservationPoste(poste.id);
    const statut = !r ? 'Libre' : r.employe_id === etat.moi ? 'Réservé par vous' : `Réservé par ${r.qui}`;
    div.innerHTML = `
      <h2>Poste ${h(poste.id)}</h2>
      <dl class="fiche">
        <dt>Zone</dt><dd>${h(nomEquipe(poste.zone))}</dd>
        <dt>Jour</dt><dd>${h(dateLongue(etat.jourChoisi))}</dd>
        <dt>État</dt><dd>${h(statut)}</dd>
      </dl>
      ${!r ? '<button id="btn-reserver" class="bouton">Réserver</button>' : ''}
      <p id="message" class="message"></p>`;
  } else {
    const salle = trouverSalle(etat.selection.id);
    const reunions = reservationsSalle(salle.id);
    div.innerHTML = `
      <h2>Salle ${h(salle.name)}</h2>
      <dl class="fiche">
        <dt>Capacité</dt><dd>${salle.capacite} personnes</dd>
        <dt>Équipements</dt><dd><span class="puces">${salle.equipements.map((e) => `<span class="puce">${h(nomEquipement(e))}</span>`).join('') || 'aucun'}</span></dd>
        <dt>Accessible</dt><dd>${salle.accessible ? 'oui' : 'non'}</dd>
        <dt>Jour</dt><dd>${h(dateLongue(etat.jourChoisi))}</dd>
      </dl>
      ${bandeauLiberation(reunions)}
      <p id="conseil-taille" class="bandeau conseil" hidden></p>
      <h3>Réunions ce jour</h3>
      ${reunions.length
        ? `<ul class="reunions">${reunions.map((r) => `<li${r.liberee ? ' class="liberee"' : ''}><span>${h(r.debut)} – ${h(r.fin)}</span><span>${r.liberee ? '<span class="badge">libérée</span> ' : ''}${r.nb_personnes} pers. · ${h(r.qui)}</span></li>`).join('')}</ul>`
        : '<p class="vide">Aucune.</p>'}
      <h3>Nouvelle réunion</h3>
      <div class="formulaire">
        <label>Début <select id="debut">${optionsHeures('9h00')}</select></label>
        <label>Fin <select id="fin">${optionsHeures('10h00')}</select></label>
        <label>Personnes <input id="nb" type="number" min="1" value="2"></label>
      </div>
      <button id="btn-reserver" class="bouton">Réserver</button>
      <p id="message" class="message"></p>`;
  }
  const bouton = $('btn-reserver');
  if (bouton) bouton.addEventListener('click', () => reserver(app));
  if (etat.selection.type === 'salle') {
    for (const id of ['debut', 'fin', 'nb']) $(id).addEventListener('change', () => conseillerTaille(app));
    conseillerTaille(app);
  }
}

// Carte B : si la salle est bien trop grande, proposer une salle plus petite libre sur le créneau.
async function conseillerTaille(app) {
  const zone = $('conseil-taille');
  if (!zone || !etat.selection || etat.selection.type !== 'salle') return;
  // Pas de conseil tant que la fin ne suit pas le début : la route refuserait ce créneau.
  const minutes = (t) => Number(t.split('h')[0]) * 60 + Number(t.split('h')[1]);
  if (minutes($('fin').value) <= minutes($('debut').value)) {
    zone.hidden = true;
    return;
  }
  const params = new URLSearchParams({
    salle: etat.selection.id,
    jour: etat.jourChoisi,
    debut: $('debut').value,
    fin: $('fin').value,
    personnes: $('nb').value,
  });
  try {
    const r = await api('GET', `/api/bonne-taille?${params}`);
    if (!r.tropGrande || !r.suggestion) {
      zone.hidden = true;
      return;
    }
    zone.innerHTML = `Pour ${h($('nb').value)} personne(s), la salle <strong>${h(r.suggestion.name)}</strong> (${r.suggestion.capacite} places) est libre sur ce créneau. <a href="#" id="choisir-suggestion">La choisir</a>`;
    zone.hidden = false;
    $('choisir-suggestion').addEventListener('click', (e) => {
      e.preventDefault();
      app.selectionner('salle', r.suggestion.id);
    });
  } catch {
    zone.hidden = true;
  }
}

export function message(texte, ok) {
  const m = $('message');
  if (!m) return;
  m.textContent = texte;
  m.className = `message ${ok ? 'ok' : 'erreur'}`;
}

export async function reserver(app) {
  if (!etat.selection) return;
  const corps = { type: etat.selection.type, ressource: etat.selection.id, employe: etat.moi, jour: etat.jourChoisi };
  if (etat.selection.type === 'salle') {
    corps.debut = $('debut').value;
    corps.fin = $('fin').value;
    corps.nb = Number($('nb').value);
  }
  try {
    await api('POST', '/api/reservations', corps);
    await app.apresReservation();
    message('Réservation enregistrée.', true);
  } catch (e) {
    message(e.message, false);
  }
}
