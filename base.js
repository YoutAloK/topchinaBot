const { Telegraf, Markup } = require('telegraf');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

if (!process.env.BOT_TOKEN) {
  console.error('Ошибка: BOT_TOKEN требуется в файле .env');
  process.exit(1);
}

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS || !process.env.DB_NAME) {
  console.error('Ошибка: Конфигурация базы данных требуется в переменных окружения (DB_HOST, DB_USER, DB_PASS, DB_NAME)');
  console.error('Проверьте настройки в Render Dashboard -> Environment Variables');
  process.exit(1);
}

// Логируем конфигурацию (без пароля)
console.log('🔧 Конфигурация базы данных:');
console.log(`   Host: ${process.env.DB_HOST}`);
console.log(`   User: ${process.env.DB_USER}`);
console.log(`   Database: ${process.env.DB_NAME}`);
console.log(`   Port: ${process.env.DB_PORT || 3306}`);
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || 'YOUR_ADMIN_TELEGRAM_ID';

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Конфигурация для freedb.tech (требует SSL)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  // Обязательное SSL для freedb.tech
  ssl: { rejectUnauthorized: false },
  connectionLimit: 10,
  charset: 'utf8mb4',
  // Настройки таймаутов
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  // Дополнительные настройки для стабильности
  multipleStatements: false,
  dateStrings: false,
  // Настройки для работы с freedb.tech
  supportBigNumbers: true,
  bigNumberStrings: true
});

const isAdmin = (ctx, next) => {
  if (ctx.from.id.toString() === ADMIN_ID.toString()) {
    return next();
  } else {
    ctx.reply('У вас нет прав для выполнения этого действия.');
  }
};

const isAdminUser = (ctx) => {
  return ctx.from.id.toString() === ADMIN_ID.toString();
};

const generateTrackCode = () => {
  return 'TC' + uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
};

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
    helpText += '• /updateorder order\\_id,статус \\- Обновить статус заказа\n';
    helpText += '• /updatedelivery order\\_id,дата \\- Обновить дату доставки\n';
    helpText += '• Отправьте фото после /addproduct для привязки к товару\n';
  }
  
  ctx.replyWithMarkdown(helpText);
});

bot.command('createorder', isAdmin, async (ctx) => {
  const trackCode = generateTrackCode();
  const currentDate = new Date().toISOString().split('T')[0];
  
  try {
    const [result] = await pool.query(
      'INSERT INTO orders (track_code, status, delivery_date) VALUES (?, ?, ?)',
      [trackCode, 'Pending', currentDate]
    );
    const orderId = result.insertId;
    ctx.reply(`✅ Заказ создан!\n\n📦 ID заказа: ${orderId}\n🔍 Трек-код: ${trackCode}\n📊 Статус: В ожидании\n📅 Дата доставки: ${currentDate}\n📅 Дата создания: ${currentDate}\n\nТеперь добавьте товары командой /addproduct`);
  } catch (error) {
    console.error('Database error in createorder:', error);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      ctx.reply('❌ Ошибка авторизации в базе данных. Обратитесь к администратору.');
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      ctx.reply('❌ Не удается подключиться к базе данных. Попробуйте позже.');
    } else {
      ctx.reply('❌ Ошибка при создании заказа.');
    }
  }
});

// Переменная для хранения данных о последнем товаре
let lastProductData = null;

bot.command('addproduct', isAdmin, async (ctx) => {
  const parts = ctx.message.text.split(' ').slice(1).join(' ').split(',');
  if (parts.length < 3) {
    return ctx.reply('❌ Неверный формат: /addproduct название,описание,количество\n\n(Будет добавлен к последнему заказу)\n\nПосле команды отправьте фото товара');
  }

  const [name, description, quantity] = parts.map(p => p.trim());

  try {
    // Получаем последний созданный заказ
    const [lastOrder] = await pool.query(
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

bot.command('listorders', isAdmin, async (ctx) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY order_id DESC LIMIT 10');
    
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
    const [lastOrder] = await pool.query(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ командой /createorder');
    }

    const orderId = lastOrder[0].order_id;

    await pool.query(
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

bot.command('updatedelivery', isAdmin, async (ctx) => {
  const parts = ctx.message.text.split(' ').slice(1);
  if (parts.length < 1) {
    return ctx.reply('❌ Формат: /updatedelivery дата_доставки\n\nПример: /updatedelivery 2024-12-25\n\n(Будет обновлен последний заказ)');
  }

  const newDeliveryDate = parts.join(' ').trim();

  try {
    // Получаем последний заказ
    const [lastOrder] = await pool.query(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ командой /createorder');
    }

    const orderId = lastOrder[0].order_id;

    await pool.query(
      'UPDATE orders SET delivery_date = ? WHERE order_id = ?',
      [newDeliveryDate, orderId]
    );
    
    ctx.reply(`✅ Дата доставки заказа ${orderId} обновлена на: ${newDeliveryDate}`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при обновлении даты доставки.');
  }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM orders WHERE track_code = ?',
      [text]
    );

    if (rows.length === 0) {
      return ctx.reply('❌ Заказ с таким трек-кодом не найден.');
    }

    const order = rows[0];
    const [items] = await pool.query(
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
    
    // Специфичные ошибки подключения к БД
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      ctx.reply('❌ Ошибка авторизации в базе данных. Обратитесь к администратору.');
    } else if (error.code === 'ECONNREFUSED') {
      ctx.reply('❌ Не удается подключиться к серверу базы данных. Попробуйте позже.');
    } else if (error.code === 'ETIMEDOUT') {
      ctx.reply('❌ Время ожидания подключения к базе данных истекло. Попробуйте позже.');
    } else if (error.code === 'ENOTFOUND') {
      ctx.reply('❌ Сервер базы данных не найден. Обратитесь к администратору.');
    } else if (error.code === 'PROTOCOL_CONNECTION_LOST') {
      ctx.reply('❌ Соединение с базой данных потеряно. Попробуйте позже.');
    } else {
      ctx.reply('❌ Произошла ошибка при получении информации о заказе. Попробуйте позже.');
    }
  }
});

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

    const [prodResult] = await pool.query(
      'INSERT INTO products (name, description, image_url) VALUES (?, ?, ?)',
      [name, description, imageUrl]
    );
    const productId = prodResult.insertId;

    await pool.query(
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

// Test database connection with retry logic
async function testDatabaseConnection(retries = 5, delay = 2000) {
  console.log('🔌 Тестирование подключения к базе данных...');
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`📡 Попытка подключения ${i + 1}/${retries}...`);
      const [rows] = await pool.query('SELECT 1 as test');
      console.log('✅ Подключение к базе данных успешно');
      console.log('📊 Тестовый запрос выполнен:', rows[0]);
      return true;
    } catch (error) {
      console.error(`❌ Попытка ${i + 1}/${retries} подключения к базе данных неудачна:`);
      console.error(`   Код ошибки: ${error.code}`);
      console.error(`   Сообщение: ${error.message}`);
      
      if (error.code === 'ECONNREFUSED') {
        console.error('   🔍 Возможные причины:');
        console.error('   - Сервер базы данных недоступен');
        console.error('   - Неверный хост или порт');
        console.error('   - Фаервол блокирует соединение');
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('   🔍 Возможные причины:');
        console.error('   - Неверные учетные данные');
        console.error('   - Пользователь не имеет доступа к базе данных');
      } else if (error.code === 'ENOTFOUND') {
        console.error('   🔍 Возможные причины:');
        console.error('   - Неверное имя хоста');
        console.error('   - Проблемы с DNS');
      }
      
      if (i === retries - 1) {
        console.error('❌ Не удалось подключиться к базе данных после всех попыток');
        console.log('⚠️  Бот будет работать в ограниченном режиме');
        return false;
      }
      
      console.log(`⏳ Повторная попытка через ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 1.5; // Увеличиваем задержку с каждой попыткой
    }
  }
}

// Запускаем тест подключения
testDatabaseConnection();

// Обработчики кнопок меню
bot.action('create_order', isAdmin, async (ctx) => {
  const trackCode = generateTrackCode();
  const currentDate = new Date().toISOString().split('T')[0];
  
  try {
    const [result] = await pool.query(
      'INSERT INTO orders (track_code, status, delivery_date) VALUES (?, ?, ?)',
      [trackCode, 'Pending', currentDate]
    );
    const orderId = result.insertId;
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
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY order_id DESC LIMIT 10');
    
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
    const [lastOrder] = await pool.query(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ');
    }

    const orderId = lastOrder[0].order_id;

    await pool.query(
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
    const [lastOrder] = await pool.query(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ');
    }

    const orderId = lastOrder[0].order_id;

    await pool.query(
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
    const [lastOrder] = await pool.query(
      'SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1'
    );

    if (lastOrder.length === 0) {
      return ctx.reply('❌ Сначала создайте заказ');
    }

    const orderId = lastOrder[0].order_id;

    await pool.query(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['Delivered', orderId]
    );
    
    ctx.reply(`✅ Статус заказа ${orderId} обновлен на: Доставлен`);
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при обновлении статуса.');
  }
});

// Graceful shutdown
let server = null;

process.once('SIGINT', async () => {
  console.log('🛑 Получен сигнал SIGINT, завершение работы...');
  
  if (process.env.NODE_ENV === 'production') {
    // Удаляем webhook
    try {
      await bot.telegram.deleteWebhook();
      console.log('✅ Webhook удален');
    } catch (error) {
      console.error('❌ Ошибка при удалении webhook:', error.message);
    }
    
    // Закрываем сервер
    if (server) {
      server.close(() => {
        console.log('✅ HTTP сервер закрыт');
        process.exit(0);
      });
    }
  } else {
    bot.stop('SIGINT');
  }
  
  pool.end();
});

process.once('SIGTERM', async () => {
  console.log('🛑 Получен сигнал SIGTERM, завершение работы...');
  
  if (process.env.NODE_ENV === 'production') {
    // Удаляем webhook
    try {
      await bot.telegram.deleteWebhook();
      console.log('✅ Webhook удален');
    } catch (error) {
      console.error('❌ Ошибка при удалении webhook:', error.message);
    }
    
    // Закрываем сервер
    if (server) {
      server.close(() => {
        console.log('✅ HTTP сервер закрыт');
        process.exit(0);
      });
    }
  } else {
    bot.stop('SIGTERM');
  }
  
  pool.end();
});

// Запуск бота в зависимости от окружения
if (process.env.NODE_ENV === 'production') {
  // Webhook режим для production (Render)
  const port = process.env.PORT || 3000;
  
  // Устанавливаем webhook
  bot.telegram.setWebhook(`https://${process.env.RENDER_EXTERNAL_URL || 'your-app-name.onrender.com'}/webhook`);
  
  // Создаем Express сервер для webhook
  const express = require('express');
  const app = express();
  
  app.use(express.json());
  
  // Webhook endpoint
  app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body);
    res.sendStatus(200);
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  server = app.listen(port, () => {
    console.log(`🤖 Бот запущен в webhook режиме на порту ${port}`);
    console.log(`📡 Webhook URL: https://${process.env.RENDER_EXTERNAL_URL || 'your-app-name.onrender.com'}/webhook`);
  });
} else {
  // Polling режим для development
  bot.launch();
  console.log('🤖 Бот запущен в polling режиме...');
}