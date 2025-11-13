const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');

// Import routes
const authRoutes = require('./routes/auth');
const shiftsRoutes = require('./routes/shifts');
const ordersRoutes = require('./routes/orders');
const deliveriesRoutes = require('./routes/deliveries');
const trackingRoutes = require('./routes/tracking');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/dashboard', dashboardRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Driver joins their own room
  socket.on('driver:join', (driverId) => {
    socket.join(`driver:${driverId}`);
    console.log(`Driver ${driverId} joined room`);
  });

  // Store dashboard joins dashboard room
  socket.on('dashboard:join', () => {
    socket.join('dashboard');
    console.log('Dashboard joined');
  });

  // Customer tracking joins delivery room
  socket.on('tracking:join', (trackingToken) => {
    socket.join(`tracking:${trackingToken}`);
    console.log(`Customer joined tracking room: ${trackingToken}`);
  });

  // Driver location update
  socket.on('location:update', (data) => {
    const { driverId, deliveryId, latitude, longitude, accuracy, speed, heading } = data;

    // Save location to database
    db.insert('locations', {
      driver_id: driverId,
      delivery_id: deliveryId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      timestamp: new Date()
    });

    // Broadcast to dashboard
    io.to('dashboard').emit('driver:location', {
      driverId,
      deliveryId,
      latitude,
      longitude,
      timestamp: new Date()
    });

    // Broadcast to customer tracking if delivery exists
    if (deliveryId) {
      const delivery = db.findOne('deliveries', { id: deliveryId });
      if (delivery) {
        io.to(`tracking:${delivery.tracking_token}`).emit('delivery:location', {
          latitude,
          longitude,
          timestamp: new Date()
        });

        // Check if driver is near destination
        const order = db.findOne('orders', { id: delivery.order_id });
        if (order && order.customer_latitude && order.customer_longitude) {
          const { isNearDestination } = require('./utils/geofence');
          const isNear = isNearDestination(
            latitude,
            longitude,
            order.customer_latitude,
            order.customer_longitude
          );

          if (isNear && delivery.status !== 'near') {
            db.update('deliveries', deliveryId, { status: 'near' });
            
            // Notify customer
            io.to(`tracking:${delivery.tracking_token}`).emit('delivery:status', {
              status: 'near',
              message: 'Driver is near your location'
            });

            // Notify dashboard
            io.to('dashboard').emit('delivery:status', {
              deliveryId,
              status: 'near'
            });
          }
        }
      }
    }
  });

  // Order status update
  socket.on('order:update', (data) => {
    const { orderId, status } = data;
    
    // Broadcast to dashboard
    io.to('dashboard').emit('order:status', {
      orderId,
      status,
      timestamp: new Date()
    });

    // If order has a delivery, notify tracking
    const order = db.findOne('orders', { id: orderId });
    if (order && order.assigned_driver_id) {
      const delivery = db.findOne('deliveries', { order_id: orderId });
      if (delivery) {
        io.to(`tracking:${delivery.tracking_token}`).emit('delivery:status', {
          status,
          timestamp: new Date()
        });
      }
    }
  });

  // New order notification
  socket.on('order:new', (order) => {
    // Notify all active drivers
    const activeShifts = db.findAll('shifts', { status: 'active' });
    activeShifts.forEach(shift => {
      io.to(`driver:${shift.driver_id}`).emit('order:available', order);
    });

    // Notify dashboard
    io.to('dashboard').emit('order:new', order);
  });

  // Delivery completed
  socket.on('delivery:complete', (data) => {
    const { deliveryId } = data;
    const delivery = db.findOne('deliveries', { id: deliveryId });
    
    if (delivery) {
      // Notify customer
      io.to(`tracking:${delivery.tracking_token}`).emit('delivery:status', {
        status: 'delivered',
        message: 'Your order has been delivered'
      });

      // Notify dashboard
      io.to('dashboard').emit('delivery:complete', {
        deliveryId,
        timestamp: new Date()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Fireway Driver App Backend Server`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 API: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   POST   /api/auth/login`);
  console.log(`   POST   /api/auth/register`);
  console.log(`   POST   /api/shifts/clock-in`);
  console.log(`   POST   /api/shifts/clock-out`);
  console.log(`   GET    /api/shifts/current`);
  console.log(`   GET    /api/orders/feed`);
  console.log(`   POST   /api/orders/:orderId/claim`);
  console.log(`   GET    /api/orders/my-orders`);
  console.log(`   POST   /api/deliveries/:deliveryId/start`);
  console.log(`   POST   /api/deliveries/:deliveryId/location`);
  console.log(`   POST   /api/deliveries/:deliveryId/complete`);
  console.log(`   GET    /api/tracking/:token`);
  console.log(`   GET    /api/dashboard/drivers`);
  console.log(`   GET    /api/dashboard/stats`);
  console.log(`   GET    /api/dashboard/alerts`);
  console.log(`\n✅ Server ready!\n`);
});

module.exports = { app, server, io };
