const request = require('supertest');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const token = 'demo-token';

describe('Analytics & Progress', () => {
  it('weekly summary endpoint returns stats', async () => {
    const res = await request(API_URL)
      .get('/week-summary?date=2026-07-27')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.days).toHaveLength(7);
    expect(res.body.completion).toBeDefined();
  });

  it('returns populated-domain contributions', async () => {
    const res = await request(API_URL)
      .get('/week-summary?date=2026-07-27')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.contributions)).toBe(true);
  });
});
