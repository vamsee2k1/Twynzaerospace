const express = require('express');
const db = require('../db');
const router = express.Router();

// Public tracking endpoint (no authentication required)
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find delivery by tracking token
    const delivery = db.findOne('deliveries', { tracking_token: token });

    if (!delivery) {
      return res.status(404).json({ error: 'Tracking information not found' });
    }

    // Get order details
    const order = db.findOne('orders', { id: delivery.order_id });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get driver details (limited info for privacy)
    const driver = db.findOne('users', { id: delivery.driver_id });

    // Get latest location
    const latestLocation = db.findAll('locations', { delivery_id: delivery.id })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    // Calculate ETA (simple estimation based on distance and average speed)
    let eta = null;
    if (latestLocation && order.customer_latitude && order.customer_longitude) {
      const { calculateDistance } = require('../utils/geofence');
      const distanceMeters = calculateDistance(
        latestLocation.latitude,
        latestLocation.longitude,
        order.customer_latitude,
        order.customer_longitude
      );
      
      // Assume average speed of 30 km/h in city
      const averageSpeedKmh = 30;
      const distanceKm = distanceMeters / 1000;
      const etaMinutes = Math.round((distanceKm / averageSpeedKmh) * 60);
      eta = etaMinutes;
    }

    // Build status timeline
    const timeline = [
      {
        status: 'received',
        label: 'Order received',
        completed: true,
        timestamp: order.created_at
      },
      {
        status: 'assigned',
        label: 'Driver assigned',
        completed: delivery.status !== 'pending',
        timestamp: delivery.created_at
      },
      {
        status: 'started',
        label: 'Out for delivery',
        completed: ['started', 'near', 'delivered'].includes(delivery.status),
        timestamp: delivery.started_at
      },
      {
        status: 'near',
        label: 'Driver is near',
        completed: ['near', 'delivered'].includes(delivery.status),
        timestamp: delivery.status === 'near' || delivery.status === 'delivered' ? new Date() : null
      },
      {
        status: 'delivered',
        label: 'Order delivered',
        completed: delivery.status === 'delivered',
        timestamp: delivery.completed_at
      }
    ];

    res.json({
      order: {
        id: order.id,
        platform: order.platform,
        customer_name: order.customer_name,
        customer_address: order.customer_address,
        items: order.items,
        status: order.status
      },
      delivery: {
        status: delivery.status,
        started_at: delivery.started_at,
        completed_at: delivery.completed_at,
        eta: eta
      },
      driver: driver ? {
        name: driver.name.split(' ')[0] // First name only for privacy
      } : null,
      location: latestLocation ? {
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
        timestamp: latestLocation.timestamp
      } : null,
      timeline
    });
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tracking link (for sending via SMS)
router.post('/send-link', async (req, res) => {
  try {
    const { deliveryId, phoneNumber } = req.body;

    if (!deliveryId || !phoneNumber) {
      return res.status(400).json({ error: 'Delivery ID and phone number are required' });
    }

    const delivery = db.findOne('deliveries', { id: parseInt(deliveryId) });

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const trackingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${delivery.tracking_token}`;

    // In production, integrate with Twilio to send SMS
    // For demo, just return the URL
    console.log(`SMS would be sent to ${phoneNumber}: Track your order: ${trackingUrl}`);

    res.json({
      success: true,
      trackingUrl,
      message: 'Tracking link sent successfully'
    });
  } catch (error) {
    console.error('Send tracking link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
