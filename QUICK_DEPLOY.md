# ⚡ Быстрый деплой на Render (5 минут)

## 🎯 Цель: Перенести бота с Railway на Render (бесплатно)

---

## 📝 Шаг 1: Регистрация на Render (2 минуты)

1. Откройте: **https://render.com**
2. Нажмите **"Get Started for Free"**
3. Войдите через **GitHub**
4. Подтвердите доступ к репозиторию `VR-Lounge/-`

---

## 🔧 Шаг 2: Создание сервиса (3 минуты)

1. В Render Dashboard нажмите **"New +"** → **"Web Service"**
2. Выберите репозиторий: **`VR-Lounge/-`**
3. Заполните:
   - **Name:** `vr-lounge-telegram-bot`
   - **Environment:** `Node`
   - **Plan:** `Free`
   - **Build Command:** `npm install`
   - **Start Command:** `node telegram-bot.js`

4. В разделе **"Environment Variables"** добавьте:

```
TELEGRAM_BOT_TOKEN = YOUR_TELEGRAM_BOT_TOKEN
ADMIN_GROUP_ID = -1002640127163
CLIENT_MINI_APP_URL = https://vr-lounge.github.io/-/client-booking-miniapp.html
MINI_APP_URL = https://vr-lounge.github.io/-/telegram-miniapp.html
FIREBASE_SERVICE_ACCOUNT = [скопируйте весь JSON из firebase-service-account.json как одну строку]
```

5. Нажмите **"Create Web Service"**

---

## ⏱️ Шаг 3: Ожидание деплоя (2 минуты)

- Render начнет сборку и деплой
- Следите за логами в реальном времени
- Когда увидите `✅ Бот готов к работе!` - готово!

---

## ✅ Шаг 4: Проверка

1. Откройте Telegram
2. Найдите **`@vr_lounge33_bot`**
3. Отправьте `/start`
4. Бот должен ответить ✅

---

## 🗑️ Шаг 5: Удаление Railway (опционально)

После проверки работы на Render:
1. Откройте Railway Dashboard
2. Удалите старый сервис (чтобы избежать конфликтов)

---

## 📊 Все функции бота сохранены:

✅ Команды (/start, /help, /myid, /register, /newbooking)
✅ Регистрация клиентов
✅ Уведомления администраторам о новых записях
✅ Напоминания за 1 день до события
✅ Напоминания за 3 часа до события
✅ Интеграция с Mini App
✅ Система ролей (admin/client/guest)

---

## 🎉 Готово!

Бот работает на Render бесплатно с автодеплоем из GitHub!

