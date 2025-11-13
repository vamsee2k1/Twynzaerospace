const { Pool } = require('pg');
require('dotenv').config();

// In-memory database for demo purposes (replace with PostgreSQL in production)
// This simulates a database using JavaScript objects
class InMemoryDB {
  constructor() {
    this.users = [];
    this.shifts = [];
    this.orders = [];
    this.deliveries = [];
    this.locations = [];
    this.notifications = [];
    this.sequences = {
      users: 1,
      shifts: 1,
      orders: 1,
      deliveries: 1,
      locations: 1,
      notifications: 1
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo users (password: "password123")
    this.users = [
      {
        id: 1,
        email: 'driver1@fireway.com',
        password_hash: '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y',
        role: 'driver',
        name: 'John Driver',
        phone: '+447700900001',
        fcm_token: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2,
        email: 'driver2@fireway.com',
        password_hash: '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y',
        role: 'driver',
        name: 'Sarah Delivery',
        phone: '+447700900002',
        fcm_token: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 3,
        email: 'store@fireway.com',
        password_hash: '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y',
        role: 'store_staff',
        name: 'Store Manager',
        phone: '+447700900100',
        fcm_token: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];
    this.sequences.users = 4;

    // Demo orders
    this.orders = [
      {
        id: 1,
        platform: 'fireway',
        external_order_id: 'FW-001',
        customer_name: 'Alice Johnson',
        customer_phone: '+447700900201',
        customer_address: '123 High Street, London, SW1A 1AA',
        customer_latitude: 51.5014,
        customer_longitude: -0.1419,
        items: [
          { name: 'Margherita Pizza', quantity: 2 },
          { name: 'Garlic Bread', quantity: 1 }
        ],
        total_amount: 25.50,
        status: 'pending',
        assigned_driver_id: null,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2,
        platform: 'just_eat',
        external_order_id: 'JE-002',
        customer_name: 'Bob Smith',
        customer_phone: '+447700900202',
        customer_address: '456 Oxford Street, London, W1D 1BS',
        customer_latitude: 51.5155,
        customer_longitude: -0.1426,
        items: [
          { name: 'Chicken Burger', quantity: 1 },
          { name: 'Fries', quantity: 2 }
        ],
        total_amount: 18.99,
        status: 'pending',
        assigned_driver_id: null,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 3,
        platform: 'uber_eats',
        external_order_id: 'UE-003',
        customer_name: 'Charlie Brown',
        customer_phone: '+447700900203',
        customer_address: '789 Baker Street, London, NW1 6XE',
        customer_latitude: 51.5237,
        customer_longitude: -0.1585,
        items: [{ name: 'Sushi Platter', quantity: 1 }],
        total_amount: 32.00,
        status: 'pending',
        assigned_driver_id: null,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 4,
        platform: 'deliveroo',
        external_order_id: 'DR-004',
        customer_name: 'Diana Prince',
        customer_phone: '+447700900204',
        customer_address: '321 King Road, London, SW3 5EP',
        customer_latitude: 51.4875,
        customer_longitude: -0.1687,
        items: [
          { name: 'Pad Thai', quantity: 1 },
          { name: 'Spring Rolls', quantity: 3 }
        ],
        total_amount: 22.50,
        status: 'pending',
        assigned_driver_id: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];
    this.sequences.orders = 5;
  }

  // Generic query method to simulate SQL queries
  async query(text, params) {
    // This is a simplified simulation - in production, use actual PostgreSQL
    return { rows: [], rowCount: 0 };
  }

  // Helper methods for CRUD operations
  insert(table, data) {
    const id = this.sequences[table]++;
    const record = { id, ...data, created_at: new Date(), updated_at: new Date() };
    this[table].push(record);
    return record;
  }

  findOne(table, criteria) {
    return this[table].find(item => {
      return Object.keys(criteria).every(key => item[key] === criteria[key]);
    });
  }

  findAll(table, criteria = {}) {
    if (Object.keys(criteria).length === 0) {
      return this[table];
    }
    return this[table].filter(item => {
      return Object.keys(criteria).every(key => item[key] === criteria[key]);
    });
  }

  update(table, id, data) {
    const index = this[table].findIndex(item => item.id === id);
    if (index !== -1) {
      this[table][index] = { ...this[table][index], ...data, updated_at: new Date() };
      return this[table][index];
    }
    return null;
  }

  delete(table, id) {
    const index = this[table].findIndex(item => item.id === id);
    if (index !== -1) {
      const deleted = this[table][index];
      this[table].splice(index, 1);
      return deleted;
    }
    return null;
  }
}

// Create singleton instance
const db = new InMemoryDB();

module.exports = db;
