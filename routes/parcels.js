const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { cache } = require('../config/middleware');
const { PARCEL_STATUS } = require('../config/constants');

// Get all parcels
router.get('/parcels', async (req, res) => {
  try {
    const { status } = req.query;
    const cacheKey = status ? `parcels_status_${status}` : 'all_parcels';
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    let query = supabase
      .from('parcels')
      .select(`
        parcel_id,
        sender_id,
        receiver_id,
        description,
        status,
        created_at,
        updated_at,
        sender:users!sender_id (
          user_id,
          username,
          phone,
          addresses:user_address!member_id (
            address_id,
            address_text,
            latitude,
            longitude,
            formatted_address,
            place_id,
            created_at
          )
        ),
        receiver:users!receiver_id (
          user_id,
          username,
          phone,
          addresses:user_address!member_id (
            address_id,
            address_text,
            latitude,
            longitude,
            formatted_address,
            place_id,
            created_at
          )
        )
      `)
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', parseInt(status));
    }

    const { data, error } = await query;
    if (error) throw error;

    // Sort addresses to use latest
    const processedData = data.map(parcel => {
      if (parcel.sender && parcel.sender.addresses) {
        parcel.sender.addresses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      if (parcel.receiver && parcel.receiver.addresses) {
        parcel.receiver.addresses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      return parcel;
    });

    cache.set(cacheKey, processedData);
    res.json(processedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new parcel
router.post('/parcels', async (req, res) => {
  try {
    const { sender_id, receiver_id, item_name, item_description, description } = req.body;

    // Validate required fields
    if (!sender_id || !receiver_id) {
      return res.status(400).json({ error: 'sender_id and receiver_id are required' });
    }

    // Create description from item_name and item_description or use provided description
    let finalDescription = description;
    if (!finalDescription) {
      if (item_name && item_description) {
        finalDescription = `${item_name} - ${item_description}`;
      } else if (item_name) {
        finalDescription = item_name;
      } else {
        finalDescription = 'ไม่มีรายละเอียด';
      }
    }

    const { data, error } = await supabase
      .from('parcels')
      .insert([{
        sender_id,
        receiver_id,
        description: finalDescription,
        status: 1  // Start with WAITING_FOR_RIDER
      }])
      .select();

    if (error) throw error;

    // Clear cache when new parcel is created
    cache.flushAll();
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update parcel status
router.patch('/parcels/:id/status', async (req, res) => {
  try {
    let statusValue = req.body.status;

    // Validate status
    if (statusValue === undefined || statusValue === null) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Validate parcel_id
    const parcelId = parseInt(req.params.id);
    if (isNaN(parcelId)) {
      return res.status(400).json({ error: 'Invalid parcel ID' });
    }

    // Check if parcel exists
    const { data: existingParcel, error: checkError } = await supabase
      .from('parcels')
      .select('parcel_id, status')
      .eq('parcel_id', parcelId)
      .single();

    if (checkError || !existingParcel) {
      return res.status(404).json({ error: 'Parcel not found' });
    }

    // Validate and convert status value
    if (typeof statusValue === 'number') {
      if (![1, 2, 3, 4].includes(statusValue)) {
        return res.status(400).json({
          error: 'Invalid status number. Use: 1-4'
        });
      }
    } else if (typeof statusValue === 'string') {
      const statusLower = statusValue.toLowerCase().trim();
      if (/^\d+$/.test(statusLower)) {
        statusValue = parseInt(statusLower);
        if (![1, 2, 3, 4].includes(statusValue)) {
          return res.status(400).json({ error: 'Invalid status number' });
        }
      } else {
        // Convert text to number
        const statusMap = {
          'waitingforrider': 1,
          'waiting_for_rider': 1,
          'rideraccepted': 2,
          'rider_accepted': 2,
          'riderpickedup': 3,
          'rider_picked_up': 3,
          'delivered': 4
        };
        statusValue = statusMap[statusLower];
        if (!statusValue) {
          return res.status(400).json({ error: 'Invalid status string' });
        }
      }
    } else {
      return res.status(400).json({ error: 'Status must be string or number' });
    }

    // Update parcel status
    const { data: updatedData, error: updateError } = await supabase
      .from('parcels')
      .update({
        status: statusValue,
        updated_at: new Date().toISOString()
      })
      .eq('parcel_id', parcelId)
      .select();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Clear cache when parcel status is updated
    cache.flushAll();

    const statusDescriptions = {
      1: 'waitingForRider',
      2: 'riderAccepted',
      3: 'riderPickedUp',
      4: 'delivered'
    };

    res.json({
      message: 'Parcel status updated successfully',
      parcel_id: parcelId,
      old_status: existingParcel.status,
      new_status: statusValue,
      status_description: statusDescriptions[statusValue],
      updated_data: updatedData[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user deliveries
router.get('/users/:userId/deliveries', async (req, res) => {
  try {
    const { userId } = req.params;

    // Support both string and integer
    let userIdValue = userId;
    if (/^\d+$/.test(userId)) {
      userIdValue = parseInt(userId);
    }

    // Get parcel data with rider info from delivery table
    const { data, error } = await supabase
      .from('parcels')
      .select(`
        parcel_id,
        sender_id,
        receiver_id,
        description,
        status,
        created_at,
        updated_at,
        delivery:delivery!parcel_id (
          delivery_id,
          rider_id,
          status,
          created_at,
          updated_at
        ),
        sender:users!sender_id (
          user_id,
          username,
          phone,
          addresses:user_address!member_id (
            address_id,
            address_text,
            latitude,
            longitude,
            formatted_address,
            place_id,
            created_at
          )
        ),
        receiver:users!receiver_id (
          user_id,
          username,
          phone,
          addresses:user_address!member_id (
            address_id,
            address_text,
            latitude,
            longitude,
            formatted_address,
            place_id,
            created_at
          )
        )
      `)
      .or(`sender_id.eq.${userIdValue},receiver_id.eq.${userIdValue}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Sort addresses to use latest and add rider info
    const processedData = data.map(parcel => {
      // Sort sender addresses by created_at (latest first)
      if (parcel.sender && parcel.sender.addresses) {
        parcel.sender.addresses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }

      // Sort receiver addresses by created_at (latest first)
      if (parcel.receiver && parcel.receiver.addresses) {
        parcel.receiver.addresses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }

      // Add rider info from delivery table
      if (parcel.delivery && parcel.delivery.length > 0) {
        // Use latest delivery record (in case there are multiple deliveries for same parcel)
        const latestDelivery = parcel.delivery.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        parcel.rider_id = latestDelivery.rider_id;
        parcel.delivery_status = latestDelivery.status;
        parcel.delivery_created_at = latestDelivery.created_at;
        parcel.delivery_updated_at = latestDelivery.updated_at;
      } else {
        parcel.rider_id = null;
        parcel.delivery_status = null;
        parcel.delivery_created_at = null;
        parcel.delivery_updated_at = null;
      }

      return parcel;
    });

    res.json(processedData || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;