const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('🔄 Applying migration for original_created_at column...\n');

  try {
    // Add the original_created_at column
    const { error } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMP WITH TIME ZONE;'
    });

    if (error) {
      console.error('❌ Error applying migration:', error);
      return;
    }

    console.log('✅ Migration applied successfully!');
    console.log('📋 Column original_created_at added to tasks table');

    // Check if the column was added
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'tasks')
      .eq('table_schema', 'public')
      .eq('column_name', 'original_created_at');

    if (columnsError) {
      console.error('❌ Error checking columns:', columnsError);
    } else {
      if (columns.length > 0) {
        console.log('✅ original_created_at column confirmed in database');
      } else {
        console.log('⚠️  original_created_at column not found - migration may have failed');
      }
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

applyMigration().then(() => {
  console.log('\n🏁 Migration complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 