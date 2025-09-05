-- Создание базы данных
CREATE DATABASE IF NOT EXISTS orders_db;
USE orders_db;

-- Создание таблицы заказов с ENUM статусами
CREATE TABLE IF NOT EXISTS orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    track_code VARCHAR(50) UNIQUE NOT NULL,
    status ENUM('Pending', 'Shipped', 'Delivered') NOT NULL DEFAULT 'Pending',
    delivery_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы товаров
CREATE TABLE IF NOT EXISTS products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы товаров в заказах
CREATE TABLE IF NOT EXISTS order_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
);

-- Создание индексов для оптимизации
CREATE INDEX idx_track_code ON orders(track_code);
CREATE INDEX idx_order_id ON order_items(order_id);
CREATE INDEX idx_product_id ON order_items(product_id);
