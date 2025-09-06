# Настройка PostgreSQL на Render

## Проблема с внешними базами данных

Render блокирует исходящие соединения к внешним базам данных (включая freedb.tech) по умолчанию. Решение - использовать встроенную PostgreSQL базу данных Render.

## Пошаговая настройка

### 1. Создание PostgreSQL базы данных на Render

1. Войдите в Render Dashboard
2. Нажмите "New +" → "PostgreSQL"
3. Выберите:
   - **Name**: `topchina-db` (или любое другое имя)
   - **Database**: `topchina_db`
   - **User**: `topchina_user`
   - **Region**: выберите ближайший к вам
   - **PostgreSQL Version**: 15 (рекомендуется)
4. Нажмите "Create Database"

### 2. Настройка переменных окружения

В настройках вашего веб-сервиса добавьте:

```
BOT_TOKEN=your_telegram_bot_token
ADMIN_ID=your_telegram_user_id
DB_TYPE=postgresql
NODE_ENV=production
```

**Важно**: `DATABASE_URL` автоматически устанавливается Render при подключении базы данных к сервису.

### 3. Подключение базы данных к сервису

1. В настройках вашего веб-сервиса
2. Перейдите в раздел "Environment"
3. Нажмите "Link Database"
4. Выберите созданную PostgreSQL базу данных
5. Нажмите "Link"

### 4. Выполнение SQL скрипта

После создания базы данных выполните SQL скрипт:

1. В Render Dashboard откройте вашу PostgreSQL базу
2. Перейдите в раздел "Connect"
3. Скопируйте "External Database URL"
4. Используйте любой PostgreSQL клиент (pgAdmin, DBeaver, или psql)
5. Выполните скрипт из файла `database_setup_postgresql.sql`

### 5. Альтернативный способ - через Render Shell

1. В Render Dashboard откройте вашу базу данных
2. Нажмите "Connect" → "Render Shell"
3. Выполните команды:

```bash
psql $DATABASE_URL
```

Затем выполните SQL скрипт:

```sql
-- Скопируйте и вставьте содержимое database_setup_postgresql.sql
```

## Проверка работы

После настройки в логах должно появиться:

```
🔧 Конфигурация базы данных:
   Тип: POSTGRESQL
   URL: установлен
   Environment: production
✅ Подключение к базе данных успешно
```

## Преимущества PostgreSQL на Render

- ✅ Нет блокировки соединений
- ✅ Автоматическое резервное копирование
- ✅ Высокая производительность
- ✅ Встроенная поддержка SSL
- ✅ Автоматическое масштабирование

## Миграция с MySQL

Если у вас уже есть данные в MySQL:

1. Экспортируйте данные из MySQL
2. Конвертируйте в PostgreSQL формат
3. Импортируйте в PostgreSQL

## Мониторинг

- **Логи базы данных**: Render Dashboard → Database → Logs
- **Метрики**: Render Dashboard → Database → Metrics
- **Health check**: `https://your-app.onrender.com/health`

## Стоимость

- **Бесплатный план**: 1 ГБ хранилища, 1 подключение
- **Starter план**: 1 ГБ хранилища, 100 подключений ($7/месяц)
- **Standard план**: 1 ГБ хранилища, 100 подключений ($20/месяц)

## Поддержка

Если возникают проблемы:

1. Проверьте логи базы данных
2. Убедитесь, что `DATABASE_URL` установлен
3. Проверьте, что `DB_TYPE=postgresql`
4. Обратитесь в поддержку Render
