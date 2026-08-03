import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  AiCapabilities,
  type AiCapabilityName,
  aiCapabilityInventory,
} from '../src/ai-capabilities'

type InventoryEntry = (typeof aiCapabilityInventory)[number]

export type CapabilityReportEntry = InventoryEntry & {
  inputContract: unknown
  outputContract: unknown
}

export type CapabilityReportOptions = {
  generatedAt?: string
}

export const DEFAULT_CAPABILITY_REPORT_PATH = path.resolve(
  __dirname,
  '../../docs/generated/phase-4-capability-inventory.html',
)

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function contractJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2))
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function summaryCard(label: string, value: number, detail: string, key: string): string {
  return `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong data-summary="${escapeHtml(key)}">${value}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>`
}

function distributionBar(label: string, count: number, total: number, color: string): string {
  const percentage = total === 0 ? 0 : Math.round((count / total) * 100)
  return `
    <li>
      <div><span>${escapeHtml(label)}</span><strong>${count}</strong></div>
      <div class="bar-track" aria-label="${escapeHtml(label)}: ${count}">
        <span style="width: ${percentage}%; background: ${color}"></span>
      </div>
    </li>`
}

function capabilityCard(capability: CapabilityReportEntry): string {
  const moduleBadges = capability.modules
    .map(module => `<span class="badge badge-module">${escapeHtml(titleCase(module))}</span>`)
    .join('')
  const searchText = [
    capability.name,
    capability.description,
    capability.kind,
    capability.availability,
    capability.risk,
    capability.scope ?? '',
    ...capability.modules,
  ].join(' ').toLowerCase()

  return `
    <article
      class="capability-card"
      data-capability-name="${escapeHtml(capability.name)}"
      data-search="${escapeHtml(searchText)}"
      data-modules="${escapeHtml(capability.modules.join(' '))}"
      data-kind="${escapeHtml(capability.kind)}"
      data-availability="${escapeHtml(capability.availability)}"
      data-risk="${escapeHtml(capability.risk)}"
    >
      <div class="capability-heading">
        <div>
          <span class="eyebrow">${escapeHtml(titleCase(capability.kind))}</span>
          <h2>${escapeHtml(capability.name)}</h2>
        </div>
        <span class="badge badge-${escapeHtml(capability.availability)}">${escapeHtml(capability.availability)}</span>
      </div>
      <p class="description">${escapeHtml(capability.description)}</p>
      <div class="badge-row">${moduleBadges}</div>
      <dl class="policy-grid">
        <div><dt>Risk</dt><dd>${escapeHtml(capability.risk)}</dd></div>
        <div><dt>Confirmation</dt><dd>${escapeHtml(capability.confirmation)}</dd></div>
        <div><dt>Idempotency</dt><dd>${escapeHtml(capability.idempotency)}</dd></div>
        <div><dt>Audit</dt><dd>${escapeHtml(capability.audit)}</dd></div>
        <div class="policy-wide"><dt>Scope</dt><dd>${escapeHtml(capability.scope ?? 'not required')}</dd></div>
      </dl>
      <details>
        <summary>Input contract</summary>
        <pre>${contractJson(capability.inputContract)}</pre>
      </details>
      <details>
        <summary>Output contract</summary>
        <pre>${contractJson(capability.outputContract)}</pre>
      </details>
      <details>
        <summary>Typed errors <span>${capability.errorCodes.length}</span></summary>
        <div class="error-list">${capability.errorCodes.map(code => `<code>${escapeHtml(code)}</code>`).join('')}</div>
      </details>
    </article>`
}

export function buildCapabilityReportEntries(): CapabilityReportEntry[] {
  return aiCapabilityInventory.map(capability => {
    const definition = AiCapabilities[capability.name as AiCapabilityName]
    return {
      ...capability,
      inputContract: z.toJSONSchema(definition.inputSchema),
      outputContract: z.toJSONSchema(definition.outputSchema),
    }
  })
}

export function renderCapabilityInventoryHtml(
  capabilities: CapabilityReportEntry[],
  options: CapabilityReportOptions = {},
): string {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const modules = [...new Set(capabilities.flatMap(capability => capability.modules))].sort()
  const registered = capabilities.filter(capability => capability.availability === 'registered').length
  const mutations = capabilities.filter(capability => capability.kind === 'write' || capability.kind === 'outcome').length
  const kindCounts = ['read', 'proposal', 'write', 'outcome'].map(kind => ({
    kind,
    count: capabilities.filter(capability => capability.kind === kind).length,
  }))
  const moduleCounts = modules.map(module => ({
    module,
    count: capabilities.filter(capability => capability.modules.includes(module)).length,
  }))

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>HealthyFlow · Phase 4 capability inventory</title>
  <style>
    :root {
      --bg: #07110e;
      --panel: rgba(16, 32, 27, 0.92);
      --panel-strong: #13251f;
      --line: rgba(158, 188, 175, 0.18);
      --text: #ecf7f1;
      --muted: #9ebcaf;
      --green: #76e6a8;
      --green-dark: #183b2a;
      --amber: #ffc870;
      --blue: #8ecbff;
      --purple: #c3a8ff;
      --red: #ff9b91;
      --shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at 8% 0%, rgba(44, 130, 86, 0.24), transparent 32rem),
        radial-gradient(circle at 92% 18%, rgba(70, 117, 155, 0.17), transparent 28rem),
        var(--bg);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    a { color: var(--green); }
    .page { width: min(1480px, calc(100% - 40px)); margin: 0 auto; padding: 56px 0 72px; }
    .hero {
      position: relative;
      overflow: hidden;
      padding: clamp(28px, 5vw, 64px);
      border: 1px solid var(--line);
      border-radius: 30px;
      background: linear-gradient(135deg, rgba(20, 52, 39, 0.96), rgba(11, 27, 23, 0.94));
      box-shadow: var(--shadow);
    }
    .hero::after {
      content: "";
      position: absolute;
      width: 320px;
      height: 320px;
      right: -110px;
      top: -150px;
      border: 1px solid rgba(118, 230, 168, 0.26);
      border-radius: 50%;
      box-shadow: 0 0 0 42px rgba(118, 230, 168, 0.035), 0 0 0 92px rgba(118, 230, 168, 0.025);
    }
    .kicker, .eyebrow {
      color: var(--green);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    h1 { max-width: 900px; margin: 12px 0 16px; font-size: clamp(2.3rem, 6vw, 5.7rem); line-height: 0.98; letter-spacing: -0.055em; }
    .hero p { max-width: 760px; margin: 0; color: #c6dacF; font-size: clamp(1rem, 2vw, 1.2rem); }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 12px 28px; margin-top: 28px; color: var(--muted); font-size: 0.84rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 22px 0; }
    .summary-card { min-height: 154px; padding: 22px; border: 1px solid var(--line); border-radius: 22px; background: var(--panel); }
    .summary-card span, .summary-card small { display: block; color: var(--muted); }
    .summary-card strong { display: block; margin: 8px 0 2px; color: var(--green); font-size: 2.6rem; line-height: 1; letter-spacing: -0.05em; }
    .overview { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
    .overview-panel { padding: 24px; border: 1px solid var(--line); border-radius: 22px; background: var(--panel); }
    .overview-panel h2 { margin: 0 0 18px; font-size: 1rem; }
    .distribution { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .distribution li > div:first-child { display: flex; justify-content: space-between; gap: 18px; color: var(--muted); font-size: 0.84rem; }
    .distribution strong { color: var(--text); }
    .bar-track { height: 7px; margin-top: 7px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,0.06); }
    .bar-track span { display: block; height: 100%; border-radius: inherit; }
    .filters {
      position: sticky;
      z-index: 10;
      top: 10px;
      display: grid;
      grid-template-columns: minmax(240px, 2fr) repeat(4, minmax(130px, 1fr)) auto;
      gap: 10px;
      align-items: end;
      margin: 0 0 20px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: rgba(8, 20, 16, 0.92);
      box-shadow: 0 14px 35px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(18px);
    }
    label { display: grid; gap: 6px; color: var(--muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    input, select, button {
      width: 100%;
      height: 43px;
      border: 1px solid var(--line);
      border-radius: 12px;
      color: var(--text);
      background: #10211b;
      font: inherit;
    }
    input, select { padding: 0 12px; }
    input:focus, select:focus, button:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
    button { width: auto; padding: 0 16px; cursor: pointer; color: #092116; background: var(--green); border-color: transparent; font-weight: 800; }
    .result-line { display: flex; justify-content: space-between; gap: 20px; margin: 0 2px 14px; color: var(--muted); font-size: 0.9rem; }
    .result-line strong { color: var(--text); }
    .capability-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .capability-card { padding: 24px; border: 1px solid var(--line); border-radius: 22px; background: var(--panel); box-shadow: 0 12px 36px rgba(0,0,0,0.16); }
    .capability-card[hidden] { display: none; }
    .capability-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .capability-card h2 { margin: 4px 0 0; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: clamp(1.05rem, 2vw, 1.34rem); letter-spacing: -0.025em; }
    .description { min-height: 48px; margin: 16px 0; color: #c2d7cd; }
    .badge-row, .error-list { display: flex; flex-wrap: wrap; gap: 7px; }
    .badge, code { display: inline-flex; align-items: center; min-height: 26px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 0.72rem; font-weight: 750; }
    .badge-module { color: var(--blue); background: rgba(80, 142, 190, 0.12); }
    .badge-registered { color: var(--amber); background: rgba(190, 129, 35, 0.13); }
    .badge-runtime { color: var(--green); background: rgba(59, 155, 102, 0.13); }
    .policy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin: 18px 0; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--line); }
    .policy-grid div { padding: 10px 12px; background: var(--panel-strong); }
    .policy-grid dt { color: var(--muted); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .policy-grid dd { margin: 2px 0 0; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.78rem; }
    .policy-wide { grid-column: 1 / -1; }
    details { margin-top: 8px; border: 1px solid var(--line); border-radius: 12px; background: rgba(5, 14, 11, 0.34); }
    summary { display: flex; justify-content: space-between; padding: 11px 13px; cursor: pointer; color: #c7dcd2; font-size: 0.82rem; font-weight: 750; }
    summary span { color: var(--muted); }
    pre { max-height: 390px; margin: 0; padding: 14px; overflow: auto; border-top: 1px solid var(--line); color: #bfe4cf; background: #07100d; font-size: 0.72rem; line-height: 1.55; }
    .error-list { padding: 0 13px 13px; }
    code { color: var(--red); background: rgba(174, 65, 53, 0.09); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .empty { display: none; margin: 28px 0; padding: 40px; border: 1px dashed var(--line); border-radius: 20px; color: var(--muted); text-align: center; }
    .empty.visible { display: block; }
    footer { margin-top: 32px; color: var(--muted); font-size: 0.82rem; text-align: center; }
    @media (max-width: 1050px) {
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .filters { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .search-field { grid-column: 1 / -1; }
    }
    @media (max-width: 760px) {
      .page { width: min(100% - 24px, 1480px); padding-top: 22px; }
      .hero { border-radius: 22px; }
      .summary-grid, .overview, .capability-grid, .filters { grid-template-columns: 1fr; }
      .search-field { grid-column: auto; }
      .summary-card { min-height: 128px; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <span class="kicker">HealthyFlow · Phase 4</span>
      <h1>HealthyFlow capability inventory</h1>
      <p>The bounded control plane for what Talk may read, propose, write, and record. Every entry is generated from the shared internal/MCP capability definitions and their Zod contracts.</p>
      <div class="hero-meta">
        <span>Generated ${escapeHtml(generatedAt)}</span>
        <span>Source: backend/src/ai-capabilities.ts</span>
        <span>Standalone artifact · no server required</span>
      </div>
    </header>

    <section class="summary-grid" aria-label="Inventory summary">
      ${summaryCard('Capabilities', capabilities.length, 'Bounded definitions', 'capabilities')}
      ${summaryCard('Module families', modules.length, 'HealthyFlow ownership areas', 'modules')}
      ${summaryCard('Phase 4 registered', registered, 'Held from runtime until Phase 5', 'registered')}
      ${summaryCard('Confirmation required', mutations, 'Writes and recorded outcomes', 'mutations')}
    </section>

    <section class="overview" aria-label="Inventory distribution">
      <article class="overview-panel">
        <h2>Capability kinds</h2>
        <ul class="distribution">
          ${kindCounts.map(({ kind, count }, index) => distributionBar(titleCase(kind), count, capabilities.length, ['var(--green)', 'var(--blue)', 'var(--amber)', 'var(--purple)'][index])).join('')}
        </ul>
      </article>
      <article class="overview-panel">
        <h2>Module coverage</h2>
        <ul class="distribution">
          ${moduleCounts.map(({ module, count }) => distributionBar(titleCase(module), count, capabilities.length, 'var(--green)')).join('')}
        </ul>
      </article>
    </section>

    <section class="filters" aria-label="Capability filters">
      <label class="search-field">Search
        <input id="capability-search" type="search" placeholder="Name, description, module, scope…" autocomplete="off">
      </label>
      <label>Module
        <select id="module-filter">
          <option value="">All modules</option>
          ${modules.map(module => `<option value="${escapeHtml(module)}">${escapeHtml(titleCase(module))}</option>`).join('')}
        </select>
      </label>
      <label>Kind
        <select id="kind-filter">
          <option value="">All kinds</option>
          ${kindCounts.map(({ kind }) => `<option value="${kind}">${titleCase(kind)}</option>`).join('')}
        </select>
      </label>
      <label>Availability
        <select id="availability-filter">
          <option value="">All availability</option>
          <option value="runtime">Runtime</option>
          <option value="registered">Registered</option>
        </select>
      </label>
      <label>Risk
        <select id="risk-filter">
          <option value="">All risk</option>
          <option value="auto">Auto</option>
          <option value="confirm">Confirm</option>
        </select>
      </label>
      <button id="clear-filters" type="button">Clear</button>
    </section>

    <div class="result-line">
      <span><strong id="visible-count">${capabilities.length}</strong> of ${capabilities.length} capabilities</span>
      <span>Expand a card to inspect its Zod-derived contracts.</span>
    </div>
    <section id="capability-grid" class="capability-grid" aria-live="polite">
      ${capabilities.map(capabilityCard).join('')}
    </section>
    <div id="empty-state" class="empty">No capabilities match these filters.</div>

    <footer>Generated from HealthyFlow’s executable registry. Regenerate after changing capability definitions.</footer>
  </main>
  <script>
    (() => {
      const search = document.getElementById('capability-search');
      const moduleFilter = document.getElementById('module-filter');
      const kindFilter = document.getElementById('kind-filter');
      const availabilityFilter = document.getElementById('availability-filter');
      const riskFilter = document.getElementById('risk-filter');
      const clear = document.getElementById('clear-filters');
      const visibleCount = document.getElementById('visible-count');
      const emptyState = document.getElementById('empty-state');
      const cards = [...document.querySelectorAll('.capability-card')];

      function applyFilters() {
        const query = search.value.trim().toLowerCase();
        let visible = 0;
        for (const card of cards) {
          const matches = (!query || card.dataset.search.includes(query))
            && (!moduleFilter.value || card.dataset.modules.split(' ').includes(moduleFilter.value))
            && (!kindFilter.value || card.dataset.kind === kindFilter.value)
            && (!availabilityFilter.value || card.dataset.availability === availabilityFilter.value)
            && (!riskFilter.value || card.dataset.risk === riskFilter.value);
          card.hidden = !matches;
          if (matches) visible += 1;
        }
        visibleCount.textContent = String(visible);
        emptyState.classList.toggle('visible', visible === 0);
      }

      for (const control of [search, moduleFilter, kindFilter, availabilityFilter, riskFilter]) {
        control.addEventListener('input', applyFilters);
      }
      clear.addEventListener('click', () => {
        search.value = '';
        moduleFilter.value = '';
        kindFilter.value = '';
        availabilityFilter.value = '';
        riskFilter.value = '';
        applyFilters();
        search.focus();
      });
    })();
  </script>
</body>
</html>
`
  return html.replace(/[ \t]+$/gm, '')
}

export async function writeCapabilityInventoryReport(
  outputPath = DEFAULT_CAPABILITY_REPORT_PATH,
): Promise<{ outputPath: string; capabilityCount: number }> {
  const capabilities = buildCapabilityReportEntries()
  const html = renderCapabilityInventoryHtml(capabilities)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, html, 'utf8')
  return { outputPath, capabilityCount: capabilities.length }
}

if (require.main === module) {
  writeCapabilityInventoryReport(process.argv[2])
    .then(({ outputPath, capabilityCount }) => {
      console.log(`Generated ${capabilityCount} capabilities at ${outputPath}`)
    })
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
