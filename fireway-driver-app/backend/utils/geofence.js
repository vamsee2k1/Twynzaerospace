require('dotenv').config();

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Check if a location is within the geofence
function isWithinGeofence(latitude, longitude) {
  const storeLat = parseFloat(process.env.STORE_LATITUDE);
  const storeLon = parseFloat(process.env.STORE_LONGITUDE);
  const radius = parseFloat(process.env.GEOFENCE_RADIUS_METERS);

  const distance = calculateDistance(storeLat, storeLon, latitude, longitude);
  return distance <= radius;
}

// Check if driver has exited the store geofence
function hasExitedGeofence(latitude, longitude) {
  return !isWithinGeofence(latitude, longitude);
}

// Calculate distance between two points (for delivery tracking)
function getDistanceBetweenPoints(lat1, lon1, lat2, lon2) {
  return calculateDistance(lat1, lon1, lat2, lon2);
}

// Check if driver is near destination (within 200 meters)
function isNearDestination(driverLat, driverLon, destLat, destLon, thresholdMeters = 200) {
  const distance = calculateDistance(driverLat, driverLon, destLat, destLon);
  return distance <= thresholdMeters;
}

module.exports = {
  calculateDistance,
  isWithinGeofence,
  hasExitedGeofence,
  getDistanceBetweenPoints,
  isNearDestination
};
