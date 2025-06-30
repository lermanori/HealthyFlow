const { initDatabase } = require('./dist/db/database.js')

async function main() {
  try {
    console.log('Initializing database...')
    await initDatabase()
    console.log('Database initialized successfully!')
    
    // Test query to see if tables exist
    const sqlite3 = require('sqlite3')
    const db = new sqlite3.Database('./healthyflow.db')
    
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.error('Error checking tables:', err)
      } else {
        console.log('Tables in database:', tables.map(t => t.name))
      }
      
      db.all("SELECT COUNT(*) as count FROM tasks", (err, result) => {
        if (err) {
          console.error('Error counting tasks:', err)
        } else {
          console.log('Number of tasks:', result[0].count)
        }
        db.close()
      })
    })
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }
}

main() 