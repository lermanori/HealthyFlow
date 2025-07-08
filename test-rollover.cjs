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

async function testRollover() {
  console.log('🧪 Testing Rollover Feature...\n');

  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dayBeforeYesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('📅 Dates:');
    console.log('  Today:', today);
    console.log('  Yesterday:', yesterday);
    console.log('  Day before yesterday:', dayBeforeYesterday);
    console.log('');

    // 1. Clean up any existing test tasks
    console.log('🧹 Cleaning up existing test tasks...');
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('user_id', 'demo-user')
      .like('title', 'Test Task%');

    if (deleteError) {
      console.error('❌ Error cleaning up:', deleteError);
    } else {
      console.log('✅ Cleaned up test tasks');
    }

    // 2. Create test tasks without dates (some completed, some not)
    console.log(`\n📝 Creating test tasks without dates...`);
    const testTasks = [
      {
        title: 'Test Task 1 - Should Roll Over (No Date)',
        type: 'task',
        category: 'work',
        start_time: '09:00',
        duration: 60,
        repeat_type: 'none',
        scheduled_date: null,
        completed: false
      },
      {
        title: 'Test Task 2 - Completed (No Date)',
        type: 'task',
        category: 'personal',
        start_time: '10:00',
        duration: 30,
        repeat_type: 'none',
        scheduled_date: null,
        completed: true
      },
      {
        title: 'Test Task 3 - Should Roll Over (No Date)',
        type: 'task',
        category: 'health',
        start_time: '14:00',
        duration: 45,
        repeat_type: 'none',
        scheduled_date: null,
        completed: false
      },
      {
        title: 'Test Task 4 - Habit (Should Not Roll Over)',
        type: 'habit',
        category: 'fitness',
        start_time: '18:00',
        duration: 90,
        repeat_type: 'daily',
        scheduled_date: null,
        completed: false
      }
    ];

    for (const task of testTasks) {
      const { data: newTask, error: createError } = await supabase
        .from('tasks')
        .insert({
          user_id: 'demo-user',
          ...task
        })
        .select()
        .single();

      if (createError) {
        console.error(`❌ Error creating task "${task.title}":`, createError);
      } else {
        console.log(`✅ Created: ${newTask.title} (${newTask.completed ? 'completed' : 'incomplete'})`);
      }
    }

    // 3. Check what we have
    console.log(`\n📋 Tasks without dates:`);
    const { data: tasksWithoutDate, error: tasksWithoutDateError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .is('scheduled_date', null)
      .like('title', 'Test Task%');

    if (tasksWithoutDateError) {
      console.error('❌ Error getting tasks without date:', tasksWithoutDateError);
    } else {
      if (tasksWithoutDate.length === 0) {
        console.log('  No test tasks without dates found');
      } else {
        tasksWithoutDate.forEach(task => {
          const status = task.completed ? '✅' : '⏳';
          console.log(`  ${status} ${task.title} (${task.type})`);
        });
      }
    }

    // 4. Check for incomplete tasks without dates
    console.log(`\n🔍 Checking for incomplete tasks without dates...`);
    const { data: incompleteTasksWithoutDate, error: incompleteError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .is('scheduled_date', null)
      .eq('completed', false)
      .eq('type', 'task');

    if (incompleteError) {
      console.error('❌ Error getting incomplete tasks without date:', incompleteError);
    } else {
      console.log(`📋 Found ${incompleteTasksWithoutDate.length} incomplete tasks without dates:`);
      incompleteTasksWithoutDate.forEach(task => {
        console.log(`  - ${task.title}`);
      });
    }

    // 5. Check yesterday's tasks
    console.log(`\n📋 Tasks for ${yesterday}:`);
    const { data: yesterdayTasks, error: yesterdayError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .eq('scheduled_date', yesterday)
      .like('title', 'Test Task%');

    if (yesterdayError) {
      console.error('❌ Error getting tasks:', yesterdayError);
    } else {
      if (yesterdayTasks.length === 0) {
        console.log('  No test tasks found');
      } else {
        yesterdayTasks.forEach(task => {
          const status = task.completed ? '✅' : '⏳';
          const rolledOver = task.rolled_over_from_task_id ? '🔄' : '';
          console.log(`  ${status} ${rolledOver} ${task.title}`);
        });
      }
    }

    // 6. Check today's tasks
    console.log(`\n📋 Tasks for ${today}:`);
    const { data: todayTasks, error: todayError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .eq('scheduled_date', today)
      .like('title', 'Test Task%');

    if (todayError) {
      console.error('❌ Error getting tasks:', todayError);
    } else {
      if (todayTasks.length === 0) {
        console.log('  No test tasks found');
      } else {
        todayTasks.forEach(task => {
          const status = task.completed ? '✅' : '⏳';
          const rolledOver = task.rolled_over_from_task_id ? '🔄' : '';
          console.log(`  ${status} ${rolledOver} ${task.title}`);
        });
      }
    }

    // 7. Test the rollover API manually
    console.log('\n🔄 Testing rollover API...');
    try {
      const response = await fetch('http://localhost:3001/api/tasks/rollover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer demo-token'
        },
        body: JSON.stringify({
          toDate: yesterday
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

    // 8. Check results after rollover
    console.log(`\n📋 Tasks for ${yesterday} after rollover:`);
    const { data: yesterdayTasksAfter, error: yesterdayAfterError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .eq('scheduled_date', yesterday)
      .like('title', 'Test Task%');

    if (yesterdayAfterError) {
      console.error('❌ Error getting tasks:', yesterdayAfterError);
    } else {
      if (yesterdayTasksAfter.length === 0) {
        console.log('  No test tasks found');
      } else {
        yesterdayTasksAfter.forEach(task => {
          const status = task.completed ? '✅' : '⏳';
          const rolledOver = task.rolled_over_from_task_id ? '🔄' : '';
          console.log(`  ${status} ${rolledOver} ${task.title}`);
          if (task.rolled_over_from_task_id) {
            console.log(`    Rolled over from: ${task.rolled_over_from_task_id}`);
          }
        });
      }
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testRollover().then(() => {
  console.log('\n🏁 Test complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 