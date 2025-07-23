const fs = require('fs');
describe('PWA & Mobile Support', () => {
  it('manifest file exists and is valid JSON', () => {
    const manifest = fs.readFileSync('public/manifest.json', 'utf8');
    expect(() => JSON.parse(manifest)).not.toThrow();
  });
  it('service worker file exists', () => {
    expect(fs.existsSync('public/sw.js')).toBe(true);
  });
}); 