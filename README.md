# TopChina Bot

Telegram бот для управления заказами с поддержкой PostgreSQL и MySQL.

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Скопируйте файл `config.example` в `.env` и заполните настройки:

```bash
cp config.example .env
```

Затем отредактируйте файл `.env`:

```env
# Telegram Bot Configuration
BOT_TOKEN=your_bot_token_here
ADMIN_ID=your_admin_telegram_id_here

# Database Configuration
# Выберите один из вариантов:

# Вариант 1: PostgreSQL (рекомендуется)
DB_TYPE=postgresql
DATABASE_URL=postgresql://username:password@localhost:5432/orders_db

# Вариант 2: MySQL (раскомментируйте и заполните)
# DB_TYPE=mysql
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=root
# DB_PASS=password
# DB_NAME=orders_db

# Environment
NODE_ENV=development
```

### 3. Настройка базы данных

```bash
npm run setup-db
```

### 4. Запуск бота

```bash
npm start
```

## 📋 Доступные команды

- `npm run setup-db` - Настроить базу данных
- `npm start` - Запустить бота

## Функции

### Для администраторов:

- 📦 Создание заказов
- 🛍️ Добавление товаров с фото
- 📋 Просмотр списка заказов
- 📊 Обновление статусов заказов
- 📅 Обновление дат доставки

### Для пользователей:

- 🔍 Поиск заказов по трек-коду
- 📸 Просмотр фото товаров
- 📊 Отслеживание статуса заказа

## Команды

### Администраторские команды:

- `/createorder` - Создать новый заказ
- `/addproduct название,описание,количество` - Добавить товар (затем отправьте фото)
- `/listorders` - Список всех заказов
- `/updateorder статус` - Обновить статус последнего заказа
- `/updatedelivery дата` - Обновить дату доставки последнего заказа

### Пользовательские команды:

- Отправьте трек-код для просмотра заказа
- `/help` - Показать справку

## Статусы заказов

- **Pending** - В ожидании
- **Shipped** - Отправлен
- **Delivered** - Доставлен

## Поддерживаемые базы данных

- PostgreSQL (рекомендуется)
- MySQL

## Структура базы данных

### Таблица `orders`

- `order_id` - ID заказа
- `track_code` - Трек-код
- `status` - Статус заказа
- `delivery_date` - Дата доставки
- `created_at` - Дата создания

### Таблица `products`

- `product_id` - ID товара
- `name` - Название товара
- `description` - Описание товара
- `image_url` - URL изображения
- `created_at` - Дата создания

### Таблица `order_items`

- `item_id` - ID элемента заказа
- `order_id` - ID заказа
- `product_id` - ID товара
- `quantity` - Количество
- `created_at` - Дата создания

## Развертывание

### Локальная разработка

1. Создайте базу данных
2. Настройте `.env` файл
3. Запустите `node setup_db.js`
4. Запустите `node bot.js`

### Production (Render)

1. Подключите PostgreSQL базу данных в Render
2. Установите переменные окружения в Render Dashboard
3. Деплойте приложение

## Требования

- Node.js 14+
- PostgreSQL 12+ или MySQL 8+
- Telegram Bot Token
