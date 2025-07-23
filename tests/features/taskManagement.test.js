const request = require('supertest');
const fs = require('fs');
const path = require('path');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const token = fs.readFileSync(path.join(__dirname, 'jwt.token'), 'utf8');

describe('Task Management', () => {
  let createdTaskId;

  it('can create a new task', async () => {
    const res = await request(API_URL)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Jest Test Task', type: 'task', category: 'work' });
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Jest Test Task');
    createdTaskId = res.body.id;
  });

  it('can edit a task title', async () => {
    const res = await request(API_URL)
      .put(`/tasks/${createdTaskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Jest Test Task Updated' });
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Jest Test Task Updated');
  });

  it('can delete a task', async () => {
    const res = await request(API_URL)
      .delete(`/tasks/${createdTaskId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
}); 