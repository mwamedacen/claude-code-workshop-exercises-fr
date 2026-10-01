import './tz.js';

// Clé de jour « AAAA-MM-JJ » d'une date, à l'heure de Paris.
export function cleDuJour(d) {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}

// Le lundi de la semaine qui contient d (à minuit).
export function lundiDe(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const decalage = (x.getDay() + 6) % 7; // lundi = 0
  x.setDate(x.getDate() - decalage);
  return x;
}

export function ajouterJours(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

// « 9h30 » -> 570 minutes
export function enMinutes(h) {
  const m = /^(\d{1,2})[h:](\d{2})$/.exec(String(h).trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 570 minutes -> « 9h30 »
export function enTexte(minutes) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}
