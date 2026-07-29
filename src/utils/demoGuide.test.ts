import assert from 'node:assert/strict'
import test from 'node:test'
import { demoScriptFor } from '../components/MayaDemoGuide'

test('production demo scripts use current targets and omit disabled Week steps', () => {
  const maya = demoScriptFor('maya', { weekViewEnabled: false })
  const noam = demoScriptFor('noam', { weekViewEnabled: false })
  const amir = demoScriptFor('amir', { weekViewEnabled: false })

  assert.equal(maya.find((step) => step.id === 'now-next')?.target, 'decision-band')
  assert.equal(noam.find((step) => step.id === 'noam-today')?.target, 'decision-band')
  assert.equal(maya.some((step) => step.route === '/week'), false)
  assert.equal(amir.some((step) => step.route === '/week'), false)
})

test('Week steps remain available when the feature is enabled', () => {
  assert.equal(
    demoScriptFor('maya', { weekViewEnabled: true }).some((step) => step.id === 'week-momentum'),
    true
  )
  assert.equal(
    demoScriptFor('amir', { weekViewEnabled: true }).some((step) => step.id === 'amir-week'),
    true
  )
})

test('Lina guide opens the populated Workout and Health surfaces', () => {
  const lina = demoScriptFor('lina', { weekViewEnabled: false })

  assert.equal(lina.find((step) => step.id === 'lina-quick-insert')?.target, 'calorie-quick-repeat')
  assert.equal(lina.find((step) => step.id === 'lina-workouts')?.route, '/workouts?mode=history')
  assert.equal(lina.find((step) => step.id === 'lina-explore')?.route, '/health')
  assert.equal(lina.find((step) => step.id === 'lina-explore')?.target, 'health-daily-overview')
})
