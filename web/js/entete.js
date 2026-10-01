// En-tête : horloge simulée, branche Git, « Qui suis-je ? », les jours.
import { etat, nomEquipe } from './etat.js';
import { cle, versDate, dateLongue, dateCourte, heure } from './dates.js';
import { h, $ } from './dom.js';

export function afficherEntete(app) {
  if (etat.info.simule) {
    const d = new Date(etat.info.maintenant);
    $('horloge').textContent = `Horloge simulée : ${dateLongue(cle(d))}, ${heure(d)}`;
    $('horloge').hidden = false;
  }
  if (etat.info.branche) {
    $('branche').textContent = `branche ${etat.info.branche}`;
    $('branche').hidden = false;
  }
  $('etage').textContent = etat.plan.etage;
  $('btn-mes-reservations').addEventListener('click', () => app.afficherMesReservations());
  $('btn-salle-libre').addEventListener('click', () => app.demanderSalleLibre());
  $('btn-equipe').addEventListener('click', () => app.afficherEquipe());
}

export function afficherQui(app) {
  const select = $('qui');
  select.innerHTML = etat.personas
    .map((p) => `<option value="${h(p.id)}"${p.id === etat.moi ? ' selected' : ''}>${h(p.first_name)} ${h(p.last_name)} (${h(nomEquipe(p.team))})</option>`)
    .join('');
  select.addEventListener('change', () => {
    etat.moi = select.value;
    localStorage.setItem('maplace.qui', etat.moi);
    app.redessiner();
  });
}

// Les dix jours ouvrés : cette semaine et la suivante.
export function afficherJours(app) {
  const ref = versDate(etat.info.reference);
  const lundi = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ((ref.getDay() + 6) % 7));
  const liens = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const k = cle(d);
    if (i === 7) liens.push('<span class="separateur"></span>');
    liens.push(`<a href="#" data-jour="${k}"${k === etat.jourChoisi ? ' class="choisi" aria-current="date"' : ''}>${dateCourte(k)}</a>`);
  }
  const nav = $('jours');
  nav.innerHTML = liens.join('');
  nav.querySelectorAll('a[data-jour]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      app.choisirJour(a.dataset.jour);
    }),
  );
}
