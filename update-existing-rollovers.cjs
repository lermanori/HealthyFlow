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

async function updateExistingRollovers() {
  console.log('🔄 Updating existing rolled over tasks with original creation dates...\n');

  try {
    const userId = 'b05c0f3d-554c-44db-8d87-397ab18288f3';
    
    // Get all rolled over tasks
    const { data: rolledOverTasks, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .not('rolled_over_from_task_id', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching rolled over tasks:', fetchError);
      return;
    }

    console.log(`📋 Found ${rolledOverTasks.length} rolled over tasks to update`);

    // Update each rolled over task with the original creation date
    for (const rolledOverTask of rolledOverTasks) {
      const originalTaskId = rolledOverTask.rolled_over_from_task_id;
      
      // Get the original task to find its creation date
      const { data: originalTask, error: originalError } = await supabase
        .from('tasks')
        .select('created_at')
        .eq('id', originalTaskId)
        .single();

      if (originalError) {
        console.error(`❌ Error getting original task ${originalTaskId}:`, originalError);
        continue;
      }

      // Update the rolled over task with the original creation date
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ original_created_at: originalTask.created_at })
        .eq('id', rolledOverTask.id);

      if (updateError) {
        console.error(`❌ Error updating task ${rolledOverTask.id}:`, updateError);
      } else {
        console.log(`✅ Updated: ${rolledOverTask.title}`);
        console.log(`  Original created: ${originalTask.created_at}`);
      }
    }

    // Verify the updates
    console.log('\n📋 Verifying updates...');
    const { data: updatedTasks, error: verifyError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .not('rolled_over_from_task_id', 'is', null)
      .limit(5);

    if (verifyError) {
      console.error('❌ Error verifying updates:', verifyError);
    } else {
      console.log('📋 Updated tasks:');
      updatedTasks.forEach(task => {
        console.log(`  - ${task.title}`);
        console.log(`    Original Created: ${task.original_created_at || 'Still not set'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Update error:', error);
  }
}

updateExistingRollovers().then(() => {
  console.log('\n🏁 Update complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 