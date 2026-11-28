// Mod « sonar » : la status line du terminal, pour l'onglet Code de Claude Desktop.
// N'ajoute aucun token : il lit les chiffres que le moteur a déjà (session.measure, turn.step) et git en local.
// Ne répète pas ce que Claude Code affiche déjà (contexte, % des 5 h) : le pied ne garde que l'essentiel,
// le bandeau (option) et le panneau de /sonar montrent le détail en jauges.
// Rien de propre à un abonnement : un chiffre que le moteur n'a pas (quotas hors abonnement, coût) n'est pas affiché,
// et seuils, langue, segments et branches protégées sont des options du plugin. Logique pure (testée) : ./logique.mjs.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, SessionRateLimit, Timer } from 'claude-code'

import type { SonarDepot, SonarMesure, SonarReponse } from '../types'
import {
  DANS_LE_PIED, TAILLE_MAX_SESSION, TTL, besoinMaison, cheminArchive, cheminJournal, cleReleve, deduireTtl,
  SEP_PIED, derniereReponse, dossierProjet, reponseFiche, elementsPied, jauges, ligne, lireCommande, lireConfig, lireStatut, langueHote, localeSysteme, majJournal, nomDepot, quotasFrais, quotasGardes, releve, textes,
} from './logique.mjs'

const mesure = atom({ plugin: 'sonar', key: 'mesure' } as const, null as SonarMesure | null)
const cache = atom({ plugin: 'sonar', key: 'cache' } as const, null as SonarReponse | null)
const depot = atom({ plugin: 'sonar', key: 'depot' } as const, null as SonarDepot | null)
const modele = atom({ plugin: 'sonar', key: 'modele' } as const, null as string | null)
const ttl = atom({ plugin: 'sonar', key: 'ttl' } as const, null as '5m' | '1h' | null)
// Bandeau choisi par /sonar (null : l'option du plugin décide).
const avecBandeau = atom({ plugin: 'sonar', key: 'bandeau' } as const, null as boolean | null)
const masque = atom({ plugin: 'sonar', key: 'masque' } as const, false)
const tic = atom({ plugin: 'sonar', key: 'tic' } as const, 0)

// Ce que logique.mjs renvoie pour le pied (elementsPied) et le détail (jauges).
// `releve` : quota tiré du dernier relevé gardé (session froide), dessiné pâle.
type Morceau = { cle: string; etiquette: string; valeur: string; detail?: string; niveau: 'ok' | 'attention' | 'alerte'; part?: number; repere?: number; releve?: boolean }
type Vue = ReturnType<EngineInterface['ui']['resolve']>

const COULEUR = { attention: 'warning', alerte: 'error' } as const
// Le Svg est dessiné comme une image : pas de couleurs du thème, un gris lisible sur fond clair comme sombre.
const GRIS = '#888'
const PANNEAU = 'sonar'
const SEP = '   '
const GIT_DELAI_MS = 3000
// Fin d'un gros journal lue par tail : sous les 4 Mio que $.process.run rend, et bien plus qu'une réponse.
const TAILLE_FIN = 3 * 1024 * 1024
const GIT_ECART_MS = 5000

// Variables du module : repartent de zéro à un rechargement (register et session.start sont rejoués).
let cfg = lireConfig()
let minuterie: Timer | undefined
let dernierGit = 0
let gitEnCours = false
// Journal des relevés de quota : chemin résolu une fois, dernier relevé connu, écritures à la file (jamais deux à la fois).
let cheminReleves: string | undefined
let derniereCle = ''
let ecriture: Promise<unknown> = Promise.resolve()
// Dernier relevé gardé dans le store (session froide, issue #33) : compte de la session (donné par l'appli de bureau,
// jamais affiché).
const CLE_GARDE = 'releve'
let compte: string | undefined

function localeHote(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? ''
  } catch {
    return ''
  }
}

// Données partielles tolérées (passerelle, hôte qui omet un champ).
// Le contexte n'est pas gardé : Claude Code l'affiche déjà.
// `a` : heure de la mesure (une session silencieuse la compare au relevé gardé, issue #35).
const versMesure = (u: { rateLimits?: SessionRateLimit[]; cost?: { usd: number } }, a?: number): SonarMesure => ({
  quotas: (u.rateLimits ?? []).map(q => ({ kind: q.kind, percentUsed: q.percentUsed, resetsAt: q.resetsAt })),
  cout: u.cost?.usd,
  a,
})

async function resoudreJournal($: EngineInterface): Promise<string | undefined> {
  if (cfg.journal === null) return undefined
  const maison = besoinMaison(cfg.journal) ? (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) : undefined
  cheminReleves ??= cheminJournal(cfg.journal, maison)
  return cheminReleves
}

// Relevé de quota (option quotaLog) : une ligne ajoutée au journal quand un % ou une heure de remise change.
// Jamais attendu par l'affichage ; erreurs avalées. Le fichier est relu juste avant d'écrire : deux sessions ouvertes
// qui voient le même changement ne l'écrivent qu'une fois (sauf écritures à la même milliseconde, sans verrou possible).
function journaliser($: EngineInterface, m: SonarMesure) {
  if (cfg.journal === null) return
  // L'heure du relevé est celle de la mesure, pas celle où la file arrive à l'écriture.
  const quand = $.clock.now()
  ecriture = ecriture.then(async () => {
    const maintenant = await quand
    const r = releve(m.quotas, m.a ?? maintenant)
    if (!r || cleReleve(r) === derniereCle) return
    const chemin = await resoudreJournal($)
    if (!chemin) return
    const maj = majJournal((await $.fs.exists(chemin)) ? String(await $.fs.read(chemin)) : '', r)
    // $.fs lit et écrit au plus 4 Mio : un journal plein part en archive à côté.
    if (maj?.archive !== undefined) await $.fs.write(cheminArchive(chemin, maintenant), maj.archive)
    if (maj) await $.fs.write(chemin, maj.texte)
    derniereCle = cleReleve(r)
  }).catch(() => undefined)
}

// Le relevé vif est gardé dans le store (pour tous, journal ou non) : une session neuve le ressortira comme minimum tant
// que le moteur n'a rien (logique.mjs, quotasGardes). La valeur vive l'écrase toujours, même plus basse. Plusieurs
// sessions : la dernière écriture gagne, sans verrou (au pire un relevé un peu plus vieux, affiché avec son âge).
// Réécrit à chaque mesure, même chiffres : l'âge affiché est celui de la dernière lecture, pas du dernier changement.
// Une session qui ne connaît pas son compte (terminal) n'écrase pas un relevé qui en porte un : il pourrait être d'un
// autre compte, et la protection « autre compte » sauterait.
function garder($: EngineInterface, m: SonarMesure) {
  void (async () => {
    // Daté de la mesure : la session ne prend jamais son propre relevé pour un plus récent (quotasFrais).
    const r = releve(m.quotas, m.a ?? await $.clock.now())
    if (!r) return
    if (!compte) {
      const avant = await $.store.get(CLE_GARDE) as { compte?: unknown } | undefined
      if (avant?.compte) return
    }
    await $.store.set(CLE_GARDE, compte ? { ...r, compte } : r)
  })().catch(() => undefined)
}

// Session ouverte avant le mod (reprise, appli relancée) : turn.step n'a encore rien vu, le cache resterait vide jusqu'au
// prochain message. On lit sa dernière réponse dans le journal local de la session (logique.mjs, derniereReponse) :
// <dossier de config>/projects/<dossier du projet>/<id de session>.jsonl : d'abord le dossier déduit du dossier courant
// (dossierProjet), sinon le premier dossier qui contient l'id (session ouverte ailleurs, nom d'une autre version).
// Journal de plus de 4 Mio ($.fs.read ne lit pas au-delà) ou introuvable : l'heure seule, prise dans la fiche de
// Claude Desktop (lireFiche) ; sans fiche, vide jusqu'au prochain message. Erreurs : rien.
async function reprendreCache($: EngineInterface) {
  if (!cfg.segments.includes('cache') || (await read($, cache))) return
  const id = await $.session.id()
  if (!/^[\w-]+$/.test(id)) return
  const conf = await $.env.get('CLAUDE_CONFIG_DIR')
  const maison = conf ? undefined : (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  const base = conf || (maison ? `${maison}/.claude` : undefined)
  if (!base) return
  const projets = `${base.replace(/[\\/]+$/, '')}/projects`
  const statut = (nom: string) => $.fs.stat(`${projets}/${nom}/${id}.jsonl`).catch(() => undefined)
  const devine = dossierProjet(await $.session.cwd().catch(() => undefined))
  let nom = devine
  let s = devine ? await statut(devine) : undefined
  if (s?.kind !== 'file') {
    nom = undefined
    for (const d of await $.fs.list(projets).catch(() => [])) {
      if (d.kind !== 'dir' || d.name === devine) continue
      s = await statut(d.name)
      if (s?.kind === 'file') {
        nom = d.name
        break
      }
    }
  }
  const chemin = `${projets}/${nom}/${id}.jsonl`
  const r = nom && s && s.size <= TAILLE_MAX_SESSION
    ? derniereReponse(String(await $.fs.read(chemin)))
    : (nom && s ? await lireFin($, chemin) : undefined)
      ?? await lireFiche($, id).then(reponse => (reponse ? { reponse, ttl: undefined } : undefined), () => undefined)
  // Un /clear ou une reprise pendant la lecture : la conversation n'est plus la même, on n'écrit rien.
  if (!r || (await $.session.id()) !== id) return
  // Une réponse arrivée pendant la lecture l'emporte : l'écriture ne remplit qu'un cache encore vide (update compare
  // et réessaie, sans fenêtre entre le test et l'écriture).
  await update($, cache, cur => cur ?? r.reponse)
  const duree = r.ttl
  if (duree && (await $.store.get('ttl')) === undefined) await update($, ttl, cur => cur ?? duree)
}

// Journal de plus de 4 Mio : sa fin par `tail -c` (Linux, macOS ; $.fs.read ne lit pas une partie de fichier, et
// $.process.run rend jusqu'à 4 Mio). La première ligne, coupée, est illisible et ignorée. Sans tail (Windows) : rien.
async function lireFin($: EngineInterface, chemin: string) {
  try {
    const p = await $.process.run(['tail', '-c', String(TAILLE_FIN), '--', chemin], { timeoutMs: 10_000 })
    return p.exitCode === 0 ? derniereReponse(p.stdout) : undefined
  } catch {
    return undefined
  }
}

// Journal de plus de 4 Mio ou introuvable : la fiche de la session chez Claude Desktop (logique.mjs, reponseFiche),
// %LOCALAPPDATA%/Claude-Data/claude_*/claude-code-sessions/<compte>/<organisation>/<id de la session côté appli>.json,
// chemin donné par les variables que l'appli passe au moteur. Windows seulement : sans ces variables, rien.
async function lireFiche($: EngineInterface, id: string) {
  const local = await $.env.get('LOCALAPPDATA')
  const morceaux = [
    await $.env.get('CLAUDE_CODE_ACCOUNT_UUID'),
    await $.env.get('CLAUDE_CODE_ORGANIZATION_UUID'),
    await $.env.get('CLAUDE_CODE_HOST_SESSION_ID'),
  ]
  if (!local || !morceaux.every(m => m && /^[\w-]+$/.test(m))) return undefined
  const data = `${local.replace(/[\\/]+$/, '')}/Claude-Data`
  for (const d of await $.fs.list(data)) {
    if (d.kind !== 'dir' || !d.name.startsWith('claude_')) continue
    const fiche = `${data}/${d.name}/claude-code-sessions/${morceaux.join('/')}.json`
    const s = await $.fs.stat(fiche).catch(() => undefined)
    if (s?.kind === 'file' && s.size <= TAILLE_MAX_SESSION) return reponseFiche(String(await $.fs.read(fiche)), id, await $.clock.now())
  }
  return undefined
}

// Le choix de /sonar (gardé dans le store) l'emporte sur l'option du plugin.
async function bandeauActif($: EngineInterface): Promise<boolean> {
  return (await read($, avecBandeau)) ?? cfg.bandeau
}

// Ce que le sonar sait à l'instant : `pied` (le minimum, pour le pied ; sans le cache quand le bandeau le montre) et
// `jauges` (tout le détail).
async function calculer($: EngineInterface) {
  const m = await read($, mesure)
  const t = await read($, ttl)
  const maintenant = await $.clock.now()
  // Rien du moteur (session froide) : le dernier relevé gardé, revérifié à chaque dessin (une fenêtre se remet en route).
  // Valeur vive : remplacée fenêtre par fenêtre par un relevé plus récent d'une autre session (issue #35).
  const garde = await Promise.resolve().then(() => $.store.get(CLE_GARDE)).catch(() => undefined)
  const quotas = m?.quotas.length ? quotasFrais(m.quotas, m.a, garde, maintenant, compte) : quotasGardes(garde, maintenant, compte)
  const d = {
    quotas,
    cout: m?.cout,
    cache: (await read($, cache)) ?? undefined,
    ttlMs: t ? TTL[t] : undefined,
    modele: (await read($, modele)) ?? undefined,
    depot: (await read($, depot)) ?? undefined,
  }
  return {
    pied: elementsPied(d, maintenant, cfg, { sansCache: await bandeauActif($) }) as Morceau[],
    jauges: jauges(d, maintenant, cfg) as Morceau[],
  }
}

// Git lancé hors du dessin, au plus toutes les 5 s ; en cas d'échec la dernière valeur reste.
async function rafraichirDepot($: EngineInterface) {
  if (!cfg.segments.includes('depot')) return
  const maintenant = await $.clock.now()
  if (gitEnCours || maintenant - dernierGit < GIT_ECART_MS) return
  gitEnCours = true
  dernierGit = maintenant
  try {
    const repo = await $.session.repo()
    if (!repo) {
      await update($, depot, () => null)
      return
    }
    const nom = nomDepot(repo.remote ?? undefined, repo.root) ?? 'repo'
    const r = await $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v1', '--branch'], { timeoutMs: GIT_DELAI_MS })
    if (r.exitCode !== 0) return
    const s = lireStatut(r.stdout)
    if (s) await update($, depot, () => ({ nom, branche: s.branche, detachee: s.detachee, modifies: s.modifies }))
  } catch { /* git absent ou trop lent : on garde la dernière valeur */ } finally {
    gitEnCours = false
  }
}

function demarrerMinuterie($: EngineInterface) {
  minuterie?.cancel()
  minuterie = $.clock.every(60_000, () => {
    void (async () => {
      await update($, tic, n => n + 1)
      await rafraichirDepot($)
    })().catch(() => undefined)
  })
}

// Une ligne : étiquette pâle et petite, valeur nette aux chiffres alignés (colorée seulement hors norme), détail pâle.
// Un seul Text parent : des Text côte à côte dans un Box se partageaient la largeur et, la fenêtre étroite,
// chacun passait à la ligne dans sa colonne (vu le 28/10). Pas de dimColor sur le parent : les enfants en hériteraient.
// `sep` : sur le bureau, le texte est dessiné comme du HTML et des espaces à la suite n'en font qu'un (vu le 28/10) :
// on y sépare par un espace cadratin, qui ne se fond pas.
function phrase(u: Vue, els: Morceau[], sep = SEP) {
  const { Text } = u
  return (
    <Text>
      {els.flatMap((el, i) => [
        <Text key={`${el.cle}-e`} dimColor size="caption">{`${i > 0 ? sep : ''}${el.etiquette ? `${el.etiquette} ` : ''}`}</Text>,
        <Text key={`${el.cle}-v`} weight="medium" tabular {...(el.niveau === 'ok' ? {} : { color: COULEUR[el.niveau] })} {...(el.releve ? { dimColor: true } : {})}>{el.valeur}</Text>,
        ...(el.detail ? [<Text key={`${el.cle}-d`} dimColor size="caption">{` (${el.detail})`}</Text>] : []),
      ])}
    </Text>
  )
}

// Jauge : une barre. Quota (`repere` = part de la fenêtre écoulée) : bleue de 0 jusqu'où usage et temps concordent, puis
// colorée jusqu'au plus avancé des deux, verte quand le temps est devant (la marge), orange quand l'usage est devant, rouge
// si en plus le quota est en alerte ; au-delà, la piste. Relevé gardé (session froide, sans temps) : l'usage en bleu, toute la
// jauge à demi-teinte. Cache chaud : le temps qui lui reste, orange sanguin, bleu sur la fin (`BIENTOT_FROID`) ;
// froid, la piste seule.
// Largeur : le dessin est large (`largeur` px) et sans viewBox, ses rectangles en % ; sans `width`, l'appli le borne à la
// place de sa colonne, et les % se calculent sur la largeur dessinée (coins ronds non déformés).
const JAUGE = { largeur: 2000, hauteur: 8 }
const COULEURS = { temps: '#5b8def', marge: '#3fa66b', avance: '#e0913a', alerte: '#e5484d', cache: '#d9480f' } as const
const BIENTOT_FROID = 0.2
function svgJauge(el: Morceau, part: number) {
  const { largeur: L, hauteur: H } = JAUGE
  const pc = (x: number) => Math.round(1000 * Math.min(1, Math.max(0, x))) / 10
  const rect = (w: number, fill: string, plus = '') => `<rect y="1" width="${w}%" height="${H - 2}" rx="3" fill="${fill}"${plus}/>`
  const u = pc(part)
  let barres: [number, string][]
  if (el.releve) barres = [[u, COULEURS.temps]]
  else if (el.repere !== undefined) {
    const t = pc(el.repere)
    // Le rythme sur les valeurs brutes ; seuls les dessins sont arrondis. Le rouge seulement quand l'usage est devant :
    // en alerte par le seuil absolu, une marge de temps reste verte.
    const devant = part > el.repere
    const teinte = !devant ? COULEURS.marge : el.niveau === 'alerte' ? COULEURS.alerte : COULEURS.avance
    // La couleur jusqu'au bout, le bleu par-dessus jusqu'à la part commune : la jonction reste nette malgré les coins ronds.
    barres = [[Math.max(u, t), teinte], [Math.min(u, t), COULEURS.temps]]
  }
  else barres = [[u, part <= BIENTOT_FROID ? COULEURS.temps : COULEURS.cache]]
  const dessin = rect(100, GRIS, ' fill-opacity="0.25"') + barres.filter(([w]) => w > 0).map(([w, c]) => rect(w, c)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">${el.releve ? `<g opacity="0.5">${dessin}</g>` : dessin}</svg>`
}

// Le Svg là où la surface le dessine : jamais sur le terminal (le kit y laisse la clé, l'appli n'en dessine rien).
const svgDe = (u: Vue, surface: string) => (surface !== 'terminal' && 'Svg' in u ? u.Svg : undefined)

// Un élément du bandeau ou du panneau : sa ligne, et dessous sa jauge là où le Svg existe (pas sur le terminal).
// `colonne` (bandeau) : chaque élément part d'un peu moins d'un tiers de la rangée et grandit pour la remplir ; sous
// `minWidth`, la rangée passe à la ligne. Dans le panneau, la jauge prend sa largeur.
const COLONNE = { width: '30%', flexGrow: 1, minWidth: 24 } as const
function bloc(u: Vue, el: Morceau, Svg: ReturnType<typeof svgDe>, colonne = false) {
  const { Box } = u
  return (
    <Box key={el.cle} flexDirection="column" {...(colonne ? COLONNE : {})}>
      {phrase(u, [el])}
      {Svg && el.part !== undefined ? <Svg source={svgJauge(el, el.part)} alt={`${el.etiquette} ${el.valeur}`} height={JAUGE.hauteur} /> : null}
    </Box>
  )
}

// Bandeau : les jauges côte à côte (elles passent à la ligne si la place manque) ; sur le terminal, une ligne de texte.
// Branche et coût n'y sont pas : le pied les montre.
async function bandeau($: EngineInterface, e: RenderInput) {
  const js = (await calculer($)).jauges.filter(el => !DANS_LE_PIED.includes(el.cle))
  if (js.length === 0) return undefined
  const u = $.ui.resolve(e)
  const Svg = svgDe(u, e.surface)
  if (!Svg) return phrase(u, js)
  const { Box } = u
  return <Box flexDirection="row" flexWrap="wrap" columnGap={3} rowGap={1}>{js.map(el => bloc(u, el, Svg, true))}</Box>
}

// Sous le détail (panneau ou réponse de /sonar) : bandeau ou non, durée du cache, fichier des relevés.
async function notes($: EngineInterface) {
  const t = textes(cfg.langue)
  const force = (await $.store.get('ttl')) !== undefined
  const etat = t.etat(await bandeauActif($), (await read($, ttl)) ?? undefined, force)
  return cfg.journal === null ? etat : `${etat}\n${t.journal(await resoudreJournal($).catch(() => undefined))}`
}

export const register: Register = (on, options) => {
  cfg = lireConfig(options, localeHote())
  let t = textes(cfg.langue)

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      // Linux, macOS en terminal : la langue est dans LC_ALL / LC_MESSAGES / LANG, Intl y répond en-US (langueHote).
      // Une variable refusée ou absente ne doit rien casser, que le moteur lève l'erreur tout de suite ou par la promesse.
      const lire = (f: () => Promise<string | undefined>) => Promise.resolve().then(f).catch(() => undefined)
      const systeme = localeSysteme(
        await lire(() => $.env.get('LC_ALL')),
        await lire(() => $.env.get('LC_MESSAGES')),
        await lire(() => $.env.get('LANG')),
      )
      const langue = langueHote(localeHote(), systeme)
      if (langue !== localeHote()) {
        cfg = lireConfig(options, langue)
        t = textes(cfg.langue)
      }
      // Le menu ne propose pas de sous-commandes : `argumentHint` les rappelle en gris après le nom.
      await $.command.register({
        name: 'sonar',
        description: cfg.langue === 'fr' ? 'Sonar : détail complet, bandeau, durée du cache, masquer / afficher' : 'Sonar: full detail, banner, cache lifetime, hide / show',
        argumentHint: cfg.langue === 'fr' ? '[bandeau | bandeau off | ttl 5m|1h|auto | masquer | afficher]' : '[banner | banner off | ttl 5m|1h|auto | hide | show]',
      })
      // Avant la 0.8.0, le store gardait un emplacement : « bandeau » vaut bandeau actif, un autre le pied seul.
      const garde = await $.store.get('bandeau')
      const ancien = await $.store.get('emplacement')
      if (typeof garde === 'boolean') await update($, avecBandeau, () => garde)
      else if (typeof ancien === 'string') await update($, avecBandeau, () => ancien === 'bandeau')
      const ttlGarde = await $.store.get('ttl')
      if (ttlGarde === '5m' || ttlGarde === '1h') await update($, ttl, () => ttlGarde)
      const id = await lire(() => $.env.get('CLAUDE_CODE_ACCOUNT_UUID'))
      compte = id && /^[\w-]+$/.test(id) ? id : undefined
      await update($, mesure, () => null)
      const u = await $.session.usage().catch(() => undefined)
      if (u) {
        // Quotas de la dernière réponse de la session (peut-être d'il y a des heures), pas une mesure neuve : sans heure,
        // ni gardés ni journalisés, ils cèdent à tout relevé valide du store (quotasFrais).
        const m = versMesure(u)
        await update($, mesure, () => m)
      }
      demarrerMinuterie($)
      // Lecture du journal de la session à côté : elle ne retarde pas le démarrage.
      void reprendreCache($).catch(() => undefined)
      await rafraichirDepot($)
    } catch { /* le sonar ne bloque jamais le démarrage */ }
    return r
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    try {
      const m = versMesure(e, await $.clock.now())
      await update($, mesure, () => m)
      journaliser($, m)
      garder($, m)
    } catch { /* idem */ }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Chaque requête du fil principal : ce qu'elle a lu / écrit dans le cache. Les sous-agents ont leur propre cache.
  on('turn.step', async function* ($, e, next) {
    // Rien avant `next` ne doit pouvoir échouer : c'est la requête du modèle qui passe ici.
    const debut = await $.clock.now().catch(() => undefined)
    const r = yield* next(e)
    try {
      if (e.agentId === undefined && r.usage) {
        const avant = await read($, cache)
        // Le cache est lu / prolongé à l'envoi de la requête : c'est de là que court sa durée de vie.
        const apres: SonarReponse = {
          a: debut ?? await $.clock.now(),
          lu: r.usage.cache_read_input_tokens,
          ecrit: r.usage.cache_creation_input_tokens,
          neuf: r.usage.input_tokens,
          modele: r.usage.model,
        }
        // Seule la 1re requête d'un tour suit un vrai silence : c'est elle qui renseigne sur la durée de vie.
        if (e.index === 0 && debut !== undefined && (await $.store.get('ttl')) === undefined) {
          const deduit = deduireTtl(avant ?? undefined, apres)
          if (deduit) await update($, ttl, () => deduit)
        }
        await update($, cache, () => apres)
        await update($, modele, () => r.usage!.model)
      }
    } catch { /* idem */ }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      // git peut prendre jusqu'à 3 s : on ne fait pas attendre la fin du tour.
      void rafraichirDepot($).catch(() => undefined)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Changement de modèle : le moteur dit lui-même la durée de vie du cache.
  on('classic.PostModelSwitch', async ($, e, next) => {
    try {
      await update($, modele, () => e.to_model)
      if ((await $.store.get('ttl')) === undefined) await update($, ttl, () => e.cache_ttl)
    } catch { /* idem */ }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Après une compaction, l'ancien cache ne sert plus : la prochaine réponse le réécrit.
  on('classic.PostCompact', async ($, e, next) => {
    await update($, cache, () => null).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Fin de conversation (/clear, reprise d'une autre, sortie) : plus de contexte ni de cache.
  // Après un /clear aucun session.start ne suit : la prochaine mesure remplira de nouveau.
  on('session.end', async ($, e, next) => {
    await update($, cache, () => null).catch(() => undefined)
    await update($, mesure, () => null).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'sonar' }, async ($, e) => {
    const c = lireCommande(e.args)
    if (c.erreur !== undefined) return { text: `${t.inconnu(c.erreur)}\n${t.aide}` }
    if (c.aide) {
      // Le détail complet va dans le panneau ; s'il ne peut pas s'ouvrir, il est écrit ici, une ligne par élément.
      const ouvert = await $.ui.open({ id: PANNEAU, title: 'Sonar' }).then(r => r.isPlaced, () => false)
      const detail = ouvert ? '' : ligne((await calculer($)).jauges, '\n')
      return { text: `${detail ? `${detail}\n` : ''}${await notes($)}\n${t.aide}` }
    }
    if (c.bandeau !== undefined) {
      const oui = Boolean(c.bandeau)
      await update($, avecBandeau, () => oui)
      await $.store.set('bandeau', oui)
      await $.store.delete('emplacement')
      await update($, masque, () => false)
      return { text: oui ? t.bandeauOui : t.bandeauNon }
    }
    if (c.ttl) {
      if (c.ttl === 'auto') {
        await $.store.delete('ttl')
        await update($, ttl, () => null)
        return { text: t.ttlAuto }
      }
      await $.store.set('ttl', c.ttl)
      await update($, ttl, () => c.ttl as '5m' | '1h')
      return { text: t.ttlForce(c.ttl) }
    }
    await update($, masque, () => Boolean(c.masque))
    return { text: c.masque ? t.masquee : t.remise }
  })

  // ——— Dessins ———
  // Chaque dessin lit `tic` : la minuterie le fait avancer, ce qui redessine comptes à rebours et cache.

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    await read($, tic)
    // Le pied, toujours là et court (logique.mjs, elementsPied) : cas normal « 🔥 2,40 $ · ⎇ master ».
    if (await read($, masque)) return next(e)
    const { pied } = await calculer($)
    if (pied.length === 0) return next(e)
    // L'appli de bureau ne dessine pas les `modes` ajoutés (essai du 27/10) : on y dessine notre propre arbre,
    // les modes natifs devant, joints comme le moteur le fait.
    if (e.surface === 'desktop') {
      const u = $.ui.resolve(e)
      const { Text } = u
      const natifs = e.props.modes.join(' & ')
      return <Text>{natifs ? <Text dimColor>{`${natifs} & `}</Text> : null}{phrase(u, pied, SEP_PIED)}</Text>
    }
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, ligne(pied, SEP_PIED)] } })
  }).catch(($, e, next) => next(e))

  // Bandeau : seulement s'il est activé ; sinon la zone reste au moteur, sans cadre vide.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, tic)
    if (e.props.hasSurvey) return next(e)
    const montrer = (await bandeauActif($)) && !(await read($, masque))
    const vue = montrer ? await bandeau($, e) : undefined
    if (!vue) return next(e)
    const { Box } = $.ui.resolve(e)
    // Les autres mods de la zone (la ligne 🐋 de baleine…) sont dessinés par next : sans lui, sonar les effaçait (07/11).
    // Une erreur plus bas ne doit pas emporter les jauges.
    let dessous = null
    try {
      dessous = await next(e)
    } catch { /* les jauges restent */ }
    return <Box flexDirection="column">{vue}{dessous ?? null}</Box>
  }).catch(($, e, next) => next(e))

  // Panneau ouvert par /sonar : tout le détail, jauges comprises sur le bureau ; fermé par sa croix.
  on('ui.render', { component: 'Pane', requestId: PANNEAU }, async ($, e) => {
    await read($, tic)
    const { jauges: js } = await calculer($)
    const u = $.ui.resolve(e)
    const { Box, Text } = u
    return (
      <Box flexDirection="column" rowGap={1}>
        {js.length > 0 ? js.map(el => bloc(u, el, svgDe(u, e.surface))) : <Text dimColor>{t.vide}</Text>}
        <Text dimColor size="caption">{await notes($)}</Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
