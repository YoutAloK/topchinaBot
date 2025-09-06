const { Telegraf, Markup } = require('telegraf');
const { Pool: PgPool } = require('pg');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

// Загружаем переменные окружения из .env файла
dotenv.config();

// Проверяем обязательные переменные
if (!process.env.BOT_TOKEN) {
  console.error('❌ Ошибка: BOT_TOKEN требуется в файле .env');
  process.exit(1);
}

if (!process.env.ADMIN_ID) {
  console.error('❌ Ошибка: ADMIN_ID требуется в файле .env');
  process.exit(1);
}

// Определяем тип базы данных
const DB_TYPE = process.env.DB_TYPE || 'postgresql';

// Проверяем конфигурацию базы данных
if (DB_TYPE === 'postgresql') {
  if (!process.env.DATABASE_URL) {
    console.error('❌ Ошибка: DATABASE_URL требуется для PostgreSQL в файле .env');
    process.exit(1);
  }
} else if (DB_TYPE === 'mysql') {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS || !process.env.DB_NAME) {
    console.error('❌ Ошибка: Конфигурация MySQL требуется в файле .env (DB_HOST, DB_USER, DB_PASS, DB_NAME)');
    process.exit(1);
  }
} else {
  console.error('❌ Ошибка: Неверный тип базы данных. Используйте postgresql или mysql');
  process.exit(1);
}

console.log('🔧 Конфигурация:');
console.log(`   База данных: ${DB_TYPE.toUpperCase()}`);
console.log(`   Режим: ${process.env.NODE_ENV || 'development'}`);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

// Создаем папку для загрузок
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Создаем пул соединений
let pool;

if (DB_TYPE === 'postgresql') {
  pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false },
    connectionLimit: 10,
    charset: 'utf8mb4',
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
    multipleStatements: false,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true
  });
}

// Универсальная функция для выполнения SQL запросов
const executeQuery = async (query, params = []) => {
  if (DB_TYPE === 'postgresql') {
    const result = await pool.query(query, params);
    return [result.rows, result];
  } else {
    return await pool.query(query, params);
  }
};

// Проверка прав администратора
const isAdmin = (ctx, next) => {
  if (ctx.from.id.toString() === ADMIN_ID.toString()) {
    return next();
  } else {
    ctx.reply('❌ У вас нет прав для выполнения этого действия.');
  }
};

const isAdminUser = (ctx) => {
  return ctx.from.id.toString() === ADMIN_ID.toString();
};

// Генерация трек-кода
const generateTrackCode = () => {
  return 'TC' + uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
};

// Переменная для хранения данных о последнем товаре
let lastProductData = null;

// Команда /start
bot.start((ctx) => {
  const isAdmin = isAdminUser(ctx);
  
  if (isAdmin) {
    ctx.reply('👋 Добро пожаловать, администратор!', Markup.inlineKeyboard([
      [Markup.button.callback('📦 Создать заказ', 'create_order')],
      [Markup.button.callback('🛍️ Добавить товар', 'add_product')],
      [Markup.button.callback('📋 Список заказов', 'list_orders')],
      [Markup.button.callback('📊 Обновить статус', 'update_status')],
      [Markup.button.callback('📅 Обновить дату доставки', 'update_delivery')],
      [Markup.button.callback('❓ Помощь', 'help')]
    ]));
  } else {
    ctx.reply('👋 Добро пожаловать! Отправьте трек-код для просмотра информации о заказе.', Markup.inlineKeyboard([
      [Markup.button.callback('❓ Помощь', 'help')]
    ]));
  }
});

// Команда /help
bot.command('help', (ctx) => {
  const isAdmin = isAdminUser(ctx);
  
  let helpText = '*Доступные команды:*\n\n';
  helpText += '• Отправьте трек\\-код для просмотра заказа\n';
  helpText += '• /help \\- Показать это сообщение\n';
  
  if (isAdmin) {
    helpText += '\n*Команды администратора:*\n';
    helpText += '• /createorder \\- Создать новый заказ\n';
    helpText += '• /addproduct название,описание,количество \\- Добавить товар \\(затем отправьте фото\\)\n';
    helpText += '• /listorders \\- Список всех заказов\n';
    helpText += '• /updateorder статус \\- Обновить статус последнего заказа\n';
    helpText += '• /updatedelivery дата \\- Обновить дату доставки последнего заказа\n';
    helpText += '• Отправьте фото после /addproduct для привязки к товару\n';
  }
  
  ctx.replyWithMarkdown(helpText);
});

// Команда создания заказа
bot.command('createorder', isAdmin, async (ctx) => {
  const trackCode = generateTrackCode();
  const currentDate = new Date().toISOString().split('T')[0];
  
  try {
    const [result] = await executeQuery(
      'INSERT INTO orders (track_code, status, delivery_date) VALUES (?, ?, ?) RETURNING order_id',
      [trackCode, 'Pending', currentDate]
    );
    
    const orderId = DB_TYPE === 'postgresql' ? result[0].order_id : result.insertId;
    
    ctx.reply(`✅ Заказ создан!\n\n📦 ID заказа: ${orderId}\n🔍 Трек-код: ${trackCode}\n📊 Статус: В ожидании\n📅 Дата доставки: ${currentDate}\n📅 Дата создания: ${currentDate}\n\nТеперь добавьте товары командой /addproduct`);
  } catch (error) {
    console.error('Database error in createorder:', error);
    ctx.reply('❌ Ошибка при создании заказа.');
  }
});

// Команда добавления товара
bot.command('addproduct', isAdmin, async (ctx) => {
  const parts = ctx.message.text.split(' ').slice(1).join(' ').split(',');
  if (parts.length < 3) {
    return ctx.reply('❌ Неверный формат: /addproduct название,описание,количество\n\n(Будет добавлен к последнему заказу)\n\nПосле команды отправьте фото товара');
  }

  const [name, description, quantity] = parts.map(p => p.trim());

  try {
    // Получаем последний созданный заказ
    const [lastOrder] = await executeQuery(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ командой /createorder');
    }

    const orderId = lastOrder[0].order_id;

    // Сохраняем данные товара для последующего добавления фото
    lastProductData = {
      orderId,
      name,
      description,
      quantity
    };

    ctx.reply(`📝 Данные товара сохранены!\n\n🛍️ Товар: ${name}\n📊 Количество: ${quantity}\n\n📸 Теперь отправьте фото товара для завершения добавления`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при добавлении товара.');
  }
});

// Команда списка заказов
bot.command('listorders', isAdmin, async (ctx) => {
  try {
    const [rows] = await executeQuery('SELECT * FROM orders ORDER BY order_id DESC LIMIT 10');
    
    if (rows.length === 0) {
      return ctx.reply('📋 Заказов не найдено.');
    }

    let message = '*📋 Последние заказы:*\n\n';
    for (const order of rows) {
      message += `🆔 ID: ${order.order_id}\n`;
      message += `🔍 Трек: ${order.track_code}\n`;
      message += `📊 Статус: ${order.status}\n`;
      message += `📅 Дата: ${order.delivery_date}\n\n`;
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при получении списка заказов.');
  }
});

// Команда обновления статуса
bot.command('updateorder', isAdmin, async (ctx) => {
  const parts = ctx.message.text.split(' ').slice(1);
  if (parts.length < 1) {
    return ctx.reply('❌ Формат: /updateorder статус\n\nДоступные статусы:\n• Pending - В ожидании\n• Shipped - Отправлен\n• Delivered - Доставлен\n\n(Будет обновлен последний заказ)');
  }

  const newStatus = parts.join(' ').trim();
  
  const validStatuses = ['Pending', 'Shipped', 'Delivered'];
  if (!validStatuses.includes(newStatus)) {
    return ctx.reply('❌ Неверный статус! Используйте: Pending, Shipped или Delivered');
  }

  try {
    // Получаем последний заказ
    const [lastOrder] = await executeQuery(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ командой /createorder');
    }

    const orderId = lastOrder[0].order_id;

    await executeQuery(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      [newStatus, orderId]
    );
    
    const statusText = {
      'Pending': 'В ожидании',
      'Shipped': 'Отправлен', 
      'Delivered': 'Доставлен'
    };
    
    ctx.reply(`✅ Статус заказа ${orderId} обновлен на: ${statusText[newStatus]}`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при обновлении заказа.');
  }
});

// Команда обновления даты доставки
bot.command('updatedelivery', isAdmin, async (ctx) => {
  const parts = ctx.message.text.split(' ').slice(1);
  if (parts.length < 1) {
    return ctx.reply('❌ Формат: /updatedelivery дата_доставки\n\nПример: /updatedelivery 2024-12-25\n\n(Будет обновлен последний заказ)');
  }

  const newDeliveryDate = parts.join(' ').trim();

  try {
    // Получаем последний заказ
    const [lastOrder] = await executeQuery(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ командой /createorder');
    }

    const orderId = lastOrder[0].order_id;

    await executeQuery(
      'UPDATE orders SET delivery_date = ? WHERE order_id = ?',
      [newDeliveryDate, orderId]
    );
    
    ctx.reply(`✅ Дата доставки заказа ${orderId} обновлена на: ${newDeliveryDate}`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при обновлении даты доставки.');
  }
});

// Обработка текстовых сообщений (поиск по трек-коду)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  try {
    const [rows] = await executeQuery(
      'SELECT * FROM orders WHERE track_code = ?',
      [text]
    );

    if (rows.length === 0) {
      return ctx.reply('❌ Заказ с таким трек-кодом не найден.');
    }

    const order = rows[0];
    const [items] = await executeQuery(
      'SELECT * FROM order_items oi JOIN products p ON oi.product_id = p.product_id WHERE oi.order_id = ?',
      [order.order_id]
    );

    const statusText = {
      'Pending': 'В ожидании',
      'Shipped': 'Отправлен', 
      'Delivered': 'Доставлен'
    };

    let message = `*📦 Информация о заказе*\n\n`;
    message += `🔍 *Трек-код:* ${order.track_code}\n`;
    message += `📊 *Статус:* ${statusText[order.status] || order.status}\n`;
    message += `📅 *Дата доставки:* ${order.delivery_date}\n`;
    message += `📅 *Дата создания:* ${order.created_at ? order.created_at.toISOString().split('T')[0] : 'Не указана'}\n\n`;
    
    if (items.length > 0) {
      message += `*🛍️ Товары в заказе:*\n`;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        message += `${i + 1}. ${item.name} (Количество: ${item.quantity})\n   ${item.description}\n\n`;
      }
    } else {
      message += `*🛍️ Товары:* Пока не добавлены\n`;
    }

    // Сначала отправляем информацию о заказе
    await ctx.replyWithMarkdown(message);
    
    // Затем отправляем фото товаров по очереди
    if (items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.image_url && fs.existsSync(path.join(__dirname, 'uploads', item.image_url))) {
          await ctx.replyWithPhoto(
            { source: path.join(__dirname, 'uploads', item.image_url) },
            { caption: `📸 ${item.name}\n${item.description}` }
          );
          // Небольшая задержка между фото для лучшего восприятия
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  } catch (error) {
    console.error('Database error:', error);
    ctx.reply('❌ Произошла ошибка при получении информации о заказе. Попробуйте позже.');
  }
});

// Обработка фото
bot.on('photo', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;

  const photo = ctx.message.photo.pop();
  
  try {
    // Получаем информацию о файле
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    
    // Скачиваем файл
    const downloadPath = path.join(__dirname, 'uploads', `${photo.file_id}.jpg`);
    const fileStream = fs.createWriteStream(downloadPath);
    
    await new Promise((resolve, reject) => {
      https.get(fileUrl, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      }).on('error', reject);
    });

    // Если есть сохраненные данные товара, добавляем товар с фото
    if (lastProductData) {
      try {
        const { orderId, name, description, quantity } = lastProductData;
        const imageUrl = `${photo.file_id}.jpg`;

        const [prodResult] = await executeQuery(
          'INSERT INTO products (name, description, image_url) VALUES (?, ?, ?) RETURNING product_id',
          [name, description, imageUrl]
        );
        
        const productId = DB_TYPE === 'postgresql' ? prodResult[0].product_id : prodResult.insertId;

        await executeQuery(
          'INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)',
          [orderId, productId, quantity]
        );

        ctx.reply(`✅ Товар с фото добавлен к заказу!\n\n📦 ID заказа: ${orderId}\n🛍️ Товар: ${name}\n📊 Количество: ${quantity}\n📸 Фото: ${imageUrl}`);
        
        // Очищаем сохраненные данные
        lastProductData = null;
      } catch (error) {
        console.error(error);
        ctx.reply('❌ Ошибка при добавлении товара с фото.');
      }
    } else {
      ctx.reply(`📸 Фото сохранено как: ${photo.file_id}.jpg\n\nИспользуйте команду /addproduct для добавления товара с этим фото`);
    }
  } catch (error) {
    console.error('Ошибка при скачивании фото:', error);
    ctx.reply('❌ Ошибка при сохранении фото.');
  }
});

// Обработчики кнопок меню
bot.action('create_order', isAdmin, async (ctx) => {
  const trackCode = generateTrackCode();
  const currentDate = new Date().toISOString().split('T')[0];
  
  try {
    const [result] = await executeQuery(
      'INSERT INTO orders (track_code, status, delivery_date) VALUES (?, ?, ?) RETURNING order_id',
      [trackCode, 'Pending', currentDate]
    );
    
    const orderId = DB_TYPE === 'postgresql' ? result[0].order_id : result.insertId;
    
    ctx.reply(`✅ Заказ создан!\n\n📦 ID заказа: ${orderId}\n🔍 Трек-код: ${trackCode}\n📊 Статус: В ожидании\n📅 Дата доставки: ${currentDate}\n📅 Дата создания: ${currentDate}\n\nТеперь добавьте товары командой /addproduct`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при создании заказа.');
  }
});

bot.action('add_product', isAdmin, (ctx) => {
  ctx.reply('📝 Введите данные товара в формате:\n\n/addproduct название,описание,количество\n\nПосле команды отправьте фото товара');
});

bot.action('list_orders', isAdmin, async (ctx) => {
  try {
    const [rows] = await executeQuery('SELECT * FROM orders ORDER BY order_id DESC LIMIT 10');
    
    if (rows.length === 0) {
      return ctx.reply('📋 Заказов не найдено.');
    }

    let message = '*📋 Последние заказы:*\n\n';
    for (const order of rows) {
      message += `🆔 ID: ${order.order_id}\n`;
      message += `🔍 Трек: ${order.track_code}\n`;
      message += `📊 Статус: ${order.status}\n`;
      message += `📅 Дата: ${order.delivery_date}\n\n`;
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при получении списка заказов.');
  }
});

bot.action('update_status', isAdmin, (ctx) => {
  ctx.reply('📊 Выберите новый статус:', Markup.inlineKeyboard([
    [Markup.button.callback('⏳ В ожидании', 'status_pending')],
    [Markup.button.callback('🚚 Отправлен', 'status_shipped')],
    [Markup.button.callback('✅ Доставлен', 'status_delivered')]
  ]));
});

bot.action('update_delivery', isAdmin, (ctx) => {
  ctx.reply('📅 Введите новую дату доставки в формате:\n\n/updatedelivery YYYY-MM-DD\n\nПример: /updatedelivery 2024-12-25');
});

bot.action('help', (ctx) => {
  const isAdmin = isAdminUser(ctx);
  
  let helpText = '*Доступные команды:*\n\n';
  helpText += '• Отправьте трек\\-код для просмотра заказа\n';
  helpText += '• /help \\- Показать это сообщение\n';
  
  if (isAdmin) {
    helpText += '\n*Команды администратора:*\n';
    helpText += '• /createorder \\- Создать новый заказ\n';
    helpText += '• /addproduct название,описание,количество \\- Добавить товар \\(затем отправьте фото\\)\n';
    helpText += '• /listorders \\- Список всех заказов\n';
    helpText += '• /updateorder статус \\- Обновить статус последнего заказа\n';
    helpText += '• /updatedelivery дата \\- Обновить дату доставки последнего заказа\n';
    helpText += '• Отправьте фото после /addproduct для привязки к товару\n';
  }
  
  ctx.replyWithMarkdown(helpText);
});

// Обработчики статусов
bot.action('status_pending', isAdmin, async (ctx) => {
  try {
    const [lastOrder] = await executeQuery(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ');
    }

    const orderId = lastOrder[0].order_id;

    await executeQuery(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['Pending', orderId]
    );
    
    ctx.reply(`✅ Статус заказа ${orderId} обновлен на: В ожидании`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при обновлении статуса.');
  }
});

bot.action('status_shipped', isAdmin, async (ctx) => {
  try {
    const [lastOrder] = await executeQuery(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ');
    }

    const orderId = lastOrder[0].order_id;

    await executeQuery(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['Shipped', orderId]
    );
    
    ctx.reply(`✅ Статус заказа ${orderId} обновлен на: Отправлен`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при обновлении статуса.');
  }
});

bot.action('status_delivered', isAdmin, async (ctx) => {
  try {
    const [lastOrder] = await executeQuery(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ');
    }

    const orderId = lastOrder[0].order_id;

    await executeQuery(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['Delivered', orderId]
    );
    
    ctx.reply(`✅ Статус заказа ${orderId} обновлен на: Доставлен`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при обновлении статуса.');
  }
});

// Тест подключения к базе данных
async function testDatabaseConnection() {
  console.log('🔌 Тестирование подключения к базе данных...');
  
  try {
    let rows;
    if (DB_TYPE === 'postgresql') {
      const result = await pool.query('SELECT 1 as test');
      rows = result.rows;
    } else {
      const result = await pool.query('SELECT 1 as test');
      rows = result[0];
    }
    
    console.log('✅ Подключение к базе данных успешно');
    console.log('📊 Тестовый запрос выполнен:', rows[0]);
    return true;
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error.message);
    console.log('⚠️  Бот будет работать в ограниченном режиме');
    return false;
  }
}

// Graceful shutdown
process.once('SIGINT', async () => {
  console.log('🛑 Получен сигнал SIGINT, завершение работы...');
  bot.stop('SIGINT');
  await pool.end();
});

process.once('SIGTERM', async () => {
  console.log('🛑 Получен сигнал SIGTERM, завершение работы...');
  bot.stop('SIGTERM');
  await pool.end();
});

// Запуск бота
async function startBot() {
  // Тестируем подключение к базе данных
  await testDatabaseConnection();
  
  // Запускаем бота
  bot.launch();
  console.log('🤖 Бот запущен в polling режиме...');
}

startBot().catch(console.error);
