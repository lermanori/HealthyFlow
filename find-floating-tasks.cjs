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

async function findFloatingTasks() {
  console.log('🔍 Finding floating tasks (start_time: null, scheduled_date: null)...\n');

  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, title, user_id, created_at')
      .is('start_time', null)
      .is('scheduled_date', null)
      .eq('completed', false);

    if (error) {
      console.error('❌ Error fetching floating tasks:', error);
      process.exit(1);
    }

    if (!tasks || tasks.length === 0) {
      console.log('✅ No floating tasks found!');
      return;
    }

    console.log(`📋 Found ${tasks.length} floating tasks:`);
    tasks.forEach(task => {
      console.log(`- ID: ${task.id}`);
      console.log(`  Title: ${task.title}`);
      console.log(`  User ID: ${task.user_id}`);
      console.log(`  Created At: ${task.created_at}`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

findFloatingTasks().then(() => {
  console.log('🏁 Script complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 