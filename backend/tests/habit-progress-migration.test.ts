import fs from 'fs'
import path from 'path'

describe('Habit progress migration', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20260716110000_add_habit_progress.sql'),
    'utf8',
  )

  it('constrains targets and outcomes and backfills materialized instances', () => {
    expect(sql).toContain("habit_target_value > 0 AND habit_target_unit IN ('minutes', 'reps', 'count')")
    expect(sql).toContain("habit_outcome IN ('pending', 'partial', 'completed', 'failed')")
    expect(sql).toContain("CASE WHEN completed THEN 'completed' ELSE 'pending' END")
    expect(sql).toContain('original_habit_id IS NOT NULL')
  })

  it('owns progress by user, cascades instance deletion, and enables RLS', () => {
    expect(sql).toContain('habit_instance_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE')
    expect(sql).toContain('user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE')
    expect(sql).toContain('ALTER TABLE habit_progress_entries ENABLE ROW LEVEL SECURITY')
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(4)
  })

  it('atomically derives the compatibility completion mirror after chunk mutations', () => {
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON habit_progress_entries')
    expect(sql).toContain("completed = next_outcome = 'completed'")
    expect(sql).toContain("WHEN progress_total > 0 THEN 'partial'")
  })
})
