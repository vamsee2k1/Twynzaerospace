const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const router = express.Router();

// Get order feed (available orders)
router.get('/feed', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    // Get all pending orders
    const orders = db.findAll('orders', { status: 'pending' })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ orders });
  } catch (error) {
    console.error('Get order feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders (for store dashboard)
router.get('/all', authenticateToken, authorizeRole('store_staff', 'admin'), async (req, res) => {
  try {
    const status = req.query.status;
    
    let orders;
    if (status) {
      orders = db.findAll('orders', { status });
    } else {
      orders = db.findAll('orders');
    }

    // Sort by created date (newest first)
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Enrich with driver info
    const enrichedOrders = orders.map(order => {
      if (order.assigned_driver_id) {
        const driver = db.findOne('users', { id: order.assigned_driver_id });
        return { ...order, driver };
      }
      return order;
    });

    res.json({ orders: enrichedOrders });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Claim order (driver self-assign)
router.post('/:orderId/claim', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user.id;

    const order = db.findOne('orders', { id: parseInt(orderId) });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(409).json({ error: 'Order is no longer available' });
    }

    // Check if driver has an active shift
    const activeShift = db.findOne('shifts', { driver_id: driverId, status: 'active' });

    if (!activeShift) {
      return res.status(403).json({ error: 'You must clock in before claiming orders' });
    }

    // Update order
    const updatedOrder = db.update('orders', parseInt(orderId), {
      status: 'assigned',
      assigned_driver_id: driverId
    });

    // Create delivery record
    const { v4: uuidv4 } = require('uuid');
    const delivery = db.insert('deliveries', {
      order_id: parseInt(orderId),
      driver_id: driverId,
      shift_id: activeShift.id,
      tracking_token: uuidv4(),
      status: 'assigned',
      delivery_sequence: 1
    });

    res.json({
      success: true,
      order: updatedOrder,
      delivery,
      message: 'Order claimed successfully'
    });
  } catch (error) {
    console.error('Claim order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign order (store staff manual assignment)
router.post('/:orderId/assign', authenticateToken, authorizeRole('store_staff', 'admin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    const order = db.findOne('orders', { id: parseInt(orderId) });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(409).json({ error: 'Order is already assigned' });
    }

    // Check if driver exists and has active shift
    const driver = db.findOne('users', { id: driverId, role: 'driver' });

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const activeShift = db.findOne('shifts', { driver_id: driverId, status: 'active' });

    if (!activeShift) {
      return res.status(403).json({ error: 'Driver must be clocked in' });
    }

    // Update order
    const updatedOrder = db.update('orders', parseInt(orderId), {
      status: 'assigned',
      assigned_driver_id: driverId
    });

    // Create delivery record
    const { v4: uuidv4 } = require('uuid');
    const delivery = db.insert('deliveries', {
      order_id: parseInt(orderId),
      driver_id: driverId,
      shift_id: activeShift.id,
      tracking_token: uuidv4(),
      status: 'assigned',
      delivery_sequence: 1
    });

    res.json({
      success: true,
      order: updatedOrder,
      delivery,
      message: 'Order assigned successfully'
    });
  } catch (error) {
    console.error('Assign order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver's assigned orders
router.get('/my-orders', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const driverId = req.user.id;

    const orders = db.findAll('orders', { assigned_driver_id: driverId })
      .filter(order => order.status !== 'delivered' && order.status !== 'cancelled');

    // Get delivery info for each order
    const ordersWithDelivery = orders.map(order => {
      const delivery = db.findOne('deliveries', { order_id: order.id });
      return { ...order, delivery };
    });

    // Sort by delivery sequence
    ordersWithDelivery.sort((a, b) => 
      (a.delivery?.delivery_sequence || 0) - (b.delivery?.delivery_sequence || 0)
    );

    res.json({ orders: ordersWithDelivery });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update delivery sequence
router.put('/update-sequence', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { deliverySequence } = req.body; // Array of { deliveryId, sequence }
    const driverId = req.user.id;

    if (!Array.isArray(deliverySequence)) {
      return res.status(400).json({ error: 'Invalid delivery sequence format' });
    }

    // Update each delivery
    deliverySequence.forEach(({ deliveryId, sequence }) => {
      const delivery = db.findOne('deliveries', { id: deliveryId, driver_id: driverId });
      if (delivery) {
        db.update('deliveries', deliveryId, { delivery_sequence: sequence });
      }
    });

    res.json({ success: true, message: 'Delivery sequence updated' });
  } catch (error) {
    console.error('Update sequence error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
