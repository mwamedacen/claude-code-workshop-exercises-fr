// Appels au serveur : renvoie le JSON, ou lève une erreur avec le message du serveur.
export async function api(methode, chemin, corps) {
  const options = { method: methode, headers: {} };
  if (corps) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(corps);
  }
  const r = await fetch(chemin, options);
  const texte = await r.text();
  let donnees = null;
  try {
    donnees = texte ? JSON.parse(texte) : null;
  } catch {
    donnees = texte;
  }
  if (!r.ok) throw new Error(donnees && donnees.erreur ? donnees.erreur : `Erreur ${r.status}`);
  return donnees;
}
