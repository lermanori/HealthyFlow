import fs from 'node:fs'
import path from 'node:path'

describe('first-class Work migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20260803010000_first_class_focus_blocks_and_reviews.sql'),
    'utf8',
  )

  it('adds persistent Focus blocks and structured Work reviews in a follow-up migration', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS focus_blocks')
    expect(migration).toContain("CHECK (status IN ('planned', 'active', 'reviewing', 'completed', 'canceled'))")
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS work_reviews')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION complete_work_review')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION complete_work_review')
  })

  it('preserves history when safely deleting a Project', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION delete_work_project_safely')
    expect(migration).toContain("status IN ('active', 'reviewing')")
    expect(migration).toContain('UPDATE tasks')
    expect(migration).toContain('SET project_id = NULL, target_relation = NULL')
  })
})
