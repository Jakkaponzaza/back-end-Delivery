const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if environment variables are set
if (!supabaseUrl) {
  console.error('SUPABASE_URL is not set. Please check your .env file.');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Please check your .env file.');
  process.exit(1);
}

// Enhanced Supabase client configuration
const supabaseOptions = {
  db: {
    schema: 'public',
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 20000
    }
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
};

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, supabaseOptions);

module.exports = supabase;
