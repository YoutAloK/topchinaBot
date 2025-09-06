# 🚀 Быстрый старт для Render

## Проблема решена! ✅

Render блокирует внешние соединения к базам данных. **Решение**: использовать встроенную PostgreSQL базу Render.

## Пошаговая настройка (5 минут)

### 1. Создайте PostgreSQL базу данных

1. В Render Dashboard → "New +" → "PostgreSQL"
2. Название: `topchina-db`
3. Регион: выберите ближайший
4. Нажмите "Create Database"

### 2. Создайте веб-сервис

1. "New +" → "Web Service"
2. Подключите ваш GitHub репозиторий
3. Настройки:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`

### 3. Подключите базу данных

1. В настройках веб-сервиса → "Environment"
2. Нажмите "Link Database"
3. Выберите созданную PostgreSQL базу

### 4. Установите переменные окружения

```
BOT_TOKEN=your_telegram_bot_token
ADMIN_ID=your_telegram_user_id
DB_TYPE=postgresql
NODE_ENV=production
```

### 5. Настройте базу данных

1. В Render Shell выполните:
   ```bash
   npm run setup-db
   ```
2. Или вручную выполните `database_setup_postgresql.sql`

### 6. Задеплойте

1. Нажмите "Deploy" в Render Dashboard
2. Дождитесь завершения деплоя
3. Проверьте логи - должно быть "✅ Подключение к базе данных успешно"

## Проверка работы

1. **Health check**: `https://your-app.onrender.com/health`
2. **Telegram**: Отправьте `/start` боту
3. **Логи**: Проверьте отсутствие ошибок

## Файлы документации

- `RENDER_POSTGRESQL_SETUP.md` - подробная настройка PostgreSQL
- `RENDER_SETUP.md` - общие инструкции
- `TROUBLESHOOTING.md` - решение проблем
- `TELEGRAM_CONFLICT_FIX.md` - исправление конфликтов

## Поддержка

Если что-то не работает:

1. Проверьте логи в Render Dashboard
2. Убедитесь, что `DATABASE_URL` установлен
3. Проверьте, что `DB_TYPE=postgresql`
4. Обратитесь в поддержку Render

## Стоимость

- **Бесплатно**: 1 ГБ PostgreSQL, 1 подключение
- **Starter**: $7/месяц за 100 подключений

---

**Готово!** Ваш бот теперь работает на Render с PostgreSQL! 🎉
