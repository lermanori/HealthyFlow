import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import SettingsContracts from '../../backend/src/settings-schema'
import {
  MODULE_PRESENTATIONS,
  analyticsIdentityForPath,
  getModulePresentation,
  moduleHealthHref,
  resolveHealthAvailability,
  resolveModuleAvailabilities,
} from '../modulePresentation'

const { SettingsSchema } = SettingsContracts

describe('module presentation manifest', () => {
  it('declares the approved labels, semantics, defaults, and legacy routes once', () => {
    assert.equal(new Set(MODULE_PRESENTATIONS.map(({ id }) => id)).size, MODULE_PRESENTATIONS.length)
    assert.equal(new Set(MODULE_PRESENTATIONS.map(({ route }) => route.path)).size, MODULE_PRESENTATIONS.length)
    assert.equal(
      new Set(MODULE_PRESENTATIONS.map(({ healthNavigation }) => healthNavigation.order)).size,
      MODULE_PRESENTATIONS.length
    )
    assert.deepEqual(
      MODULE_PRESENTATIONS.map(({ id, label, statusSemantics, defaultEnabled, route }) => ({
        id,
        label,
        statusSemantics,
        defaultEnabled,
        path: route.path,
      })),
      [
        {
          id: 'calories',
          label: 'Nutrition',
          statusSemantics: 'tracker',
          defaultEnabled: true,
          path: '/calories',
        },
        {
          id: 'workouts',
          label: 'Workouts',
          statusSemantics: 'tracker',
          defaultEnabled: true,
          path: '/workouts',
        },
        {
          id: 'achievements',
          label: 'Progress',
          statusSemantics: 'hybrid',
          defaultEnabled: true,
          path: '/achievements',
        },
      ]
    )
  })

  it('resolves loading, error, enabled, and explicitly disabled states', () => {
    assert.deepEqual(resolveModuleAvailabilities(undefined, 'loading'), {
      calories: 'loading',
      workouts: 'loading',
      achievements: 'loading',
    })
    assert.deepEqual(resolveModuleAvailabilities(undefined, 'error'), {
      calories: 'error',
      workouts: 'error',
      achievements: 'error',
    })

    const settings = SettingsSchema.parse({
      calorieIntake: false,
      workoutTracker: true,
      achievementTracker: false,
    })
    assert.deepEqual(resolveModuleAvailabilities(settings, 'ready'), {
      calories: 'disabled',
      workouts: 'enabled',
      achievements: 'disabled',
    })
  })

  it('shows Health when any tool is enabled and hides it only when all are disabled', () => {
    assert.equal(resolveHealthAvailability({
      calories: 'disabled',
      workouts: 'enabled',
      achievements: 'disabled',
    }), 'enabled')
    assert.equal(resolveHealthAvailability({
      calories: 'disabled',
      workouts: 'disabled',
      achievements: 'disabled',
    }), 'disabled')
  })

  it('keeps date-aware URLs and stable analytics identities independent from labels', () => {
    assert.equal(
      moduleHealthHref(getModulePresentation('calories'), '2026-07-27'),
      '/calories?date=2026-07-27'
    )
    assert.equal(
      moduleHealthHref(getModulePresentation('workouts'), '2026-07-27'),
      '/workouts?mode=session&date=2026-07-27'
    )
    assert.equal(analyticsIdentityForPath('/achievements'), 'achievements')
    assert.equal(analyticsIdentityForPath('/settings/health-tools'), 'settings')
  })
})

describe('Settings defaults', () => {
  it('enables all Health tools by default while preserving explicit opt-outs', () => {
    const defaults = SettingsSchema.parse({})
    assert.equal(defaults.calorieIntake, true)
    assert.equal(defaults.workoutTracker, true)
    assert.equal(defaults.achievementTracker, true)

    const optedOut = SettingsSchema.parse({
      calorieIntake: false,
      workoutTracker: false,
      achievementTracker: false,
    })
    assert.equal(optedOut.calorieIntake, false)
    assert.equal(optedOut.workoutTracker, false)
    assert.equal(optedOut.achievementTracker, false)
  })
})
