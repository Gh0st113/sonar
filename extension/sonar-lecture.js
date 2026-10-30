// Lecteur des données de sonar : fonctions pures, sans DOM, chargées avant widget.js et testées sous Node
// (test/sonar-lecture.test.mjs). Sur le bureau, le mod sonar ajoute à son pied (à côté du nom du modèle)
// une image transparente de 1 pixel dont le texte alternatif vaut « sonar:1 {json} » (sonar/hooks/logique.mjs,
// chargeExtension), dans le shadowRoot ouvert d'un hôte `[data-plugin-drawn]`. Le JSON est sans langue (nombres,
// heures en ms) : ce module le vérifie et le met en mots, en français ou en anglais.
(function (racine) {
  // Sélecteurs vérifiés contre les relevés de Claude Desktop Windows (test/fixtures, 30/10/2026).
  const SELECTEURS = {
    // Tout hôte de dessin d'un mod : relevé pour le bandeau (« AbovePrompt »), supposé pour le pied (« SessionMode »).
    hote: '[data-plugin-drawn]',
    cercle: 'button[aria-haspopup="dialog"]',
    // Début de l'aria-label du cercle : « Utilisation : Hebdomadaire · … » (fr), « Usage: … » (en).
    cercleLibelle: /^(Utilisation|Usage)\b/,
    popover: '[role="dialog"][data-cds="Popover"]',
    lienUsage: 'a[href="/settings/usage"]',
    barreLaterale: 'aside[aria-label="Barre latérale"], aside[aria-label="Sidebar"]',
    personnalisation: '[data-nav-item="customize"]',
    recents: '.dframe-nav-scroll > .dframe-recents-by-mode',
    epingles: '[data-testid="sidebar-pinned"]',
  };

  const PREFIXE = 'sonar:1 ';
  // L'image qui porte les données, dans le shadowRoot de l'hôte.
  const PORTEUR = 'img[alt^="sonar:1 "]';
  const ETATS = ['chaud', 'froid', 'incertain'];

  const fini = (x) => typeof x === 'number' && Number.isFinite(x);
  // Une heure en ms que Date sait écrire (au-delà de ±8,64e15, `new Date` est invalide et Intl lève une erreur).
  const date = (x) => fini(x) && Math.abs(x) <= 8.64e15;
  const DEUX_H = 2 * 60 * 60_000;
  const texte = (x) => typeof x === 'string' && x.length > 0 && x.length <= 200;

  // Texte alternatif → { a, cache, depot, cout } vérifié (champ douteux → null) ; pas sonar ou illisible → null.
  function lireCharge(alt) {
    if (typeof alt !== 'string' || !alt.startsWith(PREFIXE)) return null;
    let o;
    try {
      o = JSON.parse(alt.slice(PREFIXE.length));
    } catch {
      return null;
    }
    // N'importe quel script de la page ou un autre mod peut déposer une fausse image : on borne tout ce qui sert
    // d'heure, et l'expiration du cache doit suivre le relevé de près (sonar : au plus 1 h).
    if (!o || typeof o !== 'object' || !date(o.a)) return null;
    const c = o.cache;
    const d = o.depot;
    return {
      a: o.a,
      cache: c && ETATS.includes(c.etat)
        ? {
          etat: c.etat,
          expire: date(c.expire) && c.expire >= o.a - DEUX_H && c.expire <= o.a + DEUX_H ? c.expire : null,
          auMoins: c.auMoins === true,
          taux: fini(c.taux) ? Math.min(1, Math.max(0, c.taux)) : null,
          autreModele: c.autreModele === true,
        }
        : null,
      depot: d && texte(d.nom)
        ? { nom: d.nom, branche: texte(d.branche) ? d.branche : null, detachee: d.detachee === true, modifies: fini(d.modifies) ? d.modifies : 0 }
        : null,
      cout: fini(o.cout) && o.cout >= 0 ? o.cout : null,
    };
  }

  // L'état du cache à l'instant `maintenant` : un cache chaud dont l'heure est passée a refroidi depuis le relevé.
  // Durée de vie inconnue (« au moins », 5 min sûres) : incertain jusqu'à l'heure, froid au-delà d'1 h, comme sonar.
  const TTL_MIN = 5 * 60_000;
  const TTL_MAX = 60 * 60_000;
  function etatCache(cache, maintenant) {
    if (!cache) return null;
    if (cache.etat !== 'chaud' || cache.expire === null || maintenant < cache.expire) return cache.etat;
    if (!cache.auMoins) return 'froid';
    return maintenant < cache.expire - TTL_MIN + TTL_MAX ? 'incertain' : 'froid';
  }

  // Le mod redessine son pied chaque minute : une charge plus vieille que ça veut dire que plus aucun pied ne la porte
  // (sonar retiré, autre onglet) ; on ne la montre plus. Marge pour les horloges et une minute manquée.
  const AGE_MAX = 5 * 60_000;
  // Parmi les charges des pieds affichés, la plus récente encore fraîche ; aucune → null.
  function choisir(charges, maintenant) {
    let meilleure = null;
    for (const c of charges) {
      // Valeur absolue : une charge datée du futur ne doit pas l'emporter sur les vraies.
      if (c && Math.abs(maintenant - c.a) <= AGE_MAX && (!meilleure || c.a > meilleure.a)) meilleure = c;
    }
    return meilleure;
  }

  function utile(charge) {
    return Boolean(charge && (charge.cache || charge.depot || charge.cout !== null));
  }

  const MOTS = {
    fr: {
      chaud: 'chaud', froid: 'froid', incertain: 'incertain', autreModele: 'autre modèle',
      relu: (p) => `${p} % relu`, jusqua: (h, auMoins) => `${auMoins ? 'au moins ' : ''}jusqu'à ${h}`,
      detachee: 'HEAD détachée', modifies: (n) => `${n} modifié${n > 1 ? 's' : ''}`,
      cout: (x) => `${x.toFixed(2).replace('.', ',')} $`,
      cache: 'Cache', branche: 'Branche', nomCout: 'Coût', releve: (h) => `relevé à ${h}`,
      absent: 'Cache · Branche · Coût : avec le mod sonar 0.5.0 ou plus (recommandé), dans une session de l\'onglet Code',
    },
    en: {
      chaud: 'warm', froid: 'cold', incertain: 'uncertain', autreModele: 'other model',
      relu: (p) => `${p}% reused`, jusqua: (h, auMoins) => `${auMoins ? 'at least ' : ''}until ${h}`,
      detachee: 'detached HEAD', modifies: (n) => `${n} modified`,
      cout: (x) => `$${x.toFixed(2)}`,
      cache: 'Cache', branche: 'Branch', nomCout: 'Cost', releve: (h) => `read at ${h}`,
      absent: 'Cache · Branch · Cost: with the sonar mod 0.5.0 or later (recommended), in a Code tab session',
    },
  };
  const ICONES = { chaud: '🔥', froid: '🧊', incertain: '❔' };
  const mots = (langue) => MOTS[langue] ?? MOTS.en;
  const heureParDefaut = (ms) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const nomEtat = (t, etat, cache) => (etat === 'froid' && cache.autreModele ? t.autreModele : t[etat]);
  const nomBranche = (t, d) => (d.detachee ? t.detachee : d.branche ?? d.nom);

  // Forme courte : « 🔥 cache → 21:03 · ⎇ master · 4,00 $ » ; froid : « 🧊 cache froid · … ».
  function ligneCourte(charge, langue, maintenant, heure = heureParDefaut) {
    if (!utile(charge)) return '';
    const t = mots(langue);
    const morceaux = [];
    const etat = etatCache(charge.cache, maintenant);
    if (etat === 'chaud' && charge.cache.expire !== null) morceaux.push(`${ICONES.chaud} cache → ${charge.cache.auMoins ? '≥ ' : ''}${heure(charge.cache.expire)}`);
    else if (etat) morceaux.push(`${ICONES[etat]} cache ${nomEtat(t, etat, charge.cache)}`);
    if (charge.depot) morceaux.push(`⎇ ${nomBranche(t, charge.depot)}`);
    if (charge.cout !== null) morceaux.push(t.cout(charge.cout));
    return morceaux.join(' · ');
  }

  // Lignes du popover : [[étiquette, valeur], …].
  function lignesDetail(charge, langue, maintenant, heure = heureParDefaut) {
    if (!utile(charge)) return [];
    const t = mots(langue);
    const l = [];
    const etat = etatCache(charge.cache, maintenant);
    if (etat) {
      const c = charge.cache;
      const detail = etat === 'chaud'
        ? [c.taux !== null ? t.relu(Math.round(c.taux * 100)) : '', c.expire !== null ? t.jusqua(heure(c.expire), c.auMoins) : '']
        : [];
      const fin = detail.filter(Boolean).join(', ');
      l.push([t.cache, `${ICONES[etat]} ${nomEtat(t, etat, c)}${fin ? ` (${fin})` : ''}`]);
    }
    if (charge.depot) {
      const d = charge.depot;
      const nom = nomBranche(t, d);
      const detail = [nom !== d.nom ? d.nom : '', d.modifies ? t.modifies(d.modifies) : ''].filter(Boolean).join(', ');
      l.push([t.branche, `${nom}${detail ? ` (${detail})` : ''}`]);
    }
    if (charge.cout !== null) l.push([t.nomCout, t.cout(charge.cout)]);
    return l;
  }

  const releve = (h, langue) => mots(langue).releve(h);
  // Popover sans données : dire d'où elles viendraient (mod recommandé, pas requis : le reste marche sans lui).
  const absent = (langue) => mots(langue).absent;
  const froid = (charge, maintenant) => {
    const etat = etatCache(charge?.cache, maintenant);
    return Boolean(etat && etat !== 'chaud');
  };

  const api = { SELECTEURS, PREFIXE, PORTEUR, AGE_MAX, lireCharge, etatCache, choisir, utile, ligneCourte, lignesDetail, releve, absent, froid };
  // Node (tests) n'a pas de document ; dans la page, un élément d'id « module » ne doit pas faire croire à Node.
  if (typeof document === 'undefined' && typeof module === 'object' && module.exports) module.exports = api;
  else racine.SonarLecture = api;
})(typeof globalThis === 'object' ? globalThis : this);
