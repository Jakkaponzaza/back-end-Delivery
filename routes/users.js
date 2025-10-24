const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../config/database');
const { cache } = require('../config/middleware');
const { registerUser, addUserAddress, getUserAddresses, getUserData } = require('../services/authService');

// Register user
router.post('/register', async (req, res) => {
  try {
    const result = await registerUser(req.body);
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

// Login user
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const { data: users } = await supabase
      .from('users')
      .select('user_id, username, phone, password, profile_image')
      .eq('phone', phone)
      .limit(1);

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        username: user.username,
        phone: user.phone,
        profile_image: user.profile_image
      }
    });
  } catch (error) {
    if (error.message.includes('Invalid')) {
      res.status(401).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Get all users (with caching)
router.get('/users', async (req, res) => {
  try {
    const cacheKey = 'all_users';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { data, error } = await supabase
      .from('users')
      .select('user_id, username, phone, profile_image')
      .order('username');
    
    if (error) throw error;
    
    cache.set(cacheKey, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const result = await getUserData(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Add user address
router.post('/users/:userId/addresses', async (req, res) => {
  try {
    const { userId } = req.params;
    const { address_text, latitude, longitude } = req.body;
    
    const result = await addUserAddress({
      member_id: userId,
      address_text,
      latitude,
      longitude
    });

    // Clear user cache when address is added
    cache.del(`user_addresses_${userId}`);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user addresses
router.get('/users/:userId/addresses', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `user_addresses_${userId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    const result = await getUserAddresses(userId);
    cache.set(cacheKey, result);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: true, message: error.message });
  }
});

// Delete user address
router.delete('/users/:userId/addresses/:addressId', async (req, res) => {
  try {
    const { userId, addressId } = req.params;

    const { data: allAddresses } = await supabase
      .from('user_address')
      .select('address_id, created_at')
      .eq('member_id', userId)
      .order('created_at', { ascending: true });

    if (allAddresses && allAddresses.length > 0) {
      const firstAddressId = allAddresses[0].address_id;
      
      // ถ้าพยายามลบที่อยู่แรก ให้ห้าม
      if (addressId == firstAddressId) {
        return res.status(403).json({ 
          error: 'ไม่สามารถลบที่อยู่หลักได้' 
        });
      }
    }

    // ลบที่อยู่
    const { data, error } = await supabase
      .from('user_address')
      .delete()
      .eq('address_id', addressId)
      .eq('member_id', userId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // Clear cache
    cache.del(`user_addresses_${userId}`);

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
      deleted_address: data[0]
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


module.exports = router;