// L'entreprise est à Paris : le serveur calcule toutes ses dates à l'heure de Paris,
// quel que soit le fuseau de la machine (poste Windows, Mac, Linux ou machine dans le cloud).
process.env.TZ = 'Europe/Paris';
