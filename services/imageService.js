const supabase = require('../config/database');

// Upload base64 image to Supabase Storage
const uploadBase64Image = async (base64String, folder = 'delivery-status') => {
  if (!base64String) {
    console.log('❌ No base64 string provided');
    return null;
  }

  try {
    console.log('🔍 Starting image upload...');
    console.log('📁 Folder:', folder);
    console.log('📏 Base64 length:', base64String.length);

    let base64Data = base64String;
    
    // Remove data URL prefix if exists
    if (base64String.includes(',')) {
      console.log('🔄 Removing data URL prefix...');
      base64Data = base64String.split(',')[1];
      console.log('📏 Base64 data length after split:', base64Data.length);
    }

    // Convert base64 to buffer
    console.log('🔄 Converting base64 to buffer...');
    const buffer = Buffer.from(base64Data, 'base64');
    console.log('📦 Buffer size:', buffer.length, 'bytes');

    // Generate filename
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    console.log('📝 Filename:', fileName);

    // Upload to Supabase Storage
    console.log('☁️ Uploading to Supabase Storage bucket: images');
    const { data, error } = await supabase.storage
      .from('images')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      console.error('❌ Supabase Storage upload error:', error);
      console.error('Error message:', error.message);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    console.log('✅ Upload successful:', data);

    // Get public URL
    console.log('🔗 Getting public URL...');
    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;
    console.log('🌐 Public URL:', publicUrl);

    return publicUrl;
  } catch (error) {
    console.error('❌ Exception in uploadBase64Image:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return null;
  }
};

module.exports = {
  uploadBase64Image
};
