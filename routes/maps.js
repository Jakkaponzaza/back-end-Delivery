const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../config/database');
const { cache } = require('../config/middleware');
const { HEIGIT_API_KEY, HEIGIT_BASE_URL } = require('../config/constants');

// Geocoding - convert address to coordinates
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const response = await axios.get(`${HEIGIT_BASE_URL}/geocode/search`, {
      params: {
        api_key: HEIGIT_API_KEY,
        text: address,
        'boundary.country': 'TH',
        size: 10,
        lang: 'th'
      },
      headers: {
        'User-Agent': 'DeliveryApp/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Geocoding service unavailable' });
  }
});

// Reverse Geocoding - convert coordinates to address
router.post('/reverse-geocode', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const response = await axios.get(`${HEIGIT_BASE_URL}/geocode/reverse`, {
      params: {
        api_key: HEIGIT_API_KEY,
        'point.lat': latitude,
        'point.lon': longitude,
        lang: 'th',
        size: 1
      },
      headers: {
        'User-Agent': 'DeliveryApp/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Reverse geocoding service unavailable' });
  }
});

// Update rider location
router.post('/riders/:id/location', async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracy, heading, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // Update or insert rider location
    const { data, error } = await supabase
      .from('rider_locations')
      .upsert([{
        rider_id: parseInt(id),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        heading: heading ? parseFloat(heading) : null,
        speed: speed ? parseFloat(speed) : null,
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'rider_id'
      })
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Clear cache
    cache.del(`rider_location_${id}`);
    cache.del('all_rider_locations');

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: data[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get rider location
router.get('/riders/:id/location', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `rider_location_${id}`;

    // Validate rider ID
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return res.status(400).json({ error: 'Invalid rider ID' });
    }

    // Check cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { data, error } = await supabase
      .from('rider_locations')
      .select(`
        *,
        rider:riders!rider_id (
          rider_id,
          name,
          license_plate
        )
      `)
      .eq('rider_id', riderId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const result = data || null;

    // Cache for 30 seconds
    cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all rider locations (for map display)
router.get('/riders/locations/all', async (req, res) => {
  try {
    const cacheKey = 'all_rider_locations';
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    const { data, error } = await supabase
      .from('rider_locations')
      .select(`
        *,
        rider:riders!rider_id (
          rider_id,
          name,
          license_plate
        )
      `)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    cache.set(cacheKey, data, 30); // Cache for 30 seconds
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get multiple rider locations (for individual tracking)
router.post('/riders/locations/multiple', async (req, res) => {
  try {
    const { rider_ids } = req.body;
    if (!rider_ids || !Array.isArray(rider_ids)) {
      return res.status(400).json({ error: 'rider_ids array is required' });
    }

    const { data, error } = await supabase
      .from('rider_locations')
      .select(`
        *,
        rider:riders!rider_id (
          rider_id,
          name,
          license_plate
        )
      `)
      .in('rider_id', rider_ids.map(id => parseInt(id)))
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;