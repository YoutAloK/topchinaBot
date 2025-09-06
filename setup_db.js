#!/usr/bin/env node

/**
 * Упрощенный скрипт для настройки базы данных
 * Поддерживает PostgreSQL и MySQL
 * Запустите: node setup_db.js
 */

const { Pool: PgPool } = require('pg');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Загружаем переменные окружения
require('dotenv').config();

async function setupDatabase() {
  console.log('🔧 Настройка базы данных...');
  
  // Проверяем конфигурацию
  const DB_TYPE = process.env.DB_TYPE || 'postgresql';
  
  if (DB_TYPE === 'postgresql') {
    if (!process.env.DATABASE_URL) {
      console.error('❌ Ошибка: DATABASE_URL не установлен в .env файле');
      process.exit(1);
    }
  } else if (DB_TYPE === 'mysql') {
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS || !process.env.DB_NAME) {
      console.error('❌ Ошибка: Конфигурация MySQL не установлена в .env файле');
      console.error('Требуются: DB_HOST, DB_USER, DB_PASS, DB_NAME');
      process.exit(1);
    }
  } else {
    console.error('❌ Ошибка: Неверный тип базы данных. Используйте postgresql или mysql');
    process.exit(1);
  }
  
  console.log(`📊 Тип базы данных: ${DB_TYPE.toUpperCase()}`);
  
  // Создаем пул соединений
  let pool;
  
  if (DB_TYPE === 'postgresql') {
    pool = new PgPool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  } else {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      ssl: { rejectUnauthorized: false }
    });
  }
  
  try {
    // Тестируем подключение
    console.log('📡 Тестирование подключения...');
    if (DB_TYPE === 'postgresql') {
      await pool.query('SELECT 1');
    } else {
      await pool.query('SELECT 1');
    }
    console.log('✅ Подключение к базе данных успешно');
    
    // Создаем таблицы
    console.log('📝 Создание таблиц...');
    
    if (DB_TYPE === 'postgresql') {
      // PostgreSQL схема
      await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
          order_id SERIAL PRIMARY KEY,
          track_code VARCHAR(50) UNIQUE NOT NULL,
          status VARCHAR(20) DEFAULT 'Pending',
          delivery_date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          product_id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          image_url VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS order_items (
          item_id SERIAL PRIMARY KEY,
          order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
          product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
          quantity INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Создаем индексы
      await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_track_code ON orders(track_code);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);');
      
    } else {
      // MySQL схема
      await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
          order_id INT AUTO_INCREMENT PRIMARY KEY,
          track_code VARCHAR(50) UNIQUE NOT NULL,
          status ENUM('Pending', 'Shipped', 'Delivered') NOT NULL DEFAULT 'Pending',
          delivery_date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          product_id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          image_url VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS order_items (
          item_id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          product_id INT NOT NULL,
          quantity INT NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
        );
      `);
      
      // Создаем индексы
      await pool.query('CREATE INDEX idx_track_code ON orders(track_code);');
      await pool.query('CREATE INDEX idx_order_id ON order_items(order_id);');
      await pool.query('CREATE INDEX idx_product_id ON order_items(product_id);');
    }
    
    console.log('✅ Таблицы созданы успешно');
    
    // Проверяем созданные таблицы
    console.log('🔍 Проверка таблиц...');
    let tables;
    
    if (DB_TYPE === 'postgresql') {
      const result = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      tables = result.rows;
    } else {
      const result = await pool.query('SHOW TABLES');
      tables = result[0];
    }
    
    console.log('📋 Созданные таблицы:');
    tables.forEach(row => {
      const tableName = DB_TYPE === 'postgresql' ? row.table_name : Object.values(row)[0];
      console.log(`   - ${tableName}`);
    });
    
    // Вставляем тестовые данные
    console.log('📊 Добавление тестовых данных...');
    
    if (DB_TYPE === 'postgresql') {
      await pool.query(`
        INSERT INTO orders (track_code, status, delivery_date) VALUES 
        ('TC12345678', 'Pending', CURRENT_DATE + INTERVAL '7 days'),
        ('TC87654321', 'Shipped', CURRENT_DATE + INTERVAL '3 days')
        ON CONFLICT (track_code) DO NOTHING;
      `);
      
      await pool.query(`
        INSERT INTO products (name, description, image_url) VALUES 
        ('Тестовый товар 1', 'Описание тестового товара 1', 'test1.jpg'),
        ('Тестовый товар 2', 'Описание тестового товара 2', 'test2.jpg')
        ON CONFLICT DO NOTHING;
      `);
    } else {
      await pool.query(`
        INSERT IGNORE INTO orders (track_code, status, delivery_date) VALUES 
        ('TC12345678', 'Pending', DATE_ADD(CURDATE(), INTERVAL 7 DAY)),
        ('TC87654321', 'Shipped', DATE_ADD(CURDATE(), INTERVAL 3 DAY));
      `);
      
      await pool.query(`
        INSERT IGNORE INTO products (name, description, image_url) VALUES 
        ('Тестовый товар 1', 'Описание тестового товара 1', 'test1.jpg'),
        ('Тестовый товар 2', 'Описание тестового товара 2', 'test2.jpg');
      `);
    }
    
    console.log('✅ Тестовые данные добавлены');
    
    // Проверяем количество записей
    let orders, products;
    
    if (DB_TYPE === 'postgresql') {
      const ordersResult = await pool.query('SELECT COUNT(*) as count FROM orders');
      const productsResult = await pool.query('SELECT COUNT(*) as count FROM products');
      orders = ordersResult.rows[0].count;
      products = productsResult.rows[0].count;
    } else {
      const ordersResult = await pool.query('SELECT COUNT(*) as count FROM orders');
      const productsResult = await pool.query('SELECT COUNT(*) as count FROM products');
      orders = ordersResult[0][0].count;
      products = productsResult[0][0].count;
    }
    
    console.log(`📊 Количество записей:`);
    console.log(`   - Заказы: ${orders}`);
    console.log(`   - Товары: ${products}`);
    
    console.log('🎉 Настройка базы данных завершена успешно!');
    console.log('💡 Теперь можете запустить бота командой: node bot.js');
    
  } catch (error) {
    console.error('❌ Ошибка при настройке базы данных:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Запускаем настройку
setupDatabase().catch(console.error);
