"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateDatabase = migrateDatabase;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const dbPath = path_1.default.join(process.cwd(), 'healthyflow.db');
const db = new sqlite3_1.default.Database(dbPath);
function migrateDatabase() {
    return new Promise((resolve, reject) => {
        db.get("PRAGMA table_info(tasks)", (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            db.all("PRAGMA table_info(tasks)", (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                const columnNames = columns.map(col => col.name);
                const hasScheduledDate = columnNames.includes('scheduled_date');
                const hasOverdueNotified = columnNames.includes('overdue_notified');
                const addOverdueNotified = () => {
                    if (!hasOverdueNotified) {
                        console.log('🔄 Adding overdue_notified column to tasks table...');
                        db.run(`ALTER TABLE tasks ADD COLUMN overdue_notified BOOLEAN DEFAULT FALSE`, (err) => {
                            if (err) {
                                console.error('❌ Migration failed:', err);
                                reject(err);
                            }
                            else {
                                console.log('✅ overdue_notified column added!');
                                resolve();
                            }
                        });
                    }
                    else {
                        resolve();
                    }
                };
                if (!hasScheduledDate) {
                    console.log('🔄 Adding scheduled_date column to tasks table...');
                    db.run(`
            ALTER TABLE tasks 
            ADD COLUMN scheduled_date TEXT
          `, (err) => {
                        if (err) {
                            console.error('❌ Migration failed:', err);
                            reject(err);
                        }
                        else {
                            console.log('✅ Migration completed successfully!');
                            const today = new Date().toISOString().split('T')[0];
                            db.run(`
                UPDATE tasks 
                SET scheduled_date = ? 
                WHERE scheduled_date IS NULL
              `, [today], (err) => {
                                if (err) {
                                    console.error('❌ Failed to update existing tasks:', err);
                                    reject(err);
                                }
                                else {
                                    console.log('✅ Updated existing tasks with today\'s date');
                                    addOverdueNotified();
                                }
                            });
                        }
                    });
                }
                else {
                    console.log('✅ scheduled_date column already exists');
                    addOverdueNotified();
                }
            });
        });
    });
}
