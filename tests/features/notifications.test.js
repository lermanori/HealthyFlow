const request = require('supertest');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const token = 'demo-token';

describe('Notifications & Reminders', () => {
  let taskId;
  it('can set overdue notification flag on a task', async () => {
    // Create a task
    const res = await request(API_URL)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Overdue Test Task', type: 'task', category: 'work' });
    expect(res.statusCode).toBe(200);
    taskId = res.body.id;

    // Set overdue notification
    const patchRes = await request(API_URL)
      .patch('/tasks/overdue-notified')
      .set('Authorization', `Bearer ${token}`)
      .send({ taskIds: [taskId] });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.success).toBe(true);
  });

  afterAll(async () => {
    if (taskId) await request(API_URL).delete(`/tasks/${taskId}`).set('Authorization', `Bearer ${token}`);
  });
}); 