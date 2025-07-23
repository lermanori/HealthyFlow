const request = require('supertest');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const token = 'demo-token';

describe('Habits & Recurring Tasks', () => {
  let habitId;
  let today;

  beforeAll(() => {
    today = new Date().toISOString().split('T')[0];
  });

  it('creates a daily habit', async () => {
    const res = await request(API_URL)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Jest Daily Habit', type: 'habit', category: 'health', repeat: 'daily', startTime: '08:00', scheduledDate: null });
    expect(res.statusCode).toBe(200);
    habitId = res.body.id;
  });

  it('shows a virtual habit instance for today', async () => {
    const res = await request(API_URL)
      .get('/tasks?date=' + today)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    const virtual = res.body.find(t => t.originalHabitId === habitId && t.isHabitInstance);
    expect(virtual).toBeDefined();
  });

  it('completes the virtual habit and creates a real instance', async () => {
    const res = await request(API_URL)
      .post(`/tasks/complete/${habitId}-${today}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.originalHabitId).toBe(habitId);
  });

  afterAll(async () => {
    await request(API_URL).delete(`/tasks/${habitId}`).set('Authorization', `Bearer ${token}`);
  });
}); 