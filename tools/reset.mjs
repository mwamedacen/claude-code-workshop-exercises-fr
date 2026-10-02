// Efface la base de l'application : elle est recréée (avec des réservations de démonstration)
// au prochain `npm start`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const data = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
let n = 0;
for (const f of ['ma-place.db', 'ma-place.db-journal', 'ma-place.db-wal', 'ma-place.db-shm']) {
  const p = path.join(data, f);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    n++;
  }
}
console.log(n ? 'Base effacée : elle sera recréée au prochain « npm start ».' : 'Rien à effacer.');
