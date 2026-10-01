// Jours et heures côté interface (le serveur a les siens dans server/dates.js).
export const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Date locale -> « AAAA-MM-JJ »
export function cle(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
}

export function versDate(texte) {
  const [a, m, j] = texte.split('-').map(Number);
  return new Date(a, m - 1, j);
}

// « 2026-10-07 » -> « mercredi 7 octobre »
export function dateLongue(texte) {
  const d = versDate(texte);
  return `${JOURS_SEMAINE[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

// « 2026-10-07 » -> « mer. 7/10 »
export function dateCourte(texte) {
  const d = versDate(texte);
  return `${JOURS_SEMAINE[d.getDay()].slice(0, 3)}. ${d.getDate()}/${d.getMonth() + 1}`;
}

export function heure(d) {
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}
