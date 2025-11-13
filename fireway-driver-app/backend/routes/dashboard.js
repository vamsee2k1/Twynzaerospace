const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const router = express.Router();

// Get all active drivers with their current location
router.get('/drivers', authenticateToken, authorizeRole('store_staff', 'admin'), async (req, res) => {
  try {
    // Get all drivers with active shifts
    const activeShifts = db.findAll('shifts', { status: 'active' });

    const drivers = activeShifts.map(shift => {
      const driver = db.findOne('users', { id: shift.driver_id });
      
      // Get active deliveries
      const activeDeliveries = db.findAll('deliveries', { 
        driver_id: shift.driver_id,
        shift_id: shift.id
      }).filter(d => d.status !== 'delivered');

      // Get latest location
      const latestLocation = db.findAll('locations', { driver_id: shift.driver_id })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

      return {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        shift,
        activeDeliveries: activeDeliveries.length,
        location: latestLocation || null,
        status: activeDeliveries.length > 0 ? 'delivering' : 'available'
      };
    });

    res.json({ drivers });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard statistics
router.get('/stats', authenticateToken, authorizeRole('store_staff', 'admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Active drivers
    const activeDrivers = db.findAll('shifts', { status: 'active' }).length;

    // Pending orders
    const pendingOrders = db.findAll('orders', { status: 'pending' }).length;

    // Out for delivery
    const outForDelivery = db.findAll('orders', { status: 'out_for_delivery' }).length;

    // Today's completed deliveries
    const todayDeliveries = db.findAll('deliveries')
      .filter(d => d.status === 'delivered' && new Date(d.completed_at) >= today).length;

    // Average delivery time today
    const todayCompletedDeliveries = db.findAll('deliveries')
      .filter(d => d.status === 'delivered' && new Date(d.completed_at) >= today);
    
    const avgDeliveryTime = todayCompletedDeliveries.length > 0
      ? todayCompletedDeliveries.reduce((sum, d) => sum + (d.duration_minutes || 0), 0) / todayCompletedDeliveries.length
      : 0;

    // Delayed orders (more than 45 minutes old and still pending/assigned)
    const delayedOrders = db.findAll('orders')
      .filter(order => {
        const age = (new Date() - new Date(order.created_at)) / 60000; // minutes
        return age > 45 && (order.status === 'pending' || order.status === 'assigned');
      }).length;

    res.json({
      activeDrivers,
      pendingOrders,
      outForDelivery,
      todayDeliveries,
      avgDeliveryTime: Math.round(avgDeliveryTime),
      delayedOrders
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alerts
router.get('/alerts', authenticateToken, authorizeRole('store_staff', 'admin'), async (req, res) => {
  try {
    const alerts = [];

    // Delayed orders
    const delayedOrders = db.findAll('orders')
      .filter(order => {
        const age = (new Date() - new Date(order.created_at)) / 60000; // minutes
        return age > 45 && (order.status === 'pending' || order.status === 'assigned');
      });

    delayedOrders.forEach(order => {
      alerts.push({
        type: 'delayed_order',
        severity: 'high',
        message: `Order #${order.id} is delayed (${Math.round((new Date() - new Date(order.created_at)) / 60000)} minutes)`,
        orderId: order.id
      });
    });

    // Unassigned orders older than 10 minutes
    const unassignedOrders = db.findAll('orders', { status: 'pending' })
      .filter(order => {
        const age = (new Date() - new Date(order.created_at)) / 60000;
        return age > 10;
      });

    unassignedOrders.forEach(order => {
      alerts.push({
        type: 'unassigned_order',
        severity: 'medium',
        message: `Order #${order.id} has been unassigned for ${Math.round((new Date() - new Date(order.created_at)) / 60000)} minutes`,
        orderId: order.id
      });
    });

    // Driver inactivity (no location update in last 10 minutes during active delivery)
    const activeShifts = db.findAll('shifts', { status: 'active' });
    
    activeShifts.forEach(shift => {
      const activeDeliveries = db.findAll('deliveries', { 
        driver_id: shift.driver_id,
        shift_id: shift.id
      }).filter(d => d.status === 'started' || d.status === 'near');

      if (activeDeliveries.length > 0) {
        const latestLocation = db.findAll('locations', { driver_id: shift.driver_id })
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

        if (latestLocation) {
          const inactiveMinutes = (new Date() - new Date(latestLocation.timestamp)) / 60000;
          if (inactiveMinutes > 10) {
            const driver = db.findOne('users', { id: shift.driver_id });
            alerts.push({
              type: 'driver_inactive',
              severity: 'medium',
              message: `Driver ${driver.name} has not updated location for ${Math.round(inactiveMinutes)} minutes`,
              driverId: driver.id
            });
          }
        }
      }
    });

    res.json({ alerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get performance analytics
router.get('/analytics', authenticateToken, authorizeRole('store_staff', 'admin'), async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    let startDate = new Date();
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    const deliveries = db.findAll('deliveries')
      .filter(d => d.status === 'delivered' && new Date(d.completed_at) >= startDate);

    const totalDeliveries = deliveries.length;
    const totalDistance = deliveries.reduce((sum, d) => sum + (d.distance_km || 0), 0);
    const avgDeliveryTime = totalDeliveries > 0
      ? deliveries.reduce((sum, d) => sum + (d.duration_minutes || 0), 0) / totalDeliveries
      : 0;

    // Group by platform
    const byPlatform = {};
    deliveries.forEach(delivery => {
      const order = db.findOne('orders', { id: delivery.order_id });
      if (order) {
        byPlatform[order.platform] = (byPlatform[order.platform] || 0) + 1;
      }
    });

    // Group by driver
    const byDriver = {};
    deliveries.forEach(delivery => {
      const driver = db.findOne('users', { id: delivery.driver_id });
      if (driver) {
        if (!byDriver[driver.name]) {
          byDriver[driver.name] = { count: 0, totalTime: 0, totalDistance: 0 };
        }
        byDriver[driver.name].count++;
        byDriver[driver.name].totalTime += delivery.duration_minutes || 0;
        byDriver[driver.name].totalDistance += delivery.distance_km || 0;
      }
    });

    res.json({
      period,
      totalDeliveries,
      totalDistance: totalDistance.toFixed(2),
      avgDeliveryTime: Math.round(avgDeliveryTime),
      byPlatform,
      byDriver
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
