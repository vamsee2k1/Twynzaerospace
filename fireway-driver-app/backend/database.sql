-- Fireway Driver App Database Schema

-- Users table (drivers and store staff)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('driver', 'store_staff', 'admin')),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    fcm_token VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shifts table
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clock_in_time TIMESTAMP NOT NULL,
    clock_out_time TIMESTAMP,
    clock_in_latitude DECIMAL(10, 8),
    clock_in_longitude DECIMAL(11, 8),
    clock_out_latitude DECIMAL(10, 8),
    clock_out_longitude DECIMAL(11, 8),
    total_deliveries INTEGER DEFAULT 0,
    total_distance_km DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('fireway', 'just_eat', 'uber_eats', 'deliveroo')),
    external_order_id VARCHAR(255),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    customer_address TEXT NOT NULL,
    customer_latitude DECIMAL(10, 8),
    customer_longitude DECIMAL(11, 8),
    items JSONB NOT NULL,
    total_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'out_for_delivery', 'delivered', 'cancelled')),
    assigned_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
    tracking_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'assigned' CHECK (status IN ('assigned', 'started', 'near', 'delivered')),
    delivery_sequence INTEGER DEFAULT 1,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    distance_km DECIMAL(10, 2),
    duration_minutes INTEGER,
    delivery_proof_url VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Locations table (for real-time tracking)
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivery_id INTEGER REFERENCES deliveries(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(10, 2),
    speed DECIMAL(10, 2),
    heading DECIMAL(10, 2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_shifts_driver_id ON shifts(driver_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_driver ON orders(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_tracking_token ON deliveries(tracking_token);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_locations_driver_id ON locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);

-- Insert demo data
-- Password for all users: "password123"
INSERT INTO users (email, password_hash, role, name, phone) VALUES
('driver1@fireway.com', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y', 'driver', 'John Driver', '+447700900001'),
('driver2@fireway.com', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y', 'driver', 'Sarah Delivery', '+447700900002'),
('store@fireway.com', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXuK8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y', 'store_staff', 'Store Manager', '+447700900100')
ON CONFLICT (email) DO NOTHING;

-- Insert demo orders
INSERT INTO orders (platform, external_order_id, customer_name, customer_phone, customer_address, customer_latitude, customer_longitude, items, total_amount, status) VALUES
('fireway', 'FW-001', 'Alice Johnson', '+447700900201', '123 High Street, London, SW1A 1AA', 51.5014, -0.1419, '[{"name": "Margherita Pizza", "quantity": 2}, {"name": "Garlic Bread", "quantity": 1}]', 25.50, 'pending'),
('just_eat', 'JE-002', 'Bob Smith', '+447700900202', '456 Oxford Street, London, W1D 1BS', 51.5155, -0.1426, '[{"name": "Chicken Burger", "quantity": 1}, {"name": "Fries", "quantity": 2}]', 18.99, 'pending'),
('uber_eats', 'UE-003', 'Charlie Brown', '+447700900203', '789 Baker Street, London, NW1 6XE', 51.5237, -0.1585, '[{"name": "Sushi Platter", "quantity": 1}]', 32.00, 'pending'),
('deliveroo', 'DR-004', 'Diana Prince', '+447700900204', '321 King Road, London, SW3 5EP', 51.4875, -0.1687, '[{"name": "Pad Thai", "quantity": 1}, {"name": "Spring Rolls", "quantity": 3}]', 22.50, 'pending')
ON CONFLICT DO NOTHING;
