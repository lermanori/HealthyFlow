const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Open SQLite database
const db = new sqlite3.Database('./healthyflow.db');

async function migrateData() {
  console.log('Starting migration from SQLite to Supabase...');

  try {
    // Migrate users
    console.log('Migrating users...');
    const users = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM users', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const user of users) {
      const { error } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          name: user.name,
          password_hash: user.password_hash,
          created_at: user.created_at
        });
      
      if (error) {
        console.error('Error inserting user:', error);
      } else {
        console.log(`Migrated user: ${user.email}`);
      }
    }

    // Migrate tasks
    console.log('Migrating tasks...');
    const tasks = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM tasks', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const task of tasks) {
      const { error } = await supabase
        .from('tasks')
        .insert({
          id: task.id,
          user_id: task.user_id,
          title: task.title,
          type: task.type,
          category: task.category,
          start_time: task.start_time,
          duration: task.duration,
          repeat_type: task.repeat_type,
          completed: task.completed,
          completed_at: task.completed_at,
          created_at: task.created_at,
          scheduled_date: task.scheduled_date,
          overdue_notified: task.overdue_notified
        });
      
      if (error) {
        console.error('Error inserting task:', error);
      } else {
        console.log(`Migrated task: ${task.title}`);
      }
    }

    // Migrate AI recommendations
    console.log('Migrating AI recommendations...');
    const recommendations = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM ai_recommendations', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const rec of recommendations) {
      const { error } = await supabase
        .from('ai_recommendations')
        .insert({
          id: rec.id,
          user_id: rec.user_id,
          message: rec.message,
          type: rec.type,
          created_at: rec.created_at
        });
      
      if (error) {
        console.error('Error inserting recommendation:', error);
      } else {
        console.log(`Migrated recommendation: ${rec.type}`);
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    db.close();
  }
}

migrateData(); 