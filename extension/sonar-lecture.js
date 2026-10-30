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
    if (!o || typeof o !== 'object' || !fini(o.a)) return null;
    const c = o.cache;
    const d = o.depot;
    return {
      a: o.a,
      cache: c && ETATS.includes(c.etat)
        ? {
          etat: c.etat,
          expire: fini(c.expire) ? c.expire : null,
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

  // L'état du cache à l'instant `maintenant` : un cache chaud dont l'heure est passée a refroidi depuis le relevé
  // (incertain si sa durée de vie était inconnue, comme le dit sonar).
  function etatCache(cache, maintenant) {
    if (!cache) return null;
    if (cache.etat === 'chaud' && cache.expire !== null && maintenant >= cache.expire) return cache.auMoins ? 'incertain' : 'froid';
    return cache.etat;
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
    },
    en: {
      chaud: 'warm', froid: 'cold', incertain: 'uncertain', autreModele: 'other model',
      relu: (p) => `${p}% reused`, jusqua: (h, auMoins) => `${auMoins ? 'at least ' : ''}until ${h}`,
      detachee: 'detached HEAD', modifies: (n) => `${n} modified`,
      cout: (x) => `$${x.toFixed(2)}`,
      cache: 'Cache', branche: 'Branch', nomCout: 'Cost', releve: (h) => `read at ${h}`,
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
  const froid = (charge, maintenant) => {
    const etat = etatCache(charge?.cache, maintenant);
    return Boolean(etat && etat !== 'chaud');
  };

  const api = { SELECTEURS, PREFIXE, PORTEUR, lireCharge, etatCache, utile, ligneCourte, lignesDetail, releve, froid };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SonarLecture = api;
})(typeof globalThis === 'object' ? globalThis : this);
