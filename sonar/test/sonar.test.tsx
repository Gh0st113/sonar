import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

type Moteur = Parameters<TestBody>[0]
// Le moteur estampille `origin` et `presentation` d'une vraie commande ; le test n'en a pas besoin.
const commande = async ($: Moteur, args: string) => ((await $.command.run({ command: 'sonar', args } as never)) as { text?: string }).text ?? ''

const H = 3_600_000
const T0 = Date.parse('2026-10-27T12:00:00Z')
// Les textes attendus sont en français ; un test plus bas vérifie l'anglais.
const FR = { options: { language: 'fr', clock: '24h' } }
const iso = (ms: number) => new Date(ms).toISOString()
// Symboles de l'ancien affichage : plus aucun dans un rendu.
const SYMBOLES = /[⚠🔥❄❔⎇●→≈↺·]/u

const QUOTAS = [
  { kind: 'five_hour', percentUsed: 23, resetsAt: iso(T0 + 2 * H) },
  { kind: 'seven_day', percentUsed: 41, resetsAt: iso(T0 + 72 * H) },
]
const MESURE = { context: { tokens: 68_000, window: 200_000, percent: 34 }, rateLimits: QUOTAS, cost: { usd: 1.234 }, changed: ['context', 'rateLimits', 'cost'] as ('context' | 'rateLimits' | 'cost')[] }

const PIED = { plugin: 'sonar', component: 'SessionMode', props: { modes: [] as string[] } } as const
const BANDEAU = {
  plugin: 'sonar', component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const
const INDICE = { plugin: 'sonar', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as const
const PANNEAU = {
  plugin: 'sonar', component: 'Pane', requestId: 'sonar',
  props: { title: 'Sonar', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

// Le « moteur » sous le mod : ce que le test répond à ses appels, et le dessin par défaut de chaque composant.
// `panneau` : ce que répond $.ui.open (placé ou non).
function moteur(on: On, opts: { git?: 'ok' | 'main' | 'panne' | 'hors-depot'; panneau?: boolean } = {}) {
  const horloge = mock.clock(on, { now: T0 })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'sonar' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.repo', () => ({ value: opts.git === 'hors-depot' ? null : { root: 'C:/Code/projet-a', remote: 'git@github.com:octo/projet-a.git', internal: false, name: null } }))
  on('process.run', () => {
    if (opts.git === 'panne') throw new Error('git introuvable')
    const tete = opts.git === 'main' ? '## main...origin/main' : '## feat/x...origin/feat/x'
    return { value: { exitCode: 0, stdout: `${tete}\n M a.js\n?? b.js\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: opts.panneau ? { isPlaced: true } : { isPlaced: false, reason: 'pas de surface' } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    if (e.component === 'SessionMode') return <Text>{(e.props as { modes: string[] }).modes.join(' & ') || '(rien)'}</Text>
    if (e.component === 'PromptHint') return <Text>{(e.props as { hint: string }).hint}</Text>
    return <Text>(moteur)</Text>
  })
  return horloge
}

async function demarrer($: Moteur) {
  await $.session.start({ cwd: 'C:/Code/projet-a', surface: 'desktop', isInteractive: true })
  await $.session.measure(MESURE)
}

// Texte du pied tel qu'il s'affiche.
async function pied($: Moteur, surface: 'terminal' | 'desktop', modes: string[] = []) {
  const ui = await $.ui.mount({ ...PIED, props: { modes }, surface })
  const t = (await ui.find({ type: 'Text' }))?.text ?? ''
  await ui.unmount()
  return t
}

test('pied (défaut) : cas normal = la semaine seule, ni contexte ni % des 5 h', FR, async ($, on) => {
  moteur(on)
  await demarrer($)
  expect(await pied($, 'terminal')).toBe('sem. 41 %')
  expect(await pied($, 'desktop')).toBe('sem. 41 %')
  // Sur le bureau, notre dessin remplace celui du moteur : un mode natif reste devant.
  expect(await pied($, 'desktop', ['focus'])).toBe('focus & sem. 41 %')
})

test('pied : 5 h « rapide » sans %, branche protégée ; couleur sur la valeur seule', FR, async ($, on) => {
  moteur(on, { git: 'main' })
  await demarrer($)
  // 5 h : 3 h écoulées sur 5, 80 % utilisés = 20 points d'avance (alerte).
  await $.session.measure({ ...MESURE, rateLimits: [{ ...QUOTAS[0]!, percentUsed: 80 }, QUOTAS[1]!] })
  // Alertes puis attentions en tête : l'appli coupe la fin du pied quand la fenêtre est étroite.
  expect(await pied($, 'terminal')).toBe('5 h rapide  branche main  sem. 41 %')
  const ui = await $.ui.mount({ ...PIED, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toMatch(/^5 h rapide +branche main +sem\. 41 %$/)
  expect((await ui.find({ type: 'Text', text: /^rapide$/ }))?.props.color).toBe('error')
  expect((await ui.find({ type: 'Text', text: /^main$/ }))?.props.color).toBe('warning')
  // La semaine, dans les clous, n'a pas de couleur.
  expect((await ui.find({ type: 'Text', text: /^41 %$/ }))?.props.color).toBeUndefined()
  await ui.unmount()
})

test('/sonar : le panneau s’ouvre (jauges sur le bureau, texte sur le terminal) ; sinon le détail en texte', FR, async ($, on) => {
  moteur(on, { panneau: true })
  await demarrer($)
  const r = await commande($, '')
  expect(r).not.toContain('semaine')
  expect(r).toContain('Sonar : pied')
  const bureau = await $.ui.mount({ ...PANNEAU, surface: 'desktop' })
  expect((await bureau.find({ type: 'Text', text: /^semaine/ }))?.text).toMatch(/^semaine 41 % \(20 %\/j, remise \S+ \d\d:\d\d\)$/)
  expect((await bureau.find({ type: 'Svg' } as never) as { props?: { alt?: string } } | undefined)?.props?.alt).toBe('5 h 23 %')
  expect(await bureau.find({ type: 'Text', text: /ctx|contexte/ })).toBeUndefined()
  expect((await bureau.find({ type: 'Text', text: /Sonar : pied/ }))?.text).toContain('cache inconnu')
  await bureau.unmount()
  const terminal = await $.ui.mount({ ...PANNEAU, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /^branche feat\/x \(projet-a, 2 modifiés\)$/ })).toBeDefined()
  await terminal.unmount()
})

test('/sonar sans panneau placé : une ligne par élément, sans contexte ni anciens symboles', FR, async ($, on) => {
  moteur(on)
  await demarrer($)
  const r = await commande($, '')
  const [l5, l7, branche, cout] = r.split('\n')
  expect(l5).toMatch(/^5 h 23 % \(remise \d\d:\d\d\)$/)
  expect(l7).toMatch(/^semaine 41 % \(20 %\/j, remise \S+ \d\d:\d\d\)$/)
  expect(branche).toBe('branche feat/x (projet-a, 2 modifiés)')
  expect(cout).toBe('coût 1,23 $')
  expect(r).not.toMatch(/ctx|contexte|undefined|NaN/)
  expect(r).not.toMatch(SYMBOLES)
})

test('cache : la réponse du fil principal compte, celle d’un sous-agent non ; froid après 1 h, alors au pied', FR, async ($, on) => {
  const horloge = moteur(on)
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const,
      usage: e.agentId
        ? { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' }
        : { input_tokens: 4, output_tokens: 1, cache_read_input_tokens: 92, cache_creation_input_tokens: 4, model: 'claude-opus-5-5' },
      agentId: e.agentId,
    }
  })
  await demarrer($)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 })) { /* rien */ }
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' })) { /* rien */ }
  // Cache chaud : rien au pied ; le détail (durée de vie encore inconnue : « au moins ») dans /sonar.
  expect(await pied($, 'desktop')).toBe('sem. 41 %')
  expect(await commande($, '')).toMatch(/cache chaud \(92 % relu, au moins jusqu'à \d\d:\d\d\)/)
  await horloge.advance(H + 60_000)
  expect(await pied($, 'desktop')).toMatch(/^cache froid +sem\. 41 %$/)
  expect(await pied($, 'terminal')).toBe('cache froid  sem. 41 %')
  expect(await commande($, '')).toContain('cache froid')
})

test('/sonar bandeau : jauges sur le bureau, une ligne sur le terminal, couleur sur la valeur en alerte ; masquer puis afficher', FR, async ($, on) => {
  moteur(on)
  await demarrer($)
  // Semaine très en avance : alerte.
  await $.session.measure({ ...MESURE, rateLimits: [QUOTAS[0]!, { ...QUOTAS[1]!, percentUsed: 90 }] })
  await commande($, 'bandeau')
  const bureau = await $.ui.mount({ ...BANDEAU, surface: 'desktop' })
  expect((await bureau.find({ type: 'Text', text: /^semaine/ }))?.text).toMatch(/^semaine 90 % \(.+\)$/)
  expect((await bureau.find({ type: 'Text', text: /^90 %$/ }))?.props.color).toBe('error')
  const svg = await bureau.find({ type: 'Svg' } as never) as { props?: { source?: string } } | undefined
  expect(svg?.props?.source).toMatch(/^<svg [^>]*>.*<\/svg>$/)
  expect(await bureau.find({ type: 'Button' })).toBeUndefined()
  await bureau.unmount()
  const terminal = await $.ui.mount({ ...BANDEAU, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /^5 h/ }))?.text).toMatch(/^5 h 23 % \(remise \d\d:\d\d\) {3}semaine 90 % \(.+\) {3}branche feat\/x \(projet-a, 2 modifiés\) {3}coût 1,23 \$$/)
  expect(await terminal.find({ type: 'Svg' } as never)).toBeUndefined()
  await terminal.unmount()
  await commande($, 'masquer')
  const cache = await $.ui.mount({ ...BANDEAU, surface: 'desktop' })
  expect(await cache.find({ type: 'Text', text: /semaine/ })).toBeUndefined()
  await cache.unmount()
  await commande($, 'afficher')
  const remis = await $.ui.mount({ ...BANDEAU, surface: 'desktop' })
  expect(await remis.find({ type: 'Text', text: /semaine/ })).toBeDefined()
  await remis.unmount()
  // Le pied n'affiche plus rien : l'emplacement est unique.
  expect(await pied($, 'desktop')).toBe('(rien)')
})

test('/sonar indice : remplace la ligne d’aide sous la saisie', FR, async ($, on) => {
  moteur(on)
  await demarrer($)
  await commande($, 'indice')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...INDICE, surface })
    expect((await ui.find({ type: 'Text', text: /^5 h/ }))?.text).toMatch(/^5 h 23 % .* {3}coût 1,23 \$$/)
    await ui.unmount()
  }
})

test('git en panne ou hors dépôt : pas de branche, le reste s’affiche', FR, async ($, on) => {
  moteur(on, { git: 'panne' })
  await demarrer($)
  expect(await pied($, 'desktop')).toBe('sem. 41 %')
  expect(await commande($, '')).not.toMatch(/^branche /m)
})

test('hors dépôt', FR, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  await demarrer($)
  expect(await commande($, '')).not.toMatch(/^branche /m)
})

test('/clear : quotas et cache oubliés jusqu’à la prochaine mesure', FR, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  await demarrer($)
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  expect(await pied($, 'desktop')).toBe('(rien)')
})

test('quota remis à zéro pendant l’attente : écrit en toutes lettres au tic suivant', FR, async ($, on) => {
  const horloge = moteur(on, { git: 'hors-depot' })
  await demarrer($)
  await horloge.advance(2 * H + 60_000)
  expect(await pied($, 'desktop')).toBe('sem. 41 %')
  expect(await commande($, '')).toContain('5 h remis à zéro')
})

test('options : anglais, segments choisis (« context » ignoré), emplacement par défaut « banner »', { options: { language: 'en', clock: '24h', segments: 'context,cost', placement: 'banner' } }, async ($, on) => {
  moteur(on)
  await demarrer($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDEAU, surface })
    expect((await ui.find({ type: 'Text', text: /cost/ }))?.text).toBe('cost $1.23')
    expect(await ui.find({ type: 'Text', text: /5h|week|branch|ctx|34/ })).toBeUndefined()
    await ui.unmount()
  }
  // Rien dans le pied : l'emplacement par défaut vient de l'option.
  expect(await pied($, 'desktop')).toBe('(rien)')
  expect(await commande($, 'footer')).toBe('Sonar shown: footer.')
})

test('hors abonnement : ni quotas ni coût connus, le pied reste vide', FR, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  await $.session.start({ cwd: 'C:/Code/projet-a', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000, percent: 2 }, rateLimits: [], changed: ['context'] })
  expect(await pied($, 'desktop')).toBe('(rien)')
  expect(await commande($, '')).toMatch(/^Sonar : pied/)
})

// Le disque sous le mod : un dictionnaire chemin → texte. Le moteur rend les chemins absolus (antislashs sous Windows).
function disque(on: On, fichiers: Record<string, string> = {}) {
  const etat = { fichiers, panne: false }
  const p = (x: string) => x.replace(/\\/g, '/')
  on('fs.exists', (_, e) => ({ value: p(e.path) in fichiers }))
  on('fs.read', (_, e) => {
    if (!(p(e.path) in fichiers)) throw new Error('ENOENT')
    return { value: fichiers[p(e.path)]! }
  })
  on('fs.write', (_, e) => {
    if (etat.panne) throw new Error('disque plein')
    fichiers[p(e.path)] = e.text
    return { value: undefined }
  })
  return etat
}
const JOURNAL = 'C:/Users/moi/.claude/sonar/quota-log.jsonl'
const lignes = (f: Record<string, string>, p = JOURNAL) => (f[p] ?? '').split('\n').filter(Boolean).map(l => JSON.parse(l))
const attendre = () => new Promise(r => setTimeout(r, 20))

test('journal des quotas : désactivé par défaut, rien n’est écrit', FR, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  mock.env(on, { USERPROFILE: 'C:\\Users\\moi' })
  const { fichiers: f } = disque(on)
  await demarrer($)
  await attendre()
  expect(Object.keys(f)).toEqual([])
  expect(await commande($, '')).not.toContain('Relevés')
})

test('journal des quotas : une ligne par changement, chemin par défaut, nommé dans /sonar', { options: { ...FR.options, quotaLog: true } }, async ($, on) => {
  const horloge = moteur(on, { git: 'hors-depot' })
  mock.env(on, { USERPROFILE: 'C:\\Users\\moi' })
  const { fichiers: f } = disque(on)
  await demarrer($)
  await attendre()
  expect(lignes(f)).toEqual([{
    ts: iso(T0),
    five_hour: { pct: 23, resets_at: iso(T0 + 2 * H).replace('.000Z', 'Z') },
    seven_day: { pct: 41, resets_at: iso(T0 + 72 * H).replace('.000Z', 'Z') },
  }])
  // Même chiffres : aucune ligne ; un % qui bouge : une ligne.
  await horloge.advance(60_000)
  await $.session.measure(MESURE)
  await attendre()
  expect(lignes(f).length).toBe(1)
  await $.session.measure({ ...MESURE, rateLimits: [{ ...QUOTAS[0]!, percentUsed: 24 }, QUOTAS[1]!] })
  await attendre()
  expect(lignes(f).map(l => l.five_hour.pct)).toEqual([23, 24])
  expect(lignes(f)[1].ts).toBe(iso(T0 + 60_000))
  expect(await commande($, '')).toContain(`Relevés de quota : ${JOURNAL}`)
})

test('journal des quotas : chemin choisi, ligne déjà écrite par une autre session non dupliquée, disque en panne sans effet', { options: { ...FR.options, quotaLog: true, quotaLogPath: 'D:/releves/q.jsonl' } }, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  const deja = `{"ts":"x","five_hour":{"pct":23,"resets_at":"${iso(T0 + 2 * H).replace('.000Z', 'Z')}"},"seven_day":{"pct":41,"resets_at":"${iso(T0 + 72 * H).replace('.000Z', 'Z')}"}}\n`
  const d = disque(on, { 'D:/releves/q.jsonl': deja })
  await demarrer($)
  await attendre()
  expect(d.fichiers['D:/releves/q.jsonl']).toBe(deja)
  d.panne = true
  await $.session.measure({ ...MESURE, rateLimits: [{ ...QUOTAS[0]!, percentUsed: 30 }] })
  await attendre()
  // L'affichage n'en souffre pas.
  expect(await commande($, '')).toContain('5 h 30 %')
})
