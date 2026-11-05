// Logique pure du mod « sonar » (hooks/logique.mjs) : node --test mod/test/
// Le mod lui-même : `claude plugin test mod`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rythme, etatCache, deduireTtl, elementsPied, jauges, ligne, lireStatut, nomDepot, lireCommande, lireConfig,
  pct, montant, echeance, heure, TTL, DEFAUTS, SEGMENTS,
  releve, ajouterReleve, dernierReleve, cheminJournal, cheminArchive, isoUtc, majJournal, besoinMaison, TAILLE_MAX_JOURNAL,
  chargeExtension, texteExtension, PREFIXE_EXTENSION, derniereReponse, brancheCourte, SEP_PIED, MARGE_ENVOI_MS, dossierProjet,
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
  assert.deepEqual(lireConfig({ quotaWarn: -5, quotaAlert: 90 }).quota, DEFAUTS.quota); // hors bornes
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
  quotas: [q7(41, 3 * J), q5(23, 2 * H)], cout: 1.234,
  cache: { a: T0 - 60_000, lu: 92, ecrit: 4, neuf: 4, modele: 'm' }, ttlMs: TTL['1h'], modele: 'm',
  depot: { nom: 'projet-a', branche: 'feat/x', modifies: 3 },
};
// Symboles de l'ancien affichage : plus aucun dans les jauges (le pied, lui, montre 🔥 ❄️ ❔ ⎇ et « · »).
const SYMBOLES = /[⚠🔥❄❔⎇●→≈↺·]/u;
const pied = (d, cfg = FR, m = T0) => ligne(elementsPied(d, m, cfg), SEP_PIED);

test('pied : cas normal = icône du cache et coût, puis la branche ; jamais la semaine', () => {
  assert.deepEqual(elementsPied(TOUT, T0, FR), [
    { cle: 'cache', etiquette: '', valeur: '🔥 1,23 $', niveau: 'ok' },
    { cle: 'depot', etiquette: '⎇', valeur: 'x', niveau: 'ok' },
  ]);
  assert.equal(pied(TOUT), '🔥 1,23 $ · ⎇ x');
  assert.equal(pied({ ...TOUT, depot: { nom: 'p', branche: 'master', modifies: 0 } }, EN), '🔥 $1.23 · ⎇ master');
  // Cible : environ 25 caractères dans le cas normal.
  assert.ok([...pied({ ...TOUT, cout: 2.4, depot: { nom: 'p', branche: 'claude/mod-pied-cache-79d924', modifies: 2 } })].length <= 25);
});

test('pied : 5 h rapide en tête, icônes du cache, branche raccourcie ; la semaine jamais, même en alerte', () => {
  // 5 h : 3 h écoulées, rythme régulier 60 % ; 70 % = +10 (rapide, orange), 64 % = +4 (rien), remis : rien.
  assert.equal(pied({ quotas: [q5(70, 2 * H)] }), '5 h rapide');
  assert.equal(elementsPied({ quotas: [q5(80, 2 * H)] }, T0, FR)[0].niveau, 'attention');
  assert.deepEqual(elementsPied({ quotas: [q5(64, 2 * H)] }, T0, FR), []);
  assert.deepEqual(elementsPied({ quotas: [q5(40, -1)] }, T0, FR), []);
  assert.equal(pied({ quotas: [q5(95, 4.5 * H)] }, EN), '5h fast');
  // La semaine, même à 95 % ou épuisée : jamais au pied.
  assert.deepEqual(elementsPied({ quotas: [q7(95, 3 * J)] }, T0, FR), []);
  assert.deepEqual(elementsPied({ quotas: [q7(100, 2 * J), { kind: 'spend_limit', percentUsed: 92 }] }, T0, FR), []);
  // Ordre : 5 h, cache + coût, branche.
  const tout = { ...TOUT, quotas: [q7(95, 3 * J), q5(80, 2 * H)], depot: { nom: 'p', branche: 'main', modifies: 0 } };
  assert.equal(pied(tout), '5 h rapide · 🔥 1,23 $ · ⎇ main');
  // Branche protégée en orange, les autres sans couleur.
  assert.deepEqual(elementsPied(tout, T0, FR).map((x) => x.niveau), ['attention', 'ok', 'attention']);
  // Cache : froid ❄️ et incertain ❔ en orange ; autre modèle = froid ; rien si inconnu ou sans lecture/écriture.
  const sans = { cout: 2.4 };
  const froid = elementsPied({ ...sans, cache: { a: T0 - 2 * H, lu: 9, ecrit: 1, neuf: 0, modele: 'm' } }, T0, FR)[0];
  assert.deepEqual(froid, { cle: 'cache', etiquette: '', valeur: '❄️ 2,40 $', niveau: 'attention' });
  assert.equal(pied({ ...sans, cache: { a: T0 - 30 * 60_000, lu: 9, ecrit: 1, neuf: 0 } }), '❔ 2,40 $');
  assert.equal(pied({ ...sans, cache: { a: T0 - 60_000, lu: 9, ecrit: 1, neuf: 0, modele: 'a' }, modele: 'b' }), '❄️ 2,40 $');
  assert.equal(pied({ ...sans, cache: { a: T0, lu: 0, ecrit: 0, neuf: 5 } }), '2,40 $');
  assert.equal(pied(sans), '2,40 $');
  // Sans coût : l'icône seule ; ni l'un ni l'autre : rien.
  assert.equal(pied({ cache: TOUT.cache, ttlMs: TTL['1h'], modele: 'm' }), '🔥');
  assert.deepEqual(elementsPied({}, T0, FR), []);
  // Branche : tête détachée, hors dépôt.
  assert.equal(pied({ depot: { nom: 'p', detachee: true, modifies: 0 } }), '⎇ détachée');
  assert.equal(pied({ depot: { nom: 'p', detachee: true, modifies: 0 } }, EN), '⎇ detached');
  assert.deepEqual(elementsPied({ depot: undefined }, T0, FR), []);
  // Segments désactivés : retirés un à un.
  assert.deepEqual(elementsPied(tout, T0, lireConfig({ language: 'fr', segments: 'quotas' })).map((x) => x.cle), ['five_hour']);
  assert.equal(pied(tout, lireConfig({ language: 'fr', segments: 'cache,repo' })), '🔥 · ⎇ main');
  assert.equal(pied(tout, lireConfig({ language: 'fr', segments: 'cost' })), '1,23 $');
});

test('dossier du projet sous projects/ : le chemin, hors [A-Za-z0-9] remplacé par « - »', () => {
  assert.equal(dossierProjet('C:\\Code\\projet-a'), 'C--Code-projet-a');
  assert.equal(dossierProjet('/home/user/sonar'), '-home-user-sonar');
  assert.equal(dossierProjet('D:/Données/été 2026'), 'D--Donn-es--t--2026');
  assert.equal(dossierProjet(''), undefined);
  assert.equal(dossierProjet(undefined), undefined);
});

test('pied : nom de branche raccourci', () => {
  assert.equal(brancheCourte('claude/mod-pied-cache-79d924'), 'mod-pied-ca…');
  assert.equal(brancheCourte('master'), 'master');
  assert.equal(brancheCourte('feat/x'), 'x');
  assert.equal(brancheCourte('fix/ab-1234567890ab'), 'ab');
  assert.equal(brancheCourte('fonctionnalité-très-longue'), 'fonctionnal…');
  assert.equal(brancheCourte('abc-123'), 'abc-123'); // moins de 6 caractères d'empreinte : gardé
  assert.equal(brancheCourte('deadbeef'), 'deadbeef'); // pas de tiret : rien à retirer
  assert.equal(brancheCourte('fix/new-facade'), 'new-facade'); // un mot en lettres a à f, sans chiffre : gardé
  assert.equal(brancheCourte('a/'), 'a');
  assert.equal(brancheCourte(''), undefined);
  assert.equal(brancheCourte(undefined), undefined);
  assert.equal([...brancheCourte('x'.repeat(40))].length, 12);
});

test('jauges (fr) : tout le détail, sans contexte ni anciens symboles', () => {
  const j = jauges(TOUT, T0, FR);
  assert.deepEqual(j.map((x) => x.cle), ['five_hour', 'seven_day', 'cache', 'depot', 'cout']);
  const t = ligne(j);
  assert.doesNotMatch(t, /undefined|NaN|ctx|contexte/);
  assert.doesNotMatch(t, SYMBOLES);
  assert.match(t, /^5 h 23 % \(remise \d\d:\d\d\) {3}semaine 41 % \(20 %\/j, remise \S+ \d\d:\d\d\) {3}cache chaud \(92 % relu, jusqu'à \d\d:\d\d\) {3}branche feat\/x \(projet-a, 3 modifiés\) {3}coût 1,23 \$$/);
  // Jauge = usage ; repère = part de fenêtre écoulée ; cache = temps qu'il lui reste ; pas de jauge pour la branche.
  assert.equal(j[0].part, 0.23);
  assert.ok(Math.abs(j[0].repere - 0.6) < 1e-9);
  assert.ok(Math.abs(j[1].repere - 4 / 7) < 1e-9);
  assert.ok(Math.abs(j[2].part - 59 / 60) < 1e-9);
  assert.equal(j[3].part, undefined);
});

test('jauges (en) et cas limites', () => {
  assert.match(ligne(jauges(TOUT, T0, EN)), /^5h 23% \(resets \d\d:\d\d\) {3}week 41% \(20%\/d, resets [A-Z][a-z]{2} \d\d:\d\d\) {3}cache warm \(92% reused, until \d\d:\d\d\) {3}branch feat\/x \(projet-a, 3 modified\) {3}cost \$1\.23$/);
  assert.equal(ligne(jauges({ quotas: [q5(40, -1)] }, T0, FR)), '5 h remis à zéro');
  assert.equal(jauges({ quotas: [q5(40, -1)] }, T0, FR)[0].part, 0);
  assert.equal(ligne(jauges({ quotas: [], depot: { nom: 'p', detachee: true, modifies: 1 } }, T0, EN)), 'branch detached HEAD (p, 1 modified)');
  assert.equal(ligne(jauges({ quotas: [], depot: { nom: 'p', modifies: 0 } }, T0, FR)), 'branche p');
  assert.equal(ligne(jauges({ quotas: [], cache: { a: T0, lu: 9, ecrit: 1, neuf: 0 } }, T0 + 10 * 60_000, FR)), 'cache incertain');
  assert.match(ligne(jauges({ quotas: [], cache: { a: T0, lu: 9, ecrit: 1, neuf: 0 } }, T0 + 60_000, FR)), /^cache chaud \(90 % relu, au moins jusqu'à \d\d:\d\d\)$/);
  assert.equal(ligne(jauges({ quotas: [], cache: { a: T0, lu: 9, ecrit: 1, neuf: 0, modele: 'a' }, modele: 'b' }, T0, FR)), 'cache autre modèle');
  assert.match(ligne(jauges({ quotas: [{ kind: 'spend_limit', percentUsed: 62.8, resetsAt: iso(T0 + 10 * J) }] }, T0, EN)), /^budget 63% \(resets \d{1,2}\/\d{1,2}\)$/);
  assert.match(ligne(jauges({ quotas: [q7(97, 0.5 * J)] }, T0, FR)), /^semaine 97 % \(reste 3 %, remise .+\)$/);
  assert.deepEqual(jauges({ quotas: [] }, T0, FR), []);
  // « context » dans l'option segments est ignoré : le contexte n'est affiché nulle part.
  assert.deepEqual(lireConfig({ segments: 'cost, context' }).segments, ['cout']);
});

test('journal des quotas : format de ligne, fenêtre absente omise, heure de remise en ISO UTC', () => {
  const ts = Date.parse('2026-10-27T22:42:00Z');
  const quotas = [
    { kind: 'seven_day', percentUsed: 67, resetsAt: '2026-11-01T10:00:00.000Z' },
    { kind: 'five_hour', percentUsed: 66, resetsAt: '2026-10-27T23:00:00Z' },
    { kind: 'spend_limit', percentUsed: 12 }, // hors journal
  ];
  assert.equal(JSON.stringify(releve(quotas, ts)),
    '{"ts":"2026-10-27T22:42:00.000Z","five_hour":{"pct":66,"resets_at":"2026-10-27T23:00:00Z"},"seven_day":{"pct":67,"resets_at":"2026-11-01T10:00:00Z"}}');
  // Heure de remise donnée avec un fuseau : ramenée en UTC.
  assert.equal(releve([{ kind: 'five_hour', percentUsed: 5, resetsAt: '2026-10-28T01:00:00+02:00' }], ts).five_hour.resets_at, '2026-10-27T23:00:00Z');
  // Une seule fenêtre : l'autre est absente ; heure de remise illisible : champ omis.
  assert.deepEqual(releve([{ kind: 'seven_day', percentUsed: 12.5, resetsAt: 'n/a' }], ts), { ts: '2026-10-27T22:42:00.000Z', seven_day: { pct: 12.5 } });
  // Rien de lisible : pas de relevé.
  assert.equal(releve([], ts), undefined);
  assert.equal(releve([{ kind: 'five_hour', percentUsed: NaN }, { kind: 'spend_limit', percentUsed: 3 }], ts), undefined);
  assert.equal(releve(undefined, ts), undefined);
});

test('journal des quotas : une ligne seulement quand le % ou l’heure de remise change', () => {
  const r = (p5, p7, h7 = '2026-11-01T10:00:00Z', ts = T0) => releve([q5(p5, 2 * H), { kind: 'seven_day', percentUsed: p7, resetsAt: h7 }], ts);
  const a = ajouterReleve('', r(10, 40));
  assert.equal(a.split('\n').length, 2); // une ligne + fin de ligne
  assert.equal(ajouterReleve(a, r(10, 40, undefined, T0 + 60_000)), undefined); // même chiffres, autre heure : rien
  const b = ajouterReleve(a, r(11, 40));
  assert.equal(b.split('\n').filter(Boolean).length, 2);
  assert.equal(ajouterReleve(b, r(11, 40, '2026-11-08T10:00:00Z')).split('\n').filter(Boolean).length, 3); // remise déplacée
  // Une fenêtre qui disparaît est un changement.
  assert.ok(ajouterReleve(b, releve([q5(11, 2 * H)], T0)));
  // Fichier sans fin de ligne, ou dernière ligne abîmée (écriture coupée) : on compare à la dernière ligne lisible.
  assert.equal(ajouterReleve(a.trimEnd(), r(12, 40)).split('\n').filter(Boolean).length, 2);
  assert.equal(ajouterReleve(`${a}{"ts":"2026-`, r(10, 40)), undefined);
  assert.equal(dernierReleve('pas du json\n\n'), undefined);
  assert.equal(ajouterReleve('x', undefined), undefined);
});

test('journal des quotas : archive quand l’ajout dépasserait 3 Mio, jamais pour un relevé inchangé', () => {
  const r = (p) => releve([q5(p, 2 * H)], T0);
  const ligneDe = (p) => `${JSON.stringify(r(p))}\n`;
  assert.deepEqual(majJournal('', r(1)), { texte: ligneDe(1) });
  assert.equal(majJournal(ligneDe(1), r(1)), undefined);
  // Juste sous la limite : l'ajout la dépasserait → archive de l'ancien texte, le journal repart de la nouvelle ligne.
  const plein = `${'#'.repeat(TAILLE_MAX_JOURNAL - ligneDe(1).length - 10)}\n${ligneDe(1)}`;
  assert.deepEqual(majJournal(plein, r(2)), { archive: plein, texte: ligneDe(2) });
  // Plein mais rien de nouveau : ni archive ni doublon dans un journal neuf.
  assert.equal(majJournal(plein, r(1)), undefined);
  // Un journal court reste en place.
  assert.deepEqual(majJournal(ligneDe(1), r(2)), { texte: ligneDe(1) + ligneDe(2) });
});

test('journal des quotas : chemin du fichier et de l’archive', () => {
  assert.equal(cheminJournal('', 'C:\\Users\\moi'),'C:/Users/moi/.claude/sonar/quota-log.jsonl');
  assert.equal(cheminJournal('  ', '/home/moi/'), '/home/moi/.claude/sonar/quota-log.jsonl');
  assert.equal(cheminJournal('~/notes/q.jsonl', '/home/moi'), '/home/moi/notes/q.jsonl');
  assert.equal(cheminJournal('D:\\data\\q.jsonl',undefined), 'D:/data/q.jsonl');
  assert.equal(cheminJournal('', undefined), undefined); // dossier personnel inconnu : pas de journal
  assert.equal(cheminArchive('C:/u/.claude/sonar/quota-log.jsonl', Date.parse('2026-10-27T22:42:00Z')), 'C:/u/.claude/sonar/quota-log.2026-10-27T224200Z.jsonl');
  assert.equal(cheminArchive('/a.b/journal', Date.parse('2026-10-27T22:42:00Z')), '/a.b/journal.2026-10-27T224200Z');
  assert.equal(isoUtc('n/a'), undefined);
  assert.equal(cheminJournal('', '/'), '/.claude/sonar/quota-log.jsonl'); // dossier personnel à la racine
  assert.equal(cheminJournal('~', '/home/moi'), '/home/moi');
  // Le dossier personnel n'est demandé que s'il sert.
  assert.deepEqual(['', ' ', '~', '~/q.jsonl', '~\\q.jsonl', 'D:/q.jsonl', '/var/q.jsonl', '~moi/q'].map(besoinMaison),
    [true, true, true, true, true, false, false, false]);
  // Désactivé par défaut : un chemin seul ne l'active pas.
  assert.equal(lireConfig().journal, null);
  assert.equal(lireConfig({ quotaLogPath: 'D:/q.jsonl' }).journal, null);
  assert.equal(lireConfig({ quotaLog: true }).journal, '');
  assert.equal(lireConfig({ quotaLog: true, quotaLogPath: 'D:/q.jsonl' }).journal, 'D:/q.jsonl');
});

test('données pour l\'extension : sans langue, segments respectés', () => {
  const T = Date.parse('2026-10-30T20:00:00Z');
  const d = {
    quotas: [{ kind: 'seven_day', percentUsed: 41 }],
    cout: 4.004,
    cache: { a: T - 60_000, lu: 99, ecrit: 1, neuf: 0, modele: 'm' },
    ttlMs: TTL['1h'],
    modele: 'm',
    depot: { nom: 'mon-depot', branche: 'master', modifies: 2 },
  };
  const c = chargeExtension(d, T);
  assert.deepEqual(c, {
    a: T,
    cache: { etat: 'chaud', expire: T - 60_000 + H, taux: 0.99 },
    depot: { nom: 'mon-depot', modifies: 2, branche: 'master' },
    cout: 4,
  });
  assert.equal(texteExtension(c), PREFIXE_EXTENSION + JSON.stringify(c));
  assert.ok(texteExtension(c).startsWith('sonar:1 {'));
  // Durée de vie inconnue : « au moins » ; autre modèle ; HEAD détachée ; rien sans mesure.
  assert.deepEqual(chargeExtension({ ...d, ttlMs: undefined }, T).cache, { etat: 'chaud', expire: T - 60_000 + 5 * 60_000, auMoins: true, taux: 0.99 });
  assert.deepEqual(chargeExtension({ ...d, modele: 'autre' }, T).cache, { etat: 'froid', autreModele: true });
  assert.deepEqual(chargeExtension({ ...d, depot: { nom: 'r', detachee: true, modifies: 0 } }, T).depot, { nom: 'r', modifies: 0, detachee: true });
  assert.deepEqual(chargeExtension({ quotas: [] }, T), { a: T });
  // Segments désactivés : absents.
  assert.deepEqual(chargeExtension(d, T, { ...DEFAUTS, segments: ['quotas', 'cout'] }), { a: T, cout: 4 });
});

// Journal de session tel que Claude Code l'écrit : une ligne JSON par événement, un bloc de réponse par ligne,
// la requête envoyée (`api-request`) reliée à sa réponse par `requestRef`.
const ts = (ms) => new Date(ms).toISOString();
const usage = (lu, ecrit, h1 = ecrit, m5 = 0) => ({
  input_tokens: 4, cache_read_input_tokens: lu, cache_creation_input_tokens: ecrit, output_tokens: 9,
  cache_creation: { ephemeral_1h_input_tokens: h1, ephemeral_5m_input_tokens: m5 },
});
const rep = (id, a, u, extra = {}) => JSON.stringify({ type: 'assistant', isSidechain: false, requestRef: `r-${id}`, timestamp: ts(a), message: { id, model: 'claude-x', role: 'assistant', usage: u }, ...extra });
const req = (id, a) => JSON.stringify({ type: 'api-request', id: `r-${id}`, timestamp: ts(a), params: {} });
const util = (a, texte = 'question') => JSON.stringify({ type: 'user', isSidechain: false, timestamp: ts(a), message: { role: 'user', content: texte } });
const jsonl = (...l) => `${l.join('\n')}\n`;

test('session ouverte avant le mod : dernière réponse du fil principal lue dans son journal', () => {
  const t = jsonl(
    util(T0 - 3 * H), req('m1', T0 - 3 * H + 1000), rep('m1', T0 - 3 * H + 5000, usage(10, 90)),
    util(T0 - 2 * H), req('m2', T0 - 2 * H + 500),
    rep('m2', T0 - 2 * H + 3000, usage(900, 50)),
    // Un résultat d'outil s'intercale entre deux blocs de la même réponse.
    util(T0 - 2 * H + 4000, 'résultat'),
    rep('m2', T0 - 2 * H + 9000, usage(900, 50)),
    JSON.stringify({ type: 'system', subtype: 'turn_duration', timestamp: ts(T0 - 2 * H + 9500) }),
    // Un sous-agent plus récent : son cache n'est pas celui du fil principal.
    rep('s1', T0 - H, usage(5, 5), { isSidechain: true }),
    // Réponse « synthétique » (erreur d'API) : ignorée.
    JSON.stringify({ type: 'assistant', isSidechain: false, timestamp: ts(T0 - H), message: { id: 'x', model: '<synthetic>', usage: usage(0, 0) } }),
  );
  // L'heure retenue est celle de l'envoi de la requête : c'est de là que court le cache.
  assert.deepEqual(derniereReponse(t), { reponse: { a: T0 - 2 * H + 500, lu: 900, ecrit: 50, neuf: 4, modele: 'claude-x' }, ttl: '1h' });
  // Sans ligne de requête : le 1er bloc, malgré le résultat d'outil intercalé, moins la marge de prudence.
  const sansRequete = t.split('\n').filter((l) => !l.includes('"api-request"')).join('\n');
  assert.equal(derniereReponse(sansRequete).reponse.a, T0 - 2 * H + 3000 - MARGE_ENVOI_MS);
  // Une requête datée après la réponse (incohérente) est ignorée.
  assert.equal(derniereReponse(jsonl(rep('m', T0, usage(1, 1)), req('m', T0 + 5000))).reponse.a, T0 - MARGE_ENVOI_MS);
  // Un message de l'utilisateur qui cite « "type":"assistant" » ne trompe pas la remontée.
  const piege = jsonl(rep('m2', T0 - 60_000, usage(1, 1)), util(T0 - 30_000, '"type":"assistant"'), req('m3', T0 - 12_000), rep('m3', T0 - 10_000, usage(7, 0, 0, 0)));
  assert.deepEqual(derniereReponse(piege), { reponse: { a: T0 - 12_000, lu: 7, ecrit: 0, neuf: 4, modele: 'claude-x' } });
  // Écriture sur 5 min ; dernière ligne coupée (écriture en cours) ignorée ; fins de ligne Windows.
  assert.equal(derniereReponse(`${rep('m', T0, usage(0, 40, 0, 40))}\r\n{"type":"assis`).ttl, '5m');
  // Une compaction après la dernière réponse : l'ancien cache ne sert plus.
  assert.equal(derniereReponse(jsonl(rep('m', T0 - H, usage(1, 1)), JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: ts(T0) }))), undefined);
  // Une compaction plus ancienne ne gêne pas.
  assert.equal(derniereReponse(jsonl(JSON.stringify({ type: 'system', subtype: 'compact_boundary' }), util(T0 - H), rep('m', T0, usage(3, 0)))).reponse.lu, 3);
  // Rien d'exploitable.
  assert.equal(derniereReponse(''), undefined);
  assert.equal(derniereReponse(undefined), undefined);
  assert.equal(derniereReponse(jsonl(util(T0), 'pas du json')), undefined);
  // Ce que la lecture donne s'affiche comme une réponse vue en direct.
  const { reponse } = derniereReponse(t);
  assert.equal(chargeExtension({ cache: reponse, ttlMs: TTL['1h'] }, T0 - 2 * H + 60_000, FR).cache.etat, 'chaud');
});
