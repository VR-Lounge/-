#!/usr/bin/env node

/**
 * Скрипт для проверки конфигурации Telegram бота
 * Запускается локально для диагностики проблем
 */

require('dotenv').config();

console.log('🔍 Проверка конфигурации Telegram бота\n');

// Проверка переменных окружения
const checks = [
  {
    name: 'TELEGRAM_BOT_TOKEN',
    value: process.env.TELEGRAM_BOT_TOKEN,
    required: true,
    description: 'Токен Telegram бота'
  },
  {
    name: 'ADMIN_GROUP_ID',
    value: process.env.ADMIN_GROUP_ID,
    required: true,
    description: 'ID группы администраторов'
  },
  {
    name: 'CLIENT_MINI_APP_URL',
    value: process.env.CLIENT_MINI_APP_URL,
    required: false,
    description: 'URL Mini App для клиентов',
    defaultValue: 'https://vr-lounge.github.io/-/client-booking-miniapp.html'
  },
  {
    name: 'MINI_APP_URL',
    value: process.env.MINI_APP_URL,
    required: false,
    description: 'URL Mini App для админов',
    defaultValue: 'https://vr-lounge.github.io/-/telegram-miniapp.html'
  },
  {
    name: 'FIREBASE_SERVICE_ACCOUNT',
    value: process.env.FIREBASE_SERVICE_ACCOUNT ? 'Установлен (JSON)' : 'Не установлен',
    required: true,
    description: 'Firebase Service Account (JSON или файл)'
  },
  {
    name: 'RAILWAY_ENVIRONMENT',
    value: process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY,
    required: false,
    description: 'Окружение Railway (автоматически)'
  }
];

let allPassed = true;

checks.forEach(check => {
  const hasValue = check.value && check.value !== 'Не установлен';
  const status = hasValue ? '✅' : (check.required ? '❌' : '⚠️');
  const value = hasValue ? 
    (check.name.includes('TOKEN') ? '[скрыт]' : check.value) : 
    (check.defaultValue ? `(по умолчанию: ${check.defaultValue})` : 'не установлено');
  
  console.log(`${status} ${check.name}`);
  console.log(`   ${check.description}: ${value}`);
  
  if (check.required && !hasValue) {
    allPassed = false;
    console.log(`   ⚠️ ОБЯЗАТЕЛЬНАЯ переменная не установлена!`);
  }
  console.log('');
});

// Проверка Firebase ключа
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('✅ Firebase Service Account:');
    console.log(`   Project ID: ${serviceAccount.project_id || 'не указан'}`);
    console.log(`   Client Email: ${serviceAccount.client_email || 'не указан'}\n`);
  } catch (error) {
    console.log('❌ Ошибка парсинга Firebase Service Account JSON');
    console.log(`   ${error.message}\n`);
    allPassed = false;
  }
} else {
  // Проверка файла
  try {
    const fs = require('fs');
    if (fs.existsSync('./firebase-service-account.json')) {
      const serviceAccount = require('./firebase-service-account.json');
      console.log('✅ Firebase Service Account (из файла):');
      console.log(`   Project ID: ${serviceAccount.project_id || 'не указан'}`);
      console.log(`   Client Email: ${serviceAccount.client_email || 'не указан'}\n`);
    } else {
      console.log('❌ Файл firebase-service-account.json не найден\n');
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Ошибка чтения файла firebase-service-account.json');
    console.log(`   ${error.message}\n`);
    allPassed = false;
  }
}

// Итог
console.log('═══════════════════════════════════════════════════════════');
if (allPassed) {
  console.log('✅ Все обязательные переменные окружения установлены');
} else {
  console.log('❌ Некоторые обязательные переменные не установлены');
  console.log('   Проверьте настройки в Railway Dashboard');
}
console.log('═══════════════════════════════════════════════════════════\n');

// Проверка URL Mini App
console.log('🔗 Проверка URL Mini App:\n');
const urls = [
  {
    name: 'CLIENT_MINI_APP_URL',
    url: process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html'
  },
  {
    name: 'MINI_APP_URL',
    url: process.env.MINI_APP_URL || 'https://vr-lounge.github.io/-/telegram-miniapp.html'
  }
];

urls.forEach(item => {
  console.log(`${item.name}: ${item.url}`);
});

console.log('\n📝 Рекомендации:');
console.log('1. Проверьте логи в Railway Dashboard после деплоя');
console.log('2. Убедитесь, что бот запущен (статус "Active")');
console.log('3. Протестируйте команду /start в Telegram');
console.log('4. Проверьте, что уведомления приходят в админ-группу\n');

