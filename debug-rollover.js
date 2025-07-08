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

async function debugRollover() {
  console.log('🔍 Debugging Rollover Feature...\n');

  try {
    // 1. Check current date
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('📅 Current date:', today);
    console.log('📅 Yesterday:', yesterday);
    console.log('');

    // 2. Check if rolled_over_from_task_id column exists
    console.log('🔍 Checking database schema...');
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'tasks')
      .eq('table_schema', 'public');

    if (schemaError) {
      console.error('❌ Error checking schema:', schemaError);
    } else {
      const columnNames = columns.map(col => col.column_name);
      const hasRolledOverColumn = columnNames.includes('rolled_over_from_task_id');
      console.log('✅ rolled_over_from_task_id column exists:', hasRolledOverColumn);
      
      if (!hasRolledOverColumn) {
        console.log('⚠️  Column missing - this might be the issue!');
      }
    }
    console.log('');

    // 3. Get all tasks for demo user
    console.log('📋 Getting all tasks for demo user...');
    const { data: allTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .order('scheduled_date', { ascending: true });

    if (tasksError) {
      console.error('❌ Error getting tasks:', tasksError);
      return;
    }

    console.log(`📊 Found ${allTasks.length} total tasks`);
    
    // Group tasks by date
    const tasksByDate = {};
    allTasks.forEach(task => {
      const date = task.scheduled_date || 'no-date';
      if (!tasksByDate[date]) {
        tasksByDate[date] = [];
      }
      tasksByDate[date].push(task);
    });

    console.log('\n📅 Tasks by date:');
    Object.keys(tasksByDate).sort().forEach(date => {
      const tasks = tasksByDate[date];
      console.log(`  ${date}: ${tasks.length} tasks`);
      tasks.forEach(task => {
        const status = task.completed ? '✅' : '⏳';
        const rolledOver = task.rolled_over_from_task_id ? '🔄' : '';
        console.log(`    ${status} ${rolledOver} ${task.title} (${task.type})`);
      });
    });

    // 4. Check for incomplete tasks from yesterday
    console.log(`\n🔍 Checking for incomplete tasks from ${yesterday}...`);
    const { data: yesterdayTasks, error: yesterdayError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .eq('scheduled_date', yesterday)
      .eq('completed', false)
      .eq('type', 'task');

    if (yesterdayError) {
      console.error('❌ Error getting yesterday tasks:', yesterdayError);
    } else {
      console.log(`📋 Found ${yesterdayTasks.length} incomplete tasks from yesterday:`);
      yesterdayTasks.forEach(task => {
        console.log(`  - ${task.title}`);
      });
    }

    // 5. Check today's tasks
    console.log(`\n🔍 Checking tasks for ${today}...`);
    const { data: todayTasks, error: todayError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .eq('scheduled_date', today);

    if (todayError) {
      console.error('❌ Error getting today tasks:', todayError);
    } else {
      console.log(`📋 Found ${todayTasks.length} tasks for today:`);
      todayTasks.forEach(task => {
        const status = task.completed ? '✅' : '⏳';
        const rolledOver = task.rolled_over_from_task_id ? '🔄' : '';
        console.log(`  ${status} ${rolledOver} ${task.title} (${task.type})`);
        if (task.rolled_over_from_task_id) {
          console.log(`    Rolled over from: ${task.rolled_over_from_task_id}`);
        }
      });
    }

    // 6. Test rollover manually
    console.log('\n🧪 Testing rollover manually...');
    const testFromDate = '2025-07-07'; // Use a specific date for testing
    const testToDate = '2025-07-08';
    
    console.log(`Testing rollover from ${testFromDate} to ${testToDate}`);
    
    // Get incomplete tasks from test date
    const { data: testFromTasks, error: testFromError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', 'demo-user')
      .eq('scheduled_date', testFromDate)
      .eq('completed', false)
      .eq('type', 'task');

    if (testFromError) {
      console.error('❌ Error getting test from tasks:', testFromError);
    } else {
      console.log(`📋 Found ${testFromTasks.length} incomplete tasks from ${testFromDate}`);
      
      if (testFromTasks.length > 0) {
        console.log('Creating rollover tasks...');
        
        for (const task of testFromTasks) {
          const { data: newTask, error: createError } = await supabase
            .from('tasks')
            .insert({
              user_id: 'demo-user',
              title: task.title,
              type: task.type,
              category: task.category,
              start_time: task.start_time,
              duration: task.duration,
              repeat_type: task.repeat_type,
              scheduled_date: testToDate,
              completed: false,
              rolled_over_from_task_id: task.rolled_over_from_task_id || task.id
            })
            .select()
            .single();

          if (createError) {
            console.error(`❌ Error creating rollover task for "${task.title}":`, createError);
          } else {
            console.log(`✅ Created rollover task: ${newTask.title}`);
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugRollover().then(() => {
  console.log('\n🏁 Debug complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 