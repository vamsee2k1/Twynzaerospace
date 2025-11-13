const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { isWithinGeofence } = require('../utils/geofence');
const router = express.Router();

// Clock in
router.post('/clock-in', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const driverId = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates are required' });
    }

    // Check if driver is within geofence
    if (!isWithinGeofence(latitude, longitude)) {
      return res.status(403).json({ 
        error: 'You must be at the store location to clock in',
        withinGeofence: false
      });
    }

    // Check if driver already has an active shift
    const activeShift = db.findOne('shifts', { driver_id: driverId, status: 'active' });

    if (activeShift) {
      return res.status(409).json({ error: 'You already have an active shift' });
    }

    // Create new shift
    const shift = db.insert('shifts', {
      driver_id: driverId,
      clock_in_time: new Date(),
      clock_in_latitude: latitude,
      clock_in_longitude: longitude,
      status: 'active',
      total_deliveries: 0,
      total_distance_km: 0
    });

    res.status(201).json({
      success: true,
      shift,
      message: 'Clocked in successfully'
    });
  } catch (error) {
    console.error('Clock in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clock out
router.post('/clock-out', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const driverId = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates are required' });
    }

    // Find active shift
    const activeShift = db.findOne('shifts', { driver_id: driverId, status: 'active' });

    if (!activeShift) {
      return res.status(404).json({ error: 'No active shift found' });
    }

    // Update shift
    const updatedShift = db.update('shifts', activeShift.id, {
      clock_out_time: new Date(),
      clock_out_latitude: latitude,
      clock_out_longitude: longitude,
      status: 'completed'
    });

    res.json({
      success: true,
      shift: updatedShift,
      message: 'Clocked out successfully'
    });
  } catch (error) {
    console.error('Clock out error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current shift
router.get('/current', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const driverId = req.user.id;

    const activeShift = db.findOne('shifts', { driver_id: driverId, status: 'active' });

    if (!activeShift) {
      return res.json({ shift: null });
    }

    // Get active deliveries for this shift
    const activeDeliveries = db.findAll('deliveries', { 
      driver_id: driverId, 
      shift_id: activeShift.id 
    }).filter(d => d.status !== 'delivered');

    res.json({
      shift: activeShift,
      activeDeliveries: activeDeliveries.length
    });
  } catch (error) {
    console.error('Get current shift error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get shift history
router.get('/history', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const driverId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const shifts = db.findAll('shifts', { driver_id: driverId })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    res.json({ shifts });
  } catch (error) {
    console.error('Get shift history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get shift summary
router.get('/:shiftId/summary', authenticateToken, authorizeRole('driver'), async (req, res) => {
  try {
    const { shiftId } = req.params;
    const driverId = req.user.id;

    const shift = db.findOne('shifts', { id: parseInt(shiftId), driver_id: driverId });

    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    // Get deliveries for this shift
    const deliveries = db.findAll('deliveries', { shift_id: parseInt(shiftId) });

    const summary = {
      shift,
      totalDeliveries: deliveries.length,
      completedDeliveries: deliveries.filter(d => d.status === 'delivered').length,
      totalDistance: deliveries.reduce((sum, d) => sum + (d.distance_km || 0), 0),
      averageDeliveryTime: deliveries.length > 0 
        ? deliveries.reduce((sum, d) => sum + (d.duration_minutes || 0), 0) / deliveries.length 
        : 0
    };

    res.json(summary);
  } catch (error) {
    console.error('Get shift summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
