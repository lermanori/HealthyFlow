import fs from 'node:fs'
import path from 'node:path'

describe('Phase 5 Talk workflow migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260803230000_add_phase_5_talk_workflows.sql'),
    'utf8',
  )

  it('persists the workflow checkpoint separately from assistant messages', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS talk_workflows')
    expect(migration).toContain('conversation_id')
    expect(migration).toContain('anchor_date')
    expect(migration).toContain('selected_project_id')
    expect(migration).toContain('selected_task_ids')
    expect(migration).toContain('pending_proposal')
    expect(migration).toContain('confirmation_state')
    expect(migration).toContain('instruction_versions')
    expect(migration).toContain('revision')
  })

  it('supports atomic confirmation claims and crash-safe Focus block recovery', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION claim_ai_pending_action')
    expect(migration).toContain("status = 'presented'")
    expect(migration).toContain("status = 'executing'")
    expect(migration).toContain("INTERVAL '2 minutes'")
    expect(migration).toContain('CREATE OR REPLACE FUNCTION complete_ai_pending_action')
    expect(migration).toContain('idx_focus_blocks_user_request_unique')
    expect(migration).toContain('idx_ai_audit_log_request_unique')
  })
})
