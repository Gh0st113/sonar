// Logique pure du mod « sonar » (hooks/logique.mjs) : node --test sonar/test/
// Le mod lui-même : `claude plugin test sonar`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rythme, niveauContexte, etatCache, deduireTtl, segments, ligne, lireStatut, nomDepot, lireCommande, lireConfig,
  pct, montant, echeance, heure, TTL, DEFAUTS, SEGMENTS,
} from '../hooks/logique.mjs';

const H = 3_600_000;
const J = 24 * H;
const T0 = Date.parse('2026-10-27T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const q7 = (utilise, resteMs) => ({ kind: 'seven_day', percentUsed: utilise, resetsAt: iso(T0 + resteMs) });
const q5 = (utilise, resteMs) => ({ kind: 'five_hour', percentUsed: utilise, resetsAt: iso(T0 + resteMs) });
const FR = lireConfig({ language: 'fr' });
const EN = lireConfig({ language: 'en', clock: '24h' });

test('config : défauts, langue auto selon la locale, valeurs invalides ignorées', () => {
  assert.deepEqual(lireConfig(), { ...DEFAUTS, langue: 'en', horloge: '24h' });
  assert.equal(lireConfig({ language: 'auto' }, 'fr-FR').langue, 'fr');
  assert.equal(lireConfig({ language: 'auto' }, 'de-DE').langue, 'en');
  assert.equal(lireConfig({ language: 'auto' }, 'en-US').horloge, '12h');
  assert.equal(lireConfig({ language: 'auto' }, 'en-GB').horloge, '24h');
  assert.equal(lireConfig({ language: 'en', clock: '24h' }, 'en-US').horloge, '24h');
  assert.deepEqual(lireConfig({ contextWarn: 60, contextAlert: 90 }).ctx, { attention: 60, alerte: 90 });
  assert.deepEqual(lireConfig({ contextWarn: 90, contextAlert: 60 }).ctx, DEFAUTS.ctx); // inversés
  assert.deepEqual(lireConfig({ quotaWarn: -5, quotaAlert: 90 }).quota, DEFAUTS.quota); // hors bornes
  assert.deepEqual(lireConfig({ segments: 'cost, context' }).segments, ['cout', 'ctx']);
  assert.deepEqual(lireConfig({ segments: 'rien' }).segments, SEGMENTS); // aucun reconnu : tout
  assert.deepEqual(lireConfig({ protectedBranches: 'Main, develop' }).branches, ['main', 'develop']);
  assert.deepEqual(lireConfig({ protectedBranches: '' }).branches, []);
  assert.equal(lireConfig({ placement: 'banner' }).emplacement, 'bandeau');
  assert.equal(lireConfig({ placement: 'nulle-part' }).emplacement, 'pied');
});

test('rythme 7 j : à l’heure, en avance, très en avance', () => {
  // mi-fenêtre (3,5 j écoulés) : attendu 50 %
  assert.equal(rythme(q7(50, 3.5 * J), T0).niveau, 'ok');
  assert.equal(rythme(q7(55, 3.5 * J), T0).niveau, 'ok'); // attendu + 5 : encore ok
  assert.equal(rythme(q7(56, 3.5 * J), T0).niveau, 'attention');
  assert.equal(rythme(q7(65, 3.5 * J), T0).niveau, 'attention'); // attendu + 15
  assert.equal(rythme(q7(66, 3.5 * J), T0).niveau, 'alerte');
  assert.equal(rythme(q7(10, 3.5 * J), T0).niveau, 'ok'); // en retard : ok
});

test('rythme : seuils réglables', () => {
  const souple = lireConfig({ paceWarn: 10, paceAlert: 30, quotaWarn: 80, quotaAlert: 95 });
  assert.equal(rythme(q7(58, 3.5 * J), T0, souple).niveau, 'ok');
  assert.equal(rythme(q7(75, 3.5 * J), T0, souple).niveau, 'attention');
  assert.equal(rythme(q7(81, 3.5 * J), T0, souple).niveau, 'alerte');
  assert.equal(rythme(q7(79, 0.2 * J), T0, souple).niveau, 'ok');
});

test('rythme : seuils absolus 70 et 90 même quand on est à l’heure', () => {
  assert.equal(rythme(q7(69, 0.2 * J), T0).niveau, 'ok');
  assert.equal(rythme(q7(70, 0.2 * J), T0).niveau, 'attention');
  assert.equal(rythme(q7(90, 0.2 * J), T0).niveau, 'alerte');
});

test('rythme : début de fenêtre (f = 0), la grâce évite une fausse alerte', () => {
  const r = rythme(q7(10, 7 * J), T0);
  assert.equal(r.part, 0);
  assert.ok(Math.abs(r.attendu - 100 / 7) < 1e-9);
  assert.equal(r.niveau, 'ok');
  assert.equal(rythme(q5(20, 5 * H), T0).niveau, 'ok'); // 5 h : 1 h de grâce = 20 %
  assert.equal(rythme(q5(26, 5 * H), T0).niveau, 'attention');
});

test('rythme : remise à l’instant ou passée', () => {
  assert.equal(rythme(q5(40, 0), T0).remis, true);
  assert.equal(rythme(q5(40, -60_000), T0).remis, true);
  assert.equal(rythme(q5(40, 1), T0).part, 1 - 1 / (5 * H));
});

test('budget par jour (7 j), « reste » sous un jour, épuisé à 100 %', () => {
  assert.equal(rythme(q7(40, 3 * J), T0).parJour, 20);
  const r = rythme(q7(80, 12 * H), T0);
  assert.equal(r.parJour, undefined);
  assert.equal(r.reste, 20);
  const e = rythme(q7(100, 2 * J), T0);
  assert.equal(e.epuise, true);
  assert.equal(e.parJour, undefined);
  assert.equal(e.niveau, 'alerte');
  assert.equal(rythme(q5(30, 2 * H), T0).parJour, undefined); // pas de budget/jour pour 5 h
});

test('quota inconnu (passerelle : spend_limit) ou sans date : seuils absolus seulement', () => {
  const r = rythme({ kind: 'spend_limit', percentUsed: 75, resetsAt: iso(T0 + 10 * J) }, T0);
  assert.equal(r.attendu, undefined);
  assert.equal(r.niveau, 'attention');
  assert.equal(rythme({ kind: 'five_hour', percentUsed: 75 }, T0).niveau, 'attention');
  assert.equal(rythme(undefined, T0), undefined);
  assert.equal(rythme({ kind: 'five_hour', percentUsed: NaN }, T0), undefined);
});

test('contexte : seuils 50 et 80, réglables', () => {
  assert.equal(niveauContexte(49), 'ok');
  assert.equal(niveauContexte(50), 'attention');
  assert.equal(niveauContexte(80), 'attention');
  assert.equal(niveauContexte(81), 'alerte');
  assert.equal(niveauContexte(undefined), undefined);
  assert.equal(niveauContexte(55, lireConfig({ contextWarn: 60, contextAlert: 90 })), 'ok');
});

test('cache à durée connue : chaud puis froid, autre modèle, rien avant une lecture/écriture', () => {
  const d = { a: T0, lu: 90, ecrit: 5, neuf: 5, modele: 'claude-opus-5-5' };
  const c = etatCache(d, TTL['1h'], T0 + H - 1, 'claude-opus-5-5');
  assert.equal(c.etat, 'chaud');
  assert.equal(c.taux, 0.9);
  assert.equal(etatCache(d, TTL['1h'], T0 + H, 'claude-opus-5-5').etat, 'froid');
  assert.equal(etatCache(d, TTL['5m'], T0 + 5 * 60_000).etat, 'froid');
  const autre = etatCache(d, TTL['1h'], T0 + 1000, 'claude-haiku-5-5');
  assert.equal(autre.etat, 'froid');
  assert.equal(autre.autreModele, true);
  assert.equal(etatCache({ a: T0, lu: 0, ecrit: 0, neuf: 0 }, TTL['1h'], T0).etat, 'rien');
  assert.equal(etatCache(undefined, TTL['1h'], T0), undefined);
});

test('cache à durée inconnue : chaud 5 min (au moins), incertain jusqu’à 1 h, froid ensuite', () => {
  const d = { a: T0, lu: 90, ecrit: 5, neuf: 5 };
  const c = etatCache(d, undefined, T0 + 60_000);
  assert.equal(c.etat, 'chaud');
  assert.equal(c.auMoins, true);
  assert.equal(c.expire, T0 + 5 * 60_000);
  assert.equal(etatCache(d, undefined, T0 + 10 * 60_000).etat, 'incertain');
  assert.equal(etatCache(d, undefined, T0 + H).etat, 'froid');
});

test('durée de vie déduite', () => {
  const avant = { a: T0, lu: 10, ecrit: 10, neuf: 1, modele: 'm' };
  assert.equal(deduireTtl(avant, { a: T0 + 10 * 60_000, lu: 500, ecrit: 2, neuf: 1, modele: 'm' }), '1h');
  assert.equal(deduireTtl(avant, { a: T0 + 10 * 60_000, lu: 0, ecrit: 500, neuf: 1, modele: 'm' }), '5m');
  assert.equal(deduireTtl(avant, { a: T0 + 4 * 60_000, lu: 0, ecrit: 500, neuf: 1, modele: 'm' }), undefined); // trop court
  assert.equal(deduireTtl(avant, { a: T0 + 2 * H, lu: 0, ecrit: 500, neuf: 1, modele: 'm' }), undefined); // froid de toute façon
  assert.equal(deduireTtl(avant, { a: T0 + 2 * H, lu: 500, ecrit: 0, neuf: 1, modele: 'm' }), undefined); // incohérent, ignoré
  assert.equal(deduireTtl(avant, { a: T0 + 10 * 60_000, lu: 500, ecrit: 2, neuf: 1, modele: 'autre' }), undefined);
  assert.equal(deduireTtl(undefined, avant), undefined);
});

test('git : statut porcelain', () => {
  assert.deepEqual(lireStatut('## main...origin/main [ahead 1]\n M a.js\n?? b.js\n'), { branche: 'main', modifies: 2 });
  assert.deepEqual(lireStatut('## feat/x\n'), { branche: 'feat/x', modifies: 0 });
  assert.deepEqual(lireStatut('## No commits yet on main\n'), { branche: 'main', modifies: 0 });
  assert.deepEqual(lireStatut('## HEAD (no branch)\n'), { detachee: true, modifies: 0 });
  assert.deepEqual(lireStatut('## main\r\n M a.js\r\n'), { branche: 'main', modifies: 1 });
  assert.equal(lireStatut(undefined), undefined);
});

test('nom du dépôt', () => {
  assert.equal(nomDepot('git@github.com:octo/sonar.git', '/x'), 'sonar');
  assert.equal(nomDepot('https://github.com/a/b-c.git', undefined), 'b-c');
  assert.equal(nomDepot(undefined, 'C:\\Users\\x\\Code\\projet-a'), 'projet-a');
  assert.equal(nomDepot(undefined, 'C:/Users/x/Code/projet-b/'), 'projet-b');
  assert.equal(nomDepot(undefined, undefined), undefined);
});

test('commande /sonar, en français et en anglais', () => {
  assert.deepEqual(lireCommande(''), { aide: true });
  assert.deepEqual(lireCommande(' Bandeau '), { emplacement: 'bandeau' });
  assert.deepEqual(lireCommande('banner'), { emplacement: 'bandeau' });
  assert.deepEqual(lireCommande('footer'), { emplacement: 'pied' });
  assert.deepEqual(lireCommande('ttl 5m'), { ttl: '5m' });
  assert.deepEqual(lireCommande('masquer'), { masque: true });
  assert.deepEqual(lireCommande('hide'), { masque: true });
  assert.deepEqual(lireCommande('show'), { masque: false });
  assert.equal(lireCommande('ttl 10m').erreur, 'ttl 10m');
  assert.ok(lireCommande('pied bandeau').erreur);
});

test('formats selon la langue et l’horloge', () => {
  assert.equal(pct(34), '34');
  assert.equal(pct(33.6), '34');
  assert.equal(pct(0.5, FR), '0,5');
  assert.equal(pct(0.5, EN), '0.5');
  assert.equal(montant(1.234, FR), '1,23 $');
  assert.equal(montant(1.234, EN), '$1.23');
  const maintenant = new Date(2026, 9, 27, 10, 0).getTime();
  assert.equal(echeance(new Date(2026, 9, 27, 14, 5).getTime(), maintenant, FR), '14:05');
  assert.equal(echeance(new Date(2026, 10, 2, 9, 0).getTime(), maintenant, FR), 'lun. 09:00');
  assert.equal(echeance(new Date(2026, 10, 2, 9, 0).getTime(), maintenant, EN), 'Mon 09:00');
  const us = lireConfig({ language: 'en', clock: '12h' });
  assert.equal(heure(new Date(2026, 9, 27, 14, 5).getTime(), us), '2:05 PM');
  assert.equal(heure(new Date(2026, 9, 27, 0, 7).getTime(), us), '12:07 AM');
});

const TOUT = {
  contexte: 34, quotas: [q7(41, 3 * J), q5(23, 2 * H)], cout: 1.234,
  cache: { a: T0 - 60_000, lu: 92, ecrit: 4, neuf: 4, modele: 'm' }, ttlMs: TTL['1h'], modele: 'm',
  depot: { nom: 'projet-a', branche: 'feat/x', modifies: 3 },
};

test('segments (fr) : tout présent, 5 h avant 7 j, sans « undefined » ni « NaN »', () => {
  const segs = segments(TOUT, T0, FR);
  assert.deepEqual(segs.map((s) => s.cle), ['ctx', 'five_hour', 'seven_day', 'cache', 'depot', 'cout']);
  const t = ligne(segs);
  assert.doesNotMatch(t, /undefined|NaN/);
  assert.match(t, /^ctx 34 % · 5 h 23 % → \d\d:\d\d · 7 j 41 % ≈ 20 %\/j → \S+ \d\d:\d\d · cache 🔥 92 % → \d\d:\d\d · projet-a ⎇ feat\/x ●3 · 💰 1,23 \$$/);
});

test('segments (en)', () => {
  const t = ligne(segments(TOUT, T0, EN));
  assert.match(t, /^ctx 34% · 5h 23% → \d\d:\d\d · 7d 41% ≈ 20%\/d → [A-Z][a-z]{2} \d\d:\d\d · cache 🔥 92% → \d\d:\d\d · projet-a ⎇ feat\/x ●3 · 💰 \$1\.23$/);
});

test('segments : choix et ordre fixe, branches protégées réglables', () => {
  const cfg = lireConfig({ language: 'fr', segments: 'cost,context', protectedBranches: 'develop' });
  assert.equal(ligne(segments(TOUT, T0, cfg)), 'ctx 34 % · 💰 1,23 $');
  const dev = segments({ quotas: [], depot: { nom: 'p', branche: 'develop', modifies: 0 } }, T0, cfg);
  assert.equal(dev.length, 0); // dépôt désactivé
  const avecDepot = lireConfig({ language: 'fr', protectedBranches: 'develop' });
  assert.equal(ligne(segments({ quotas: [], depot: { nom: 'p', branche: 'develop', modifies: 0 } }, T0, avecDepot)), '⚠️ p ⎇ develop');
  assert.equal(ligne(segments({ quotas: [], depot: { nom: 'p', branche: 'main', modifies: 0 } }, T0, avecDepot)), 'p ⎇ main');
});

test('segments : rien de connu, quota remis, épuisé, tête détachée, cache incertain, budget de passerelle', () => {
  assert.deepEqual(segments({ quotas: [] }, T0, FR), []);
  const s = segments({ quotas: [q5(40, -1)], depot: { nom: 'pz', branche: 'main', modifies: 0 } }, T0, FR);
  assert.equal(ligne(s), '5 h ↺ remis à zéro · ⚠️ pz ⎇ main');
  assert.equal(s[1].niveau, 'attention');
  assert.equal(ligne(segments({ contexte: 85, quotas: [q7(100, 2 * J)] }, T0, FR)), `⚠️ ctx 85 % · ⚠️ 7 j épuisé → ${echeance(T0 + 2 * J, T0, FR)}`);
  assert.equal(ligne(segments({ quotas: [], depot: { nom: 'p', detachee: true, modifies: 1 } }, T0, EN)), 'p ⎇ detached HEAD ●1');
  assert.equal(ligne(segments({ quotas: [], cache: { a: T0, lu: 9, ecrit: 1, neuf: 0 } }, T0 + 10 * 60_000, FR)), 'cache ❔ incertain');
  assert.match(ligne(segments({ quotas: [], cache: { a: T0, lu: 9, ecrit: 1, neuf: 0 } }, T0 + 60_000, EN)), /^cache 🔥 90% → ≥ \d\d:\d\d$/);
  const passerelle = segments({ quotas: [{ kind: 'spend_limit', percentUsed: 62.8, resetsAt: iso(T0 + 10 * J) }] }, T0, EN);
  assert.match(ligne(passerelle), /^budget 63% → \d{1,2}\/\d{1,2}$/); // > 6 jours : la date
  assert.deepEqual(lireConfig({ contextWarn: 60 }).ctx, { attention: 60, alerte: 80 }); // un seul champ donné
});
