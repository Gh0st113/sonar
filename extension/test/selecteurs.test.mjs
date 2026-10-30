// Les sélecteurs de l'extension trouvent leur cible dans les relevés de Claude Desktop Windows (fr).
// Sans jsdom : test/mini-dom.mjs suffit pour ces fragments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { lireHtml } from './mini-dom.mjs';

const { SELECTEURS: S } = createRequire(import.meta.url)('../sonar-lecture.js');
const releve = (nom) => lireHtml(readFileSync(new URL('fixtures/' + nom, import.meta.url), 'utf8'));

test('cercle : bouton à popover dialog, libellé « Utilisation »', () => {
  const cercles = releve('cercle-bouton.fr.html').querySelectorAll(S.cercle)
    .filter((b) => S.cercleLibelle.test(b.getAttribute('aria-label')));
  assert.equal(cercles.length, 1);
  assert.match('Usage: Weekly · all models: 30%', S.cercleLibelle);
  assert.doesNotMatch('Utilisateur', S.cercleLibelle);
});

test('popover du cercle : dialog, lien vers /settings/usage, limites et titres (UI+)', () => {
  const doc = releve('cercle-popover.fr.html');
  const popover = doc.querySelector(S.popover);
  assert.ok(popover);
  const lien = popover.querySelector(S.lienUsage);
  assert.ok(lien, 'UI+ part de ce lien pour trouver l\'en-tête et la liste');
  // Comme usageSection() : la ligne d'en-tête du lien, puis la liste juste après.
  const liste = lien.parent.parent.children.filter((c) => c.tag !== '#text');
  const entete = lien.parent;
  const apres = liste[liste.indexOf(entete) + 1];
  assert.equal(apres.getAttribute('role'), 'group');
  const meters = apres.querySelectorAll('[role="meter"]');
  assert.equal(meters.length, 3, '5 heures, hebdomadaire, crédits cloud');
  // Comme titleOf() : premier .text-primary du bloc .flex-col au-dessus du Meter.
  const titres = meters.map((m) => m.closest('[data-cds="Meter"]').parent.closest('.flex-col').querySelector('.text-primary').textContent.replace(/\s+/g, ' ').trim());
  assert.deepEqual(titres, ['Limite de 5 heures', 'Hebdomadaire · tous les modèles', 'Crédits de session cloud']);
  assert.match(titres[0], /^(Session limit|Sitzungslimit|5-Stunden-Limit|Limite de 5\s?heures)$/i);
  assert.match(titres[1], /^(Weekly|Wöchentlich|Hebdomadaire)( · (all models|alle Modelle|tous les modèles))?$/i);
  // Le bloc des limites est le premier enfant de la liste qui contient un meter, sans meter direct.
  const blocs = apres.children.filter((c) => c.tag !== '#text');
  assert.ok(blocs[0].querySelectorAll('[role="meter"]').includes(meters[0]));
  assert.equal(blocs[0].querySelectorAll('[role="meter"]').length, 2);
});

test('barre latérale : insertion après « Personnalisation », avant les récents et épinglés', () => {
  const doc = releve('barre-laterale.fr.html');
  const aside = doc.querySelector(S.barreLaterale);
  assert.ok(aside);
  const perso = aside.querySelector(S.personnalisation);
  assert.match(perso.textContent, /Personnalisation/);
  const recents = aside.querySelector(S.recents);
  assert.ok(recents);
  const freres = recents.parent.children.filter((c) => c.tag !== '#text');
  const precedent = freres[freres.indexOf(recents) - 1];
  assert.ok(precedent.querySelectorAll(S.personnalisation).includes(perso), 'le groupe juste avant contient Personnalisation');
  assert.ok(precedent.querySelectorAll('button').length > 0, 'le modèle de ligne (dernier bouton) existe');
  // La liste épinglée (coupée du relevé) vit dans le bloc des récents : insérer avant lui, c'est insérer avant elle.
  assert.equal(aside.querySelector(S.epingles), null);
  assert.ok(lireHtml('<aside aria-label="Sidebar"></aside>').querySelector(S.barreLaterale));
});

test('hôte du bandeau AbovePrompt', () => {
  assert.ok(releve('bandeau-sonar-hote.fr.html').querySelector(S.hote));
  assert.ok(releve('bandeau-sonar-ancetres.txt.html').querySelector(`[data-engine-site="AbovePrompt"] ${S.hote}`));
});
