const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load .env from parent directory (same as the backend does)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function cleanupRolloverTasks() {
  try {
    console.log('🔍 Finding all rolled-over tasks...');
    
    // Get all tasks that have rolled_over_from_task_id set
    const { data: rolledOverTasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, title, rolled_over_from_task_id, created_at, user_id')
      .not('rolled_over_from_task_id', 'is', null);
    
    if (fetchError) {
      console.error('Error fetching rolled-over tasks:', fetchError);
      return;
    }
    
    console.log(`🔍 Found ${rolledOverTasks.length} rolled-over tasks to clean up`);
    
    if (rolledOverTasks.length === 0) {
      console.log('✅ No rolled-over tasks found. Database is clean!');
      return;
    }
    
    // Group by user for better reporting
    const tasksByUser = {};
    rolledOverTasks.forEach(task => {
      if (!tasksByUser[task.user_id]) {
        tasksByUser[task.user_id] = [];
      }
      tasksByUser[task.user_id].push(task);
    });
    
    console.log('\n📋 Rolled-over tasks by user:');
    Object.entries(tasksByUser).forEach(([userId, tasks]) => {
      console.log(`User ${userId}: ${tasks.length} tasks`);
      tasks.forEach(task => {
        console.log(`  - ${task.title} (ID: ${task.id})`);
      });
    });
    
    // Delete all rolled-over tasks
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .not('rolled_over_from_task_id', 'is', null);
    
    if (deleteError) {
      console.error('Error deleting rolled-over tasks:', deleteError);
      return;
    }
    
    console.log(`\n✅ Successfully cleaned up ${rolledOverTasks.length} rolled-over tasks`);
    console.log('🎉 Database cleanup completed!');
    
  } catch (error) {
    console.error('Unexpected error during cleanup:', error);
  }
}

// Run the cleanup
cleanupRolloverTasks()
  .then(() => {
    console.log('\n🏁 Cleanup script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 