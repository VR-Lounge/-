#!/bin/bash
# Скрипт для пошагового развертывания Telegram бота на Firebase Cloud Functions

set -e  # Остановка при ошибке

echo "🚀 Развертывание Telegram бота на Firebase Cloud Functions"
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Шаг 1: Проверка Firebase CLI
echo -e "${GREEN}=== ШАГ 1: Проверка Firebase CLI ===${NC}"
if command -v firebase &> /dev/null; then
    echo "✅ Firebase CLI установлен глобально"
    FIREBASE_CMD="firebase"
elif [ -f "node_modules/.bin/firebase" ]; then
    echo "✅ Firebase CLI установлен локально"
    FIREBASE_CMD="npx firebase-tools"
else
    echo -e "${RED}❌ Firebase CLI не найден!${NC}"
    echo "Установите: npm install firebase-tools --save-dev"
    exit 1
fi

$FIREBASE_CMD --version
echo ""

# Шаг 2: Вход в Firebase
echo -e "${GREEN}=== ШАГ 2: Вход в Firebase ===${NC}"
echo "⚠️  Откроется браузер для авторизации..."
read -p "Нажмите Enter для продолжения..."
$FIREBASE_CMD login
echo ""

# Шаг 3: Проверка проекта
echo -e "${GREEN}=== ШАГ 3: Проверка проекта ===${NC}"
$FIREBASE_CMD projects:list
echo ""

# Шаг 4: Инициализация (если нужно)
if [ ! -f "firebase.json" ]; then
    echo -e "${YELLOW}=== ШАГ 4: Инициализация Firebase проекта ===${NC}"
    echo "Выберите:"
    echo "  - Использовать существующий проект: vr-lounge33"
    echo "  - JavaScript (не TypeScript)"
    echo "  - ESLint: No"
    echo "  - Установить зависимости: Yes"
    read -p "Нажмите Enter для начала инициализации..."
    $FIREBASE_CMD init functions
else
    echo "✅ Проект уже инициализирован"
fi
echo ""

# Шаг 5: Настройка переменных окружения
echo -e "${GREEN}=== ШАГ 5: Настройка переменных окружения ===${NC}"
echo "Устанавливаю конфигурацию..."
$FIREBASE_CMD functions:config:set telegram.bot_token="YOUR_TELEGRAM_BOT_TOKEN"
$FIREBASE_CMD functions:config:set telegram.admin_group_id="-1002640127163"
$FIREBASE_CMD functions:config:set telegram.mini_app_url="https://vr-lounge.github.io/-/telegram-miniapp.html"
$FIREBASE_CMD functions:config:set telegram.client_mini_app_url="https://vr-lounge.github.io/-/client-booking-miniapp.html"

echo ""
echo "Проверка конфигурации:"
$FIREBASE_CMD functions:config:get
echo ""

# Шаг 6: Проверка кода
echo -e "${GREEN}=== ШАГ 6: Проверка кода functions/index.js ===${NC}"
if [ -f "functions/index.js" ]; then
    echo "✅ Файл functions/index.js существует"
    echo "Проверьте, что он содержит все необходимые функции"
else
    echo -e "${RED}❌ Файл functions/index.js не найден!${NC}"
    exit 1
fi
echo ""

# Шаг 7: Развертывание
echo -e "${GREEN}=== ШАГ 7: Развертывание функций ===${NC}"
echo "⚠️  Это займет 2-5 минут..."
read -p "Нажмите Enter для начала развертывания..."
$FIREBASE_CMD deploy --only functions
echo ""

# Шаг 8: Настройка Webhook
echo -e "${GREEN}=== ШАГ 8: Настройка Webhook в Telegram ===${NC}"
echo "Получаю URL функции..."
FUNCTION_URL="https://us-central1-vr-lounge33.cloudfunctions.net/telegramBot"
echo "URL функции: $FUNCTION_URL"
echo ""
echo "Устанавливаю Webhook..."
curl -X POST "https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=$FUNCTION_URL"
echo ""
echo ""
echo "Проверка Webhook:"
curl "https://api.telegram.org/botYOUR_TELEGRAM_BOT_TOKEN/getWebhookInfo"
echo ""
echo ""

# Шаг 9: Финальная проверка
echo -e "${GREEN}=== ШАГ 9: Финальная проверка ===${NC}"
echo "✅ Развертывание завершено!"
echo ""
echo "Проверьте работу бота:"
echo "  1. Откройте Telegram"
echo "  2. Напишите боту /start"
echo "  3. Проверьте логи: $FIREBASE_CMD functions:log"
echo ""
echo "⚠️  Не забудьте остановить локальный процесс бота:"
echo "  pkill -f telegram-bot.js"
echo ""

echo -e "${GREEN}🎉 Готово! Бот работает на Firebase Cloud Functions!${NC}"

