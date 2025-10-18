const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { cache } = require('../config/middleware');

// Health check
router.get('/', (req, res) => res.json({ message: 'Supabase Backend is running!' }));

router.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('user_id').limit(1);
    if (error) throw error;
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      cache: cache.getStats()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: err.message
    });
  }
});

// Health check สำหรับ location service
router.get('/health/location', async (req, res) => {
  try {
    const { data, error } = await supabase.from('rider_locations').select('rider_id').limit(1);
    if (error) throw error;
    
    res.json({ 
      status: 'healthy',
      service: 'location',
      timestamp: new Date().toISOString(),
      active_riders: data?.length || 0
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'location',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

module.exports = router;