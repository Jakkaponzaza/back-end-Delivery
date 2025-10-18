// HeiGIT API Configuration
const HEIGIT_API_KEY = process.env.HEIGIT_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImY4Y2RmZTY3YWM4MDQ3YWY4MWFmZmIyNjllMzlmNzlmIiwiaCI6Im11cm11cjY0In0=';
const HEIGIT_BASE_URL = 'https://api.openrouteservice.org';

// Status constants
const PARCEL_STATUS = {
  WAITING_FOR_RIDER: 1,    // รอไรเดอร์มารับสินค้า
  RIDER_ACCEPTED: 2,       // ไรเดอร์รับงาน
  RIDER_PICKED_UP: 3,      // ไรเดอร์รับสินค้าแล้ว
  DELIVERED: 4             // ส่งสำเร็จ
};

// Delivery Status constants
const DELIVERY_STATUS = {
  PENDING: 0,        // รอรับพัสดุ
  IN_TRANSIT: 1,     // กำลังส่ง
  DELIVERED: 2       // ส่งสำเร็จ
};

module.exports = {
  HEIGIT_API_KEY,
  HEIGIT_BASE_URL,
  PARCEL_STATUS,
  DELIVERY_STATUS
};