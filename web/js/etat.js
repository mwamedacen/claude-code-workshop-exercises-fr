// L'état de l'interface, partagé par tous les modules.
export const etat = {
  plan: null,
  info: null,
  personas: [],
  reservationsDuJour: [],
  jourChoisi: null, // « AAAA-MM-JJ »
  selection: null, // { type: 'poste' | 'salle', id }
  suggestions: [], // salles proposées par « Salle libre maintenant »
  moi: localStorage.getItem('maplace.qui') || 'e001',
};

const EQUIPES = { finance: 'Finance', rh: 'RH', tech: 'Tech', marketing: 'Marketing' };
export const nomEquipe = (id) => EQUIPES[id] || id;

const EQUIPEMENTS = { visio: 'visio', ecran: 'écran', tableau: 'tableau' };
export const nomEquipement = (id) => EQUIPEMENTS[id] || id;

export const trouverSalle = (id) => etat.plan.salles.find((s) => s.id === id) || null;
export const trouverPoste = (id) => etat.plan.postes.find((p) => p.id === id) || null;
export const reservationPoste = (id) => etat.reservationsDuJour.find((r) => r.type === 'poste' && r.ressource === id) || null;
export const reservationsSalle = (id) => etat.reservationsDuJour.filter((r) => r.type === 'salle' && r.ressource === id);
