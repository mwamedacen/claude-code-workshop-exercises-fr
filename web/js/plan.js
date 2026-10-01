// Le plan de l'étage, en SVG. Chaque poste et chaque salle est un bouton accessible.
import { etat, nomEquipe, reservationPoste, reservationsSalle } from './etat.js';
import { h, $ } from './dom.js';

export function dessinerPlan(app) {
  const { plan } = etat;
  if (!plan) return;
  const morceaux = [];
  morceaux.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.largeur} ${plan.hauteur}" role="group" aria-label="Plan du ${h(plan.etage)}">`);
  for (const z of plan.zones) {
    morceaux.push(`<rect class="zone" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="12"></rect>`);
    morceaux.push(`<text class="zone-nom" x="${z.x + 12}" y="${z.y + 22}">${h(z.label)}</text>`);
  }
  for (const d of plan.decor) {
    morceaux.push(`<rect class="decor" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="12"></rect>`);
    morceaux.push(`<text x="${d.x + d.w / 2}" y="${d.y + d.h / 2 + 4}" text-anchor="middle">${h(d.label)}</text>`);
  }
  for (const s of plan.salles) {
    const nb = reservationsSalle(s.id).length;
    const classes = ['salle'];
    if (nb >= 3) classes.push('pleine');
    if (etat.suggestions.includes(s.id)) classes.push('suggestion');
    const choisie = etat.selection && etat.selection.id === s.id;
    const label = `Salle ${s.name}, ${s.capacite} places, ${nb === 0 ? 'aucune réunion' : `${nb} réunion${nb > 1 ? 's' : ''}`} ce jour`;
    morceaux.push(`<g class="${classes.join(' ')}" data-type="salle" data-id="${h(s.id)}" role="button" tabindex="0" aria-label="${h(label)}">`);
    morceaux.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="10"${choisie ? ' class="selection"' : ''}></rect>`);
    morceaux.push(`<text class="salle-nom" x="${s.x + 12}" y="${s.y + 26}">${h(s.name)}</text>`);
    morceaux.push(`<text x="${s.x + 12}" y="${s.y + 44}">${s.capacite} places</text>`);
    if (nb) morceaux.push(`<text x="${s.x + 12}" y="${s.y + 62}">${nb} réunion${nb > 1 ? 's' : ''}</text>`);
    morceaux.push('</g>');
  }
  for (const p of plan.postes) {
    const r = reservationPoste(p.id);
    const etatPoste = !r ? 'libre' : r.employe_id === etat.moi ? 'moi' : 'occupe';
    const qui = etatPoste === 'libre' ? 'libre' : etatPoste === 'moi' ? 'réservé par vous' : `réservé par ${r.qui}`;
    const choisi = etat.selection && etat.selection.id === p.id ? ' selection' : '';
    morceaux.push(`<rect class="poste ${etatPoste}${choisi}" data-type="poste" data-id="${h(p.id)}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="6" role="button" tabindex="0" aria-label="${h(`Poste ${p.id}, zone ${nomEquipe(p.zone)}, ${qui}`)}"></rect>`);
    morceaux.push(`<text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 4}" text-anchor="middle">${h(p.id)}</text>`);
  }
  morceaux.push('</svg>');

  const div = $('plan');
  div.innerHTML = morceaux.join('');
  div.querySelectorAll('[data-type]').forEach((el) => {
    const choisir = () => app.selectionner(el.dataset.type, el.dataset.id);
    el.addEventListener('click', choisir);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choisir();
      }
    });
  });

  $('legende').innerHTML = [
    ['libre', 'var(--libre)', 'var(--libre-bord)'],
    ['réservé', 'var(--pris)', 'var(--pris-bord)'],
    ['à vous', 'var(--moi)', 'var(--moi-bord)'],
    ['salle très demandée', 'var(--salle-demandee)', 'var(--salle-bord)'],
  ]
    .map(([texte, fond, bord]) => `<span><i style="background:${fond};border-color:${bord}"></i>${texte}</span>`)
    .join('');
}
