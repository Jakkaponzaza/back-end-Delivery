const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../config/database');
const { cache } = require('../config/middleware');
const { registerRider, getRiderData } = require('../services/authService');

// Register rider
router.post('/register/rider', async (req, res) => {
  try {
    const result = await registerRider(req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: error.message });
    } else if (error.message.includes('Image too large')) {
      res.status(413).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Login rider
router.post('/login/rider', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const { data: riders } = await supabase
      .from('riders')
      .select(`rider_id, name, phone, password, profile_image, vehicle_image, license_plate, location`)
      .eq('phone', phone)
      .limit(1);

    if (!riders || riders.length === 0) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const rider = riders[0];
    const isValid = await bcrypt.compare(password, rider.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    res.json({
      success: true,
      message: 'Login successful',
      rider: {
        rider_id: rider.rider_id,
        name: rider.name,
        phone: rider.phone,
        profile_image: rider.profile_image,
        vehicle_image: rider.vehicle_image,
        license_plate: rider.license_plate,
        location: rider.location
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get rider by ID
router.get('/riders/:id', async (req, res) => {
  try {
    const result = await getRiderData(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Rider not found' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Check rider current job
router.get('/riders/:riderId/current-job', async (req, res) => {
  try {
    const { riderId } = req.params;

    const { data, error } = await supabase
      .from('delivery')
      .select(`
        delivery_id,
        parcel_id,
        status,
        created_at,
        pickup_image,
        delivery_image,
        parcels!inner (
          parcel_id,
          description,
          item_image,
          sender:users!sender_id (username, phone),
          receiver:users!receiver_id (username, phone)
        )
      `)
      .eq('rider_id', riderId)
      .in('status', [0, 1]) // pending หรือ in_transit
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    res.json({
      success: true,
      has_active_job: data && data.length > 0,
      current_job: data && data.length > 0 ? data[0] : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;