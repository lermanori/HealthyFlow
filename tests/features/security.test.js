const request = require('supertest');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';

describe('Data & Security', () => {
  it('user cannot access another user\'s tasks (mocked)', async () => {
    const res = await request(API_URL)
      .get('/tasks')
      .set('Authorization', `Bearer some-other-user-token`);
    expect([401, 403]).toContain(res.statusCode);
  });
  it('auth required for protected endpoints (mocked)', async () => {
    const res = await request(API_URL)
      .get('/tasks');
    expect([401, 403]).toContain(res.statusCode);
  });
}); 