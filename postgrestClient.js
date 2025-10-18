const axios = require('axios');
require('dotenv').config();

// PostgREST client configuration
const postgrestUrl = `${process.env.SUPABASE_URL}/rest/v1`;
const apiKey = process.env.SUPABASE_KEY;

// Check if environment variables are set
if (!postgrestUrl) {
  console.error('SUPABASE_URL is not set. Please check your .env file.');
  process.exit(1);
}

if (!apiKey) {
  console.error('SUPABASE_KEY is not set. Please check your .env file.');
  process.exit(1);
}

// Create axios instance for PostgREST with timeout and retry
const postgrest = axios.create({
  baseURL: postgrestUrl,
  timeout: 20000, // 20 seconds timeout
  headers: {
    'apikey': apiKey,
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  // Retry configuration
  retry: 3,
  retryDelay: 1000
});

// Add request interceptor for retry logic
postgrest.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    
    // If no config or retry attempts exceeded, reject
    if (!config || !config.retry) {
      return Promise.reject(error);
    }
    
    // Set retry count
    config.__retryCount = config.__retryCount || 0;
    
    // Check if we've maxed out total number of retries
    if (config.__retryCount >= config.retry) {
      return Promise.reject(error);
    }
    
    // Increase retry count
    config.__retryCount += 1;
    
    // Only retry on network errors or 5xx errors
    if (error.code === 'ECONNABORTED' || 
        error.code === 'ETIMEDOUT' ||
        (error.response && error.response.status >= 500)) {
      
      // Create new promise to handle exponential backoff
      const backoff = new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, config.retryDelay * Math.pow(2, config.__retryCount));
      });
      
      // Return the promise in which recalls axios to retry the request
      await backoff;
      return postgrest(config);
    }
    
    return Promise.reject(error);
  }
);

// Helper: build query string from filters
function buildQuery(filters = {}) {
  return Object.entries(filters)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

// Enhanced error handler
function handleError(operation, table, error) {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    throw new Error(`${operation} timeout for table ${table}. Please try again.`);
  }
  
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.message || error.response.data || 'Unknown error';
    
    switch (status) {
      case 400:
        throw new Error(`Bad request: ${message}`);
      case 401:
        throw new Error('Unauthorized access');
      case 403:
        throw new Error('Forbidden access');
      case 404:
        throw new Error(`Table ${table} not found`);
      case 409:
        throw new Error(`Conflict: ${message}`);
      case 422:
        throw new Error(`Validation error: ${message}`);
      case 500:
        throw new Error('Internal server error');
      case 503:
        throw new Error('Service temporarily unavailable');
      default:
        throw new Error(`${operation} failed: ${message}`);
    }
  }
  
  if (error.request) {
    throw new Error(`Network error during ${operation}`);
  }
  
  throw new Error(`${operation} failed: ${error.message}`);
}

// Get all records from a table
async function getAll(table) {
  try {
    const response = await postgrest.get(`/${table}`);
    return response.data;
  } catch (error) {
    handleError('Get all', table, error);
  }
}

// Get records with filters
async function getFiltered(table, filters = {}) {
  try {
    const query = buildQuery(filters);
    const response = await postgrest.get(`/${table}?${query}`);
    return response.data;
  } catch (error) {
    handleError('Get filtered', table, error);
  }
}

// Insert a new record (supports single object or array)
async function insert(table, data) {
  try {
    const payload = Array.isArray(data) ? data : [data];
    const response = await postgrest.post(`/${table}`, payload, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data;
  } catch (error) {
    handleError('Insert', table, error);
  }
}

// Update records with filters
async function update(table, data, filters = {}) {
  try {
    const query = buildQuery(filters);
    const response = await postgrest.patch(`/${table}?${query}`, data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data;
  } catch (error) {
    handleError('Update', table, error);
  }
}

// Delete records with filters
async function remove(table, filters = {}) {
  try {
    const query = buildQuery(filters);
    const response = await postgrest.delete(`/${table}?${query}`, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data;
  } catch (error) {
    handleError('Delete', table, error);
  }
}

// Get single record by ID
async function getById(table, id, idColumn = 'id') {
  try {
    const response = await postgrest.get(`/${table}?${idColumn}=eq.${id}&limit=1`);
    return response.data[0] || null;
  } catch (error) {
    handleError('Get by ID', table, error);
  }
}

// Count records with optional filters
async function count(table, filters = {}) {
  try {
    const query = buildQuery(filters);
    const response = await postgrest.head(`/${table}?${query}`, {
      headers: {
        'Prefer': 'count=exact'
      }
    });
    return parseInt(response.headers['content-range']?.split('/')[1] || '0');
  } catch (error) {
    handleError('Count', table, error);
  }
}

// Health check function
async function healthCheck() {
  try {
    const response = await postgrest.get('/', {
      timeout: 5000
    });
    return {
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  postgrest,
  getAll,
  getFiltered,
  getById,
  insert,
  update,
  remove,
  count,
  healthCheck
};
