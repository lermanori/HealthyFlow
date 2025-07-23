const request = require('supertest');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const token = 'demo-token';

describe('Analytics & Progress', () => {
  it('weekly summary endpoint returns stats', async () => {
    const res = await request(API_URL)
      .get('/week-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.totalTasks).toBeDefined();
    expect(res.body.completedTasks).toBeDefined();
  });

  it('category breakdown includes at least one category', async () => {
    const res = await request(API_URL)
      .get('/week-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body.categories).length).toBeGreaterThan(0);
  });
}); 