const fs = require('fs');
const path = require('path');

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function expectExistingPng(publicPath) {
  const filePath = path.join('public', publicPath);
  expect(fs.existsSync(filePath)).toBe(true);

  const file = fs.readFileSync(filePath);
  expect(file.subarray(0, 8).equals(pngSignature)).toBe(true);
}

describe('PWA & Mobile Support', () => {
  it('manifest file exists, is valid JSON, and references existing icons', () => {
    const manifest = fs.readFileSync('public/manifest.json', 'utf8');
    expect(() => JSON.parse(manifest)).not.toThrow();

    const parsed = JSON.parse(manifest);
    expect(parsed.name).toBe('HealthyFlow');
    expect(parsed.display).toBe('standalone');
    expect(parsed.start_url).toBe('/');
    expect(parsed.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(parsed.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    expect(parsed.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of parsed.icons) {
      expectExistingPng(icon.src.replace(/^\//, ''));
    }
  });

  it('service worker caches the app shell and bypasses API requests', () => {
    const serviceWorker = fs.readFileSync('public/sw.js', 'utf8');
    expect(fs.existsSync('public/sw.js')).toBe(true);
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).toContain("request.mode === 'navigate'");
    expect(serviceWorker).toContain("caches.match('/')");
  });

  it('registers the service worker from application code', () => {
    const main = fs.readFileSync('src/main.tsx', 'utf8');

    expect(main).toContain("register('/sw.js')");
    expect(main).toContain("location.port === '5173'");
    expect(main).toContain("healthyflow:update-ready");
  });

  it('html references only existing PWA icons', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const iconHrefs = [...html.matchAll(/href="\/(icons\/[^"]+)"/g)].map((match) => match[1]);

    expect(iconHrefs.length).toBeGreaterThan(0);
    for (const iconHref of iconHrefs) {
      expectExistingPng(iconHref);
    }

    expect(html).not.toContain('/vite.svg');
    expect(html).not.toContain('/splash/');
  });

  it('Netlify config supports SPA routing and service worker freshness', () => {
    const netlifyConfig = fs.readFileSync('netlify.toml', 'utf8');

    expect(netlifyConfig).toContain('from = "/*"');
    expect(netlifyConfig).toContain('to = "/index.html"');
    expect(netlifyConfig).toContain('for = "/sw.js"');
    expect(netlifyConfig).toContain('Service-Worker-Allowed = "/"');
  });
});
