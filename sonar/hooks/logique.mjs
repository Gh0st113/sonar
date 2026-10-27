// Logique pure du mod « sonar » (aucun accès à `$`) : testée par test/logique.test.mjs (node --test).
// Rien n'y est propre à un abonnement ou à une personne : seuils, langue, segments et branches viennent de la config.

const H = 3_600_000;
// Fenêtres connues : leur durée permet de calculer le rythme. Un autre quota (ex. `spend_limit` d'une passerelle)
// s'affiche quand même, avec les seuils absolus seulement.
export const FENETRES = { five_hour: 5 * H, seven_day: 7 * 24 * H };
const ORDRE_QUOTAS = ['five_hour', 'seven_day'];
export const TTL = { '5m': 5 * 60_000, '1h': H };
const TTL_MIN = TTL['5m'];
const TTL_MAX = TTL['1h'];

// pied = labels du pied de saisie ; indice = ligne d'aide sous la saisie ; ligne = $.ui.status ; bandeau = au-dessus.
export const EMPLACEMENTS = ['pied', 'indice', 'ligne', 'bandeau'];
const ALIAS = { footer: 'pied', hint: 'indice', status: 'ligne', banner: 'bandeau', hide: 'masquer', show: 'afficher' };
export const SEGMENTS = ['ctx', 'quotas', 'cache', 'depot', 'cout'];
const ALIAS_SEGMENTS = { context: 'ctx', quota: 'quotas', limits: 'quotas', repo: 'depot', git: 'depot', cost: 'cout' };

export const DEFAUTS = {
  langue: 'en',
  horloge: '24h',
  ctx: { attention: 50, alerte: 80 },
  rythme: { attention: 5, alerte: 15 },
  quota: { attention: 70, alerte: 90 },
  segments: SEGMENTS,
  branches: ['main', 'master'],
  emplacement: 'pied',
  // Journal des relevés de quota : null = désactivé, sinon l'option quotaLogPath telle quelle (vide = chemin par défaut).
  journal: null,
};

const TEXTES = {
  fr: {
    noms: { five_hour: '5 h', seven_day: '7 j', spend_limit: 'budget' },
    remis: '↺ remis à zéro', epuise: 'épuisé', reste: (p) => `(reste ${p} %)`, parJour: '%/j',
    froid: 'froid', autreModele: 'autre modèle', incertain: 'incertain', detachee: 'HEAD détachée',
    jours: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], decimale: ',',
    cout: (x) => `${x} $`,
    inconnu: (a) => `argument inconnu : « ${a} »`,
    aide: [
      '/sonar pied | indice | ligne | bandeau — où afficher le sonar',
      '/sonar ttl 5m | 1h | auto — durée de vie du cache (auto : déduite des réponses)',
      '/sonar masquer | afficher',
      'Seuils, langue, segments, branches : réglages du plugin (pluginConfigs["sonar@sonar-mods"] dans settings.json).',
    ].join('\n'),
    etat: (lieu, ttl, force) => `Sonar : ${lieu}, cache ${ttl ?? 'inconnu'}${force ? ' (forcé)' : ''}.`,
    affichee: (lieu) => `Sonar affiché : ${lieu}.`,
    ttlAuto: 'Durée du cache : déduite des réponses.',
    ttlForce: (t) => `Durée du cache forcée : ${t}.`,
    masquee: 'Sonar masqué (/sonar afficher pour le remettre).',
    remise: 'Sonar affiché.',
    journal: (c) => `Relevés de quota : ${c ?? 'dossier personnel introuvable, aucun relevé'}`,
  },
  en: {
    noms: { five_hour: '5h', seven_day: '7d', spend_limit: 'budget' },
    remis: '↺ reset', epuise: 'exhausted', reste: (p) => `(${p}% left)`, parJour: '%/d',
    froid: 'cold', autreModele: 'other model', incertain: 'uncertain', detachee: 'detached HEAD',
    jours: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], decimale: '.',
    cout: (x) => `$${x}`,
    inconnu: (a) => `unknown argument: "${a}"`,
    aide: [
      '/sonar footer | hint | status | banner — where to show it',
      '/sonar ttl 5m | 1h | auto — prompt cache lifetime (auto: inferred from responses)',
      '/sonar hide | show',
      'Thresholds, language, segments, branches: plugin options (pluginConfigs["sonar@sonar-mods"] in settings.json).',
    ].join('\n'),
    etat: (lieu, ttl, force) => `Sonar: ${lieu}, cache ${ttl ?? 'unknown'}${force ? ' (forced)' : ''}.`,
    affichee: (lieu) => `Sonar shown: ${lieu}.`,
    ttlAuto: 'Cache lifetime: inferred from responses.',
    ttlForce: (t) => `Cache lifetime forced: ${t}.`,
    masquee: 'Sonar hidden (/sonar show to bring it back).',
    remise: 'Sonar shown.',
    journal: (c) => `Usage limit log: ${c ?? 'home folder not found, nothing logged'}`,
  },
};
export const textes = (langue) => TEXTES[langue] ?? TEXTES.en;
// Nom affiché d'un emplacement : le mot français ou anglais que /sonar accepte.
const NOM_EMPLACEMENT = { en: { pied: 'footer', indice: 'hint', ligne: 'status', bandeau: 'banner' } };
export const nomEmplacement = (lieu, langue) => NOM_EMPLACEMENT[langue]?.[lieu] ?? lieu;

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const liste = (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : [])
  .map((x) => x.trim().toLowerCase()).filter(Boolean);
// Défaut champ par champ, puis la paire doit rester cohérente (0 ≤ attention ≤ alerte ≤ max), sinon défaut complet.
const paire = (a, b, defaut, max = 100) => {
  const x = fini(a) ? a : defaut.attention;
  const y = fini(b) ? b : defaut.alerte;
  return x >= 0 && y <= max && x <= y ? { attention: x, alerte: y } : defaut;
};

// Options du plugin (userConfig) → config complète ; une valeur invalide reprend son défaut.
// `localeHote` : la langue de l'environnement (ex. « fr-FR »), utilisée quand language = auto.
export function lireConfig(options = {}, localeHote = '') {
  const o = options ?? {};
  const auto = String(localeHote).toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const langue = ['fr', 'en'].includes(o.language) ? o.language : auto;
  // Horloge sur 12 h seulement là où c'est l'usage (anglais des États-Unis) ; 24 h partout ailleurs.
  const horloge = ['24h', '12h'].includes(o.clock) ? o.clock : langue === 'en' && /^en-us/i.test(String(localeHote)) ? '12h' : '24h';
  const segs = liste(o.segments).map((x) => ALIAS_SEGMENTS[x] ?? x).filter((x) => SEGMENTS.includes(x));
  const branches = o.protectedBranches === undefined ? DEFAUTS.branches : liste(o.protectedBranches);
  const lieu = ALIAS[o.placement] ?? o.placement;
  return {
    langue,
    horloge,
    ctx: paire(o.contextWarn, o.contextAlert, DEFAUTS.ctx),
    rythme: paire(o.paceWarn, o.paceAlert, DEFAUTS.rythme),
    quota: paire(o.quotaWarn, o.quotaAlert, DEFAUTS.quota),
    segments: o.segments === undefined || segs.length === 0 ? SEGMENTS : segs,
    branches,
    emplacement: EMPLACEMENTS.includes(lieu) ? lieu : DEFAUTS.emplacement,
    journal: o.quotaLog === true ? String(o.quotaLogPath ?? '') : null,
  };
}

// Arguments de `/sonar` (français ou anglais) : un emplacement, « ttl 5m|1h|auto », masquer/afficher, ou rien (aide).
export function lireCommande(args) {
  const mots = String(args ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).map((m) => ALIAS[m] ?? m);
  if (mots.length === 0) return { aide: true };
  if (EMPLACEMENTS.includes(mots[0]) && mots.length === 1) return { emplacement: mots[0] };
  if (mots[0] === 'ttl' && mots.length === 2 && ['5m', '1h', 'auto'].includes(mots[1])) return { ttl: mots[1] };
  if (mots.length === 1 && (mots[0] === 'masquer' || mots[0] === 'afficher')) return { masque: mots[0] === 'masquer' };
  return { erreur: String(args ?? '').trim() };
}

// Au début d'une fenêtre, le moindre usage paraît « en avance » : on accorde d'office
// une part minimale de la fenêtre (1 h sur 5 h, 1 jour sur 7 j).
const GRACE = { five_hour: 0.2, seven_day: 1 / 7 };
const ICONE = { ok: '', attention: '⚠️ ', alerte: '⚠️ ' };

const z = (n) => String(n).padStart(2, '0');
export const heure = (ms, cfg = DEFAUTS) => {
  const d = new Date(ms);
  if (cfg.horloge === '12h') {
    const h = d.getHours();
    return `${h % 12 || 12}:${z(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return `${z(d.getHours())}:${z(d.getMinutes())}`;
};
// Même jour : l'heure seule ; sinon le jour de la semaine (moins de 7 jours devant).
export const echeance = (ms, maintenant, cfg = DEFAUTS) => {
  const a = new Date(ms);
  const b = new Date(maintenant);
  const memeJour = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (memeJour) return heure(ms, cfg);
  // Au-delà de 6 jours (ex. budget mensuel d'une passerelle), le jour de la semaine serait ambigu : la date.
  if (ms - maintenant > 6 * 24 * H) return cfg.langue === 'fr' ? `${z(a.getDate())}/${z(a.getMonth() + 1)}` : `${a.getMonth() + 1}/${a.getDate()}`;
  return `${textes(cfg.langue).jours[a.getDay()]} ${heure(ms, cfg)}`;
};

const entier = (x) => Math.round(x);
// Pourcentage affiché : entier, sauf sous 10 où une décimale reste utile (0,5 %).
export const pct = (x, cfg = DEFAUTS) =>
  (x < 10 && !Number.isInteger(x) ? x.toFixed(1).replace('.', textes(cfg.langue).decimale) : String(entier(x)));
// « 34 % » en français (espace), « 34% » en anglais.
const pc = (x, cfg) => (cfg.langue === 'fr' ? `${pct(x, cfg)} %` : `${pct(x, cfg)}%`);
// Écriture serrée du pied (une vingtaine de caractères visibles) : « 62% », « 7j », ⚠️ collé, dans toutes les langues.
const pcSerre = (x, cfg) => `${pct(x, cfg)}%`;
const serre = (nom) => nom.replace(/\s+/g, '');
const ICONE_SERREE = { ok: '', attention: '⚠️', alerte: '⚠️' };

export function niveauContexte(p, cfg = DEFAUTS) {
  if (!fini(p)) return undefined;
  return p > cfg.ctx.alerte ? 'alerte' : p >= cfg.ctx.attention ? 'attention' : 'ok';
}

// Rythme d'un quota : compare l'usage à la part de fenêtre écoulée.
// undefined : quota illisible. `remis` : la remise à zéro est passée, le nouveau chiffre arrivera à la prochaine réponse.
export function rythme(q, maintenant, cfg = DEFAUTS) {
  if (!q || !fini(q.percentUsed)) return undefined;
  const longueur = FENETRES[q.kind];
  const utilise = Math.max(0, q.percentUsed);
  const reset = q.resetsAt ? Date.parse(q.resetsAt) : NaN;
  const o = { kind: q.kind, utilise };
  if (fini(reset) && reset <= maintenant) return { ...o, remis: true, niveau: 'ok' };
  if (fini(reset)) o.reset = reset;
  if (longueur && fini(reset)) {
    const f = Math.min(1, Math.max(0, 1 - (reset - maintenant) / longueur));
    o.part = f;
    o.attendu = 100 * Math.max(f, GRACE[q.kind] ?? 0);
    const jours = (reset - maintenant) / (24 * H);
    // Sous un jour, un budget « par jour » n'a plus de sens : on montre ce qui reste.
    if (longueur > 24 * H && utilise < 100) {
      if (jours >= 1) o.parJour = (100 - utilise) / jours;
      else o.reste = 100 - utilise;
    }
  }
  o.epuise = utilise >= 100;
  const avance = o.attendu === undefined ? 0 : utilise - o.attendu;
  o.niveau = utilise >= cfg.quota.alerte || avance > cfg.rythme.alerte ? 'alerte'
    : avance > cfg.rythme.attention || utilise >= cfg.quota.attention ? 'attention' : 'ok';
  return o;
}

// Cache de la conversation principale d'après sa dernière requête { a, lu, ecrit, neuf, modele }.
// ttlMs inconnu (undefined) : chaud sûr pendant 5 min, incertain jusqu'à 1 h, froid ensuite.
// Froid aussi si le modèle a changé depuis (un autre modèle n'a pas ce cache).
export function etatCache(derniere, ttlMs, maintenant, modeleActuel) {
  if (!derniere || !fini(derniere.a)) return undefined;
  const lu = derniere.lu ?? 0;
  const ecrit = derniere.ecrit ?? 0;
  const total = lu + ecrit + (derniere.neuf ?? 0);
  if (lu + ecrit === 0) return { etat: 'rien' };
  const taux = total > 0 ? lu / total : undefined;
  if (modeleActuel && derniere.modele && modeleActuel !== derniere.modele) return { etat: 'froid', autreModele: true };
  const ecoule = maintenant - derniere.a;
  if (fini(ttlMs)) return ecoule < ttlMs ? { etat: 'chaud', expire: derniere.a + ttlMs, taux } : { etat: 'froid' };
  if (ecoule < TTL_MIN) return { etat: 'chaud', expire: derniere.a + TTL_MIN, taux, auMoins: true };
  return ecoule < TTL_MAX ? { etat: 'incertain' } : { etat: 'froid' };
}

// Durée de vie du cache déduite de deux requêtes successives du même modèle :
// une lecture après plus de 6 min d'écart prouve 1 h ; une réécriture complète entre 6 et 60 min fait pencher pour 5 min.
export function deduireTtl(avant, apres) {
  if (!avant || !apres || !fini(avant.a) || !fini(apres.a)) return undefined;
  if (avant.modele && apres.modele && avant.modele !== apres.modele) return undefined;
  const ecart = apres.a - avant.a;
  // Au-delà d'une heure, plus aucun cache ne tient : l'écart ne prouve rien.
  if (ecart <= 6 * 60_000 || ecart >= H) return undefined;
  if ((apres.lu ?? 0) > 0) return '1h';
  if ((apres.ecrit ?? 0) > 0) return '5m';
  return undefined;
}

export const montant = (usd, cfg = DEFAUTS) => textes(cfg.langue).cout(usd.toFixed(2).replace('.', textes(cfg.langue).decimale));
// Pied : à partir de 10, les centimes n'apportent rien et coûtent 3 caractères.
const montantCourt = (usd, cfg) => (usd >= 10 ? textes(cfg.langue).cout(String(Math.round(usd))) : montant(usd, cfg));

// Nom court d'un dépôt : la fin de l'URL du remote, sinon le dernier dossier de la racine.
export function nomDepot(remote, racine) {
  const source = (remote || racine || '').replace(/\.git$/i, '').replace(/[\\/]+$/, '');
  const m = /([^/\\:]+)$/.exec(source);
  return m ? m[1] : undefined;
}

// Sortie de `git status --porcelain=v1 --branch` : branche (ou tête détachée) et nombre de fichiers touchés.
export function lireStatut(sortie) {
  if (typeof sortie !== 'string') return undefined;
  const lignes = sortie.split(/\r?\n/).filter(Boolean);
  const tete = lignes[0]?.startsWith('## ') ? lignes.shift().slice(3) : '';
  if (/^HEAD \(no branch\)/.test(tete)) return { detachee: true, modifies: lignes.length };
  const branche = /^No commits yet on /.test(tete) ? tete.slice('No commits yet on '.length).split('...')[0] : tete.split('...')[0] || undefined;
  return { branche, modifies: lignes.length };
}

const quotasTries = (quotas) => [...(quotas ?? [])].filter((q) => q && typeof q.kind === 'string')
  .sort((a, b) => (ORDRE_QUOTAS.indexOf(a.kind) + 1 || 99) - (ORDRE_QUOTAS.indexOf(b.kind) + 1 || 99));

// Segments affichés, dans l'ordre ; chacun { cle, texte, niveau }. Un segment sans donnée ou désactivé est absent.
export function segments(d, maintenant, cfg = DEFAUTS) {
  const t = textes(cfg.langue);
  const actif = (k) => cfg.segments.includes(k);
  const s = [];
  const nc = actif('ctx') ? niveauContexte(d.contexte, cfg) : undefined;
  if (nc) s.push({ cle: 'ctx', texte: `${ICONE[nc]}ctx ${pc(d.contexte, cfg)}`, court: `${ICONE_SERREE[nc]}ctx ${pcSerre(d.contexte, cfg)}`, niveau: nc });
  if (actif('quotas')) {
    for (const q of quotasTries(d.quotas)) {
      const r = rythme(q, maintenant, cfg);
      if (!r) continue;
      const nom = t.noms[r.kind] ?? r.kind;
      if (r.remis) {
        s.push({ cle: r.kind, texte: `${nom} ${t.remis}`, court: `${serre(nom)} ↺`, niveau: 'ok' });
        continue;
      }
      const tete = `${ICONE[r.niveau]}${nom} ${r.epuise ? t.epuise : pc(r.utilise, cfg)}`;
      let x = tete;
      const court = `${ICONE_SERREE[r.niveau]}${serre(nom)} ${r.epuise ? t.epuise : pcSerre(r.utilise, cfg)}`;
      if (r.parJour !== undefined) x += ` ≈ ${pct(r.parJour, cfg)}${cfg.langue === 'fr' ? ' ' : ''}${t.parJour}`;
      if (r.reste !== undefined) x += ` ${t.reste(pct(r.reste, cfg))}`;
      if (r.reset !== undefined) x += ` → ${echeance(r.reset, maintenant, cfg)}`;
      // `tete` : la partie que le bandeau colore (le chiffre en cause), la suite reste grise.
      s.push({ cle: r.kind, texte: x, tete, court, niveau: r.niveau });
    }
  }
  const c = actif('cache') ? etatCache(d.cache, d.ttlMs, maintenant, d.modele) : undefined;
  if (c && c.etat !== 'rien') {
    if (c.etat === 'chaud') {
      const taux = c.taux !== undefined ? ` ${pc(entier(100 * c.taux), cfg)}` : '';
      s.push({ cle: 'cache', texte: `cache 🔥${taux} → ${c.auMoins ? '≥ ' : ''}${heure(c.expire, cfg)}`, court: '🔥', niveau: 'ok' });
    } else if (c.etat === 'incertain') {
      s.push({ cle: 'cache', texte: `cache ❔ ${t.incertain}`, court: 'cache ❔', niveau: 'ok' });
    } else {
      s.push({ cle: 'cache', texte: `cache ❄️ ${c.autreModele ? t.autreModele : t.froid}`, court: 'cache ❄️', niveau: 'attention' });
    }
  }
  if (actif('depot') && d.depot?.nom) {
    const b = d.depot.detachee ? t.detachee : d.depot.branche;
    const garde = Boolean(d.depot.branche && cfg.branches.includes(d.depot.branche.toLowerCase()));
    let x = `${garde ? '⚠️ ' : ''}${d.depot.nom}`;
    if (b) x += ` ⎇ ${b}`;
    if (d.depot.modifies) x += ` ●${d.depot.modifies}`;
    s.push({ cle: 'depot', texte: x, court: `${garde ? '⚠️' : ''}${b ? `⎇ ${b}` : d.depot.nom}${d.depot.modifies ? ` ●${d.depot.modifies}` : ''}`, niveau: garde ? 'attention' : 'ok' });
  }
  if (actif('cout') && fini(d.cout)) s.push({ cle: 'cout', texte: montant(d.cout, cfg), court: montantCourt(d.cout, cfg), niveau: 'ok' });
  return s;
}

export const ligne = (segs) => segs.map((x) => x.texte).join(' · ');

// Pied : la place est courte et l'appli coupe la fin de la ligne ; la largeur n'est pas mesurable (police proportionnelle),
// donc on trie par priorité : alertes, puis attentions, puis le reste dans l'ordre des segments (tri stable).
const PRIORITE = { alerte: 0, attention: 1, ok: 2 };
export const ligneCourte = (segs) => [...segs]
  .sort((a, b) => (PRIORITE[a.niveau] ?? 2) - (PRIORITE[b.niveau] ?? 2))
  .map((x) => x.court ?? x.texte).join(' · ');

// ——— Journal des relevés de quota (option quotaLog, désactivée par défaut) ———
// Une ligne JSON par changement du % ou de l'heure de remise à zéro de five_hour / seven_day ; aucun appel au modèle.
// Les noms de champs sont lus par un script d'analyse externe : ne pas les changer.
export const FENETRES_JOURNAL = ['five_hour', 'seven_day'];
export const CHEMIN_JOURNAL = '.claude/sonar/quota-log.jsonl';
// $.fs lit et écrit au plus 4 Mio d'un coup : à 3 Mio, le journal part en archive et repart de zéro.
export const TAILLE_MAX_JOURNAL = 3 * 1024 * 1024;

// ISO UTC à la seconde (« 2026-11-01T10:00:00Z ») ; illisible → undefined.
export function isoUtc(x) {
  const ms = typeof x === 'number' ? x : Date.parse(String(x ?? ''));
  return fini(ms) ? new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z') : undefined;
}

// Relevé à l'instant `maintenant` : { ts, five_hour?, seven_day? } ; undefined si aucune des deux fenêtres n'est lisible.
export function releve(quotas, maintenant) {
  const r = { ts: new Date(maintenant).toISOString() };
  for (const kind of FENETRES_JOURNAL) {
    const q = (quotas ?? []).find((x) => x?.kind === kind && fini(x.percentUsed));
    if (!q) continue;
    const resets = isoUtc(q.resetsAt);
    r[kind] = resets ? { pct: q.percentUsed, resets_at: resets } : { pct: q.percentUsed };
  }
  return FENETRES_JOURNAL.some((k) => r[k]) ? r : undefined;
}

// Ce qui compare deux relevés : les fenêtres, pas l'heure du relevé.
export const cleReleve = (r) => (r ? JSON.stringify(FENETRES_JOURNAL.map((k) => [r[k]?.pct ?? null, r[k]?.resets_at ?? null])) : '');

// Dernier relevé lisible d'un journal (texte JSONL) ; une ligne abîmée en fin de fichier est ignorée.
export function dernierReleve(texte) {
  const lignes = String(texte ?? '').split(/\r?\n/);
  for (let i = lignes.length - 1; i >= 0; i--) {
    if (!lignes[i].trim()) continue;
    try {
      const o = JSON.parse(lignes[i]);
      if (o && typeof o === 'object' && FENETRES_JOURNAL.some((k) => o[k])) return o;
    } catch { /* ligne abîmée : on remonte */ }
  }
  return undefined;
}

// Nouveau texte du journal avec `r` ajouté, ou undefined si rien n'a changé depuis sa dernière ligne.
export function ajouterReleve(texte, r) {
  if (!r || cleReleve(dernierReleve(texte)) === cleReleve(r)) return undefined;
  const t = String(texte ?? '');
  return `${t}${t && !t.endsWith('\n') ? '\n' : ''}${JSON.stringify(r)}\n`;
}

// Ce qu'il faut écrire : undefined si rien n'a changé ; sinon le nouveau texte, et `archive` (l'ancien texte) quand
// l'ajout ferait passer le journal au-delà de TAILLE_MAX_JOURNAL : le journal repart alors de la seule nouvelle ligne.
export function majJournal(texte, r) {
  const t = String(texte ?? '');
  const nouveau = ajouterReleve(t, r);
  if (nouveau === undefined) return undefined;
  return nouveau.length > TAILLE_MAX_JOURNAL && t ? { archive: t, texte: `${JSON.stringify(r)}\n` } : { texte: nouveau };
}

// Chemin du journal : vide → ~/.claude/sonar/quota-log.jsonl ; « ~/… » sous le dossier personnel ; sinon tel quel.
// undefined si le dossier personnel est inconnu alors qu'il en faut un.
export function cheminJournal(option, maison) {
  const o = String(option ?? '').trim().replace(/\\/g, '/');
  // « / » (dossier personnel à la racine) devient '' : les chemins ci-dessous remettent le « / ».
  const m = maison ? String(maison).replace(/\\/g, '/').replace(/\/+$/, '') : undefined;
  if (!o) return m !== undefined ? `${m}/${CHEMIN_JOURNAL}` : undefined;
  if (o === '~' || o.startsWith('~/')) return m !== undefined ? `${m}${o.slice(1)}` : undefined;
  return o;
}

// Le dossier personnel ne sert qu'au chemin par défaut et à « ~/… ».
export const besoinMaison = (option) => /^$|^~([\\/]|$)/.test(String(option ?? '').trim());

// Archive d'un journal plein : « quota-log.jsonl » → « quota-log.2026-10-27T224200Z.jsonl ».
export function cheminArchive(chemin, maintenant) {
  const date = isoUtc(maintenant).replace(/[:-]/g, '').replace(/^(\d{4})(\d\d)(\d\d)/, '$1-$2-$3');
  const m = /^(.*?)(\.[^./]+)?$/.exec(chemin);
  return `${m[1]}.${date}${m[2] ?? ''}`;
}
