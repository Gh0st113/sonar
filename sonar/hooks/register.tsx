// Mod « sonar » : la status line du terminal, pour l'onglet Code de Claude Desktop.
// N'ajoute aucun token : il lit les chiffres que le moteur a déjà (session.measure, turn.step) et git en local.
// Ne répète pas ce que Claude Code affiche déjà (contexte, % des 5 h) : le pied ne garde que l'essentiel,
// le bandeau (option) et le panneau de /sonar montrent le détail en jauges.
// Rien de propre à un abonnement : un chiffre que le moteur n'a pas (quotas hors abonnement, coût) n'est pas affiché,
// et seuils, langue, segments et branches protégées sont des options du plugin. Logique pure (testée) : ./logique.mjs.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, SessionRateLimit, Timer } from 'claude-code'

import type { SonarDepot, SonarEmplacement, SonarMesure, SonarReponse } from '../types'
import {
  EMPLACEMENTS, TTL, besoinMaison, cheminArchive, cheminJournal, cleReleve, deduireTtl, elementsPied, jauges, ligne,
  lireCommande, lireConfig, lireStatut, majJournal, nomDepot, nomEmplacement, releve, textes,
} from './logique.mjs'

const mesure = atom({ plugin: 'sonar', key: 'mesure' } as const, null as SonarMesure | null)
const cache = atom({ plugin: 'sonar', key: 'cache' } as const, null as SonarReponse | null)
const depot = atom({ plugin: 'sonar', key: 'depot' } as const, null as SonarDepot | null)
const modele = atom({ plugin: 'sonar', key: 'modele' } as const, null as string | null)
const ttl = atom({ plugin: 'sonar', key: 'ttl' } as const, null as '5m' | '1h' | null)
const emplacement = atom({ plugin: 'sonar', key: 'emplacement' } as const, null as SonarEmplacement | null)
const masque = atom({ plugin: 'sonar', key: 'masque' } as const, false)
const tic = atom({ plugin: 'sonar', key: 'tic' } as const, 0)

// Ce que logique.mjs renvoie pour le pied (elementsPied) et le détail (jauges).
type Morceau = { cle: string; etiquette: string; valeur: string; detail?: string; niveau: 'ok' | 'attention' | 'alerte'; part?: number; repere?: number }
type Vue = ReturnType<EngineInterface['ui']['resolve']>

const COULEUR = { attention: 'warning', alerte: 'error' } as const
// Le Svg est dessiné comme une image : pas de couleurs du thème, un gris lisible sur fond clair comme sombre.
const GRIS = '#888'
const TEINTE = { ok: GRIS, attention: '#d4a017', alerte: '#e5484d' } as const
const PANNEAU = 'sonar'
const SEP = '   '
const SEP_BUREAU = '   '
const GIT_DELAI_MS = 3000
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

function localeHote(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? ''
  } catch {
    return ''
  }
}

// Données partielles tolérées (passerelle, hôte qui omet un champ).
// Le contexte n'est pas gardé : Claude Code l'affiche déjà.
const versMesure = (u: { rateLimits?: SessionRateLimit[]; cost?: { usd: number } }): SonarMesure => ({
  quotas: (u.rateLimits ?? []).map(q => ({ kind: q.kind, percentUsed: q.percentUsed, resetsAt: q.resetsAt })),
  cout: u.cost?.usd,
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
    const r = releve(m.quotas, maintenant)
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

// L'emplacement choisi par /sonar (gardé dans le store) l'emporte sur l'option du plugin.
async function lieu($: EngineInterface): Promise<SonarEmplacement> {
  return (await read($, emplacement)) ?? (cfg.emplacement as SonarEmplacement)
}

// Ce que le sonar sait à l'instant : `pied` (le minimum, pour le pied) et `jauges` (tout le détail).
async function calculer($: EngineInterface) {
  const m = await read($, mesure)
  const t = await read($, ttl)
  const d = {
    quotas: m?.quotas ?? [],
    cout: m?.cout,
    cache: (await read($, cache)) ?? undefined,
    ttlMs: t ? TTL[t] : undefined,
    modele: (await read($, modele)) ?? undefined,
    depot: (await read($, depot)) ?? undefined,
  }
  const maintenant = await $.clock.now()
  return { pied: elementsPied(d, maintenant, cfg) as Morceau[], jauges: jauges(d, maintenant, cfg) as Morceau[] }
}

// Emplacement « ligne » : $.ui.status n'est pas un dessin, il faut le reposer à chaque changement.
async function poserStatut($: EngineInterface) {
  if ((await lieu($)) !== 'ligne' || (await read($, masque))) {
    $.ui.status(undefined)
    return
  }
  const t = ligne((await calculer($)).jauges, SEP)
  $.ui.status(t || undefined)
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
      await poserStatut($)
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
        <Text key={`${el.cle}-e`} dimColor size="caption">{`${i > 0 ? sep : ''}${el.etiquette} `}</Text>,
        <Text key={`${el.cle}-v`} weight="medium" tabular {...(el.niveau === 'ok' ? {} : { color: COULEUR[el.niveau] })}>{el.valeur}</Text>,
        ...(el.detail ? [<Text key={`${el.cle}-d`} dimColor size="caption">{` (${el.detail})`}</Text>] : []),
      ])}
    </Text>
  )
}

// Jauge : barre = usage, trait = part de la fenêtre écoulée (ce que serait un usage régulier).
const JAUGE = { largeur: 120, hauteur: 8 }
function svgJauge(part: number, repere: number | undefined, niveau: Morceau['niveau']) {
  const { largeur: L, hauteur: H } = JAUGE
  const plein = Math.round(L * Math.min(1, Math.max(0, part)))
  const fond = `<rect y="1" width="${L}" height="${H - 2}" rx="3" fill="${GRIS}" fill-opacity="0.25"/>`
  const barre = plein > 0 ? `<rect y="1" width="${plein}" height="${H - 2}" rx="3" fill="${TEINTE[niveau]}"${niveau === 'ok' ? ' fill-opacity="0.7"' : ''}/>` : ''
  const trait = repere === undefined ? '' : `<rect x="${Math.min(L - 2, Math.max(0, Math.round(L * repere) - 1))}" width="2" height="${H}" fill="${GRIS}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">${fond}${barre}${trait}</svg>`
}

// Le Svg là où la surface le dessine : jamais sur le terminal (le kit y laisse la clé, l'appli n'en dessine rien).
const svgDe = (u: Vue, surface: string) => (surface !== 'terminal' && 'Svg' in u ? u.Svg : undefined)

// Un élément du bandeau ou du panneau : sa ligne, et dessous sa jauge là où le Svg existe (pas sur le terminal).
function bloc(u: Vue, el: Morceau, Svg: ReturnType<typeof svgDe>) {
  const { Box } = u
  return (
    <Box key={el.cle} flexDirection="column">
      {phrase(u, [el])}
      {Svg && el.part !== undefined ? <Svg source={svgJauge(el.part, el.repere, el.niveau)} alt={`${el.etiquette} ${el.valeur}`} width={JAUGE.largeur} height={JAUGE.hauteur} /> : null}
    </Box>
  )
}

// Bandeau : les jauges côte à côte (elles passent à la ligne si la place manque) ; sur le terminal, une ligne de texte.
async function bandeau($: EngineInterface, e: RenderInput) {
  const { jauges: js } = await calculer($)
  if (js.length === 0) return undefined
  const u = $.ui.resolve(e)
  const Svg = svgDe(u, e.surface)
  if (!Svg) return phrase(u, js)
  const { Box } = u
  return <Box flexDirection="row" flexWrap="wrap" columnGap={3} rowGap={1}>{js.map(el => bloc(u, el, Svg))}</Box>
}

// Sous le détail (panneau ou réponse de /sonar) : emplacement, durée du cache, fichier des relevés.
async function notes($: EngineInterface) {
  const t = textes(cfg.langue)
  const force = (await $.store.get('ttl')) !== undefined
  const etat = t.etat(nomEmplacement(await lieu($), cfg.langue), (await read($, ttl)) ?? undefined, force)
  return cfg.journal === null ? etat : `${etat}\n${t.journal(await resoudreJournal($).catch(() => undefined))}`
}

export const register: Register = (on, options) => {
  cfg = lireConfig(options, localeHote())
  const t = textes(cfg.langue)

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      // Le menu ne propose pas de sous-commandes : `argumentHint` les rappelle en gris après le nom.
      await $.command.register({
        name: 'sonar',
        description: cfg.langue === 'fr' ? 'Sonar : détail complet, emplacement, durée du cache, masquer / afficher' : 'Sonar: full detail, placement, cache lifetime, hide / show',
        argumentHint: cfg.langue === 'fr' ? '[pied | indice | ligne | bandeau | ttl 5m|1h|auto | masquer | afficher]' : '[footer | hint | status | banner | ttl 5m|1h|auto | hide | show]',
      })
      const lieuGarde = await $.store.get('emplacement')
      if (typeof lieuGarde === 'string' && (EMPLACEMENTS as readonly string[]).includes(lieuGarde)) {
        await update($, emplacement, () => lieuGarde as SonarEmplacement)
      }
      const ttlGarde = await $.store.get('ttl')
      if (ttlGarde === '5m' || ttlGarde === '1h') await update($, ttl, () => ttlGarde)
      await update($, mesure, () => null)
      const u = await $.session.usage().catch(() => undefined)
      if (u) {
        const m = versMesure(u)
        await update($, mesure, () => m)
        journaliser($, m)
      }
      demarrerMinuterie($)
      await rafraichirDepot($)
      await poserStatut($)
    } catch { /* le sonar ne bloque jamais le démarrage */ }
    return r
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    try {
      const m = versMesure(e)
      await update($, mesure, () => m)
      journaliser($, m)
      await poserStatut($)
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
      void rafraichirDepot($).then(() => poserStatut($)).catch(() => undefined)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Changement de modèle : le moteur dit lui-même la durée de vie du cache.
  on('classic.PostModelSwitch', async ($, e, next) => {
    try {
      await update($, modele, () => e.to_model)
      if ((await $.store.get('ttl')) === undefined) await update($, ttl, () => e.cache_ttl)
      await poserStatut($)
    } catch { /* idem */ }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Après une compaction, l'ancien cache ne sert plus : la prochaine réponse le réécrit.
  on('classic.PostCompact', async ($, e, next) => {
    await update($, cache, () => null).catch(() => undefined)
    await poserStatut($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Fin de conversation (/clear, reprise d'une autre, sortie) : plus de contexte ni de cache.
  // Après un /clear aucun session.start ne suit : la prochaine mesure remplira de nouveau.
  on('session.end', async ($, e, next) => {
    await update($, cache, () => null).catch(() => undefined)
    await update($, mesure, () => null).catch(() => undefined)
    if (e.reason === 'clear') await poserStatut($).catch(() => undefined)
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
    if (c.emplacement) {
      await update($, emplacement, () => c.emplacement as SonarEmplacement)
      await $.store.set('emplacement', c.emplacement)
      await update($, masque, () => false)
      await poserStatut($)
      return { text: t.affichee(nomEmplacement(c.emplacement, cfg.langue)) }
    }
    if (c.ttl) {
      if (c.ttl === 'auto') {
        await $.store.delete('ttl')
        await update($, ttl, () => null)
        await poserStatut($)
        return { text: t.ttlAuto }
      }
      await $.store.set('ttl', c.ttl)
      await update($, ttl, () => c.ttl as '5m' | '1h')
      await poserStatut($)
      return { text: t.ttlForce(c.ttl) }
    }
    await update($, masque, () => Boolean(c.masque))
    await poserStatut($)
    return { text: c.masque ? t.masquee : t.remise }
  })

  // ——— Dessins ———
  // Chaque dessin lit `tic` : la minuterie le fait avancer, ce qui redessine comptes à rebours et cache.

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    await read($, tic)
    if ((await lieu($)) !== 'pied' || (await read($, masque))) return next(e)
    // Le pied ne montre que ce qui mérite un coup d'œil (cas normal : la semaine seule).
    const { pied } = await calculer($)
    if (pied.length === 0) return next(e)
    // L'appli de bureau ne dessine pas les `modes` ajoutés (essai du 27/10) : on y dessine notre propre arbre,
    // les modes natifs devant, joints comme le moteur le fait.
    if (e.surface === 'desktop') {
      const u = $.ui.resolve(e)
      const { Text } = u
      return <Text>{e.props.modes.length > 0 ? <Text dimColor>{`${e.props.modes.join(' & ')} & `}</Text> : null}{phrase(u, pied, SEP_BUREAU)}</Text>
    }
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, ligne(pied, '  ')] } })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    await read($, tic)
    if ((await lieu($)) !== 'indice' || (await read($, masque))) return next(e)
    const { jauges: js } = await calculer($)
    return js.length > 0 ? phrase($.ui.resolve(e), js) : next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, tic)
    if (e.props.hasSurvey || (await lieu($)) !== 'bandeau' || (await read($, masque))) return next(e)
    return (await bandeau($, e)) ?? next(e)
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
