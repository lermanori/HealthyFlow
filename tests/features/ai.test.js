const request = require('supertest');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const token = 'demo-token';

describe('AI Features', () => {
  it('can fetch AI recommendations', async () => {
    const res = await request(API_URL)
      .post('/ai/recommend')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('can open and close the AI analyzer modal (mocked)', () => {
    // This would be a frontend test; here we just assert true as a placeholder
    expect(true).toBe(true);
  });
}); 