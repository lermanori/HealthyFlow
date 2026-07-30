import express from 'express'
import request from 'supertest'
import {
  compareMarketingVersions,
  IosVersionPolicySchema,
} from '../../src/mobile-version-contracts'
import {
  MobileVersionConfigurationError,
  readIosVersionPolicy,
} from '../../src/mobile-version'
import { mobileRoutes } from '../../src/routes/mobile'
import { logger } from '../../src/utils/logger'

const VERSION_ENV_KEYS = [
  'IOS_VERSION_GATE_ENABLED',
  'IOS_MINIMUM_VERSION',
  'IOS_LATEST_VERSION',
  'IOS_APP_STORE_URL',
  'IOS_UPDATE_MESSAGE',
] as const

const originalEnvironment = Object.fromEntries(
  VERSION_ENV_KEYS.map((key) => [key, process.env[key]]),
)

function restoreEnvironment() {
  VERSION_ENV_KEYS.forEach((key) => {
    const value = originalEnvironment[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
}

afterEach(() => {
  restoreEnvironment()
  jest.restoreAllMocks()
})

describe('iOS version policy', () => {
  it('compares numeric marketing-version components without lexical mistakes', () => {
    expect(compareMarketingVersions('1.10', '1.9.9')).toBe(1)
    expect(compareMarketingVersions('2.0', '2.0.0')).toBe(0)
    expect(compareMarketingVersions('1.2.3', '1.3')).toBe(-1)
  })

  it('is explicitly disabled unless enabled by the environment', () => {
    expect(readIosVersionPolicy({})).toEqual({
      enabled: false,
      platform: 'ios',
    })
  })

  it('returns a validated enabled policy and defaults latest to minimum', () => {
    const policy = readIosVersionPolicy({
      IOS_VERSION_GATE_ENABLED: 'true',
      IOS_MINIMUM_VERSION: '1.4.0',
      IOS_APP_STORE_URL: 'https://apps.apple.com/app/healthyflow/id123456789',
    })

    expect(IosVersionPolicySchema.parse(policy)).toEqual({
      enabled: true,
      platform: 'ios',
      minimumVersion: '1.4.0',
      latestVersion: '1.4.0',
      storeUrl: 'https://apps.apple.com/app/healthyflow/id123456789',
      message: 'A newer version of HealthyFlow is required to continue.',
    })
  })

  it('rejects unsafe store URLs and inverted version ranges', () => {
    expect(() => readIosVersionPolicy({
      IOS_VERSION_GATE_ENABLED: 'true',
      IOS_MINIMUM_VERSION: '1.4.0',
      IOS_APP_STORE_URL: 'https://example.com/update',
    })).toThrow(MobileVersionConfigurationError)

    expect(() => readIosVersionPolicy({
      IOS_VERSION_GATE_ENABLED: 'true',
      IOS_MINIMUM_VERSION: '2.0',
      IOS_LATEST_VERSION: '1.9',
      IOS_APP_STORE_URL: 'https://apps.apple.com/app/healthyflow/id123456789',
    })).toThrow('IOS_LATEST_VERSION cannot be lower than IOS_MINIMUM_VERSION')
  })
})
describe('GET /api/mobile/version/ios', () => {
  const app = express()
  app.use('/api/mobile', mobileRoutes)

  it('returns the public policy without authentication and disables caching', async () => {
    process.env.IOS_VERSION_GATE_ENABLED = 'true'
    process.env.IOS_MINIMUM_VERSION = '1.2'
    process.env.IOS_LATEST_VERSION = '1.3'
    process.env.IOS_APP_STORE_URL = 'https://apps.apple.com/app/healthyflow/id123456789'

    const response = await request(app).get('/api/mobile/version/ios')

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.minimumVersion).toBe('1.2')
    expect(response.body.latestVersion).toBe('1.3')
  })

  it('surfaces an enabled but invalid deployment policy', async () => {
    jest.spyOn(logger, 'error').mockImplementation()
    process.env.IOS_VERSION_GATE_ENABLED = 'true'
    delete process.env.IOS_MINIMUM_VERSION
    delete process.env.IOS_APP_STORE_URL

    const response = await request(app).get('/api/mobile/version/ios')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'iOS version policy is unavailable' })
  })
})
