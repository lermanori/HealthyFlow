import { logger } from '../utils/logger'
import sqlite3 from 'sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const dbPath = path.join(process.cwd(), 'healthyflow.db')
const db = new sqlite3.Database(dbPath)

interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export function migrateDatabase() {
  return new Promise<void>((resolve, reject) => {
    // Check if scheduled_date column exists
    db.get("PRAGMA table_info(tasks)", (err, rows) => {
      if (err) {
        reject(err)
        return
      }

      // Get all column names
      db.all("PRAGMA table_info(tasks)", (err, columns: ColumnInfo[]) => {
        if (err) {
          reject(err)
          return
        }

        const columnNames = columns.map(col => col.name)
        const hasScheduledDate = columnNames.includes('scheduled_date')
        const hasOverdueNotified = columnNames.includes('overdue_notified')
        const hasOriginalHabitId = columnNames.includes('original_habit_id')

        const addOriginalHabitId = () => {
          if (!hasOriginalHabitId) {
            logger.info('🔄 Adding original_habit_id column to tasks table...')
            db.run(`ALTER TABLE tasks ADD COLUMN original_habit_id TEXT`, (err) => {
              if (err) {
                console.error('❌ Migration failed:', err)
                reject(err)
              } else {
                logger.info('✅ original_habit_id column added!')
                resolve()
              }
            })
          } else {
            logger.info('✅ original_habit_id column already exists')
            resolve()
          }
        }

        const addOverdueNotified = () => {
          if (!hasOverdueNotified) {
            logger.info('🔄 Adding overdue_notified column to tasks table...')
            db.run(`ALTER TABLE tasks ADD COLUMN overdue_notified BOOLEAN DEFAULT FALSE`, (err) => {
              if (err) {
                console.error('❌ Migration failed:', err)
                reject(err)
              } else {
                logger.info('✅ overdue_notified column added!')
                addOriginalHabitId()
              }
            })
          } else {
            logger.info('✅ overdue_notified column already exists')
            addOriginalHabitId()
          }
        }

        if (!hasScheduledDate) {
          logger.info('🔄 Adding scheduled_date column to tasks table...')
          
          // Add the scheduled_date column
          db.run(`
            ALTER TABLE tasks 
            ADD COLUMN scheduled_date TEXT
          `, (err) => {
            if (err) {
              console.error('❌ Migration failed:', err)
              reject(err)
            } else {
              logger.info('✅ Migration completed successfully!')
              
              // Update existing tasks with today's date
              const today = new Date().toISOString().split('T')[0]
              db.run(`
                UPDATE tasks 
                SET scheduled_date = ? 
                WHERE scheduled_date IS NULL
              `, [today], (err) => {
                if (err) {
                  console.error('❌ Failed to update existing tasks:', err)
                  reject(err)
                } else {
                  logger.info('✅ Updated existing tasks with today\'s date')
                  addOverdueNotified()
                }
              })
            }
          })
        } else {
          logger.info('✅ scheduled_date column already exists')
          addOverdueNotified()
        }
      })
    })
  })
}

// Run migration if this file is executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   migrateDatabase()
//     .then(() => {
//       logger.info('🎉 Database migration completed!')
//       process.exit(0)
//     })
//     .catch((err) => {
//       console.error('💥 Migration failed:', err)
//       process.exit(1)
//     })
// } 