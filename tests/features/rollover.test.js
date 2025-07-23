const request = require('supertest');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const token = 'demo-token';

describe('Rollover of Floating Tasks', () => {
  let floatingTaskId;
  let today;

  beforeAll(() => {
    today = new Date().toISOString().split('T')[0];
  });

  it('creates a floating task', async () => {
    const res = await request(API_URL)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Floating Jest Task', type: 'task', category: 'work', startTime: null, scheduledDate: null });
    expect(res.statusCode).toBe(200);
    floatingTaskId = res.body.id;
  });

  it('triggers rollover and finds rolled over task', async () => {
    await request(API_URL)
      .post('/tasks/rollover')
      .set('Authorization', `Bearer ${token}`)
      .send({ toDate: today });

    const res = await request(API_URL)
      .get('/tasks?date=' + today)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    const rolled = res.body.find(t => t.rolledOverFromTaskId === floatingTaskId);
    expect(rolled).toBeDefined();
    expect(rolled.originalCreatedAt).toBeDefined();
  });

  afterAll(async () => {
    // Clean up both tasks
    await request(API_URL).delete(`/tasks/${floatingTaskId}`).set('Authorization', `Bearer ${token}`);
  });
}); 