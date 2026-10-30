// Lecteur du bandeau sonar : fonctions pures, sans DOM, chargées avant widget.js (content script) et testées
// sous Node (test/sonar-lecture.test.mjs). Le bandeau d'un mod n'est pas dans le DOM de la page : son texte est
// dans le shadowRoot ouvert de son hôte `div[data-plugin-drawn="AbovePrompt"]`. widget.js en tire un texte, un
// segment par ligne (« cache chaud (99 % relu, jusqu'à 21:03) », « branche master (mon-depot) », « coût 4,00 $ »),
// et ce module en fait { cache, branche, depot, cout } (fr ou en, selon la langue de sonar).
(function (racine) {
  // Sélecteurs vérifiés contre les relevés de Claude Desktop Windows (test/fixtures, 30/10/2026).
  const SELECTEURS = {
    hote: '[data-plugin-drawn="AbovePrompt"]',
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

  // Valeurs de l'état du cache, ramenées aux mots français de sonar.
  const ETATS = {
    chaud: 'chaud', froid: 'froid', incertain: 'incertain', 'autre modèle': 'autre modèle',
    warm: 'chaud', cold: 'froid', uncertain: 'incertain', 'other model': 'autre modèle',
  };
  const ESPACES = /[  ]/g;
  // Début d'un segment de sonar, pour couper un texte venu d'un seul bloc.
  const DEBUTS = /(?<=[)$%\d])\s*(?=(?:5 ?h|semaine|sem\.|week|budget|cache|branche|branch|coût|cost) )/g;
  const QUOTA = /^(?:5 ?h|semaine|sem\.|week|budget) \d/;
  // Le message de sonar avant la première mesure : c'est bien sonar, sans rien à lire.
  const VIDE = /^(Pas encore de mesure|No reading yet)\b/;
  const CACHE = /^cache (chaud|froid|incertain|autre modèle|warm|cold|uncertain|other model)(?: \((.*)\))?$/;
  const RELU = /(\d+(?:[.,]\d+)?) ?% (?:relu|reused)/;
  const JUSQUA = /(?:jusqu['’]à|until) (\d{1,2}:\d{2}(?: ?[AP]M)?)/;
  const BRANCHE = /^(?:branche|branch) (.+?)(?: \((.*)\))?$/;
  const MODIFIES = /^\d+ modifi/;
  const COUT = /^(?:coût (\d[\d ]*(?:,\d+)? \$)|cost (\$\d[\d,]*(?:\.\d+)?))$/;

  function segments(texte) {
    return String(texte ?? '').replace(ESPACES, ' ').split(/\n+/)
      .flatMap((l) => l.split(DEBUTS)).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  // Texte du bandeau → { cache: { etat, relu, jusqua } | null, branche, depot, cout } ; null si ce n'est pas sonar.
  function lireSonar(texte) {
    const r = { cache: null, branche: null, depot: null, cout: null };
    let reconnu = false;
    for (const s of segments(texte)) {
      let m;
      if ((m = CACHE.exec(s))) {
        const relu = RELU.exec(m[2] ?? '');
        r.cache = {
          etat: ETATS[m[1]],
          relu: relu ? Number(relu[1].replace(',', '.')) : null,
          jusqua: JUSQUA.exec(m[2] ?? '')?.[1] ?? null,
        };
      } else if ((m = BRANCHE.exec(s))) {
        // « branche master (mon-depot, 2 modifiés) » ; sans branche connue, sonar écrit le nom du dépôt seul.
        const detail = (m[2] ?? '').split(', ').filter((d) => d && !MODIFIES.test(d));
        if (detail.length > 0) {
          r.branche = m[1];
          r.depot = detail[0];
        } else {
          r.depot = m[1];
        }
      } else if ((m = COUT.exec(s))) {
        r.cout = m[1] ?? m[2];
      } else if (!QUOTA.test(s) && !VIDE.test(s)) {
        continue;
      }
      reconnu = true;
    }
    return reconnu ? r : null;
  }

  // Masquer un hôte AbovePrompt ? Oui seulement si son texte ACTUEL se lit comme sonar.
  function masquer(texte) {
    return lireSonar(texte) !== null;
  }

  // Un pas de suivi d'un hôte : texte actuel → { masque, garde }. `garde` est la dernière lecture utile et son
  // heure ({ lecture, a }), pour l'affichage seulement : elle survit au tour où le bandeau disparaît, mais le
  // masquage ne regarde que le texte actuel.
  function suivre(garde, texte, maintenant) {
    const lecture = lireSonar(texte);
    return { masque: lecture !== null, garde: utile(lecture) ? { lecture, a: maintenant } : garde ?? null };
  }

  // Une lecture qui a quelque chose à montrer (le message « pas encore de mesure » n'en a pas).
  function utile(lecture) {
    return Boolean(lecture && (lecture.cache || lecture.branche || lecture.depot || lecture.cout));
  }

  const MOTS = {
    fr: {
      chaud: 'chaud', froid: 'froid', incertain: 'incertain', 'autre modèle': 'autre modèle',
      relu: (p) => `${String(p).replace('.', ',')} % relu`, jusqua: (h) => `jusqu'à ${h}`,
      cache: 'Cache', branche: 'Branche', cout: 'Coût', releve: (h) => `relevé à ${h}`,
    },
    en: {
      chaud: 'warm', froid: 'cold', incertain: 'uncertain', 'autre modèle': 'other model',
      relu: (p) => `${p}% reused`, jusqua: (h) => `until ${h}`,
      cache: 'Cache', branche: 'Branch', cout: 'Cost', releve: (h) => `read at ${h}`,
    },
  };
  const ICONES = { chaud: '🔥', froid: '🧊', incertain: '❔', 'autre modèle': '🧊' };

  // Forme courte : « 🔥 cache → 21:03 · ⎇ master · 4,00 $ » ; froid : « 🧊 cache froid · … ».
  function ligneCourte(lecture, langue) {
    if (!utile(lecture)) return '';
    const t = MOTS[langue] ?? MOTS.en;
    const morceaux = [];
    const c = lecture.cache;
    if (c) morceaux.push(c.etat === 'chaud' && c.jusqua ? `${ICONES.chaud} cache → ${c.jusqua}` : `${ICONES[c.etat] ?? ''} cache ${t[c.etat] ?? c.etat}`.trim());
    if (lecture.branche || lecture.depot) morceaux.push(`⎇ ${lecture.branche ?? lecture.depot}`);
    if (lecture.cout) morceaux.push(lecture.cout);
    return morceaux.join(' · ');
  }

  // Lignes du popover : [[étiquette, valeur], …].
  function lignesDetail(lecture, langue) {
    if (!utile(lecture)) return [];
    const t = MOTS[langue] ?? MOTS.en;
    const l = [];
    const c = lecture.cache;
    if (c) {
      const detail = [c.relu !== null ? t.relu(c.relu) : '', c.jusqua ? t.jusqua(c.jusqua) : ''].filter(Boolean).join(', ');
      l.push([t.cache, `${ICONES[c.etat] ?? ''} ${t[c.etat] ?? c.etat}${detail ? ` (${detail})` : ''}`.trim()]);
    }
    if (lecture.branche || lecture.depot) {
      l.push([t.branche, lecture.branche ? `${lecture.branche}${lecture.depot ? ` (${lecture.depot})` : ''}` : lecture.depot]);
    }
    if (lecture.cout) l.push([t.cout, lecture.cout]);
    return l;
  }

  const releve = (h, langue) => (MOTS[langue] ?? MOTS.en).releve(h);
  const froid = (lecture) => Boolean(lecture?.cache && lecture.cache.etat !== 'chaud');

  const api = { SELECTEURS, segments, lireSonar, masquer, suivre, utile, ligneCourte, lignesDetail, releve, froid };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SonarLecture = api;
})(typeof globalThis === 'object' ? globalThis : this);
