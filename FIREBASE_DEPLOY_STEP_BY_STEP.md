# 🚀 Пошаговое развертывание Telegram бота на Firebase Cloud Functions

## Цель
Развернуть бота автономно на Firebase Cloud Functions, чтобы он работал 24/7 без необходимости держать компьютер включенным.

---

## 📋 Шаг 1: Установка Firebase CLI

### ⚠️ Если возникают проблемы с сетью (ECONNRESET):

**Вариант A: Установка через Homebrew (рекомендуется для macOS)**
```bash
# Установите Homebrew, если его нет:
# /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Установите Firebase CLI через Homebrew:
brew install firebase-cli
```

**Вариант B: Глобальная установка через npm (требует sudo)**
```bash
sudo npm install -g firebase-tools
```

**Вариант C: Локальная установка (без sudo)**
```bash
# Попробуйте с увеличенным таймаутом:
npm install firebase-tools --save-dev --timeout=60000

# Или через другой registry:
npm install firebase-tools --save-dev --registry https://registry.npmjs.org/ --timeout=60000
```

**Вариант D: Ручная установка (если ничего не помогает)**
```bash
# Скачайте напрямую:
curl -L https://firebase.tools/bin/macos/latest -o firebase-tools.tar.gz
tar -xzf firebase-tools.tar.gz
sudo mv firebase /usr/local/bin/
```

### Проверка установки
```bash
firebase --version
# или (если установлен локально)
npx firebase-tools --version
```

### 🔧 Решение проблем с сетью:

Если получаете ошибку `ECONNRESET`:
1. Проверьте интернет-соединение
2. Попробуйте использовать VPN (если находитесь за корпоративным прокси)
3. Попробуйте установить через Homebrew (самый надежный способ на macOS)
4. Попробуйте позже, когда сеть стабильна

---

## 📋 Шаг 2: Вход в Firebase

```bash
npx firebase-tools login
```

Откроется браузер для авторизации. Войдите в свой Google аккаунт, который используется для Firebase проекта `vr-lounge33`.

**Проверка после входа:**
```bash
npx firebase-tools projects:list
```

Должен отобразиться проект `vr-lounge33`.

---

## 📋 Шаг 3: Инициализация Firebase проекта

```bash
cd "/Users/LOBANOFF-PRO/Documents/VR Lounge/CRM VR Lounge"
npx firebase-tools init functions
```

**Выберите:**
- ✅ Использовать существующий проект: `vr-lounge33`
- ✅ JavaScript (не TypeScript)
- ✅ ESLint: No (или Yes, если хотите)
- ✅ Установить зависимости: Yes

**После инициализации появятся файлы:**
- `.firebaserc` - конфигурация проекта
- `firebase.json` - настройки Firebase

---

## 📋 Шаг 4: Настройка переменных окружения

После инициализации нужно установить секретные переменные:

```bash
firebase functions:config:set telegram.bot_token="YOUR_TELEGRAM_BOT_TOKEN"
firebase functions:config:set telegram.admin_group_id="-1002640127163"
firebase functions:config:set telegram.mini_app_url="https://vr-lounge.github.io/-/telegram-miniapp.html"
firebase functions:config:set telegram.client_mini_app_url="https://vr-lounge.github.io/-/client-booking-miniapp.html"
```

**Проверка:**
```bash
firebase functions:config:get
```

---

## 📋 Шаг 5: Проверка кода functions/index.js

Убедитесь, что файл `functions/index.js` содержит:
- ✅ Инициализацию Firebase Admin SDK
- ✅ Инициализацию Telegram бота (БЕЗ polling)
- ✅ Все обработчики команд (`/start`, `/register`, `/help` и т.д.)
- ✅ Cloud Function `telegramBot` для обработки Webhook
- ✅ Cloud Function `onNewBooking` для уведомлений о новых записях
- ✅ Cloud Function `checkUpcomingEvents` для напоминаний

---

## 📋 Шаг 6: Развертывание функций

```bash
cd "/Users/LOBANOFF-PRO/Documents/VR Lounge/CRM VR Lounge"
firebase deploy --only functions
```

Это займет 2-5 минут. После успешного развертывания вы увидите URL:
```
https://us-central1-vr-lounge33.cloudfunctions.net/telegramBot
```

---

## 📋 Шаг 7: Настройка Webhook в Telegram

После развертывания нужно один раз установить Webhook:

```bash
curl -X POST "https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://us-central1-vr-lounge33.cloudfunctions.net/telegramBot"
```

Или через браузер откройте:
```
https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/setWebhook?url=https://us-central1-vr-lounge33.cloudfunctions.net/telegramBot
```

**Проверка Webhook:**
```bash
curl "https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

---

## 📋 Шаг 8: Проверка работы бота

1. Откройте Telegram и напишите боту `/start`
2. Проверьте, что бот отвечает
3. Проверьте логи в Firebase Console:
   ```bash
   firebase functions:log
   ```

---

## 📋 Шаг 9: Остановка локального бота

После успешного развертывания остановите локальный процесс:

```bash
pkill -f "telegram-bot.js"
```

Теперь бот работает на Firebase Cloud Functions и не требует включенного компьютера!

---

## ✅ Проверочный список

- [ ] Firebase CLI установлен
- [ ] Выполнен `firebase login`
- [ ] Выполнен `firebase init functions`
- [ ] Настроены переменные окружения (`firebase functions:config:set`)
- [ ] Проверен код `functions/index.js`
- [ ] Выполнен `firebase deploy --only functions`
- [ ] Установлен Webhook в Telegram
- [ ] Проверена работа бота
- [ ] Остановлен локальный процесс

---

## 🔧 Устранение проблем

### Ошибка: "Firebase CLI не найден"
```bash
# Установите локально
npm install firebase-tools --save-dev
# Используйте через npx
npx firebase-tools --version
```

### Ошибка: "Permission denied"
```bash
# Используйте sudo для глобальной установки
sudo npm install -g firebase-tools
```

### Ошибка: "Project not found"
```bash
# Проверьте проект
firebase projects:list
# Выберите проект
firebase use vr-lounge33
```

### Ошибка при развертывании
```bash
# Проверьте логи
firebase functions:log
# Проверьте конфигурацию
firebase functions:config:get
```

---

## 📝 Полезные команды

```bash
# Просмотр логов
firebase functions:log

# Просмотр конфигурации
firebase functions:config:get

# Удаление функции
firebase functions:delete telegramBot

# Переразвертывание
firebase deploy --only functions:telegramBot
```

---

## 🎯 Результат

После выполнения всех шагов:
- ✅ Бот работает на Firebase Cloud Functions 24/7
- ✅ Не требует включенного компьютера
- ✅ Автоматически масштабируется
- ✅ Интегрирован с Firestore
- ✅ Все в одном месте (Firebase + GitHub)

---

## 📞 Поддержка

Если возникнут проблемы на любом этапе, сообщите мне - помогу решить!
