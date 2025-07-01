const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://jvdcaxdtmieedhwztdip.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZGNheGR0bWllZWRod3p0ZGlwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTM4MTYzNiwiZXhwIjoyMDY2OTU3NjM2fQ.QMBek7poXpVmpZPLhjx1DJefebYtpGd8cZxGe58HLTA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function addDemoUser() {
  try {
    console.log('🔐 Adding demo user to Supabase...');
    
    // Hash the demo password
    const passwordHash = await bcrypt.hash('demo123', 10);
    
    // Demo user data
    const demoUser = {
      email: 'demo@healthyflow.com',
      name: 'Demo User',
      password_hash: passwordHash
    };
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', demoUser.email)
      .single();
    
    if (existingUser) {
      console.log('⚠️  Demo user already exists, updating...');
      
      // Update existing user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: demoUser.name,
          password_hash: demoUser.password_hash
        })
        .eq('email', demoUser.email);
      
      if (updateError) {
        throw updateError;
      }
      
      console.log('✅ Demo user updated successfully!');
    } else {
      console.log('➕ Creating new demo user...');
      
      // Insert new user
      const { error: insertError } = await supabase
        .from('users')
        .insert([demoUser]);
      
      if (insertError) {
        throw insertError;
      }
      
      console.log('✅ Demo user created successfully!');
    }
    
    // Verify the user was added
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, created_at')
      .eq('email', demoUser.email)
      .single();
    
    if (fetchError) {
      throw fetchError;
    }
    
    console.log('📋 Demo user details:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Created: ${user.created_at}`);
    console.log('\n🎉 Demo user is ready for login!');
    console.log('   Email: demo@healthyflow.com');
    console.log('   Password: demo123');
    
  } catch (error) {
    console.error('❌ Error adding demo user:', error);
    process.exit(1);
  }
}

// Run the script
addDemoUser(); 