// Mod « sonar » : la status line du terminal, pour l'onglet Code de Claude Desktop.
// N'ajoute aucun token : il lit les chiffres que le moteur a déjà (session.measure, turn.step) et git en local.
// Rien de propre à un abonnement : un chiffre que le moteur n'a pas (quotas hors abonnement, coût) n'est pas affiché,
// et seuils, langue, segments et branches protégées sont des options du plugin. Logique pure (testée) : ./logique.mjs.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, SessionRateLimit, Timer } from 'claude-code'

import type { SonarDepot, SonarEmplacement, SonarMesure, SonarReponse } from '../types'
import { EMPLACEMENTS, TTL, deduireTtl, ligne, lireCommande, lireConfig, lireStatut, nomDepot, nomEmplacement, segments, textes } from './logique.mjs'

const mesure = atom({ plugin: 'sonar', key: 'mesure' } as const, null as SonarMesure | null)
const cache = atom({ plugin: 'sonar', key: 'cache' } as const, null as SonarReponse | null)
const depot = atom({ plugin: 'sonar', key: 'depot' } as const, null as SonarDepot | null)
const modele = atom({ plugin: 'sonar', key: 'modele' } as const, null as string | null)
const ttl = atom({ plugin: 'sonar', key: 'ttl' } as const, null as '5m' | '1h' | null)
const emplacement = atom({ plugin: 'sonar', key: 'emplacement' } as const, null as SonarEmplacement | null)
const masque = atom({ plugin: 'sonar', key: 'masque' } as const, false)
const tic = atom({ plugin: 'sonar', key: 'tic' } as const, 0)

const COULEUR = { attention: 'warning', alerte: 'error' } as const
const GIT_DELAI_MS = 3000
const GIT_ECART_MS = 5000

// Variables du module : repartent de zéro à un rechargement (register et session.start sont rejoués).
let cfg = lireConfig()
let minuterie: Timer | undefined
let dernierGit = 0
let gitEnCours = false

function localeHote(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? ''
  } catch {
    return ''
  }
}

// Données partielles tolérées (passerelle, hôte qui omet un champ).
const versMesure = (u: { context?: { percent?: number }; rateLimits?: SessionRateLimit[]; cost?: { usd: number } }): SonarMesure => ({
  contexte: u.context?.percent,
  quotas: (u.rateLimits ?? []).map(q => ({ kind: q.kind, percentUsed: q.percentUsed, resetsAt: q.resetsAt })),
  cout: u.cost?.usd,
})

// L'emplacement choisi par /sonar (gardé dans le store) l'emporte sur l'option du plugin.
async function lieu($: EngineInterface): Promise<SonarEmplacement> {
  return (await read($, emplacement)) ?? (cfg.emplacement as SonarEmplacement)
}

async function calculer($: EngineInterface) {
  const m = await read($, mesure)
  const t = await read($, ttl)
  return segments({
    contexte: m?.contexte,
    quotas: m?.quotas ?? [],
    cout: m?.cout,
    cache: (await read($, cache)) ?? undefined,
    ttlMs: t ? TTL[t] : undefined,
    modele: (await read($, modele)) ?? undefined,
    depot: (await read($, depot)) ?? undefined,
  }, await $.clock.now(), cfg)
}

// Emplacement « ligne » : $.ui.status n'est pas un dessin, il faut le reposer à chaque changement.
async function poserStatut($: EngineInterface) {
  if ((await lieu($)) !== 'ligne' || (await read($, masque))) {
    $.ui.status(undefined)
    return
  }
  const t = ligne(await calculer($))
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

// Segments colorés (emplacements qui dessinent) : gris quand tout va bien, orange / rouge sinon.
async function dessin($: EngineInterface, e: RenderInput, avecBouton: boolean) {
  const segs = await calculer($)
  if (segs.length === 0) return undefined
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="row">
      {segs.map((s, i) => (
        <Text key={s.cle} dimColor={s.niveau === 'ok'} color={s.niveau === 'ok' ? undefined : COULEUR[s.niveau as 'attention' | 'alerte']}>
          {i > 0 ? ' · ' : ''}{s.texte}
        </Text>
      ))}
      {avecBouton && <Text> </Text>}
      {avecBouton && <Button key="masquer" plain label={textes(cfg.langue).boutonMasquer} onPress={() => update($, masque, () => true)} />}
    </Box>
  )
}

export const register: Register = (on, options) => {
  cfg = lireConfig(options, localeHote())
  const t = textes(cfg.langue)

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      await $.command.register({ name: 'sonar', description: cfg.langue === 'fr' ? 'Sonar : emplacement, durée du cache, masquer / afficher' : 'Sonar: placement, cache lifetime, hide / show' })
      const lieuGarde = await $.store.get('emplacement')
      if (typeof lieuGarde === 'string' && (EMPLACEMENTS as readonly string[]).includes(lieuGarde)) {
        await update($, emplacement, () => lieuGarde as SonarEmplacement)
      }
      const ttlGarde = await $.store.get('ttl')
      if (ttlGarde === '5m' || ttlGarde === '1h') await update($, ttl, () => ttlGarde)
      await update($, mesure, () => null)
      const u = await $.session.usage().catch(() => undefined)
      if (u) await update($, mesure, () => versMesure(u))
      demarrerMinuterie($)
      await rafraichirDepot($)
      await poserStatut($)
    } catch { /* la sonar ne bloque jamais le démarrage */ }
    return r
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    try {
      await update($, mesure, () => versMesure(e))
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
      const force = (await $.store.get('ttl')) !== undefined
      return { text: `${t.etat(nomEmplacement(await lieu($), cfg.langue), (await read($, ttl)) ?? undefined, force)}\n${t.aide}` }
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
    const x = ligne(await calculer($))
    return next(x ? { ...e, props: { ...e.props, modes: [...e.props.modes, x] } } : e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    await read($, tic)
    if ((await lieu($)) !== 'indice' || (await read($, masque))) return next(e)
    return (await dessin($, e, false)) ?? next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, tic)
    if (e.props.hasSurvey || (await lieu($)) !== 'bandeau' || (await read($, masque))) return next(e)
    return (await dessin($, e, true)) ?? next(e)
  }).catch(($, e, next) => next(e))
}
