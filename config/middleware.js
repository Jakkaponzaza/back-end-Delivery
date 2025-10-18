const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const timeout = require('connect-timeout');
const NodeCache = require('node-cache');

// Initialize cache (1 minute TTL)
const cache = new NodeCache({ stdTTL: 60 });

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Timeout errors
  if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
    return res.status(408).json({ error: 'Request timeout. Please try again.' });
  }

  // Database connection errors
  if (err.code === 'PGRST116') {
    return res.status(503).json({ error: 'Database temporarily unavailable. Please try again.' });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
};

const setupMiddleware = (app) => {
  // Apply rate limiting to all API routes
  app.use('/api', limiter);

  // Timeout middleware (20 seconds)
  app.use(timeout('20s'));

  // CORS Configuration
  // CORS Configuration - รองรับ mobile app
  app.use(cors({
    origin: '*', // รับทุก origin สำหรับ mobile app
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Body Parser Configuration with increased limits (100MB)
  app.use(express.json({
    limit: '100mb',
    parameterLimit: 100000
  }));

  app.use(express.urlencoded({
    limit: '100mb',
    extended: true,
    parameterLimit: 100000
  }));

  // Error handling
  app.use(errorHandler);
};

module.exports = {
  cache,
  setupMiddleware,
  errorHandler
};