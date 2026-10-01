// Carte C « Jours d'équipe » : où est assise mon équipe le jour affiché, et un poste conseillé près d'elle.
import { etat, nomEquipe } from './etat.js';
import { dateLongue } from './dates.js';
import { api } from './api.js';
import { h, $ } from './dom.js';

export async function afficherEquipe(app) {
  const r = await api('GET', `/api/equipe?jour=${etat.jourChoisi}&employe=${encodeURIComponent(etat.moi)}`);
  etat.equipe = { presents: r.presents.map((x) => x.poste), conseil: r.conseil };
  etat.selection = null;
  const n = r.presents.length;
  $('panneau').innerHTML = `
    <h2>Mon équipe · ${h(nomEquipe(r.equipe))}</h2>
    <p>${h(dateLongue(etat.jourChoisi))} : ${n ? `${n} collègue${n > 1 ? 's' : ''} au bureau (postes en pointillés sur le plan).` : 'personne de votre équipe au bureau.'}</p>
    ${n ? `<p class="puces">${r.presents.map((x) => `<span class="puce">${h(x.qui)} · ${h(x.poste)}</span>`).join('')}</p>` : ''}
    ${r.conseil ? `<p>Poste conseillé près d'eux : <strong>${h(r.conseil)}</strong> (entouré en vert).</p><button id="btn-conseil" class="bouton">Voir le poste ${h(r.conseil)}</button>` : '<p class="vide">Aucun poste libre ce jour-là.</p>'}`;
  const bouton = $('btn-conseil');
  if (bouton) bouton.addEventListener('click', () => {
    etat.selection = { type: 'poste', id: r.conseil };
    app.redessiner();
  });
  app.redessiner();
}
