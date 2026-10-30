// Textes français ajoutés à UI+ (widget.js) ; les tests d'origine sont dans widget.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { buildView } = createRequire(import.meta.url)('../widget.js');
const NOW = Date.parse('2026-09-29T23:00:00Z');
const at = (ms) => new Date(NOW + ms).toISOString();

test('libellés français', () => {
  const view = buildView({
    limits: [
      { kind: 'session', percent: 9.7, resets_at: at(257 * 60_000) },
      { kind: 'weekly_all', percent: 30, resets_at: at(6 * 86_400_000) },
    ],
  }, NOW, 'fr', 'fr-FR');
  assert.deepEqual(view.rows.map((row) => row.label), ['Limite de 5 heures', 'Hebdomadaire · tous les modèles']);
  assert.equal(view.rows[0].meta, '4 h 17 min · 9%');
  assert.equal(view.pace, '16 % au-dessus du rythme');
  const sous = buildView({ limits: [{ kind: 'weekly_all', percent: 20, resets_at: at(3.5 * 86_400_000) }] }, NOW, 'fr');
  assert.equal(sous.pace, '30 % sous le rythme');
});
