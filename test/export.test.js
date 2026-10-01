import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrer } from '../server/index.js';

test("l'export ne contient ni nom ni e-mail", async () => {
  const s = await demarrer({ port: 0, db: ':memory:', maintenant: '2026-10-07T09:05' });
  try {
    const csv = await (await fetch(s.url + '/api/export.csv')).text();
    assert.match(csv.split('\n')[0], /employe;equipe/);
    assert.doesNotMatch(csv, /@/);
    assert.doesNotMatch(csv, /Camille|Martin/);
  } finally {
    await s.fermer();
  }
});
