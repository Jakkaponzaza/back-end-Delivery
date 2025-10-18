const bcrypt = require('bcryptjs');
const supabase = require('./supabaseClient');
const { v4: uuidv4 } = require('uuid');

const SALT_ROUNDS = 10;
const OPERATION_TIMEOUT = 20000; // 20 seconds

// Timeout wrapper for database operations
async function withTimeout(promise, timeoutMs = OPERATION_TIMEOUT) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

// Hash password
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return await bcrypt.hash(password, salt);
}

// Compare password
async function comparePasswords(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

// Register user
async function registerUser({ username, phone, password, profile_image, address, latitude, longitude, formatted_address, place_id }) {
  if (!username || !phone || !password) {
    throw new Error('Username, phone, and password are required');
  }

  try {
    const { data: existingUsers } = await withTimeout(
      supabase
        .from('users')
        .select('phone')
        .eq('phone', phone)
        .limit(1)
    );

    if (existingUsers && existingUsers.length > 0) {
      throw new Error('User with this phone already exists');
    }

    const hashedPassword = await hashPassword(password);

    // Upload profile image if provided
    let profileImageUrl = null;
    if (profile_image) {
      profileImageUrl = await uploadBase64Image(profile_image, 'user-profiles');
    }

    const { data, error } = await withTimeout(
      supabase
        .from('users')
        .insert([{ 
          username, 
          phone, 
          password: hashedPassword, 
          profile_image: profileImageUrl 
        }])
        .select('user_id, username, phone, profile_image')
    );

    if (error) throw new Error(error.message);

    // Add default address if provided
    if (address && data && data[0]) {
      await addUserAddress({
        member_id: data[0].user_id,
        address_text: address,
        latitude: latitude || 13.7563,
        longitude: longitude || 100.5018,
        formatted_address: formatted_address || address,
        place_id: place_id || null
      });
    }

    return { 
      success: true,
      message: 'register success',
      user: data[0]
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Registration timeout. Please try again.');
    }
    throw error;
  }
}


// Login user
async function loginUser(phone, password) {
  if (!phone || !password) throw new Error('Phone and password are required');

  try {
    const { data: users, error } = await withTimeout(
      supabase
        .from('users')
        .select('user_id, username, phone, password, profile_image')
        .eq('phone', phone)
        .limit(1)
    );

    if (error) throw new Error(error.message);
    if (!users || users.length === 0) throw new Error('Invalid phone or password');

    const user = users[0];
    const isValid = await comparePasswords(password, user.password);
    if (!isValid) throw new Error('Invalid phone or password');

    return { 
      success: true, 
      message: 'Login successful', 
      user: { 
        user_id: user.user_id, 
        username: user.username, 
        phone: user.phone,
        profile_image: user.profile_image
      } 
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Login timeout. Please try again.');
    }
    throw error;
  }
}

// Register rider
async function registerRider({ name, phone, password, profile_image, vehicle_image, license_plate, location, latitude, longitude }) {
  if (!name || !phone || !password) 
    throw new Error('Name, phone, and password are required');

  try {
    const { data: existingRiders } = await withTimeout(
      supabase
        .from('riders')
        .select('phone')
        .eq('phone', phone)
        .limit(1)
    );

    if (existingRiders && existingRiders.length > 0) {
      throw new Error('Rider with this phone already exists');
    }

    const hashedPassword = await hashPassword(password);

    // Upload images if provided
    let profileImageUrl = null;
    let vehicleImageUrl = null;

    if (profile_image) {
      profileImageUrl = await uploadBase64Image(profile_image, 'rider-profiles');
    }

    if (vehicle_image) {
      vehicleImageUrl = await uploadBase64Image(vehicle_image, 'vehicles');
    }

    // Create location object with coordinates
    const locationData = {
      address: location || null,
      latitude: latitude || 13.7563,
      longitude: longitude || 100.5018
    };

    const { data, error } = await withTimeout(
      supabase
        .from('riders')
        .insert([{
          name,
          phone,
          password: hashedPassword,
          profile_image: profileImageUrl,
          vehicle_image: vehicleImageUrl,
          license_plate: license_plate || null,
          location: JSON.stringify(locationData),
        }])
        .select('rider_id, name, phone, profile_image, vehicle_image, license_plate, location')
    );

    if (error) throw new Error(error.message);

    return { 
      success: true, 
      message: 'register success', 
      rider: data[0] 
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Registration timeout. Please try again.');
    }
    throw error;
  }
}


// Login rider
async function loginRider(phone, password) {
  if (!phone || !password) throw new Error('Phone and password are required');

  try {
    const { data: riders, error } = await withTimeout(
      supabase
        .from('riders')
        .select('rider_id, name, phone, password, profile_image, vehicle_image, license_plate, location, is_available')
        .eq('phone', phone)
        .limit(1)
    );

    if (error) throw new Error(error.message);
    if (!riders || riders.length === 0) throw new Error('Invalid phone or password');

    const rider = riders[0];
    const isValid = await comparePasswords(password, rider.password);
    if (!isValid) throw new Error('Invalid phone or password');

    return { 
      success: true, 
      message: 'Login successful', 
      rider: { 
        rider_id: rider.rider_id, 
        name: rider.name, 
        phone: rider.phone,
        profile_image: rider.profile_image,
        vehicle_image: rider.vehicle_image,
        license_plate: rider.license_plate,
        location: rider.location,
        is_available: rider.is_available
      } 
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Login timeout. Please try again.');
    }
    throw error;
  }
}

// Upload base64 image to Supabase Storage
async function uploadBase64Image(base64String, folder = 'profiles') {
  if (!base64String) return null;

  try {
    let base64Data = base64String;
    if (base64String.includes(',')) {
      base64Data = base64String.split(',')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${folder}/${uuidv4()}.jpg`;

    const { data, error } = await withTimeout(
      supabase.storage
        .from('images')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: false,
        }),
      15000 // 15 seconds for image upload
    );

    if (error) {
      console.error('Image upload failed:', error.message);
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  } catch (error) {
    if (error.message === 'Operation timeout') {
      console.error('Image upload timeout');
    } else {
      console.error('Image upload error:', error.message);
    }
    return null;
  }
}

// Add user address
async function addUserAddress({ member_id, address_text, latitude, longitude, formatted_address, place_id }) {
  if (!member_id || !address_text) {
    throw new Error('Member ID and address text are required');
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('user_address')
        .insert([{
          member_id: parseInt(member_id),
          address_text,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          formatted_address: formatted_address || address_text,
          place_id: place_id || null,
          created_at: new Date().toISOString()
        }])
        .select('address_id, member_id, address_text, latitude, longitude, formatted_address, place_id')
    );

    if (error) throw new Error(error.message);

    return {
      success: true,
      message: 'Address added successfully',
      address: data[0]
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Add address timeout. Please try again.');
    }
    throw error;
  }
}


// Get user addresses
async function getUserAddresses(member_id) {
  if (!member_id) throw new Error('Member ID is required');

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('user_address')
        .select('address_id, member_id, address_text, latitude, longitude, formatted_address, place_id, created_at')
        .eq('member_id', member_id)
        .order('created_at', { ascending: false })
    );

    if (error) throw new Error(error.message);

    return {
      success: true,
      addresses: data || []
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Get addresses timeout. Please try again.');
    }
    throw error;
  }
}


// Get user data
async function getUserData(user_id) {
  if (!user_id) throw new Error('User ID is required');

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('users')
        .select('user_id, username, phone, profile_image')
        .eq('user_id', user_id)
        .single()
    );

    if (error) throw new Error(error.message);

    return {
      success: true,
      user: data
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Get user data timeout. Please try again.');
    }
    throw error;
  }
}

// Get rider data
async function getRiderData(rider_id) {
  if (!rider_id) throw new Error('Rider ID is required');

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('riders')
        .select('rider_id, name, phone, profile_image, vehicle_image, license_plate, location')
        .eq('rider_id', rider_id)
        .single()
    );

    if (error) throw new Error(error.message);

    return {
      success: true,
      rider: data
    };
  } catch (error) {
    if (error.message === 'Operation timeout') {
      throw new Error('Get rider data timeout. Please try again.');
    }
    throw error;
  }
}

module.exports = {
  registerUser,
  loginUser,
  registerRider,
  loginRider,
  addUserAddress,
  getUserAddresses,
  getUserData,
  getRiderData,
  uploadBase64Image,
  hashPassword,
  comparePasswords
};
