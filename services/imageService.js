const supabase = require('../config/database');

// Upload base64 image to Supabase Storage
const uploadBase64Image = async (base64String, folder = 'delivery-status') => {
  if (!base64String) return null;

  try {
    let base64Data = base64String;
    if (base64String.includes(',')) {
      base64Data = base64String.split(',')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    const { data, error } = await supabase.storage
      .from('images')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  } catch (error) {
    return null;
  }
};

module.exports = {
  uploadBase64Image
};