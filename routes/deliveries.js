const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { cache } = require('../config/middleware');
const { DELIVERY_STATUS } = require('../config/constants');
const { uploadBase64Image } = require('../services/imageService');

// Get rider deliveries
router.get('/riders/:riderId/deliveries', async (req, res) => {
  try {
    const { riderId } = req.params;

    // Check if rider exists
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('rider_id, name')
      .eq('rider_id', riderId)
      .single();

    if (riderError || !rider) {
      return res.status(404).json({ error: 'Rider not found' });
    }

    // ✅ ดึงข้อมูล delivery พร้อมพิกัดที่ปักหมุด
    const { data, error } = await supabase
      .from('delivery')
      .select(`
        delivery_id,
        parcel_id,
        rider_id,
        status,
        created_at,
        updated_at,
        pickup_latitude,
        pickup_longitude,
        pickup_address,
        delivery_latitude,
        delivery_longitude,
        delivery_address,
        parcels!inner (
          parcel_id,
          sender_id,
          receiver_id,
          description,
          status,
          created_at,
          sender:users!sender_id (
            user_id,
            username,
            phone
          ),
          receiver:users!receiver_id (
            user_id,
            username,
            phone
          )
        )
      `)
      .eq('rider_id', riderId)
      .in('status', [0, 1]) // Only pending and in_transit
      .order('created_at', { ascending: false });

    if (error) throw error;

    // ✅ ประมวลผลข้อมูล - ใช้พิกัดจาก delivery แทน user_address
    const processedData = (data || []).map(delivery => {
      // ใช้พิกัดจาก delivery table (ที่ปักหมุด)
      const pickupCoords = {
        latitude: delivery.pickup_latitude,
        longitude: delivery.pickup_longitude,
        address_text: delivery.pickup_address || 'ไม่มีข้อมูลที่อยู่'
      };

      const deliveryCoords = {
        latitude: delivery.delivery_latitude,
        longitude: delivery.delivery_longitude,
        address_text: delivery.delivery_address || 'ไม่มีข้อมูลที่อยู่'
      };

      // เพิ่มพิกัดเข้าไปใน sender และ receiver
      if (delivery.parcels && delivery.parcels.sender) {
        delivery.parcels.sender.pickup_coordinates = pickupCoords;
      }

      if (delivery.parcels && delivery.parcels.receiver) {
        delivery.parcels.receiver.delivery_coordinates = deliveryCoords;
      }

      return delivery;
    });

    console.log(`✅ Found ${processedData.length} deliveries for rider ${riderId}`);

    res.json(processedData);
  } catch (err) {
    console.error('❌ Error getting rider deliveries:', err);
    res.status(500).json({ error: err.message });
  }
});

// Accept parcel by rider
router.post('/parcels/:parcelId/accept', async (req, res) => {
  try {
    const { parcelId } = req.params;
    const { rider_id } = req.body;

    // 1. Check if rider has unfinished jobs
    const { data: existingJobs, error: jobCheckError } = await supabase
      .from('delivery')
      .select('delivery_id, status')
      .eq('rider_id', rider_id)
      .in('status', [0, 1]); // pending or in_transit

    if (jobCheckError) {
      return res.status(500).json({ error: 'ไม่สามารถตรวจสอบงานที่มีอยู่ได้' });
    }

    if (existingJobs && existingJobs.length > 0) {
      return res.status(400).json({ 
        error: 'คุณมีงานที่ยังไม่เสร็จอยู่ กรุณาส่งพัสดุให้เสร็จก่อนรับงานใหม่',
        existing_jobs: existingJobs.length
      });
    }

    // 2. Check if parcel is still waiting for rider
    const { data: parcel, error: parcelCheckError } = await supabase
      .from('parcels')
      .select('parcel_id, status')
      .eq('parcel_id', parcelId)
      .single();

    if (parcelCheckError || !parcel) {
      return res.status(404).json({ error: 'ไม่พบพัสดุที่ต้องการ' });
    }

    if (parcel.status !== 1) { // Must be WAITING_FOR_RIDER
      return res.status(400).json({ error: 'พัสดุนี้ไม่สามารถรับได้ อาจมีไรเดอร์คนอื่นรับไปแล้ว' });
    }

    // 3. Check if another rider already accepted this job
    // ✅ แก้ไขตรงนี้ - เช็คว่ามี rider_id หรือยัง
    const { data: existingDelivery, error: deliveryCheckError } = await supabase
      .from('delivery')
      .select('delivery_id, rider_id, status')
      .eq('parcel_id', parcelId)
      .not('rider_id', 'is', null) // ✅ เพิ่มเงื่อนไขนี้
      .in('status', [0, 1, 2]);

    if (deliveryCheckError) {
      return res.status(500).json({ error: 'ไม่สามารถตรวจสอบสถานะการส่งได้' });
    }

    if (existingDelivery && existingDelivery.length > 0) {
      return res.status(400).json({ error: 'พัสดุนี้มีไรเดอร์รับไปแล้ว' });
    }

    // 4. Update parcel status
    const { data: updatedParcel, error: parcelUpdateError } = await supabase
      .from('parcels')
      .update({ 
        status: 2, // RIDER_ACCEPTED
        updated_at: new Date().toISOString()
      })
      .eq('parcel_id', parcelId)
      .eq('status', 1) // Must still be status 1
      .select();

    if (parcelUpdateError || !updatedParcel || updatedParcel.length === 0) {
      return res.status(400).json({ error: 'ไม่สามารถรับงานได้ อาจมีไรเดอร์คนอื่นรับไปแล้ว' });
    }

    // 5. Update existing delivery record (instead of creating new one)
    const { data: updatedDelivery, error: deliveryError } = await supabase
      .from('delivery')
      .update({
        rider_id: rider_id,
        status: 0, // PENDING
        updated_at: new Date().toISOString()
      })
      .eq('parcel_id', parcelId)
      .is('rider_id', null) // Only update if no rider yet
      .select();

    if (deliveryError || !updatedDelivery || updatedDelivery.length === 0) {
      // Rollback parcel status
      await supabase
        .from('parcels')
        .update({ status: 1 })
        .eq('parcel_id', parcelId);
      
      return res.status(400).json({ error: 'ไม่สามารถรับงานได้ อาจมีไรเดอร์คนอื่นรับไปแล้ว' });
    }

    console.log('✅ Rider accepted parcel:', parcelId, 'by rider:', rider_id);

    // Clear cache
    cache.flushAll();

    res.status(201).json({
      success: true,
      message: 'รับงานสำเร็จ',
      delivery: updatedDelivery[0],
      parcel_status: 2
    });
  } catch (err) {
    console.error('❌ Error accepting parcel:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get rider history
router.get('/riders/:riderId/history', async (req, res) => {
  try {
    const { riderId } = req.params;
    const { data, error } = await supabase
      .from('delivery')
      .select(`
        delivery_id,
        parcel_id,
        rider_id,
        status,
        created_at,
        updated_at,
        parcels!inner (
          parcel_id,
          sender_id,
          receiver_id,
          description,
          status,
          created_at,
          sender:users!sender_id (
            user_id,
            username,
            phone
          ),
          receiver:users!receiver_id (
            user_id,
            username,
            phone
          )
        )
      `)
      .eq('rider_id', riderId)
      .eq('status', 2) // Only delivered
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update delivery status
router.patch('/deliveries/:id/status', async (req, res) => {
  try {
    const { status, image } = req.body;
    
    if (status === undefined || status === null) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const deliveryId = parseInt(req.params.id);
    if (isNaN(deliveryId)) {
      return res.status(400).json({ error: 'Invalid delivery ID' });
    }

    // Check if delivery exists
    const { data: existingDelivery, error: checkError } = await supabase
      .from('delivery')
      .select('delivery_id, parcel_id, status')
      .eq('delivery_id', deliveryId)
      .single();

    if (checkError || !existingDelivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Validate status value (0, 1, 2)
    if (![0, 1, 2].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Use: 0 (pending), 1 (in_transit), 2 (delivered)'
      });
    }

    // Map delivery status to parcel status
    let parcelStatus;
    switch (status) {
      case 0: parcelStatus = 2; break; // delivery pending = parcel rider_accepted
      case 1: parcelStatus = 3; break; // delivery in_transit = parcel rider_picked_up  
      case 2: parcelStatus = 4; break; // delivery delivered = parcel delivered
    }

    // Prepare update data
    const updateData = {
      status: status,
      updated_at: new Date().toISOString()
    };

    // Add image if provided (for status 1 and 2)
    if (image && (status === 1 || status === 2)) {
      try {
        const imageUrl = await uploadBase64Image(image, 'delivery-status');
        if (imageUrl) {
          if (status === 1) {
            updateData.pickup_image = imageUrl; // Pickup image
          } else if (status === 2) {
            updateData.delivery_image = imageUrl; // Delivery image
          }
        }
      } catch (imageError) {
        // Don't let image error block status update
      }
    }

    // Update delivery status
    const { data: updatedDelivery, error: deliveryError } = await supabase
      .from('delivery')
      .update(updateData)
      .eq('delivery_id', deliveryId)
      .select();

    if (deliveryError) {
      return res.status(500).json({ error: deliveryError.message });
    }

    // Update parcel status to sync
    const { error: parcelError } = await supabase
      .from('parcels')
      .update({
        status: parcelStatus,
        updated_at: new Date().toISOString()
      })
      .eq('parcel_id', existingDelivery.parcel_id);

    if (parcelError) {
      return res.status(500).json({ error: parcelError.message });
    }

    // Clear cache when delivery status is updated
    cache.flushAll();

    const statusDescriptions = {
      0: 'pending',
      1: 'in_transit',
      2: 'delivered'
    };

    res.json({
      success: true,
      message: 'อัปเดตสถานะสำเร็จ',
      delivery_id: deliveryId,
      old_status: existingDelivery.status,
      new_status: status,
      status_description: statusDescriptions[status],
      parcel_status: parcelStatus,
      updated_data: updatedDelivery[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available deliveries for riders
router.get('/deliveries/available', async (req, res) => {
  try {
    const cacheKey = 'available_deliveries';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    // ✅ ดึงข้อมูล parcels พร้อม item_image
    const { data: parcels, error: parcelsError } = await supabase
      .from('parcels')
      .select(`
        parcel_id,
        sender_id,
        receiver_id,
        description,
        item_image,
        status,
        created_at,
        updated_at,
        sender:users!sender_id (
          user_id,
          username,
          phone
        ),
        receiver:users!receiver_id (
          user_id,
          username,
          phone
        )
      `)
      .eq('status', 1) // Only waiting for rider
      .order('created_at', { ascending: false });

    if (parcelsError) throw parcelsError;

    // ✅ ดึงพิกัดจาก delivery table
    const parcelIds = parcels.map(p => p.parcel_id);
    
    const { data: deliveries, error: deliveriesError } = await supabase
      .from('delivery')
      .select(`
        parcel_id,
        pickup_latitude,
        pickup_longitude,
        pickup_address,
        delivery_latitude,
        delivery_longitude,
        delivery_address
      `)
      .in('parcel_id', parcelIds);

    if (deliveriesError) throw deliveriesError;

    // ✅ รวมข้อมูล parcels กับ delivery coordinates
    const processedData = parcels.map(parcel => {
      const delivery = deliveries.find(d => d.parcel_id === parcel.parcel_id);
      
      if (delivery) {
        // ใช้พิกัดจาก delivery table
        if (parcel.sender) {
          parcel.sender.pickup_coordinates = {
            latitude: delivery.pickup_latitude,
            longitude: delivery.pickup_longitude,
            address_text: delivery.pickup_address || 'ไม่มีข้อมูลที่อยู่'
          };
        }
        
        if (parcel.receiver) {
          parcel.receiver.delivery_coordinates = {
            latitude: delivery.delivery_latitude,
            longitude: delivery.delivery_longitude,
            address_text: delivery.delivery_address || 'ไม่มีข้อมูลที่อยู่'
          };
        }
      }
      
      return parcel;
    });

    cache.set(cacheKey, processedData);
    console.log(`✅ Found ${processedData.length} available deliveries`);
    res.json(processedData);
  } catch (err) {
    console.error('❌ Error getting available deliveries:', err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;