const express = require('express');
require('dotenv').config();

const { setupMiddleware } = require('./config/middleware');
const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');
const riderRoutes = require('./routes/riders');
const parcelRoutes = require('./routes/parcels');
const deliveryRoutes = require('./routes/deliveries');
const mapRoutes = require('./routes/maps');

const app = express();

// Setup middleware
setupMiddleware(app);

// Routes
app.use('/', healthRoutes);
app.use('/api', userRoutes);
app.use('/api', riderRoutes);
app.use('/api', parcelRoutes);
app.use('/api', deliveryRoutes);
app.use('/api', mapRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});