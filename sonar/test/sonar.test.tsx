import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

type Moteur = Parameters<TestBody>[0]
// Le moteur estampille `origin` et `presentation` d'une vraie commande ; le test n'en a pas besoin.
const commande = ($: Moteur, args: string) => $.command.run({ command: 'sonar', args } as never)

const H = 3_600_000
const T0 = Date.parse('2026-10-27T12:00:00Z')
// Les textes attendus sont en français ; un test plus bas vérifie l'anglais.
const FR = { options: { language: 'fr', clock: '24h' } }
const iso = (ms: number) => new Date(ms).toISOString()

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

// Le « moteur » sous le mod : ce que le test répond à ses appels, et le dessin par défaut de chaque composant.
function moteur(on: On, opts: { git?: 'ok' | 'panne' | 'hors-depot' } = {}) {
  const horloge = mock.clock(on, { now: T0 })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'sonar' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.repo', () => ({ value: opts.git === 'hors-depot' ? null : { root: 'C:/Code/projet-a', remote: 'git@github.com:octo/projet-a.git', internal: false, name: null } }))
  on('process.run', () => {
    if (opts.git === 'panne') throw new Error('git introuvable')
    return { value: { exitCode: 0, stdout: '## feat/x...origin/feat/x\n M a.js\n?? b.js\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('ui.status', () => ({ value: undefined }))
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

test('pied (défaut) : ligne courte sur terminal et desktop, détail complet dans /sonar', FR, async ($, on) => {
  moteur(on)
  await demarrer($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PIED, surface })
    const t = (await ui.find({ type: 'Text', text: /ctx/ }))?.text ?? ''
    expect(t).toBe('ctx 34% · 5h 23% · 7j 41% · ⎇ feat/x ●2 · 1,23 $')
    await ui.unmount()
  }
  // Sur desktop, notre dessin remplace celui du moteur : un mode natif reste devant.
  const avecMode = await $.ui.mount({ ...PIED, props: { modes: ['focus'] }, surface: 'desktop' })
  expect((await avecMode.find({ type: 'Text', text: /ctx/ }))?.text).toBe('focus & ctx 34% · 5h 23% · 7j 41% · ⎇ feat/x ●2 · 1,23 $')
  await avecMode.unmount()
  const r = await commande($, '') as { text?: string }
  const detail = r.text?.split('\n')[0] ?? ''
  expect(detail).toMatch(/^ctx 34 % · 5 h 23 % → \d\d:\d\d · 7 j 41 % ≈ 20 %\/j → \S+ \d\d:\d\d · projet-a ⎇ feat\/x ●2 · 1,23 \$$/)
  expect(detail).not.toMatch(/undefined|NaN/)
  expect(r.text).toContain('Sonar : pied')
})

test('cache : la réponse du fil principal compte, celle d’un sous-agent non ; froid après 1 h', FR, async ($, on) => {
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
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PIED, surface })
    expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).toContain(' · 🔥 · ')
    await ui.unmount()
  }
  // Durée de vie encore inconnue : chaud au moins 5 min (« ≥ ») ; le détail est dans /sonar.
  expect((await commande($, '') as { text?: string }).text).toMatch(/cache 🔥 92 % → ≥ \d\d:\d\d/)
  await horloge.advance(H + 60_000)
  const ui = await $.ui.mount({ ...PIED, surface: 'desktop' })
  // Froid = attention : il passe en tête du pied.
  expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).toMatch(/^cache ❄️ · ctx 34%/)
  await ui.unmount()
  expect((await commande($, '') as { text?: string }).text).toContain('cache ❄️ froid')
})

test('/sonar bandeau : une ligne grise, seule la tête du segment en alerte colorée, /sonar masquer puis afficher', FR, async ($, on) => {
  moteur(on)
  await demarrer($)
  // 7 j très en avance : alerte.
  await $.session.measure({ ...MESURE, rateLimits: [QUOTAS[0]!, { ...QUOTAS[1]!, percentUsed: 90 }] })
  await commande($, 'bandeau')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDEAU, surface })
    expect((await ui.find({ type: 'Text', text: /ctx 34/ }))?.text).toBe('ctx 34 %')
    // Le séparateur reste gris : seule la tête du segment prend la couleur.
    expect((await ui.find({ type: 'Text', text: /7 j/ }))?.text).toBe('⚠️ 7 j 90 %')
    expect((await ui.find({ type: 'Text', text: /%\/j/ }))?.text).toMatch(/^ ≈ \d+(,\d)? %\/j → \S+ \d\d:\d\d$/)
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
  await commande($, 'masquer')
  const ui = await $.ui.mount({ ...BANDEAU, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
  await ui.unmount()
  await commande($, 'afficher')
  const ui2 = await $.ui.mount({ ...BANDEAU, surface: 'desktop' })
  expect(await ui2.find({ type: 'Text', text: /ctx/ })).toBeDefined()
  await ui2.unmount()
  // Le pied n'affiche plus rien : l'emplacement est unique.
  const pied = await $.ui.mount({ ...PIED, surface: 'desktop' })
  expect((await pied.find({ type: 'Text' }))?.text).toBe('(rien)')
  await pied.unmount()
})

test('/sonar indice : remplace la ligne d’aide sous la saisie', FR, async ($, on) => {
  moteur(on)
  await demarrer($)
  await commande($, 'indice')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...INDICE, surface })
    expect((await ui.find({ type: 'Text', text: /ctx 34/ }))?.text).toBe('ctx 34 %')
    await ui.unmount()
  }
})

test('git en panne ou hors dépôt : pas de segment dépôt, le reste s’affiche', FR, async ($, on) => {
  moteur(on, { git: 'panne' })
  await demarrer($)
  const ui = await $.ui.mount({ ...PIED, surface: 'desktop' })
  const t = (await ui.find({ type: 'Text', text: /ctx/ }))?.text ?? ''
  expect(t).toContain('ctx 34%')
  expect(t).not.toContain('⎇')
  await ui.unmount()
})

test('hors dépôt', FR, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  await demarrer($)
  const ui = await $.ui.mount({ ...PIED, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).not.toContain('⎇')
  await ui.unmount()
})

test('/clear : contexte, quotas et cache oubliés jusqu’à la prochaine mesure', FR, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  await demarrer($)
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  const ui = await $.ui.mount({ ...PIED, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('(rien)')
  await ui.unmount()
})

test('quota remis à zéro pendant l’attente : « ↺ » au tic suivant', FR, async ($, on) => {
  const horloge = moteur(on, { git: 'hors-depot' })
  await demarrer($)
  await horloge.advance(2 * H + 60_000)
  const ui = await $.ui.mount({ ...PIED, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).toContain('5h ↺')
  expect((await commande($, '') as { text?: string }).text).toContain('5 h ↺ remis à zéro')
  await ui.unmount()
})

test('options : anglais, segments choisis, emplacement par défaut « banner »', { options: { language: 'en', clock: '24h', segments: 'context,cost', placement: 'banner' } }, async ($, on) => {
  moteur(on)
  await demarrer($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDEAU, surface })
    expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).toBe('ctx 34%')
    expect((await ui.find({ type: 'Text', text: /\$1\.23/ }))?.text).toBe(' · $1.23')
    expect(await ui.find({ type: 'Text', text: /5h|⎇/ })).toBeUndefined()
    await ui.unmount()
  }
  // Rien dans le pied : l'emplacement par défaut vient de l'option.
  const pied = await $.ui.mount({ ...PIED, surface: 'desktop' })
  expect((await pied.find({ type: 'Text' }))?.text).toBe('(rien)')
  await pied.unmount()
  const r = await commande($, 'footer') as { text?: string }
  expect(r.text).toBe('Sonar shown: footer.')
})

test('hors abonnement : ni quotas ni coût connus, seul le reste s’affiche', FR, async ($, on) => {
  moteur(on, { git: 'hors-depot' })
  await $.session.start({ cwd: 'C:/Code/projet-a', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000, percent: 2 }, rateLimits: [], changed: ['context'] })
  const ui = await $.ui.mount({ ...PIED, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('ctx 2%')
  await ui.unmount()
})
