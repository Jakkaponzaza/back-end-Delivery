const bcrypt = require('bcryptjs');
const supabase = require('../config/database');

// Register user
const registerUser = async (userData) => {
  const { username, phone, password, profile_image } = userData;

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('phone')
    .eq('phone', phone)
    .single();

  if (existingUser) {
    throw new Error('User with this phone number already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert user
  const { data, error } = await supabase
    .from('users')
    .insert([{
      username,
      phone,
      password: hashedPassword,
      profile_image: profile_image || null
    }])
    .select();

  if (error) throw error;

  return {
    success: true,
    message: 'User registered successfully',
    user: {
      user_id: data[0].user_id,
      username: data[0].username,
      phone: data[0].phone,
      profile_image: data[0].profile_image
    }
  };
};

// Register rider
const registerRider = async (riderData) => {
  const { name, phone, password, profile_image, vehicle_image, license_plate, location } = riderData;

  // Check if rider already exists
  const { data: existingRider } = await supabase
    .from('riders')
    .select('phone')
    .eq('phone', phone)
    .single();

  if (existingRider) {
    throw new Error('Rider with this phone number already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert rider
  const { data, error } = await supabase
    .from('riders')
    .insert([{
      name,
      phone,
      password: hashedPassword,
      profile_image: profile_image || null,
      vehicle_image: vehicle_image || null,
      license_plate,
      location: location || null  
    }])
    .select();

  if (error) throw error;

  return {
    success: true,
    message: 'Rider registered successfully',
    rider: {
      rider_id: data[0].rider_id,
      name: data[0].name,
      phone: data[0].phone,
      profile_image: data[0].profile_image,
      vehicle_image: data[0].vehicle_image,
      license_plate: data[0].license_plate,
      location: data[0].location 
    }
  };
};


// Add user address
const addUserAddress = async (addressData) => {
  const { member_id, address_text, latitude, longitude } = addressData;

  const { data, error } = await supabase
    .from('user_address')
    .insert([{
      member_id,
      address_text,
      latitude,
      longitude
    }])
    .select();

  if (error) throw error;

  return {
    success: true,
    message: 'Address added successfully',
    address: data[0]
  };
};

// Get user addresses
const getUserAddresses = async (userId) => {
  const { data, error } = await supabase
    .from('user_address')
    .select('*')
    .eq('member_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return data || [];
};

// Get user data
const getUserData = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, phone, profile_image')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new Error('User not found');
  }

  return data;
};

// Get rider data
const getRiderData = async (riderId) => {
  const { data, error } = await supabase
    .from('riders')
    .select('rider_id, name, phone, profile_image, vehicle_image, license_plate')
    .eq('rider_id', riderId)
    .single();

  if (error || !data) {
    throw new Error('Rider not found');
  }

  return data;
};

module.exports = {
  registerUser,
  registerRider,
  addUserAddress,
  getUserAddresses,
  getUserData,
  getRiderData
};