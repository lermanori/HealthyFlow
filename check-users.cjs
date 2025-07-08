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

async function checkUsers() {
  console.log('🔍 Checking users in database...\n');

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*');

    if (error) {
      console.error('❌ Error fetching users:', error);
      return;
    }

    console.log(`📊 Found ${users.length} users:`);
    users.forEach(user => {
      console.log(`  - ID: ${user.id}`);
      console.log(`    Email: ${user.email}`);
      console.log(`    Name: ${user.name}`);
      console.log('');
    });

    // Check if there are any tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .limit(5);

    if (tasksError) {
      console.error('❌ Error fetching tasks:', tasksError);
    } else {
      console.log(`📋 Found ${tasks.length} tasks (showing first 5):`);
      tasks.forEach(task => {
        console.log(`  - ID: ${task.id}`);
        console.log(`    Title: ${task.title}`);
        console.log(`    User ID: ${task.user_id}`);
        console.log(`    Scheduled Date: ${task.scheduled_date}`);
        console.log(`    Start Time: ${task.start_time}`);
        console.log(`    Completed: ${task.completed}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkUsers().then(() => {
  console.log('🏁 Check complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 