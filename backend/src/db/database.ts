import sqlite3 from 'sqlite3'
import path from 'path'
import { migrateDatabase } from './migrate'

const dbPath = path.join(process.cwd(), 'healthyflow.db')
export const db = new sqlite3.Database(dbPath)

export async function initDatabase() {
  // Run migration first
  try {
    await migrateDatabase()
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Tasks table with scheduled_date field
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('task', 'habit')),
      category TEXT NOT NULL,
      start_time TEXT,
      duration INTEGER,
      repeat_type TEXT CHECK (repeat_type IN ('daily', 'weekly', 'none')),
      scheduled_date TEXT,
      completed BOOLEAN DEFAULT FALSE,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `)

  // AI recommendations table
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('suggestion', 'encouragement', 'tip')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `)

  // Insert demo user
  db.run(`
    INSERT OR IGNORE INTO users (id, email, name, password_hash)
    VALUES ('demo-user', 'demo@healthyflow.com', 'Demo User', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
  `)

  // Insert demo tasks with scheduled dates
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
  const demoTasks = [
    {
      id: 'task-1',
      title: 'Morning Meditation',
      type: 'habit',
      category: 'health',
      start_time: '07:00',
      duration: 15,
      repeat_type: 'daily',
      scheduled_date: today
    },
    {
      id: 'task-2',
      title: 'Review Project Proposal',
      type: 'task',
      category: 'work',
      start_time: '09:00',
      duration: 60,
      repeat_type: 'none',
      scheduled_date: today
    },
    {
      id: 'task-3',
      title: 'Gym Workout',
      type: 'habit',
      category: 'fitness',
      start_time: '18:00',
      duration: 90,
      repeat_type: 'daily',
      scheduled_date: today
    },
    {
      id: 'task-4',
      title: 'Read for 30 minutes',
      type: 'habit',
      category: 'personal',
      start_time: '21:00',
      duration: 30,
      repeat_type: 'daily',
      scheduled_date: today
    },
    {
      id: 'task-5',
      title: 'Team Meeting Preparation',
      type: 'task',
      category: 'work',
      start_time: '10:00',
      duration: 45,
      repeat_type: 'none',
      scheduled_date: tomorrow
    },
    {
      id: 'task-6',
      title: 'Grocery Shopping',
      type: 'task',
      category: 'personal',
      start_time: '14:00',
      duration: 60,
      repeat_type: 'none',
      scheduled_date: tomorrow
    }
  ]

  demoTasks.forEach(task => {
    db.run(`
      INSERT OR IGNORE INTO tasks (id, user_id, title, type, category, start_time, duration, repeat_type, scheduled_date)
      VALUES (?, 'demo-user', ?, ?, ?, ?, ?, ?, ?)
    `, [task.id, task.title, task.type, task.category, task.start_time, task.duration, task.repeat_type, task.scheduled_date])
  })

  console.log('✅ Database initialized with future planning support')
}