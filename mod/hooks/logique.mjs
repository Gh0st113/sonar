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
// Pas de contexte : Claude Code l'affiche déjà (comme le % des 5 h). « context » dans l'option est ignoré.
export const SEGMENTS = ['quotas', 'cache', 'depot', 'cout'];
const ALIAS_SEGMENTS = { quota: 'quotas', limits: 'quotas', repo: 'depot', git: 'depot', cost: 'cout' };

export const DEFAUTS = {
  langue: 'en',
  horloge: '24h',
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
    noms: { five_hour: '5 h', seven_day: 'semaine', spend_limit: 'budget' },
    nomsCourts: { seven_day: 'sem.' },
    remis: 'remis à zéro', epuise: 'épuisé', rapide: 'rapide',
    parJour: (p) => `${p} %/j`, reste: (p) => `reste ${p} %`, remet: (e) => `remise ${e}`,
    cache: 'cache', chaud: 'chaud', froid: 'froid', autreModele: 'autre modèle', incertain: 'incertain',
    relu: (p) => `${p} relu`, jusqua: (h, auMoins) => `${auMoins ? 'au moins ' : ''}jusqu'à ${h}`,
    branche: 'branche', detachee: 'HEAD détachée', detacheeCourt: 'détachée', modifies: (n) => `${n} modifié${n > 1 ? 's' : ''}`,
    nomCout: 'coût', vide: 'Pas encore de mesure : elle arrive avec la prochaine réponse.',
    jours: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], decimale: ',',
    cout: (x) => `${x} $`,
    inconnu: (a) => `argument inconnu : « ${a} »`,
    aide: [
      '/sonar — ouvre le panneau de détail',
      '/sonar pied | indice | ligne | bandeau — où afficher le sonar',
      '/sonar ttl 5m | 1h | auto — durée de vie du cache (auto : déduite des réponses)',
      '/sonar masquer | afficher',
      'Seuils, langue, segments, branches : réglages du plugin (pluginConfigs["sonar@sonar-mods"] dans settings.json).',
    ].join('\n'),
    etat: (lieu, ttl, force) => `Sonar : ${lieu}, durée du cache ${ttl ?? 'inconnue'}${force ? ' (forcée)' : ''}.`,
    affichee: (lieu) => `Sonar affiché : ${lieu}.`,
    ttlAuto: 'Durée du cache : déduite des réponses.',
    ttlForce: (t) => `Durée du cache forcée : ${t}.`,
    masquee: 'Sonar masqué (/sonar afficher pour le remettre).',
    remise: 'Sonar affiché.',
    journal: (c) => `Relevés de quota : ${c ?? 'dossier personnel introuvable, aucun relevé'}`,
  },
  en: {
    noms: { five_hour: '5h', seven_day: 'week', spend_limit: 'budget' },
    nomsCourts: {},
    remis: 'reset', epuise: 'exhausted', rapide: 'fast',
    parJour: (p) => `${p}%/d`, reste: (p) => `${p}% left`, remet: (e) => `resets ${e}`,
    cache: 'cache', chaud: 'warm', froid: 'cold', autreModele: 'other model', incertain: 'uncertain',
    relu: (p) => `${p} reused`, jusqua: (h, auMoins) => `${auMoins ? 'at least ' : ''}until ${h}`,
    branche: 'branch', detachee: 'detached HEAD', detacheeCourt: 'detached', modifies: (n) => `${n} modified`,
    nomCout: 'cost', vide: 'No reading yet: it comes with the next response.',
    jours: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], decimale: '.',
    cout: (x) => `$${x}`,
    inconnu: (a) => `unknown argument: "${a}"`,
    aide: [
      '/sonar — opens the detail pane',
      '/sonar footer | hint | status | banner — where to show it',
      '/sonar ttl 5m | 1h | auto — prompt cache lifetime (auto: inferred from responses)',
      '/sonar hide | show',
      'Thresholds, language, segments, branches: plugin options (pluginConfigs["sonar@sonar-mods"] in settings.json).',
    ].join('\n'),
    etat: (lieu, ttl, force) => `Sonar: ${lieu}, cache lifetime ${ttl ?? 'unknown'}${force ? ' (forced)' : ''}.`,
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

// Rythme d'un quota : compare l'usage à la part de fenêtre écoulée.
// undefined : quota illisible. `remis` : la remise à zéro est passée, le nouveau chiffre arrivera à la prochaine réponse.
// `part` : part de la fenêtre écoulée (0 à 1) ; `avance` : points d'usage au-delà du rythme régulier (grâce comprise).
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
  if (o.attendu !== undefined) o.avance = utilise - o.attendu;
  const avance = o.avance ?? 0;
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

const protegee = (depot, cfg) => Boolean(depot?.branche && cfg.branches.includes(depot.branche.toLowerCase()));
const valeurQuota = (r, t, cfg) => (r.remis ? t.remis : r.epuise ? t.epuise : pc(r.utilise, cfg));

// Pied (disposition A, choisie par l'utilisateur le 05/11) : court (~25 caractères), dans cet ordre, séparés par « · » :
//   1. `5 h rapide` (orange), seulement quand les 5 h partent plus vite que le temps (sans %, Claude Code l'affiche) ;
//   2. l'icône du cache collée au coût de la session : 🔥 chaud, ❄️ froid (orange), ❔ incertain (orange), puis le
//      montant (`🔥 2,40 $`) ; pas d'icône si l'état du cache est inconnu, pas de montant si le coût l'est ;
//   3. la branche, raccourcie (brancheCourte) : `⎇ master` ; orange sur une branche protégée ; rien hors dépôt.
// La semaine n'y est jamais, même en alerte : elle reste au bandeau, au panneau et dans le popover de sonar pour Windows.
// Chacun { cle, etiquette, valeur, niveau } ; l'étiquette peut être vide.
export const SEP_PIED = ' · ';
const ICONES = { chaud: '🔥', froid: '❄️', incertain: '❔' };
export function elementsPied(d, maintenant, cfg = DEFAUTS) {
  const t = textes(cfg.langue);
  const actif = (k) => cfg.segments.includes(k);
  const e = [];
  if (actif('quotas')) {
    const cinq = quotasTries(d.quotas).filter((q) => q.kind === 'five_hour').map((q) => rythme(q, maintenant, cfg))[0];
    if (cinq && !cinq.remis && cinq.avance > cfg.rythme.attention) e.push({ cle: 'five_hour', etiquette: t.noms.five_hour, valeur: t.rapide, niveau: 'attention' });
  }
  const c = actif('cache') ? etatCache(d.cache, d.ttlMs, maintenant, d.modele) : undefined;
  const icone = ICONES[c?.etat];
  const cout = actif('cout') && fini(d.cout) ? montant(d.cout, cfg) : undefined;
  if (icone || cout) {
    e.push({ cle: 'cache', etiquette: '', valeur: [icone, cout].filter(Boolean).join(' '), niveau: c?.etat === 'froid' || c?.etat === 'incertain' ? 'attention' : 'ok' });
  }
  if (actif('depot') && d.depot?.nom) {
    const b = d.depot.detachee ? t.detacheeCourt : brancheCourte(d.depot.branche);
    if (b) e.push({ cle: 'depot', etiquette: '⎇', valeur: b, niveau: protegee(d.depot, cfg) ? 'attention' : 'ok' });
  }
  return e;
}

// Nom de branche pour le pied : le dernier segment après « / », sans suffixe d'empreinte (« -79d924 » : au moins
// 6 caractères hexadécimaux dont un chiffre, pour garder « new-facade »), 12 caractères
// au plus, « … » compris : claude/mod-pied-cache-79d924 → mod-pied-ca….
export function brancheCourte(branche, max = 12) {
  if (typeof branche !== 'string' || !branche) return undefined;
  const fin = branche.split('/').filter(Boolean).pop() ?? branche;
  const nom = fin.replace(/-(?=[0-9a-f]*\d)[0-9a-f]{6,}$/i, '') || fin;
  const car = [...nom];
  return car.length > max ? `${car.slice(0, max - 1).join('')}…` : nom;
}

// Bandeau et panneau : tout le détail, chacun { cle, etiquette, valeur, detail, niveau, part?, repere? }.
// `part` (0 à 1) remplit la jauge ; `repere` marque la part de fenêtre écoulée (le rythme régulier). Sans `part`, pas de jauge.
export function jauges(d, maintenant, cfg = DEFAUTS) {
  const t = textes(cfg.langue);
  const actif = (k) => cfg.segments.includes(k);
  const j = [];
  if (actif('quotas')) {
    for (const q of quotasTries(d.quotas)) {
      const r = rythme(q, maintenant, cfg);
      if (!r) continue;
      const detail = [];
      if (r.parJour !== undefined) detail.push(t.parJour(pct(r.parJour, cfg)));
      if (r.reste !== undefined) detail.push(t.reste(pct(r.reste, cfg)));
      if (r.reset !== undefined) detail.push(t.remet(echeance(r.reset, maintenant, cfg)));
      j.push({
        cle: r.kind, etiquette: t.noms[r.kind] ?? r.kind, valeur: valeurQuota(r, t, cfg), detail: detail.join(', '),
        niveau: r.niveau, part: r.remis ? 0 : Math.min(1, r.utilise / 100), repere: r.part,
      });
    }
  }
  const c = actif('cache') ? etatCache(d.cache, d.ttlMs, maintenant, d.modele) : undefined;
  if (c?.etat === 'chaud') {
    // La jauge du cache se vide à mesure que son expiration approche.
    const duree = fini(d.ttlMs) ? d.ttlMs : TTL_MIN;
    const detail = [c.taux !== undefined ? t.relu(pc(entier(100 * c.taux), cfg)) : '', t.jusqua(heure(c.expire, cfg), c.auMoins)];
    j.push({ cle: 'cache', etiquette: t.cache, valeur: t.chaud, detail: detail.filter(Boolean).join(', '), niveau: 'ok', part: Math.min(1, Math.max(0, (c.expire - maintenant) / duree)) });
  } else if (c?.etat === 'incertain') {
    j.push({ cle: 'cache', etiquette: t.cache, valeur: t.incertain, detail: '', niveau: 'ok' });
  } else if (c?.etat === 'froid') {
    j.push({ cle: 'cache', etiquette: t.cache, valeur: c.autreModele ? t.autreModele : t.froid, detail: '', niveau: 'attention', part: 0 });
  }
  if (actif('depot') && d.depot?.nom) {
    const b = d.depot.detachee ? t.detachee : d.depot.branche;
    const detail = [b ? d.depot.nom : '', d.depot.modifies ? t.modifies(d.depot.modifies) : ''];
    j.push({ cle: 'depot', etiquette: t.branche, valeur: b ?? d.depot.nom, detail: detail.filter(Boolean).join(', '), niveau: protegee(d.depot, cfg) ? 'attention' : 'ok' });
  }
  if (actif('cout') && fini(d.cout)) j.push({ cle: 'cout', etiquette: t.nomCout, valeur: montant(d.cout, cfg), detail: '', niveau: 'ok' });
  return j;
}

// ——— Données pour l'extension sonar pour Windows (dossier windows/ du dépôt, Claude Desktop Windows) ———
// Dans le pied, sur le bureau, le mod ajoute une image transparente de 1 pixel dont le texte alternatif porte ces
// données en JSON, sans langue (nombres, heures en ms). L'extension la lit dans le shadowRoot de l'hôte du pied et
// l'affiche dans le cercle d'usage et la barre latérale, dans la langue de l'appli. Rien de visible.
// Format versionné : changer un champ = changer PREFIXE_EXTENSION (« sonar:2 ») et l'extension avec.
export const PREFIXE_EXTENSION = 'sonar:1 ';

// { a, cache?: { etat, expire?, auMoins?, taux?, autreModele? }, depot?: { nom, branche?, detachee?, modifies }, cout? }
// Les quotas n'y sont pas : l'extension les lit elle-même. Les segments désactivés dans les options n'y sont pas non plus.
export function chargeExtension(d, maintenant, cfg = DEFAUTS) {
  const actif = (k) => cfg.segments.includes(k);
  const o = { a: maintenant };
  const c = actif('cache') ? etatCache(d.cache, d.ttlMs, maintenant, d.modele) : undefined;
  if (c && c.etat !== 'rien') {
    o.cache = { etat: c.etat };
    if (fini(c.expire)) o.cache.expire = c.expire;
    if (c.auMoins) o.cache.auMoins = true;
    if (fini(c.taux)) o.cache.taux = Math.round(c.taux * 1000) / 1000;
    if (c.autreModele) o.cache.autreModele = true;
  }
  if (actif('depot') && d.depot?.nom) {
    o.depot = { nom: d.depot.nom, modifies: d.depot.modifies ?? 0 };
    if (d.depot.branche) o.depot.branche = d.depot.branche;
    if (d.depot.detachee) o.depot.detachee = true;
  }
  if (actif('cout') && fini(d.cout)) o.cout = Math.round(d.cout * 100) / 100;
  return o;
}
export const texteExtension = (charge) => PREFIXE_EXTENSION + JSON.stringify(charge);

// Nom du dossier que Claude Code donne à un projet sous projects/ : son chemin, chaque caractère hors [A-Za-z0-9]
// remplacé par « - » (C:\Code\projet-a → C--Code-projet-a ; /home/moi/sonar → -home-moi-sonar).
export const dossierProjet = (cwd) => (typeof cwd === 'string' && cwd ? cwd.replace(/[^A-Za-z0-9]/g, '-') : undefined);

// ——— Cache d'une session ouverte avant le mod (reprise, appli relancée) : le journal local de la session ———
// Claude Code écrit chaque session dans ~/.claude/projects/<dossier>/<id de session>.jsonl, une ligne JSON par
// événement. On y lit, depuis la fin, la dernière réponse du fil principal (`assistant`, hors sous-agents) et son usage :
// le même { a, lu, ecrit, neuf, modele } que turn.step donne. Aucun appel au modèle.
// Une compaction plus récente (`compact_boundary`) : l'ancien cache ne sert plus, rien.
// `a` : le cache court depuis l'ENVOI de la requête. Sa ligne `api-request` (reliée par `requestRef`) en donne l'heure ;
// sans elle, la 1re ligne de la réponse (l'appli écrit un bloc par ligne, des résultats d'outils s'intercalent) moins
// MARGE_ENVOI_MS : la réponse arrive de quelques secondes à une minute après l'envoi (relevé du 05/11).
// `ttl` : la durée que la réponse a écrite, si elle en a écrit (« ephemeral_1h » ou 5 min).
// $.fs lit au plus 4 Mio d'un coup : au-delà, le mod ne lit pas (TAILLE_MAX_SESSION).
export const TAILLE_MAX_SESSION = 4 * 1024 * 1024;
export const MARGE_ENVOI_MS = 60_000;
// Après la réponse, on remonte encore au plus ce nombre de lignes pour trouver sa requête.
const RECHERCHE_REQUETE = 2000;
export function derniereReponse(texte) {
  const lignes = String(texte ?? '').split(/\r?\n/);
  const lire = (l) => {
    try { return JSON.parse(l); } catch { return undefined; }
  };
  let r;
  let id;
  let ref;
  let debut;
  let envoi;
  let fin; // indice de la ligne où les blocs de la réponse sont épuisés
  for (let i = lignes.length - 1; i >= 0; i--) {
    const l = lignes[i];
    if (r === undefined) {
      // Tri grossier avant JSON.parse : la plupart des lignes ne sont pas des réponses.
      if (l.includes('"compact_boundary"') && lire(l)?.subtype === 'compact_boundary') return undefined;
      if (!l.includes('"type":"assistant"')) continue;
      const o = lire(l);
      const u = o?.type === 'assistant' && !o.isSidechain ? o.message?.usage : undefined;
      const a = Date.parse(o?.timestamp);
      if (!u || !fini(a) || o.message.model === '<synthetic>') continue;
      id = o.message.id;
      ref = typeof o.requestRef === 'string' ? o.requestRef : undefined;
      debut = a;
      r = { lu: u.cache_read_input_tokens ?? 0, ecrit: u.cache_creation_input_tokens ?? 0, neuf: u.input_tokens ?? 0 };
      if (typeof o.message.model === 'string') r.modele = o.message.model;
      const cc = u.cache_creation ?? {};
      r.ttl = cc.ephemeral_1h_input_tokens > 0 ? '1h' : cc.ephemeral_5m_input_tokens > 0 ? '5m' : undefined;
      if (id === undefined) fin = i;
      continue;
    }
    if (fin !== undefined && (!ref || fin - i > RECHERCHE_REQUETE)) break;
    if (ref && l.includes('"api-request"') && l.includes(ref)) {
      const o = lire(l);
      const a = Date.parse(o?.timestamp);
      if (o?.type === 'api-request' && o.id === ref && fini(a)) {
        envoi = a;
        break;
      }
    }
    // Les autres blocs de la même réponse, plus haut ; une ligne `user` (résultat d'outil) peut s'intercaler.
    if (fin === undefined && l.includes('"type":"assistant"')) {
      const o = lire(l);
      if (o?.type !== 'assistant' || o.isSidechain) continue;
      if (o.message?.id !== id) {
        fin = i;
        continue;
      }
      const a = Date.parse(o.timestamp);
      if (fini(a) && a < debut) debut = a;
    }
  }
  if (!r) return undefined;
  const { ttl, ...reste } = r;
  // L'envoi ne peut pas suivre la réponse : une heure de requête incohérente est ignorée.
  const a = envoi !== undefined && envoi <= debut ? envoi : debut - MARGE_ENVOI_MS;
  const reponse = { a, ...reste };
  return ttl ? { reponse, ttl } : { reponse };
}

// Repli texte (terminal, ligne d'état, réponse de /sonar) : « semaine 41 % (20 %/j, remise ven. 12:00) ».
// Une étiquette vide (l'icône du cache au pied) ne laisse pas d'espace devant.
export const texte = (el) => `${el.etiquette ? `${el.etiquette} ` : ''}${el.valeur}${el.detail ? ` (${el.detail})` : ''}`;
export const ligne = (els, sep = '   ') => els.map(texte).join(sep);

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
