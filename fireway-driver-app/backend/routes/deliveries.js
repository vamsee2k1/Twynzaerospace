const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { hasExitedGeofence, isNearDestination } = require('../utils/geofence');
const router = express.Router();

// Start delivery
router.post('/:deliveryId/start', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { latitude, longitude } = req.body;
    const driverId = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates are required' });
    }

    const delivery = db.findOne('deliveries', { id: parseInt(deliveryId), driver_id: driverId });

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status !== 'assigned') {
      return res.status(409).json({ error: 'Delivery already started' });
    }

    // Check if driver has exited geofence
    if (!hasExitedGeofence(latitude, longitude)) {
      return res.status(403).json({ 
        error: 'You must exit the store area to start delivery',
        withinGeofence: true
      });
    }

    // Update delivery status
    const updatedDelivery = db.update('deliveries', parseInt(deliveryId), {
      status: 'started',
      started_at: new Date()
    });

    // Update order status
    const order = db.findOne('orders', { id: delivery.order_id });
    if (order) {
      db.update('orders', order.id, { status: 'out_for_delivery' });
    }

    // Record initial location
    db.insert('locations', {
      driver_id: driverId,
      delivery_id: parseInt(deliveryId),
      latitude,
      longitude,
      timestamp: new Date()
    });

    res.json({
      success: true,
      delivery: updatedDelivery,
      message: 'Delivery started'
    });
  } catch (error) {
    console.error('Start delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update location during delivery
router.post('/:deliveryId/location', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { latitude, longitude, accuracy, speed, heading } = req.body;
    const driverId = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates are required' });
    }

    const delivery = db.findOne('deliveries', { id: parseInt(deliveryId), driver_id: driverId });

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status !== 'started' && delivery.status !== 'near') {
      return res.status(409).json({ error: 'Delivery is not active' });
    }

    // Record location
    db.insert('locations', {
      driver_id: driverId,
      delivery_id: parseInt(deliveryId),
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      timestamp: new Date()
    });

    // Check if driver is near destination
    const order = db.findOne('orders', { id: delivery.order_id });
    if (order && order.customer_latitude && order.customer_longitude) {
      const isNear = isNearDestination(
        latitude, 
        longitude, 
        order.customer_latitude, 
        order.customer_longitude
      );

      if (isNear && delivery.status !== 'near') {
        db.update('deliveries', parseInt(deliveryId), { status: 'near' });
      }
    }

    res.json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete delivery
router.post('/:deliveryId/complete', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { notes, proofUrl } = req.body;
    const driverId = req.user.id;

    const delivery = db.findOne('deliveries', { id: parseInt(deliveryId), driver_id: driverId });

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status === 'delivered') {
      return res.status(409).json({ error: 'Delivery already completed' });
    }

    // Calculate duration
    const startTime = new Date(delivery.started_at);
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    // Calculate distance (sum of all location updates)
    const locations = db.findAll('locations', { delivery_id: parseInt(deliveryId) })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let totalDistance = 0;
    for (let i = 1; i < locations.length; i++) {
      const { calculateDistance } = require('../utils/geofence');
      const dist = calculateDistance(
        locations[i - 1].latitude,
        locations[i - 1].longitude,
        locations[i].latitude,
        locations[i].longitude
      );
      totalDistance += dist;
    }
    const distanceKm = (totalDistance / 1000).toFixed(2);

    // Update delivery
    const updatedDelivery = db.update('deliveries', parseInt(deliveryId), {
      status: 'delivered',
      completed_at: endTime,
      duration_minutes: durationMinutes,
      distance_km: parseFloat(distanceKm),
      notes,
      delivery_proof_url: proofUrl
    });

    // Update order status
    const order = db.findOne('orders', { id: delivery.order_id });
    if (order) {
      db.update('orders', order.id, { status: 'delivered' });
    }

    // Update shift statistics
    const shift = db.findOne('shifts', { id: delivery.shift_id });
    if (shift) {
      db.update('shifts', shift.id, {
        total_deliveries: shift.total_deliveries + 1,
        total_distance_km: shift.total_distance_km + parseFloat(distanceKm)
      });
    }

    res.json({
      success: true,
      delivery: updatedDelivery,
      message: 'Delivery completed successfully'
    });
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get delivery details
router.get('/:deliveryId', authenticateToken, async (req, res) => {
  try {
    const { deliveryId } = req.params;

    const delivery = db.findOne('deliveries', { id: parseInt(deliveryId) });

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Get order details
    const order = db.findOne('orders', { id: delivery.order_id });

    // Get driver details
    const driver = db.findOne('users', { id: delivery.driver_id });

    res.json({
      delivery,
      order,
      driver: driver ? { id: driver.id, name: driver.name, phone: driver.phone } : null
    });
  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get delivery logs (for store dashboard)
router.get('/', authenticateToken, authorizeRole('store_staff', 'admin'), async (req, res) => {
  try {
    const { status, driverId, startDate, endDate } = req.query;

    let deliveries = db.findAll('deliveries');

    // Apply filters
    if (status) {
      deliveries = deliveries.filter(d => d.status === status);
    }
    if (driverId) {
      deliveries = deliveries.filter(d => d.driver_id === parseInt(driverId));
    }
    if (startDate) {
      deliveries = deliveries.filter(d => new Date(d.created_at) >= new Date(startDate));
    }
    if (endDate) {
      deliveries = deliveries.filter(d => new Date(d.created_at) <= new Date(endDate));
    }

    // Sort by created date (newest first)
    deliveries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Enrich with order and driver info
    const enrichedDeliveries = deliveries.map(delivery => {
      const order = db.findOne('orders', { id: delivery.order_id });
      const driver = db.findOne('users', { id: delivery.driver_id });
      return {
        ...delivery,
        order,
        driver: driver ? { id: driver.id, name: driver.name, phone: driver.phone } : null
      };
    });

    res.json({ deliveries: enrichedDeliveries });
  } catch (error) {
    console.error('Get delivery logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
