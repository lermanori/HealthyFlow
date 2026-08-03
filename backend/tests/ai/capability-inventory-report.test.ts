import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  type CapabilityReportEntry,
  renderCapabilityInventoryHtml,
  writeCapabilityInventoryReport,
} from '../../scripts/generate-ai-capability-inventory'
import { aiCapabilityInventory } from '../../src/ai-capabilities'

const capability: CapabilityReportEntry = {
  name: '<unsafe_capability>',
  description: 'Render Tasks & outcomes safely.',
  modules: ['tasks'],
  kind: 'write',
  availability: 'registered',
  risk: 'confirm',
  scope: 'hf:write:update',
  confirmation: 'required',
  idempotency: 'request_id',
  audit: 'required',
  errorCodes: ['invalid_input', 'execution_failed'],
  bounded: true,
  inputContract: {
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  },
  outputContract: {
    type: 'object',
    properties: { updated: { type: 'boolean' } },
    required: ['updated'],
  },
}

describe('AI capability inventory HTML report', () => {
  it('renders a standalone, filterable report with escaped capability data and contracts', () => {
    const html = renderCapabilityInventoryHtml([capability], {
      generatedAt: '2026-08-03T12:00:00.000Z',
    })

    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('HealthyFlow capability inventory')
    expect(html).toContain('data-summary="capabilities">1</strong>')
    expect(html).toContain('&lt;unsafe_capability&gt;')
    expect(html).not.toContain('<unsafe_capability>')
    expect(html).toContain('Render Tasks &amp; outcomes safely.')
    expect(html).toContain('id="capability-search"')
    expect(html).toContain('id="module-filter"')
    expect(html).toContain('Input contract')
    expect(html).toContain('&quot;title&quot;')
    expect(html).toContain('2026-08-03T12:00:00.000Z')
  })

  it('writes the complete live inventory and its Zod contracts to a standalone file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'healthyflow-capability-report-'))
    const outputPath = path.join(directory, 'inventory.html')

    try {
      const result = await writeCapabilityInventoryReport(outputPath)
      const html = await readFile(outputPath, 'utf8')

      expect(result).toEqual({
        outputPath,
        capabilityCount: aiCapabilityInventory.length,
      })
      for (const capability of aiCapabilityInventory) {
        expect(html).toContain(`data-capability-name="${capability.name}"`)
      }
      expect(html).toContain('Input contract')
      expect(html).toContain('Output contract')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
