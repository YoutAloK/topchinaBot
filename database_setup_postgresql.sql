-- PostgreSQL схема для TopChina Bot
-- Выполните этот скрипт в вашей PostgreSQL базе данных

-- Создание таблицы заказов
CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    track_code VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending',
    delivery_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы товаров
CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы элементов заказа
CREATE TABLE IF NOT EXISTS order_items (
    item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_orders_track_code ON orders(track_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Вставка тестовых данных (опционально)
INSERT INTO orders (track_code, status, delivery_date) VALUES 
('TC12345678', 'Pending', CURRENT_DATE + INTERVAL '7 days'),
('TC87654321', 'Shipped', CURRENT_DATE + INTERVAL '3 days')
ON CONFLICT (track_code) DO NOTHING;

INSERT INTO products (name, description, image_url) VALUES 
('Тестовый товар 1', 'Описание тестового товара 1', 'test1.jpg'),
('Тестовый товар 2', 'Описание тестового товара 2', 'test2.jpg')
ON CONFLICT DO NOTHING;

-- Проверка создания таблиц
SELECT 'Таблицы созданы успешно' as status;
