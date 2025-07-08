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

async function testOriginalDate() {
  console.log('🧪 Testing Original Creation Date Feature...\n');

  try {
    const userId = 'b05c0f3d-554c-44db-8d87-397ab18288f3';
    
    // 1. Check if the original_created_at column exists
    console.log('🔍 Checking if original_created_at column exists...');
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
        console.log('✅ original_created_at column exists');
      } else {
        console.log('❌ original_created_at column not found');
        return;
      }
    }

    // 2. Check existing rolled over tasks
    console.log('\n📋 Checking existing rolled over tasks...');
    const { data: rolledOverTasks, error: rolledOverError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .not('rolled_over_from_task_id', 'is', null)
      .limit(5);

    if (rolledOverError) {
      console.error('❌ Error getting rolled over tasks:', rolledOverError);
    } else {
      console.log(`📋 Found ${rolledOverTasks.length} rolled over tasks:`);
      rolledOverTasks.forEach(task => {
        console.log(`  - ${task.title}`);
        console.log(`    Created: ${task.created_at}`);
        console.log(`    Original Created: ${task.original_created_at || 'Not set'}`);
        console.log(`    Rolled over from: ${task.rolled_over_from_task_id}`);
        console.log('');
      });
    }

    // 3. Create a test task without start_time to test rollover
    console.log('📝 Creating test task for rollover...');
    const testTask = {
      title: 'Test Task - Original Date',
      type: 'task',
      category: 'work',
      start_time: null,
      duration: 60,
      repeat_type: 'none',
      scheduled_date: null,
      completed: false
    };

    const { data: newTask, error: createError } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        ...testTask
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating test task:', createError);
    } else {
      console.log('✅ Created test task:', newTask.title);
      console.log('  Created at:', newTask.created_at);
      console.log('');

      // 4. Test rollover API
      console.log('🔄 Testing rollover API...');
      try {
        const response = await fetch('http://localhost:3001/api/tasks/rollover', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer demo-token'
          },
          body: JSON.stringify({
            toDate: new Date().toISOString().split('T')[0]
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Rollover API response:', result);
        } else {
          console.error('❌ Rollover API failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ Error calling rollover API:', error.message);
      }

      // 5. Check if the rolled over task has original_created_at set
      console.log('\n📋 Checking rolled over task...');
      const { data: rolledOverTask, error: checkError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('title', 'Test Task - Original Date')
        .not('rolled_over_from_task_id', 'is', null)
        .single();

      if (checkError) {
        console.error('❌ Error checking rolled over task:', checkError);
      } else if (rolledOverTask) {
        console.log('✅ Found rolled over task:');
        console.log('  Title:', rolledOverTask.title);
        console.log('  Created at:', rolledOverTask.created_at);
        console.log('  Original Created at:', rolledOverTask.original_created_at);
        console.log('  Rolled over from:', rolledOverTask.rolled_over_from_task_id);
      } else {
        console.log('⚠️  Rolled over task not found');
      }
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testOriginalDate().then(() => {
  console.log('\n🏁 Test complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 