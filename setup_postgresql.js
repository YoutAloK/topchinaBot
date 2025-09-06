#!/usr/bin/env node

/**
 * Скрипт для настройки PostgreSQL базы данных
 * Запустите: node setup_postgresql.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Загружаем переменные окружения
require('dotenv').config();

async function setupDatabase() {
  console.log('🔧 Настройка PostgreSQL базы данных...');
  
  // Проверяем DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ Ошибка: DATABASE_URL не установлен');
    console.error('Убедитесь, что база данных подключена к сервису в Render Dashboard');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Тестируем подключение
    console.log('📡 Тестирование подключения...');
    await pool.query('SELECT 1');
    console.log('✅ Подключение к базе данных успешно');
    
    // Читаем SQL скрипт
    const sqlPath = path.join(__dirname, 'database_setup_postgresql.sql');
    if (!fs.existsSync(sqlPath)) {
      console.error('❌ Файл database_setup_postgresql.sql не найден');
      process.exit(1);
    }
    
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');
    
    // Выполняем SQL скрипт
    console.log('📝 Выполнение SQL скрипта...');
    await pool.query(sqlScript);
    console.log('✅ Таблицы созданы успешно');
    
    // Проверяем созданные таблицы
    console.log('🔍 Проверка таблиц...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('📋 Созданные таблицы:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Проверяем тестовые данные
    const orders = await pool.query('SELECT COUNT(*) as count FROM orders');
    const products = await pool.query('SELECT COUNT(*) as count FROM products');
    
    console.log(`📊 Тестовые данные:`);
    console.log(`   - Заказы: ${orders.rows[0].count}`);
    console.log(`   - Товары: ${products.rows[0].count}`);
    
    console.log('🎉 Настройка базы данных завершена успешно!');
    console.log('💡 Теперь можете запустить бота');
    
  } catch (error) {
    console.error('❌ Ошибка при настройке базы данных:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Запускаем настройку
setupDatabase().catch(console.error);
