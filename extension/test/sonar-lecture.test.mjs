import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { decoder } from './mini-dom.mjs';

const { lireSonar, masquer, suivre, ligneCourte, lignesDetail, froid } = createRequire(import.meta.url)('../sonar-lecture.js');

const releve = readFileSync(new URL('fixtures/bandeau-sonar-shadow.fr.html', import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
// Comme widget.js (hostText) : un bloc div par ligne.
const parBlocs = decoder(releve.replace(/<\/?div\b[^>]*>/g, '\n').replace(/<[^>]+>/g, ''));
// Balises simplement retirées : tout le texte d'un bloc, sans séparateur entre les segments.
const brut = decoder(releve.replace(/<[^>]+>/g, ''));

const ATTENDU = { cache: { etat: 'chaud', relu: 99, jusqua: '21:03' }, branche: 'master', depot: 'mon-depot', cout: '4,00 $' };
const BALEINE = '🐋 DeepSeek plonge… (12 s)';

test('le relevé fr du bandeau, balises retirées', () => {
  assert.match(brut, /\(mon-depot\)coût 4,00 \$/, 'segments collés dans le texte brut');
  assert.deepEqual(lireSonar(brut), ATTENDU);
  assert.deepEqual(lireSonar(parBlocs), ATTENDU);
});

test('variante anglaise', () => {
  const texte = ['5h 54% (resets 20:50)', 'week 95% (3.1%/d, resets Sun 11:00)', 'cache warm (99% reused, until 9:03 PM)',
    'branch main (my-repo, 2 modified)', 'cost $12.50'].join('\n');
  assert.deepEqual(lireSonar(texte), { cache: { etat: 'chaud', relu: 99, jusqua: '9:03 PM' }, branche: 'main', depot: 'my-repo', cout: '$12.50' });
  assert.deepEqual(lireSonar('cache cold\nbranch my-repo'), { cache: { etat: 'froid', relu: null, jusqua: null }, branche: null, depot: 'my-repo', cout: null });
});

test('champ absent → null', () => {
  const sansCache = parBlocs.replace(/cache chaud[^\n]*/, '');
  assert.deepEqual(lireSonar(sansCache), { ...ATTENDU, cache: null });
  assert.deepEqual(lireSonar('5 h 54 % (remise 20:50)'), { cache: null, branche: null, depot: null, cout: null });
});

test('autres formes de sonar', () => {
  const auMoins = lireSonar('cache chaud (au moins jusqu’à 21:03)');
  assert.deepEqual(auMoins.cache, { etat: 'chaud', relu: null, jusqua: '21:03', auMoins: true });
  assert.equal(ligneCourte(auMoins, 'fr'), '🔥 cache → ≥ 21:03');
  assert.deepEqual(lignesDetail(auMoins, 'fr'), [['Cache', '🔥 chaud (au moins jusqu\'à 21:03)']]);
  // Jauges de quota sans % (remise passée, épuisé) et quota au nom brut : toujours sonar.
  for (const q of ['5 h remis à zéro', 'semaine épuisé', '5h reset', 'week exhausted', 'seven_day_opus 12 % (remise ven. 12:00)', 'budget 40 % (reste 60 %)']) {
    assert.deepEqual(lireSonar(q), { cache: null, branche: null, depot: null, cout: null }, q);
  }
  // Un seul bloc, segments collés sans parenthèse entre eux.
  assert.deepEqual(lireSonar('semaine 95 % (remise dim. 11:00)cache froidbranche master (mon-depot)coût 4,00 $'),
    { cache: { etat: 'froid', relu: null, jusqua: null }, branche: 'master', depot: 'mon-depot', cout: '4,00 $' });
  assert.equal(lireSonar('cache autre modèle').cache.etat, 'autre modèle');
  assert.equal(lireSonar('cache incertain').cache.etat, 'incertain');
  assert.deepEqual(lireSonar('branche HEAD détachée (mon-depot, 3 modifiés)'), { cache: null, branche: 'HEAD détachée', depot: 'mon-depot', cout: null });
  assert.deepEqual(lireSonar('branche mon-depot (1 modifié)'), { cache: null, branche: null, depot: 'mon-depot', cout: null });
  assert.equal(lireSonar('coût 1 234,56 $').cout, '1 234,56 $');
});

test('texte de baleine, vide ou méconnu → null', () => {
  assert.equal(lireSonar(BALEINE), null);
  assert.equal(lireSonar(''), null);
  assert.equal(lireSonar(undefined), null);
  assert.equal(lireSonar('mon cache est plein'), null);
  // Un texte qui mêle sonar et autre chose n'est pas sonar (jamais masqué).
  assert.equal(lireSonar(BALEINE + '\nbranch main'), null);
  assert.equal(lireSonar(parBlocs + '\n' + BALEINE), null);
  for (const t of ['week 42 — sprint review', 'budget 200 € restant', '5h 30 avant la réunion', 'cache tiède']) assert.equal(lireSonar(t), null, t);
});

test('masquage : fonction pure du texte actuel', () => {
  assert.equal(masquer(parBlocs), true);
  assert.equal(masquer(brut), true);
  assert.equal(masquer(BALEINE), false);
  assert.equal(masquer(''), false);
  // Le message de sonar avant sa première mesure est bien sonar.
  assert.equal(masquer('Pas encore de mesure : elle arrive avec la prochaine réponse.'), true);
});

test('suivi d\'un même hôte : sonar puis baleine → masqué puis démasqué, la lecture gardée reste', () => {
  const un = suivre(null, parBlocs, 1000);
  assert.equal(un.masque, true);
  assert.deepEqual(un.garde, { lecture: ATTENDU, a: 1000 });
  const deux = suivre(un.garde, BALEINE, 2000);
  assert.equal(deux.masque, false, 'la lecture gardée ne décide pas du masquage');
  assert.equal(deux.garde, un.garde);
  const trois = suivre(deux.garde, '', 3000);
  assert.equal(trois.masque, false);
  assert.equal(trois.garde, un.garde);
  assert.equal(suivre(trois.garde, parBlocs, 4000).masque, true);
});

test('formes courtes et détail', () => {
  assert.equal(ligneCourte(ATTENDU, 'fr'), '🔥 cache → 21:03 · ⎇ master · 4,00 $');
  const froidFr = { ...ATTENDU, cache: { etat: 'froid', relu: null, jusqua: null } };
  assert.equal(ligneCourte(froidFr, 'fr'), '🧊 cache froid · ⎇ master · 4,00 $');
  assert.equal(ligneCourte(froidFr, 'en'), '🧊 cache cold · ⎇ master · 4,00 $');
  assert.equal(froid(froidFr), true);
  assert.equal(froid(ATTENDU), false);
  assert.equal(ligneCourte(null, 'fr'), '');
  assert.equal(ligneCourte({ cache: null, branche: null, depot: null, cout: null }, 'fr'), '');
  assert.deepEqual(lignesDetail(ATTENDU, 'fr'), [
    ['Cache', '🔥 chaud (99 % relu, jusqu\'à 21:03)'], ['Branche', 'master (mon-depot)'], ['Coût', '4,00 $'],
  ]);
});
