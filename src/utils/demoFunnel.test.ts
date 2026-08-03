import assert from 'node:assert/strict'
import test from 'node:test'
import {
  demoPersonas,
  demoSignupSearch,
  parseDemoPersonaId,
  type DemoAcquisition,
} from '../demoPersonas'

test('the picker frames every real persona around a problem and short value proof', () => {
  assert.deepEqual(
    demoPersonas.map(({ id, problem, duration }) => ({ id, problem, duration })),
    [
      { id: 'maya', problem: 'Workday overload', duration: '30 sec' },
      { id: 'noam', problem: 'Stuck and overwhelmed', duration: '30 sec' },
      { id: 'lina', problem: 'Health scattered across apps', duration: '30 sec' },
      { id: 'amir', problem: 'Everything changed again', duration: '30 sec' },
    ],
  )
  assert.ok(demoPersonas.every((persona) => (
    persona.outcome
    && persona.activationPrompt
    && persona.valueHeadline
    && persona.valueCopy
    && persona.transformation.length === 3
    && persona.proof.length === 3
  )))
})

test('persona proof stays faithful to the seeded story', () => {
  const noam = demoPersonas.find((persona) => persona.id === 'noam')
  const lina = demoPersonas.find((persona) => persona.id === 'lina')

  assert.deepEqual(noam?.proof, [
    ['Focus now', 'Take medication with breakfast'],
    ['Next fixed point', 'Put laundry in the machine · 11:00'],
    ['Safely visible for later', 'Electricity bill, Dana reply, reset walk'],
  ])
  assert.deepEqual(lina?.proof[2], ['Training protected', 'Upper body strength plan · 18:00'])
})

test('unknown persona URLs fail safely to Maya', () => {
  assert.equal(parseDemoPersonaId('noam'), 'noam')
  assert.equal(parseDemoPersonaId('unknown'), 'maya')
  assert.equal(parseDemoPersonaId(null), 'maya')
})

test('signup handoff preserves intent, source, and campaign attribution only', () => {
  const acquisition: DemoAcquisition = {
    persona: 'lina',
    entrySource: 'landing',
    utmSource: 'newsletter',
    utmMedium: 'email',
    utmCampaign: 'beta',
  }
  const params = new URLSearchParams(demoSignupSearch(acquisition))

  assert.equal(params.get('mode'), 'signup')
  assert.equal(params.get('from'), 'demo')
  assert.equal(params.get('persona'), 'lina')
  assert.equal(params.get('source'), 'landing')
  assert.equal(params.get('utm_source'), 'newsletter')
  assert.equal(params.get('utm_medium'), 'email')
  assert.equal(params.get('utm_campaign'), 'beta')
  assert.equal(params.has('tasks'), false)
  assert.equal(params.has('habits'), false)
})
