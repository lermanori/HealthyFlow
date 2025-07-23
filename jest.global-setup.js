const fs = require('fs');
const path = require('path');
const request = require('supertest');

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const DEMO_EMAIL = 'demo@healthyflow.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

module.exports = async () => {
  if (!DEMO_PASSWORD) throw new Error('Set DEMO_PASSWORD in your environment');
  const res = await request(API_URL)
    .post('/auth/login')
    .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (!res.body.token) {
    throw new Error('Failed to get token: ' + JSON.stringify(res.body));
  }
  fs.writeFileSync(path.join(__dirname, 'tests', 'features', 'jwt.token'), res.body.token, 'utf8');
  console.log('✅ JWT token fetched and saved for tests');
}; 