import fs from 'node:fs'
import path from 'node:path'

describe('Founders Club contact-message migration', () => {
  const migrationPath = path.join(
    __dirname,
    '../../supabase/migrations/20260907143000_founders_club_contact_messages.sql',
  )

  it('replaces the purchase-intent kinds and adds reply contact', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS reply_to TEXT')
    expect(migration).toContain("WHEN 'subscribe' THEN 'feedback'")
    expect(migration).toContain("WHEN 'topup' THEN 'more_actions'")
    expect(migration).toContain("kind IN ('feedback', 'more_actions')")
    expect(migration).toContain('char_length(reply_to) BETWEEN 3 AND 254')
  })
})
