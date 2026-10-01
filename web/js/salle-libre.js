// « Salle libre maintenant » : les salles libres pendant l'heure qui vient, la plus petite d'abord.
import { etat, nomEquipement } from './etat.js';
import { api } from './api.js';
import { h, $ } from './dom.js';

export function demanderSalleLibre(app) {
  etat.selection = null;
  $('panneau').innerHTML = `
    <h2>Salle libre maintenant</h2>
    <div class="formulaire">
      <label>Combien êtes-vous ? <input id="combien" type="number" min="1" value="2"></label>
      <button id="btn-chercher" class="bouton">Chercher</button>
    </div>
    <div id="resultats"></div>`;
  $('btn-chercher').addEventListener('click', () => chercherSalleLibre(app));
}

export async function chercherSalleLibre(app) {
  const personnes = Number($('combien').value) || 1;
  const r = await api('GET', `/api/salles-libres?personnes=${personnes}`);
  if (etat.jourChoisi !== etat.info.aujourdhui) {
    await app.choisirJour(etat.info.aujourdhui); // « maintenant », c'est aujourd'hui
  }
  etat.suggestions = r.salles.map((s) => s.id);
  let html;
  if (r.message) html = `<p class="message erreur">${h(r.message)}</p>`;
  else if (r.salles.length === 0) html = `<p class="vide">Aucune salle libre de ${h(r.debut)} à ${h(r.fin)} pour ${personnes} personne(s).</p>`;
  else
    html = `<p>Libres de ${h(r.debut)} à ${h(r.fin)}, la plus petite d’abord :</p>
      <ul class="resultats">${r.salles
        .map((s) => `<li><a href="#" data-salle="${h(s.id)}"><strong>${h(s.name)}</strong><span>${s.capacite} places${s.equipements.length ? ` · ${s.equipements.map((e) => h(nomEquipement(e))).join(', ')}` : ''}</span></a></li>`)
        .join('')}</ul>`;
  $('resultats').innerHTML = html;
  $('resultats').querySelectorAll('a[data-salle]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      app.selectionner('salle', a.dataset.salle);
    }),
  );
  app.redessiner();
}
