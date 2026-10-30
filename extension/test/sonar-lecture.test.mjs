// Le lecteur de l'extension face à ce que le mod sonar dépose réellement dans son pied :
// les charges sont produites par sonar/hooks/logique.mjs, pas recopiées à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chargeExtension, texteExtension, TTL } from '../../sonar/hooks/logique.mjs';

const { lireCharge, etatCache, choisir, AGE_MAX, ligneCourte, lignesDetail, absent, froid, PREFIXE, PORTEUR } = createRequire(import.meta.url)('../sonar-lecture.js');

const H = 3_600_000;
const T = Date.parse('2026-10-30T20:00:00Z');
// Heure fixe pour ne pas dépendre du fuseau de la machine de test.
const heure = (ms) => new Date(ms).toISOString().slice(11, 16);
const D = {
  quotas: [{ kind: 'seven_day', percentUsed: 95 }],
  cout: 4,
  cache: { a: T - 60_000, lu: 99, ecrit: 1, neuf: 0, modele: 'm' },
  ttlMs: TTL['1h'],
  modele: 'm',
  depot: { nom: 'mon-depot', branche: 'master', modifies: 0 },
};
const alt = (d, t = T) => texteExtension(chargeExtension(d, t));

test('contrat : préfixe et sélecteur du porteur suivent le mod', () => {
  assert.ok(alt(D).startsWith(PREFIXE));
  assert.equal(PORTEUR, `img[alt^="${PREFIXE}"]`);
});

test('charge complète du mod → lecture', () => {
  assert.deepEqual(lireCharge(alt(D)), {
    a: T,
    cache: { etat: 'chaud', expire: T - 60_000 + H, auMoins: false, taux: 0.99, autreModele: false },
    depot: { nom: 'mon-depot', branche: 'master', detachee: false, modifies: 0 },
    cout: 4,
  });
});

test('forme courte et détail, en français et en anglais', () => {
  const c = lireCharge(alt(D));
  assert.equal(ligneCourte(c, 'fr', T, heure), '🔥 cache → 20:59 · ⎇ master · 4,00 $');
  assert.equal(ligneCourte(c, 'en', T, heure), '🔥 cache → 20:59 · ⎇ master · $4.00');
  // Langue inconnue (allemand de UI+) : anglais.
  assert.equal(ligneCourte(c, 'de', T, heure), ligneCourte(c, 'en', T, heure));
  assert.deepEqual(lignesDetail(c, 'fr', T, heure), [
    ['Cache', '🔥 chaud (99 % relu, jusqu\'à 20:59)'], ['Branche', 'master (mon-depot)'], ['Coût', '4,00 $'],
  ]);
  assert.deepEqual(lignesDetail(c, 'en', T, heure), [
    ['Cache', '🔥 warm (99% reused, until 20:59)'], ['Branch', 'master (mon-depot)'], ['Cost', '$4.00'],
  ]);
});

test('le cache refroidit à l\'écran après son heure, sans nouvelle charge', () => {
  const c = lireCharge(alt(D));
  assert.equal(etatCache(c.cache, T), 'chaud');
  assert.equal(froid(c, T), false);
  const plusTard = T + H;
  assert.equal(etatCache(c.cache, plusTard), 'froid');
  assert.equal(froid(c, plusTard), true);
  assert.equal(ligneCourte(c, 'fr', plusTard, heure), '🧊 cache froid · ⎇ master · 4,00 $');
  // Durée de vie inconnue (« au moins ») : incertain une fois l'heure passée, comme le dit sonar.
  const auMoins = lireCharge(alt({ ...D, ttlMs: undefined }));
  assert.equal(ligneCourte(auMoins, 'fr', T, heure), '🔥 cache → ≥ 20:04 · ⎇ master · 4,00 $');
  assert.deepEqual(lignesDetail(auMoins, 'fr', T, heure)[0], ['Cache', '🔥 chaud (99 % relu, au moins jusqu\'à 20:04)']);
  assert.equal(etatCache(auMoins.cache, T + 10 * 60_000), 'incertain');
  // Au-delà d'une heure, froid même sans durée de vie connue (comme sonar).
  assert.equal(etatCache(auMoins.cache, T - 60_000 + H - 1), 'incertain');
  assert.equal(etatCache(auMoins.cache, T - 60_000 + H), 'froid');
});

test('choix de la charge : la plus récente des pieds affichés, rien si trop vieille', () => {
  const a = lireCharge(alt(D, T));
  const b = lireCharge(alt({ ...D, depot: { nom: 'autre', branche: 'dev', modifies: 0 } }, T + 30_000));
  assert.equal(choisir([a, null, b], T + 30_000), b);
  assert.equal(choisir([a], T + 30_000), a);
  assert.equal(choisir([], T), null);
  assert.equal(choisir([null], T), null);
  // Plus aucun pied ne la redessine : au-delà d'AGE_MAX, elle n'est plus montrée.
  assert.equal(choisir([a], T + AGE_MAX), a);
  assert.equal(choisir([a], T + AGE_MAX + 1), null);
  // Une fausse charge datée du futur ne l'emporte pas.
  const future = lireCharge(alt({ ...D, cout: 999 }, T + H));
  assert.equal(choisir([future, a], T), a);
});

test('autres formes : autre modèle, HEAD détachée, fichiers modifiés, dépôt sans branche', () => {
  assert.equal(ligneCourte(lireCharge(alt({ ...D, modele: 'autre' })), 'fr', T, heure), '🧊 cache autre modèle · ⎇ master · 4,00 $');
  const det = lireCharge(alt({ ...D, depot: { nom: 'r', detachee: true, modifies: 3 } }));
  assert.deepEqual(lignesDetail(det, 'fr', T, heure)[1], ['Branche', 'HEAD détachée (r, 3 modifiés)']);
  assert.deepEqual(lignesDetail(det, 'en', T, heure)[1], ['Branch', 'detached HEAD (r, 3 modified)']);
  const sansBranche = lireCharge(alt({ ...D, depot: { nom: 'r', modifies: 1 } }));
  assert.deepEqual(lignesDetail(sansBranche, 'fr', T, heure)[1], ['Branche', 'r (1 modifié)']);
});

test('champ absent → null ; segments désactivés dans sonar → rien à montrer', () => {
  const sansCache = lireCharge(alt({ ...D, cache: undefined }));
  assert.equal(sansCache.cache, null);
  assert.equal(ligneCourte(sansCache, 'fr', T, heure), '⎇ master · 4,00 $');
  const vide = lireCharge(alt({ quotas: [] }));
  assert.deepEqual(vide, { a: T, cache: null, depot: null, cout: null });
  assert.equal(ligneCourte(vide, 'fr', T, heure), '');
  assert.deepEqual(lignesDetail(vide, 'fr', T, heure), []);
});

test('ce qui n\'est pas une charge sonar → null', () => {
  for (const x of [undefined, null, '', '🐋 DeepSeek plonge… (12 s)', 'semaine 95 %', 'sonar:1 ', 'sonar:1 {', 'sonar:1 null',
    'sonar:1 {"cache":{"etat":"chaud"}}', 'sonar:2 {"a":1}', 42]) {
    assert.equal(lireCharge(x), null, String(x));
  }
  // Heures que Date ne sait pas écrire, ou expiration sans rapport avec le relevé.
  assert.equal(lireCharge('sonar:1 {"a":1e16}'), null);
  assert.equal(lireCharge(`sonar:1 {"a":${T},"cache":{"etat":"chaud","expire":1e16}}`).cache.expire, null);
  assert.equal(lireCharge(`sonar:1 {"a":${T},"cache":{"etat":"chaud","expire":${T + 3 * H}}}`).cache.expire, null);
  // Champs douteux écartés un par un.
  assert.deepEqual(lireCharge('sonar:1 {"a":1,"cache":{"etat":"tiède"},"depot":{"nom":""},"cout":-3}'), { a: 1, cache: null, depot: null, cout: null });
});

test('popover sans données du mod : une ligne qui dit pourquoi, en fr et en en', () => {
  assert.deepEqual(lignesDetail(null, 'fr', T), []);
  assert.match(absent('fr'), /mod sonar \(0\.5\.0 ou plus/);
  assert.match(absent('en'), /sonar mod \(0\.5\.0 or later/);
  assert.equal(absent('de'), absent('en'));
});
