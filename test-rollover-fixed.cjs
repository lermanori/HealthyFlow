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

async function testRolloverFixed() {
  console.log('🧪 Testing Fixed Rollover Feature...\n');

  try {
    const today = new Date().toISOString().split('T')[0];
    const userId = 'b05c0f3d-554c-44db-8d87-397ab18288f3'; // Use the real user ID
    
    console.log('📅 Today:', today);
    console.log('👤 User ID:', userId);
    console.log('');

    // 1. Check current tasks without start_time
    console.log('🔍 Checking tasks without start_time...');
    const { data: tasksWithoutStartTime, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .is('start_time', null)
      .eq('completed', false)
      .eq('type', 'task');

    if (fetchError) {
      console.error('❌ Error fetching tasks without start_time:', fetchError);
      return;
    }

    console.log(`📋 Found ${tasksWithoutStartTime.length} incomplete tasks without start_time:`);
    tasksWithoutStartTime.forEach(task => {
      console.log(`  - ${task.title} (scheduled: ${task.scheduled_date})`);
    });

    // 2. Check today's tasks before rollover
    console.log(`\n📋 Tasks for ${today} (before rollover):`);
    const { data: todayTasksBefore, error: todayBeforeError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('scheduled_date', today);

    if (todayBeforeError) {
      console.error('❌ Error getting today tasks:', todayBeforeError);
    } else {
      console.log(`📋 Found ${todayTasksBefore.length} tasks for today:`);
      todayTasksBefore.forEach(task => {
        const status = task.completed ? '✅' : '⏳';
        const rolledOver = task.rolled_over_from_task_id ? '🔄' : '';
        console.log(`  ${status} ${rolledOver} ${task.title}`);
      });
    }

    // 3. Test the rollover API manually
    console.log('\n🔄 Testing rollover API...');
    try {
      const response = await fetch('http://localhost:3001/api/tasks/rollover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer demo-token'
        },
        body: JSON.stringify({
          toDate: today
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Rollover API response:', result);
      } else {
        console.error('❌ Rollover API failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error details:', errorText);
      }
    } catch (error) {
      console.error('❌ Error calling rollover API:', error.message);
    }

    // 4. Check today's tasks after rollover
    console.log(`\n📋 Tasks for ${today} (after rollover):`);
    const { data: todayTasksAfter, error: todayAfterError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('scheduled_date', today);

    if (todayAfterError) {
      console.error('❌ Error getting today tasks:', todayAfterError);
    } else {
      console.log(`📋 Found ${todayTasksAfter.length} tasks for today:`);
      todayTasksAfter.forEach(task => {
        const status = task.completed ? '✅' : '⏳';
        const rolledOver = task.rolled_over_from_task_id ? '🔄' : '';
        console.log(`  ${status} ${rolledOver} ${task.title}`);
        if (task.rolled_over_from_task_id) {
          console.log(`    Rolled over from: ${task.rolled_over_from_task_id}`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testRolloverFixed().then(() => {
  console.log('\n🏁 Test complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 