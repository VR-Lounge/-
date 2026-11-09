// Telegram Bot для VR Lounge CRM
// Интеграция с Firebase для управления клиентами и уведомлениями

require('dotenv').config();

// Определение окружения (для логирования)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT;
const environment = process.env.RENDER ? 'Render' : (process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Локальное');

const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// Поддержка Firebase ключа из переменной окружения (для облачных сервисов)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Для облачных сервисов (Railway, Render и т.д.)
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Для локальной разработки
  serviceAccount = require('./firebase-service-account.json');
}

// Инициализация Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Инициализация Telegram бота
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('ОШИБКА: TELEGRAM_BOT_TOKEN не установлен в переменных окружения!');
  process.exit(1);
}

console.log('🚀 Инициализация Telegram бота...');
console.log('📅 Время запуска:', new Date().toISOString());
console.log('🆔 Process ID:', process.pid);
console.log('🌐 Окружение:', environment);
if (isProduction) {
  console.log('🏭 Режим: Production');
}

const bot = new TelegramBot(token, { polling: true });

console.log('✅ Telegram бот инициализирован с polling: true');

// Логирование всех входящих сообщений для отладки
bot.on('message', (msg) => {
  console.log(`📩 Получено сообщение от ${msg.from.first_name} (${msg.chat.type}):`, msg.text || '[не текст]');
});

// Обработка текстовых сообщений от админа для рассылки (должен быть после всех команд)
bot.on('message', async (msg) => {
  // Пропускаем сообщения из групп
  if (msg.chat.type !== 'private') {
    return;
  }
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;
  
  // Проверяем, ожидает ли этот админ сообщение для рассылки
  if (!broadcastPendingState.get(userId) || !text) {
    return;
  }
  
  // Пропускаем команды
  if (text.startsWith('/')) {
    return;
  }
  
  // Проверяем, что пользователь - администратор
  const role = await getUserRole(userId);
  if (role !== 'admin') {
    broadcastPendingState.delete(userId);
    return;
  }
  
  try {
    // Подтверждение рассылки
    await bot.sendMessage(chatId, `📢 Подтверждение рассылки

📝 Ваше сообщение:
${text}

📊 Будет отправлено активным клиентам с Telegram.

Продолжить?`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Да, отправить', callback_data: `confirm_broadcast:${msg.message_id}` },
            { text: '❌ Отмена', callback_data: 'cancel_broadcast' }
          ]
        ]
      }
    });
    
    // Сохраняем текст сообщения
    broadcastPendingState.set(userId, text);
    
  } catch (error) {
    console.error('Ошибка обработки сообщения для рассылки:', error);
    broadcastPendingState.delete(userId);
  }
});

// ID группы администраторов (замените на ваш)
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID || '-1001234567890'; // Пример формата

console.log('🤖 Telegram бот запущен!');
console.log('📋 ID группы администраторов:', ADMIN_GROUP_ID);

// Хранилище для состояния рассылки (временное, в памяти)
const broadcastPendingState = new Map();

// ============================================
// СИСТЕМА РОЛЕЙ ПОЛЬЗОВАТЕЛЕЙ
// ============================================

// Кэш для ролей пользователей (чтобы не делать запросы каждый раз)
const userRoleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Функция определения роли пользователя (с кэшированием)
async function getUserRole(userId) {
  try {
    // Проверяем кэш
    const cached = userRoleCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.role;
    }
    
    // Сначала проверяем, является ли пользователь админом (из графика смен)
    const adminSnapshot = await db.collection('admins')
      .where('telegramId', '==', userId.toString())
      .limit(1) // Ограничиваем результат
      .get();
    
    if (!adminSnapshot.empty) {
      const role = 'admin';
      userRoleCache.set(userId, { role, timestamp: Date.now() });
      return role;
    }
    
    // Затем проверяем, является ли пользователь руководителем
    const managerSnapshot = await db.collection('managers')
      .where('telegramId', '==', userId.toString())
      .limit(1) // Ограничиваем результат
      .get();
    
    if (!managerSnapshot.empty) {
      const role = 'admin'; // Руководители имеют те же права, что и админы
      userRoleCache.set(userId, { role, timestamp: Date.now() });
      return role;
    }
    
    // Затем проверяем, является ли пользователь клиентом
    const clientSnapshot = await db.collection('clients')
      .where('telegramId', '==', userId.toString())
      .limit(1) // Ограничиваем результат
      .get();
    
    if (!clientSnapshot.empty) {
      const role = 'client';
      userRoleCache.set(userId, { role, timestamp: Date.now() });
      return role;
    }
    
    // Если не найден нигде - гость
    const role = 'guest';
    userRoleCache.set(userId, { role, timestamp: Date.now() });
    return role;
  } catch (error) {
    console.error('Ошибка определения роли пользователя:', error);
    // При ошибке возвращаем роль из кэша, если есть
    const cached = userRoleCache.get(userId);
    if (cached) {
      return cached.role;
    }
    return 'guest';
  }
}

// ============================================
// ОСНОВНЫЕ КОМАНДЫ БОТА
// ============================================

// Команда /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || msg.from.first_name;
  const startPayload = String((match && match[1]) || '').trim();
  
  console.log(`📨 Получена команда /start от ${username} (chatId: ${chatId}, userId: ${userId})`);

  // Deep link: /start gift_VRL-XXXXXX — сразу отдать ссылку на карту
  const giftStart = startPayload.match(/^gift[_-]?([A-Za-z0-9\-]+)$/i);
  if (giftStart) {
    const giftCode = giftStart[1].toUpperCase();
    const link = `https://vr-lounge.github.io/vr-lounge-redesign/gift.html?code=${encodeURIComponent(giftCode)}`;
    try {
      const roleQuick = await getUserRole(userId);
      if (roleQuick === 'admin') {
        await bot.sendMessage(
          chatId,
          `🎁 Карта ${giftCode}\n\nСсылка клиенту:\n${link}\n\nПовторить доставку: /giftlink ${giftCode}`
        );
      } else {
        await bot.sendMessage(chatId, `🎁 Ваша карта ${giftCode}:\n${link}`);
      }
    } catch (e) {
      await bot.sendMessage(chatId, `🎁 Карта ${giftCode}:\n${link}`);
    }
    return;
  }

  // URL Mini App для админов
  const ADMIN_MINI_APP_URL = process.env.MINI_APP_URL || 'https://vr-lounge.github.io/-/telegram-miniapp.html';
  // URL Mini App для клиентов (Friendly-сервис)
  const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';

  // Определяем роль пользователя с таймаутом и обработкой ошибок
  let role = 'guest'; // По умолчанию гость
  try {
    console.log(`🔍 Определение роли для пользователя ${userId}...`);
    // Добавляем таймаут для определения роли (максимум 5 секунд)
    const rolePromise = getUserRole(userId);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('guest'), 5000));
    role = await Promise.race([rolePromise, timeoutPromise]);
    console.log(`👤 Роль пользователя ${username}: ${role}`);
  } catch (error) {
    console.error(`❌ Ошибка определения роли пользователя ${userId}:`, error);
    console.error(`📋 Детали ошибки:`, error.message, error.stack);
    role = 'guest'; // При ошибке считаем гостем
  }

  try {
    if (role === 'admin') {
      // Меню для администратора
      await bot.sendMessage(chatId, `
👋 Привет, ${username}!

Добро пожаловать в панель администратора VR Lounge! 🎮

Доступные функции:
• Создавать новые записи клиентов
• Просматривать статистику
• Управлять клиентами
• Делать рассылки
• Получать уведомления о событиях
      `, {
        reply_markup: {
          keyboard: [
            [{ 
              text: '📝 Создать запись', 
              web_app: { url: ADMIN_MINI_APP_URL }
            }],
            [{ text: '📊 Статистика' }, { text: '👥 Клиенты' }],
            [{ text: '📢 Рассылка' }, { text: 'Помощь' }]
          ],
          resize_keyboard: true
        }
      });
      
      // Устанавливаем правильную Menu Button для админов
      try {
        await bot.setChatMenuButton({
          chat_id: chatId,
          menu_button: {
            type: 'web_app',
            text: '📝 Создать запись',
            web_app: {
              url: ADMIN_MINI_APP_URL
            }
          }
        });
      } catch (error) {
        console.error('Ошибка установки Menu Button для админа:', error.message);
      }
    } else if (role === 'client') {
      // Меню для клиента
      await bot.sendMessage(chatId, `
👋 Привет, ${username}!

Добро пожаловать в VR Lounge! 🎮

Здесь можно:

🎁 Узнавать первыми о скидках и акциях — вступайте в наш клуб постоянных клиентов и получайте выгодные предложения!

✨ Записываться на игры, дни рождения — просто выберите дату, время и услугу прямо в боте. Всё быстро и удобно!

📅 Смотреть свои записи — все ваши бронирования в одном месте. Не нужно ничего запоминать!

🔔 Получать напоминания — мы напомним вам о записи за день и за 3 часа до начала. Ничего не пропустите!

💬 Быстро связываться с нами — все контакты и ответы на вопросы всегда под рукой.

Начните с кнопки "✨ Записаться" ниже — это займёт всего пару минут! 🚀
      `, {
        reply_markup: {
          keyboard: [
            [{ 
              text: '✨ Записаться', 
              web_app: { url: CLIENT_MINI_APP_URL }
            }],
            [{ text: '📅 Мои записи' }, { text: '📞 Контакты' }],
            [{ text: 'ℹ️ О клубе' }, { text: 'Помощь' }]
          ],
          resize_keyboard: true
        }
      });
      
      // Устанавливаем правильную Menu Button для клиентов
      try {
        await bot.setChatMenuButton({
          chat_id: chatId,
          menu_button: {
            type: 'web_app',
            text: '✨ Записаться',
            web_app: {
              url: CLIENT_MINI_APP_URL
            }
          }
        });
      } catch (error) {
        console.error('Ошибка установки Menu Button для клиента:', error.message);
      }
    } else {
      // Меню для гостя (не зарегистрированного)
      await bot.sendMessage(chatId, `
👋 Привет, ${username}!

Добро пожаловать в VR Lounge! 🎮

Мы - игровой клуб с VR очками, PS5, X-Box и многим другим!

Здесь можно:

🎁 Узнавать первыми о скидках и акциях — вступайте в наш клуб постоянных клиентов и получайте выгодные предложения!

✨ Записываться на игры, дни рождения — просто выберите дату, время и услугу прямо в боте. Всё быстро и удобно!

📅 Смотреть свои записи — все ваши бронирования в одном месте. Не нужно ничего запоминать!

🔔 Получать напоминания — мы напомним вам о записи за день и за 3 часа до начала. Ничего не пропустите!

💬 Быстро связываться с нами — все контакты и ответы на вопросы всегда под рукой.

📍 Адрес: г. Кольчугино, ул. Зернова, д. 11
🕐 График работы:
   пн-пт: 15-20
   сб-вс: 12-21

Начните с кнопки "✨ Записаться" ниже — это займёт всего пару минут! 🚀
      `, {
        reply_markup: {
          keyboard: [
            [{ 
              text: '✨ Записаться', 
              web_app: { url: CLIENT_MINI_APP_URL }
            }],
            [{ text: '📞 Контакты' }, { text: 'ℹ️ О клубе' }],
            [{ text: 'Регистрация' }, { text: 'Помощь' }]
          ],
          resize_keyboard: true,
          remove_keyboard: false
        }
      });
      
      // Устанавливаем правильную Menu Button для гостей через Bot API
      try {
        await bot.setChatMenuButton({
          chat_id: chatId,
          menu_button: {
            type: 'web_app',
            text: '✨ Записаться',
            web_app: {
              url: CLIENT_MINI_APP_URL
            }
          }
        });
      } catch (error) {
        console.error('Ошибка установки Menu Button для гостя:', error.message);
      }
    }
    
    console.log(`✅ Ответ отправлен пользователю ${username} (роль: ${role})`);
  } catch (error) {
    console.error('❌ Ошибка отправки сообщения /start:', error);
    console.error('📋 Детали ошибки:', error.message);
    console.error('📋 Код ошибки:', error.code);
    if (error.response) {
      console.error('📡 Статус ответа:', error.response.statusCode);
      if (error.response.body) {
        console.error('📄 Тело ответа:', JSON.stringify(error.response.body, null, 2));
      }
    }
    
    // Попытка отправить простое сообщение об ошибке
    try {
      await bot.sendMessage(chatId, `👋 Привет, ${username}!\n\nПроизошла ошибка при загрузке меню. Пожалуйста, попробуйте еще раз через несколько секунд.`, {
        reply_markup: {
          keyboard: [
            [{ text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } }],
            [{ text: 'Помощь' }]
          ],
          resize_keyboard: true
        }
      });
      console.log(`✅ Отправлено сообщение об ошибке пользователю ${username}`);
    } catch (fallbackError) {
      console.error('❌ Критическая ошибка: не удалось отправить даже сообщение об ошибке:', fallbackError.message);
    }
  }
});

// Команда /register - регистрация клиента
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username ? `@${msg.from.username}` : null;
  const firstName = msg.from.first_name || '';
  const lastName = msg.from.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  // Проверяем, что это личный чат (не группа)
  if (msg.chat.type !== 'private') {
    await bot.sendMessage(chatId, '❌ Регистрация возможна только в личном чате с ботом. Пожалуйста, напишите боту напрямую.');
    return;
  }

  try {
    await bot.sendMessage(chatId, `
🎮 Привет! Рады видеть тебя в VR Lounge! 🎉

Стань членом нашего клуба и получи доступ к эксклюзивным возможностям! 🎁

✨ Что тебя ждет после регистрации:
• Бонусы и скидки на услуги клуба
• Участие в розыгрышах призов
• Приоритетная запись на популярные услуги
• Напоминания о записях и специальные предложения

Чтобы зарегистрироваться, нам нужен твой номер телефона 📱

Это займет всего пару секунд:
• Нажми кнопку ниже, чтобы поделиться номером
• Или напиши номер в формате: +7 (XXX) XXX-XX-XX

Стань частью VR Lounge прямо сейчас! 🚀
    `, {
      reply_markup: {
        keyboard: [
          [{
            text: '📱 Поделиться номером телефона',
            request_contact: true
          }],
          [{ text: 'Отмена' }]
        ],
        resize_keyboard: true
      }
    });
  } catch (error) {
    console.error('Ошибка отправки сообщения регистрации:', error);
    await bot.sendMessage(chatId, '😅 Упс! Что-то пошло не так. Попробуй еще раз или напиши номер вручную в формате +7 (XXX) XXX-XX-XX');
  }
});

// Обработка кнопки "Регистрация" (текстовая кнопка)
bot.onText(/^Регистрация$/i, async (msg) => {
  // Вызываем ту же логику, что и команда /register
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username ? `@${msg.from.username}` : null;
  const firstName = msg.from.first_name || '';
  const lastName = msg.from.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  // Проверяем, что это личный чат (не группа)
  if (msg.chat.type !== 'private') {
    await bot.sendMessage(chatId, '❌ Регистрация возможна только в личном чате с ботом. Пожалуйста, напишите боту напрямую.');
    return;
  }

  try {
    await bot.sendMessage(chatId, `
🎮 Привет! Рады видеть тебя в VR Lounge! 🎉

Стань членом нашего клуба и получи доступ к эксклюзивным возможностям! 🎁

✨ Что тебя ждет после регистрации:
• Бонусы и скидки на услуги клуба
• Участие в розыгрышах призов
• Приоритетная запись на популярные услуги
• Напоминания о записях и специальные предложения

Чтобы зарегистрироваться, нам нужен твой номер телефона 📱

Это займет всего пару секунд:
• Нажми кнопку ниже, чтобы поделиться номером
• Или напиши номер в формате: +7 (XXX) XXX-XX-XX

Стань частью VR Lounge прямо сейчас! 🚀
    `, {
      reply_markup: {
        keyboard: [
          [{
            text: '📱 Поделиться номером телефона',
            request_contact: true
          }],
          [{ text: 'Отмена' }]
        ],
        resize_keyboard: true
      }
    });
  } catch (error) {
    console.error('Ошибка отправки сообщения регистрации:', error);
    await bot.sendMessage(chatId, '😅 Упс! Что-то пошло не так. Попробуй еще раз или напиши номер вручную в формате +7 (XXX) XXX-XX-XX');
  }
});

// Обработка контакта (номер телефона)
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  const userId = msg.from.id.toString();
  const username = msg.from.username ? `@${msg.from.username}` : null;
  const phoneNumber = contact.phone_number;
  
  // Проверяем, что это личный чат
  if (msg.chat.type !== 'private') {
    return; // Игнорируем контакты из групп
  }
  
  // Нормализуем номер телефона
  let normalizedPhone = phoneNumber.replace(/\D/g, '');
  if (normalizedPhone.startsWith('8')) {
    normalizedPhone = '7' + normalizedPhone.substring(1);
  }
  if (!normalizedPhone.startsWith('7')) {
    normalizedPhone = '7' + normalizedPhone;
  }
  
  const formattedPhone = `+7 (${normalizedPhone.substring(1, 4)}) ${normalizedPhone.substring(4, 7)}-${normalizedPhone.substring(7, 9)}-${normalizedPhone.substring(9, 11)}`;
  const phoneDigits = normalizedPhone;

  try {
    // Ищем клиента по телефону с retry логикой
    let clientsSnapshot;
    let retries = 3;
    let lastError;
    
    while (retries > 0) {
      try {
        clientsSnapshot = await db.collection('clients')
          .where('phoneDigits', '==', phoneDigits)
          .limit(1) // Ограничиваем результат для экономии лимита
          .get();
        break; // Успешно, выходим из цикла
      } catch (queryError) {
        lastError = queryError;
        retries--;
        
        if (queryError.code === 8 || queryError.message.includes('Quota exceeded')) {
          // Превышен лимит - ждем перед повтором
          console.warn(`⚠️ Превышен лимит Firestore. Осталось попыток: ${retries}`);
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем 2 секунды
            continue;
          }
        } else {
          // Другая ошибка - не повторяем
          throw queryError;
        }
      }
    }
    
    if (retries === 0 && lastError) {
      throw lastError; // Все попытки исчерпаны
    }

    if (!clientsSnapshot.empty) {
      // Клиент существует - обновляем Telegram данные
      const clientDoc = clientsSnapshot.docs[0];
      await clientDoc.ref.update({
        telegramId: userId,
        telegramUsername: username,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // URL Mini App для клиентов (Friendly-сервис)
      const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
      
      await bot.sendMessage(chatId, `
🎉 Отлично! Твой Telegram успешно привязан к аккаунту!

Ты уже член нашего клуба! 🎮🎁

✨ Тебе доступно:
• Бонусы и скидки на услуги клуба
• Участие в розыгрышах призов
• Приоритетная запись на популярные услуги
• Напоминания о записях (за 1 день и за 3 часа)
• Специальные предложения и новости о наших новинках

Ждем тебя в VR Lounge! 🎮
      `, {
        reply_markup: {
          keyboard: [
            [{ 
              text: '✨ Записаться', 
              web_app: { url: CLIENT_MINI_APP_URL }
            }],
            [{ text: '📅 Мои записи' }, { text: '📞 Контакты' }],
            [{ text: 'ℹ️ О клубе' }, { text: 'Помощь' }]
          ],
          resize_keyboard: true
        }
      });
      
      // Устанавливаем правильную Menu Button для клиентов
      try {
        await bot.setChatMenuButton({
          chat_id: chatId,
          menu_button: {
            type: 'web_app',
            text: '✨ Записаться',
            web_app: {
              url: CLIENT_MINI_APP_URL
            }
          }
        });
      } catch (error) {
        console.error('Ошибка установки Menu Button для клиента:', error.message);
      }
    } else {
      // Клиента нет - создаем нового с retry логикой
      let retries = 3;
      let lastError;
      
      while (retries > 0) {
        try {
          await db.collection('clients').add({
            clientName: contact.first_name || 'Не указано',
            clientPhone: formattedPhone,
            phoneDigits: phoneDigits,
            telegramId: userId,
            telegramUsername: username,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastBookingDate: null,
            totalBookings: 0,
            totalSpent: 0,
            isActive: true
          });
          break; // Успешно, выходим из цикла
        } catch (createError) {
          lastError = createError;
          retries--;
          
          if (createError.code === 8 || createError.message.includes('Quota exceeded')) {
            console.warn(`⚠️ Превышен лимит Firestore при создании клиента. Осталось попыток: ${retries}`);
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем 2 секунды
              continue;
            }
          } else {
            throw createError; // Другая ошибка - не повторяем
          }
        }
      }
      
      if (retries === 0 && lastError) {
        throw lastError; // Все попытки исчерпаны
      }

      // URL Mini App для клиентов (Friendly-сервис)
      const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
      
      await bot.sendMessage(chatId, `
🎉 Добро пожаловать в VR Lounge!

Ты успешно стал(а) членом нашего клуба! 🎮🎁

Теперь ты можешь:
🎁 Узнавать первыми о скидках и акциях
✨ Записываться на игры, дни рождения прямо здесь
📅 Видеть все свои записи в одном месте
🔔 Получать напоминания о записях

Начни с кнопки "✨ Записаться" — выбери удобное время и услугу! 🚀

✨ Теперь тебе доступно:
• Бонусы и скидки на услуги клуба
• Участие в розыгрышах призов
• Приоритетная запись на популярные услуги
• Напоминания о записях (за 1 день и за 3 часа)
• Специальные предложения и новости о наших новинках

Записывайся на удобное время и наслаждайся игрой! 🚀
      `, {
        reply_markup: {
          keyboard: [
            [{ 
              text: '✨ Записаться', 
              web_app: { url: CLIENT_MINI_APP_URL }
            }],
            [{ text: '📅 Мои записи' }, { text: '📞 Контакты' }],
            [{ text: 'ℹ️ О клубе' }, { text: 'Помощь' }]
          ],
          resize_keyboard: true
        }
      });
      
      // Устанавливаем правильную Menu Button для клиентов
      try {
        await bot.setChatMenuButton({
          chat_id: chatId,
          menu_button: {
            type: 'web_app',
            text: '✨ Записаться',
            web_app: {
              url: CLIENT_MINI_APP_URL
            }
          }
        });
      } catch (error) {
        console.error('Ошибка установки Menu Button для клиента:', error.message);
      }
    }

    // Уведомляем администраторов
    try {
      await bot.sendMessage(ADMIN_GROUP_ID, `
🆕 Новый клиент зарегистрировался через бота:
👤 Имя: ${contact.first_name || 'Не указано'}
📱 Телефон: ${formattedPhone}
💬 Telegram: ${username || userId}
      `);
    } catch (groupError) {
      console.error('Ошибка отправки уведомления в группу:', groupError.message);
    }

  } catch (error) {
    console.error('Ошибка регистрации клиента:', error);
    console.error('Детали ошибки:', error.message, error.code);
    
    let errorMessage = '😅 Упс! Что-то пошло не так при регистрации.';
    
    // Более информативное сообщение в зависимости от типа ошибки
    if (error.code === 8 || error.message.includes('Quota exceeded')) {
      errorMessage = '⏳ Сейчас слишком много запросов к базе данных. Пожалуйста, попробуй через 1-2 минуты. Мы работаем над решением!';
      console.error('⚠️ Превышен лимит Firebase Firestore. Нужно подождать.');
    } else if (error.code === 14 || error.message.includes('UNAVAILABLE')) {
      errorMessage = '🔌 База данных временно недоступна. Попробуй через минуту!';
    } else if (error.code === 3 || error.message.includes('INVALID_ARGUMENT')) {
      errorMessage = '❌ Ошибка в данных. Пожалуйста, убедись, что номер телефона указан правильно.';
    }
    
    try {
      await bot.sendMessage(chatId, errorMessage);
    } catch (sendError) {
      console.error('Ошибка отправки сообщения об ошибке:', sendError.message);
    }
  }
});

// Обработчик кнопки "Контакты"
bot.onText(/📞 Контакты|Контакты|контакты/, async (msg) => {
  const chatId = msg.chat.id;
  const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
  
  const contactsMessage = `
📞 Контакты VR Lounge

📍 Адрес: г. Кольчугино, ул. Зернова, д. 11

🕐 График работы:
   пн-пт: 15-20
   сб-вс: 12-21

📱 Связь с нами:
   Юлия: +7 (930) 224-45-51
   Даниил: +7 (993) 746-04-14

🌐 Мы в социальных сетях и на картах ⬇️:
  `;

  await bot.sendMessage(chatId, contactsMessage, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📍 Адрес на карте', url: 'https://yandex.ru/maps/org/vr_lounge_igrovoy_ray/5361992713' },
          { text: '⭐ Отзывы', url: 'https://yandex.ru/maps/org/vr_lounge_igrovoy_ray/5361992713/reviews/?ll' }
        ],
        [
          { text: '🔵 Мы ВКонтакте', url: 'https://vk.com/vr_lounge' }
        ],
        [
          { text: '💬 Telegram Юлии (@YulaAlex)', url: 'https://t.me/YulaAlex' }
        ],
        [
          { text: '💬 Telegram Даниила (@kylka_ment0)', url: 'https://t.me/kylka_ment0' }
        ],
        [
          { text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } }
        ]
      ]
    }
  });
});

// Обработчик кнопки "О клубе" / "О нас" / "Информация"
bot.onText(/ℹ️ О клубе|О клубе|о клубе|ℹ️ О нас|О нас|о нас|ℹ️ Информация|Информация|информация/, async (msg) => {
  const chatId = msg.chat.id;
  const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
  
  const infoMessage = `
🎮 VR Lounge - Игровой Рай

Мы - современный игровой клуб с широким выбором развлечений!

🎯 Наши услуги:
• VR очки (1-4 шт.)
• PS5 (1-2 джойстика)
• X-Box (1-4 джойстика)
• X-Box Kinnect (до 8 человек)
• Караоке
• Настольные игры
• Аренда всего помещения (День Рождения)
• Ведущая для мероприятий

💰 Стоимость:
• Будни: от 150 ₽/час
• Выходные: от 250 ₽/час
• День Рождения: от 3000 ₽/час

📍 Адрес: г. Кольчугино, ул. Зернова, д. 11

🕐 График работы:
   пн-пт: 15-20
   сб-вс: 12-21

Запишитесь на удобное время прямо здесь! 🎮
  `;

  await bot.sendMessage(chatId, infoMessage, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } },
          { text: '📞 Контакты', callback_data: 'show_contacts' }
        ],
        [
          { text: '📍 Адрес на карте', url: 'https://yandex.ru/maps/org/vr_lounge_igrovoy_ray/5361992713' },
          { text: '⭐ Отзывы', url: 'https://yandex.ru/maps/org/vr_lounge_igrovoy_ray/5361992713/reviews/?ll' }
        ],
        [
          { text: '🔵 Мы ВКонтакте', url: 'https://vk.com/vr_lounge' }
        ]
      ]
    }
  });
});

// Обработчик кнопки "Мои записи"
bot.onText(/📅 Мои записи|Мои записи|мои записи/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
  
  try {
    // Находим клиента по telegramId
    const clientsSnapshot = await db.collection('clients')
      .where('telegramId', '==', userId)
      .get();
    
    if (clientsSnapshot.empty) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы в базе клиентов.\n\nИспользуйте команду /register для регистрации.');
      return;
    }
    
    const client = clientsSnapshot.docs[0].data();
    const phoneDigits = client.phoneDigits;
    
    console.log(`📱 Поиск записей для клиента ${client.clientName || userId}:`);
    console.log(`   📞 phoneDigits из clients: ${phoneDigits}`);
    
    if (!phoneDigits) {
      await bot.sendMessage(chatId, '❌ У вас не указан номер телефона в базе. Пожалуйста, зарегистрируйтесь заново через /register');
      return;
    }
    
    // Пробуем несколько вариантов формата номера для поиска записей
    const phoneVariants = [];
    
    // Исходный номер
    phoneVariants.push(phoneDigits);
    
    // Если номер начинается с 7 или 8 и имеет 11 цифр, пробуем без первой цифры
    if (phoneDigits.length === 11) {
      if (phoneDigits.startsWith('7')) {
        phoneVariants.push(phoneDigits.substring(1));
      } else if (phoneDigits.startsWith('8')) {
        phoneVariants.push(phoneDigits.substring(1));
      }
    }
    
    // Если номер имеет 10 цифр, пробуем с 7 в начале
    if (phoneDigits.length === 10) {
      phoneVariants.push('7' + phoneDigits);
    }
    
    // Убираем дубликаты
    const uniqueVariants = [...new Set(phoneVariants)];
    console.log(`   🔍 Варианты номеров для поиска: ${uniqueVariants.join(', ')}`);
    
    // Находим все бронирования клиента по всем вариантам номера
    let allBookings = [];
    
    for (const variant of uniqueVariants) {
      try {
        const variantSnapshot = await db.collection('bookings')
          .where('phoneDigits', '==', variant)
          .limit(50)
          .get();
        
        if (!variantSnapshot.empty) {
          console.log(`   ✅ Найдено записей по номеру ${variant}: ${variantSnapshot.size}`);
          // Добавляем записи, избегая дубликатов
          variantSnapshot.docs.forEach(doc => {
            const bookingId = doc.id;
            if (!allBookings.find(b => b.id === bookingId)) {
              allBookings.push({
                id: bookingId,
                ...doc.data()
              });
            }
          });
        }
      } catch (queryError) {
        console.error(`   ❌ Ошибка поиска по варианту ${variant}:`, queryError.message);
        continue;
      }
    }
    
    console.log(`   📊 Всего найдено уникальных записей: ${allBookings.length}`);
    
    if (allBookings.length === 0) {
      await bot.sendMessage(chatId, '📅 У вас пока нет записей.\n\nЗапишитесь на удобное время прямо здесь! 🎮', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } }]
          ]
        }
      });
      return;
    }
    
    // Сортируем: сначала по дате (desc), затем по времени (desc)
    allBookings.sort((a, b) => {
      const dateA = new Date(a.bookingDate);
      const dateB = new Date(b.bookingDate);
      if (dateB.getTime() !== dateA.getTime()) {
        return dateB.getTime() - dateA.getTime();
      }
      // Если даты одинаковые, сортируем по времени
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      return timeB.localeCompare(timeA);
    });
    
    let bookingsMessage = `📅 Ваши записи:\n\n`;
    
    allBookings.slice(0, 10).forEach((booking, index) => {
      const date = new Date(booking.bookingDate);
      const formattedDate = date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        weekday: 'short'
      });
      
      const serviceNames = getServiceNames(booking.selectedServices || []);
      
      bookingsMessage += `${index + 1}. 📅 ${formattedDate}\n`;
      bookingsMessage += `   ⏰ ${booking.startTime || 'Не указано'} (${booking.duration || 0} ч)\n`;
      bookingsMessage += `   🎮 ${serviceNames || 'Не указано'}\n`;
      if (booking.notes) {
        bookingsMessage += `   📝 ${booking.notes}\n`;
      }
      bookingsMessage += `\n`;
    });
    
    bookingsMessage += `\nДля создания новой записи нажмите кнопку ниже:`;
    
    await bot.sendMessage(chatId, bookingsMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✨ Новая запись', web_app: { url: CLIENT_MINI_APP_URL } }],
          [{ text: '📞 Контакты', callback_data: 'show_contacts' }]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения записей клиента:', error);
    console.error('Детали ошибки:', {
      code: error.code,
      message: error.message,
      userId: userId
    });
    
    let errorMessage = '❌ Произошла ошибка при получении ваших записей.';
    
    // Более информативное сообщение в зависимости от типа ошибки
    if (error.code === 8 || error.message.includes('Quota exceeded')) {
      errorMessage = '⏳ Сейчас слишком много запросов к базе данных. Пожалуйста, попробуйте через 1-2 минуты.';
    } else if (error.code === 9 || error.message.includes('FAILED_PRECONDITION')) {
      errorMessage = '⚠️ Требуется создать индекс в Firebase. Обратитесь к администратору.';
      console.error('⚠️ Нужно создать индекс для запроса: bookings по phoneDigits и bookingDate');
    } else if (error.code === 14 || error.message.includes('UNAVAILABLE')) {
      errorMessage = '🔌 База данных временно недоступна. Попробуйте через минуту.';
    }
    
    await bot.sendMessage(chatId, errorMessage);
  }
});

// Обработчик callback для всех inline кнопок
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;
  const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
  
  // Обработка обновления списка клиентов
  if (data === 'refresh_clients') {
    await bot.answerCallbackQuery(query.id, { text: 'Обновление списка...' });
    // Вызываем обработчик напрямую
    const role = await getUserRole(userId);
    if (role === 'admin') {
      try {
        const clientsSnapshot = await db.collection('clients')
          .where('isActive', '==', true)
          .orderBy('clientName', 'asc')
          .limit(50)
          .get();
        
        if (clientsSnapshot.empty) {
          await bot.sendMessage(chatId, '📋 Клиентов в базе пока нет.');
          return;
        }
        
        let message = `👥 Список клиентов (всего: ${clientsSnapshot.size})\n\n`;
        
        clientsSnapshot.docs.forEach((doc, index) => {
          const client = doc.data();
          const name = client.clientName || 'Без имени';
          const phone = client.clientPhone || 'Нет телефона';
          const telegram = client.telegramId ? '✅ Telegram' : '❌ Нет Telegram';
          const bookingsCount = client.bookingsCount || 0;
          
          message += `${index + 1}. ${name}\n`;
          message += `   📞 ${phone}\n`;
          message += `   ${telegram} | Записей: ${bookingsCount}\n\n`;
          
          if (message.length > 3500) {
            message += `\n... и еще клиентов`;
            return;
          }
        });
        
        const totalClients = (await db.collection('clients')
          .where('isActive', '==', true)
          .get()).size;
        
        const clientsWithTelegram = (await db.collection('clients')
          .where('isActive', '==', true)
          .where('telegramId', '!=', null)
          .get()).size;
        
        message += `\n📊 Статистика:\n`;
        message += `• Всего активных: ${totalClients}\n`;
        message += `• С Telegram: ${clientsWithTelegram}\n`;
        message += `• Без Telegram: ${totalClients - clientsWithTelegram}`;
        
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Обновить список', callback_data: 'refresh_clients' }
              ]
            ]
          }
        });
      } catch (error) {
        console.error('Ошибка обновления списка клиентов:', error);
      }
    }
    return;
  }
  
  // Обработка обновления статистики
  if (data === 'refresh_stats') {
    await bot.answerCallbackQuery(query.id, { text: 'Обновление статистики...' });
    // Вызываем обработчик напрямую
    const role = await getUserRole(userId);
    if (role === 'admin') {
      try {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        
        const totalClients = (await db.collection('clients')
          .where('isActive', '==', true)
          .get()).size;
        
        const clientsWithTelegram = (await db.collection('clients')
          .where('isActive', '==', true)
          .where('telegramId', '!=', null)
          .get()).size;
        
        const todayBookings = await db.collection('bookings')
          .where('bookingDate', '==', todayStr)
          .get();
        
        const monthBookings = await db.collection('bookings')
          .where('bookingDate', '>=', startOfMonthStr)
          .get();
        
        let monthRevenue = 0;
        monthBookings.docs.forEach(doc => {
          const booking = doc.data();
          const total = booking.total || booking.bookingTotal || 0;
          monthRevenue += parseFloat(total) || 0;
        });
        
        let todayRevenue = 0;
        todayBookings.docs.forEach(doc => {
          const booking = doc.data();
          const total = booking.total || booking.bookingTotal || 0;
          todayRevenue += parseFloat(total) || 0;
        });
        
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        const upcomingBookings = await db.collection('bookings')
          .where('bookingDate', 'in', [todayStr, tomorrowStr])
          .orderBy('bookingDate', 'asc')
          .orderBy('startTime', 'asc')
          .limit(10)
          .get();
        
        let message = `📊 Статистика VR Lounge\n\n`;
        
        message += `👥 Клиенты:\n`;
        message += `• Всего активных: ${totalClients}\n`;
        message += `• С Telegram: ${clientsWithTelegram}\n`;
        message += `• Без Telegram: ${totalClients - clientsWithTelegram}\n\n`;
        
        message += `📅 Записи сегодня (${todayStr}):\n`;
        message += `• Всего: ${todayBookings.size}\n`;
        message += `• Выручка: ${todayRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽\n\n`;
        
        message += `📆 Записи за месяц:\n`;
        message += `• Всего: ${monthBookings.size}\n`;
        message += `• Выручка: ${monthRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽\n\n`;
        
        if (upcomingBookings.size > 0) {
          message += `⏰ Ближайшие записи:\n`;
          upcomingBookings.docs.slice(0, 5).forEach((doc, index) => {
            const booking = doc.data();
            const date = booking.bookingDate;
            const time = booking.startTime || '--:--';
            const client = booking.clientName || 'Без имени';
            message += `${index + 1}. ${date} ${time} - ${client}\n`;
          });
          if (upcomingBookings.size > 5) {
            message += `... и еще ${upcomingBookings.size - 5} записей\n`;
          }
        }
        
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Обновить', callback_data: 'refresh_stats' }
              ]
            ]
          }
        });
      } catch (error) {
        console.error('Ошибка обновления статистики:', error);
      }
    }
    return;
  }
  
  // Обработка отмены рассылки
  if (data === 'cancel_broadcast') {
    broadcastPendingState.delete(userId);
    await bot.answerCallbackQuery(query.id, { text: 'Рассылка отменена' });
    await bot.editMessageText('❌ Рассылка отменена.', {
      chat_id: chatId,
      message_id: query.message.message_id
    });
    return;
  }
  
  // Обработка подтверждения рассылки
  if (data.startsWith('confirm_broadcast:')) {
    await bot.answerCallbackQuery(query.id, { text: 'Отправка рассылки...' });
    
    const messageText = broadcastPendingState.get(userId);
    if (!messageText) {
      await bot.sendMessage(chatId, '❌ Сообщение для рассылки не найдено. Попробуйте начать заново.');
      return;
    }
    
    try {
      // Получаем активных клиентов с Telegram
      const clientsSnapshot = await db.collection('clients')
        .where('isActive', '==', true)
        .where('telegramId', '!=', null)
        .get();
      
      let successCount = 0;
      let failCount = 0;
      
      await bot.sendMessage(chatId, `📢 Начинаю рассылку ${clientsSnapshot.size} клиентам...`);
      
      // Отправляем сообщение каждому клиенту
      for (const clientDoc of clientsSnapshot.docs) {
        const client = clientDoc.data();
        if (client.telegramId) {
          try {
            await bot.sendMessage(client.telegramId, messageText);
            successCount++;
            
            // Небольшая задержка, чтобы не превышать лимиты Telegram API
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error) {
            console.error(`Ошибка отправки клиенту ${client.clientName}:`, error.message);
            failCount++;
          }
        }
      }
      
      broadcastPendingState.delete(userId);
      
      await bot.sendMessage(chatId, `✅ Рассылка завершена!

📊 Результаты:
• Отправлено успешно: ${successCount}
• Ошибок: ${failCount}
• Всего клиентов: ${clientsSnapshot.size}`);
      
    } catch (error) {
      console.error('Ошибка рассылки:', error);
      broadcastPendingState.delete(userId);
      await bot.sendMessage(chatId, '❌ Ошибка при рассылке. Попробуйте позже.');
    }
    return;
  }
  
  // Обработка кнопки "Контакты"
  if (data === 'show_contacts') {
    const contactsMessage = `
📞 Контакты VR Lounge

📍 Адрес: г. Кольчугино, ул. Зернова, д. 11

🕐 График работы:
   пн-пт: 15-20
   сб-вс: 12-21

📱 Связь с нами:
   Юлия: +7 (930) 224-45-51
   Даниил: +7 (993) 746-04-14

🌐 Мы в социальных сетях и на картах ⬇️:
    `;
    
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, contactsMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📍 Адрес на карте', url: 'https://yandex.ru/maps/org/vr_lounge_igrovoy_ray/5361992713' },
            { text: '⭐ Отзывы', url: 'https://yandex.ru/maps/org/vr_lounge_igrovoy_ray/5361992713/reviews/?ll' }
          ],
          [
            { text: '🔵 Мы ВКонтакте', url: 'https://vk.com/vr_lounge' }
          ],
          [
            { text: '💬 Telegram Юлии (@YulaAlex)', url: 'https://t.me/YulaAlex' }
          ],
          [
            { text: '💬 Telegram Даниила (@kylka_ment0)', url: 'https://t.me/kylka_ment0' }
          ],
          [
            { text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } }
          ]
        ]
      }
    });
  }
});

// Команда /newbooking - открыть Mini App для создания записи (только для админов)
// Работает как в личных чатах, так и в группах
bot.onText(/\/newbooking|\/запись|\/новая_запись/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  const MINI_APP_URL = process.env.MINI_APP_URL || 'https://vr-lounge.github.io/-/telegram-miniapp.html';

  console.log(`📨 Команда /newbooking от пользователя ${userId} (${msg.from.first_name || 'Unknown'}) в чате ${chatType} (chatId: ${chatId})`);

  // Проверяем роль пользователя
  const role = await getUserRole(userId);
  console.log(`👤 Определенная роль для пользователя ${userId}: ${role}`);
  
  if (role !== 'admin') {
    console.log(`❌ Доступ запрещен для пользователя ${userId}. Роль: ${role}`);
    
    // В группах отправляем ответ в личку, чтобы не засорять группу
    if (chatType !== 'private') {
      try {
        await bot.sendMessage(userId, '❌ Эта функция доступна только администраторам и руководителям.\n\nИспользуйте команду в личном чате с ботом или нажмите на кнопку ниже:', {
          reply_markup: {
            inline_keyboard: [
              [{
                text: '📝 Создать запись',
                web_app: { url: ADMIN_MINI_APP_URL }
              }]
            ]
          }
        });
      } catch (error) {
        // Если не можем отправить в личку, отправляем в группу
        await bot.sendMessage(chatId, `❌ Эта функция доступна только администраторам и руководителям.\n\nВаш Telegram ID: ${userId}\nПроверьте, что ваш telegramId добавлен в коллекцию managers или admins в Firebase.\n\nНапишите боту в личку: @vr_lounge_bot`, {
          reply_to_message_id: msg.message_id
        });
      }
    } else {
      await bot.sendMessage(chatId, `❌ Эта функция доступна только администраторам и руководителям.\n\nВаш Telegram ID: ${userId}\nПроверьте, что ваш telegramId добавлен в коллекцию managers или admins в Firebase.`);
    }
    return;
  }

  console.log(`✅ Доступ разрешен для пользователя ${userId}. Открываю Mini App...`);

  try {
    // В группах отправляем сообщение с кнопкой, которая работает для всех участников группы
    // В личных чатах тоже отправляем кнопку
    const messageText = chatType === 'private' 
      ? '📝 Нажмите на кнопку ниже, чтобы открыть форму создания записи:'
      : `📝 ${msg.from.first_name || 'Администратор'}, нажмите на кнопку ниже, чтобы открыть форму создания записи:`;

    // В группах не используем reply_to_message_id вместе с web_app (может вызывать ошибку 400)
    const messageOptions = {
      reply_markup: {
        inline_keyboard: [
          [{
            text: '📝 Создать запись клиента',
            web_app: { url: ADMIN_MINI_APP_URL }
          }]
        ]
      }
    };

    // Добавляем reply_to_message_id только если это не private чат
    // Но убираем его, так как это может вызывать ошибку 400 с web_app
    // if (chatType !== 'private') {
    //   messageOptions.reply_to_message_id = msg.message_id;
    // }

    await bot.sendMessage(chatId, messageText, messageOptions);
    
    console.log(`✅ Кнопка Mini App отправлена в чат ${chatType} (chatId: ${chatId})`);
  } catch (error) {
    console.error('Ошибка открытия Mini App:', error.message);
    console.error('Детали ошибки:', error);
    
    // Более детальная обработка ошибок
    let errorMessage = '❌ Не удалось открыть форму. ';
    
    if (error.response) {
      errorMessage += `Код ошибки: ${error.response.statusCode}. `;
      if (error.response.body) {
        console.error('Тело ответа ошибки:', JSON.stringify(error.response.body, null, 2));
      }
    }
    
    errorMessage += 'Попробуйте позже или напишите боту в личку: @vr_lounge_bot';
    
    await bot.sendMessage(chatId, errorMessage, {
      reply_to_message_id: chatType !== 'private' ? msg.message_id : undefined
    });
  }
});

// Команда /myid - узнать свой Telegram ID
bot.onText(/\/myid|\/id/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username ? `@${msg.from.username}` : 'не указан';
  const firstName = msg.from.first_name || 'Не указано';
  
  // Проверяем роль
  const role = await getUserRole(userId);
  
  const message = `
👤 Ваша информация:

🆔 Telegram ID: \`${userId}\`
👤 Имя: ${firstName}
📱 Username: ${username}
🔐 Роль: ${role === 'admin' ? '✅ Администратор/Руководитель' : role === 'client' ? '👤 Клиент' : '❌ Гость'}

${role !== 'admin' ? '\n⚠️ Если вы руководитель или администратор, проверьте:\n1. Ваш telegramId добавлен в коллекцию managers или admins в Firebase\n2. telegramId сохранен как строка (в кавычках)\n3. Поле isActive = true' : ''}
  `;
  
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const role = await getUserRole(userId);
  
  try {
    if (role === 'admin') {
      await bot.sendMessage(chatId, `
📖 Справка по боту VR Lounge (Администратор)

Доступные команды:
/start - Начать работу с ботом
/newbooking - Создать новую запись (открывает Mini App)
/register - Зарегистрировать клиента
/giftlink VRL-XXXXXX - отправить клиенту ссылку на подарочную карту
/help - Показать эту справку

Функции администратора:
• Создание записей через Mini App
• Просмотр статистики
• Управление клиентами
• Рассылки клиентам
• Уведомления о событиях в группе администраторов
• После activate карты — авто-доставка ссылки (или текст «отправь вручную»)

После регистрации клиентов они будут автоматически получать:
• Напоминания о предстоящих записях (за 1 день и за 3 часа)
• Информацию об изменениях в их записях
• Специальные предложения и новости
      `);
    } else if (role === 'client') {
      await bot.sendMessage(chatId, `
📖 Справка по боту VR Lounge

Доступные команды:
/start - Начать работу с ботом
/help - Показать эту справку

Вы будете автоматически получать:
• Напоминания о предстоящих записях (за 1 день и за 3 часа)
• Информацию об изменениях в ваших записях
• Приглашения и специальные предложения

Если у вас есть вопросы, свяжитесь с нами через администраторов.
      `);
    } else {
      await bot.sendMessage(chatId, `
📖 Справка по боту VR Lounge

Доступные команды:
/start - Начать работу с ботом
/register - Зарегистрироваться в базе клиентов
/help - Показать эту справку

После регистрации вы будете получать:
• Напоминания о ваших записях
• Информацию о предстоящих событиях
• Приглашения и специальные предложения

Если у вас есть вопросы, свяжитесь с нами через администраторов.
      `);
    }
  } catch (error) {
    console.error('Ошибка отправки сообщения /help:', error);
  }
});

// Обработка кнопки "Помощь" (текстовая кнопка)
bot.onText(/^Помощь$/i, async (msg) => {
  // Вызываем ту же логику, что и команда /help
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const role = await getUserRole(userId);
  
  try {
    if (role === 'admin') {
      await bot.sendMessage(chatId, `
📖 Справка по боту VR Lounge (Администратор)

Доступные команды:
/start - Начать работу с ботом
/newbooking - Создать новую запись (открывает Mini App)
/register - Зарегистрировать клиента
/giftlink VRL-XXXXXX - ссылка на подарочную карту клиенту
/help - Показать эту справку

Функции администратора:
• Создание записей через Mini App
• Просмотр статистики
• Управление клиентами
• Рассылки клиентам
• Уведомления о событиях в группе администраторов

После регистрации клиентов они будут автоматически получать:
• Напоминания о предстоящих записях (за 1 день и за 3 часа)
• Информацию об изменениях в их записях
• Специальные предложения и новости
      `);
    } else if (role === 'client') {
      await bot.sendMessage(chatId, `
📖 Справка по боту VR Lounge

Доступные команды:
/start - Начать работу с ботом
/help - Показать эту справку

Вы будете автоматически получать:
• Напоминания о предстоящих записях (за 1 день и за 3 часа)
• Информацию об изменениях в ваших записях
• Приглашения и специальные предложения

Если у вас есть вопросы, свяжитесь с нами через администраторов.
      `);
    } else {
      await bot.sendMessage(chatId, `
📖 Справка по боту VR Lounge

Доступные команды:
/start - Начать работу с ботом
/register - Зарегистрироваться в базе клиентов
/help - Показать эту справку

После регистрации вы будете получать:
• Напоминания о ваших записях
• Информацию о предстоящих событиях
• Приглашения и специальные предложения

Если у вас есть вопросы, свяжитесь с нами через администраторов.
      `);
    }
  } catch (error) {
    console.error('Ошибка отправки сообщения /help:', error);
  }
});

// ============================================
// АДМИНСКИЕ ФУНКЦИИ: КЛИЕНТЫ, СТАТИСТИКА, РАССЫЛКА
// ============================================

// Обработчик кнопки "👥 Клиенты"
bot.onText(/👥 Клиенты|Клиенты|клиенты/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, что пользователь - администратор
  const role = await getUserRole(userId);
  if (role !== 'admin') {
    await bot.sendMessage(chatId, '❌ Эта функция доступна только администраторам.');
    return;
  }
  
  try {
    console.log(`👥 Админ ${userId} запросил список клиентов`);
    
    // Получаем всех активных клиентов
    const clientsSnapshot = await db.collection('clients')
      .where('isActive', '==', true)
      .orderBy('clientName', 'asc')
      .limit(50) // Ограничиваем для первой страницы
      .get();
    
    if (clientsSnapshot.empty) {
      await bot.sendMessage(chatId, '📋 Клиентов в базе пока нет.');
      return;
    }
    
    let message = `👥 Список клиентов (всего: ${clientsSnapshot.size})\n\n`;
    
    // Формируем список клиентов
    clientsSnapshot.docs.forEach((doc, index) => {
      const client = doc.data();
      const name = client.clientName || 'Без имени';
      const phone = client.clientPhone || 'Нет телефона';
      const telegram = client.telegramId ? '✅ Telegram' : '❌ Нет Telegram';
      const bookingsCount = client.bookingsCount || 0;
      
      message += `${index + 1}. ${name}\n`;
      message += `   📞 ${phone}\n`;
      message += `   ${telegram} | Записей: ${bookingsCount}\n\n`;
      
      // Ограничиваем длину сообщения (Telegram лимит ~4096 символов)
      if (message.length > 3500) {
        message += `\n... и еще клиентов`;
        return;
      }
    });
    
    // Добавляем статистику
    const totalClients = (await db.collection('clients')
      .where('isActive', '==', true)
      .get()).size;
    
    const clientsWithTelegram = (await db.collection('clients')
      .where('isActive', '==', true)
      .where('telegramId', '!=', null)
      .get()).size;
    
    message += `\n📊 Статистика:\n`;
    message += `• Всего активных: ${totalClients}\n`;
    message += `• С Telegram: ${clientsWithTelegram}\n`;
    message += `• Без Telegram: ${totalClients - clientsWithTelegram}`;
    
    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Обновить список', callback_data: 'refresh_clients' }
          ]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения списка клиентов:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при получении списка клиентов. Попробуйте позже.');
  }
});

// Обработчик кнопки "📊 Статистика"
bot.onText(/📊 Статистика|Статистика|статистика/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, что пользователь - администратор
  const role = await getUserRole(userId);
  if (role !== 'admin') {
    await bot.sendMessage(chatId, '❌ Эта функция доступна только администраторам.');
    return;
  }
  
  try {
    console.log(`📊 Админ ${userId} запросил статистику`);
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
    
    // Статистика клиентов
    const totalClients = (await db.collection('clients')
      .where('isActive', '==', true)
      .get()).size;
    
    const clientsWithTelegram = (await db.collection('clients')
      .where('isActive', '==', true)
      .where('telegramId', '!=', null)
      .get()).size;
    
    // Статистика записей (сегодня)
    const todayBookings = await db.collection('bookings')
      .where('bookingDate', '==', todayStr)
      .get();
    
    // Статистика записей (этот месяц)
    const monthBookings = await db.collection('bookings')
      .where('bookingDate', '>=', startOfMonthStr)
      .get();
    
    // Подсчитываем выручку за месяц
    let monthRevenue = 0;
    monthBookings.docs.forEach(doc => {
      const booking = doc.data();
      const total = booking.total || booking.bookingTotal || 0;
      monthRevenue += parseFloat(total) || 0;
    });
    
    // Подсчитываем записей на сегодня
    let todayRevenue = 0;
    todayBookings.docs.forEach(doc => {
      const booking = doc.data();
      const total = booking.total || booking.bookingTotal || 0;
      todayRevenue += parseFloat(total) || 0;
    });
    
    // Ближайшие записи (сегодня и завтра)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const upcomingBookings = await db.collection('bookings')
      .where('bookingDate', 'in', [todayStr, tomorrowStr])
      .orderBy('bookingDate', 'asc')
      .orderBy('startTime', 'asc')
      .limit(10)
      .get();
    
    // Формируем сообщение
    let message = `📊 Статистика VR Lounge\n\n`;
    
    message += `👥 Клиенты:\n`;
    message += `• Всего активных: ${totalClients}\n`;
    message += `• С Telegram: ${clientsWithTelegram}\n`;
    message += `• Без Telegram: ${totalClients - clientsWithTelegram}\n\n`;
    
    message += `📅 Записи сегодня (${todayStr}):\n`;
    message += `• Всего: ${todayBookings.size}\n`;
    message += `• Выручка: ${todayRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽\n\n`;
    
    message += `📆 Записи за месяц:\n`;
    message += `• Всего: ${monthBookings.size}\n`;
    message += `• Выручка: ${monthRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽\n\n`;
    
    if (upcomingBookings.size > 0) {
      message += `⏰ Ближайшие записи:\n`;
      upcomingBookings.docs.slice(0, 5).forEach((doc, index) => {
        const booking = doc.data();
        const date = booking.bookingDate;
        const time = booking.startTime || '--:--';
        const client = booking.clientName || 'Без имени';
        message += `${index + 1}. ${date} ${time} - ${client}\n`;
      });
      if (upcomingBookings.size > 5) {
        message += `... и еще ${upcomingBookings.size - 5} записей\n`;
      }
    }
    
    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Обновить', callback_data: 'refresh_stats' }
          ]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при получении статистики. Попробуйте позже.');
  }
});

// Обработчик кнопки "📢 Рассылка"
bot.onText(/📢 Рассылка|Рассылка|рассылка/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, что пользователь - администратор
  const role = await getUserRole(userId);
  if (role !== 'admin') {
    await bot.sendMessage(chatId, '❌ Эта функция доступна только администраторам.');
    return;
  }
  
  try {
    console.log(`📢 Админ ${userId} начал рассылку`);
    
    // Проверяем количество активных клиентов с Telegram
    const clientsSnapshot = await db.collection('clients')
      .where('isActive', '==', true)
      .where('telegramId', '!=', null)
      .get();
    
    if (clientsSnapshot.empty) {
      await bot.sendMessage(chatId, '❌ Нет активных клиентов с Telegram для рассылки.');
      return;
    }
    
    // Отправляем инструкцию
    await bot.sendMessage(chatId, `📢 Рассылка сообщений клиентам

📊 Будет отправлено ${clientsSnapshot.size} активным клиентам с Telegram.

⚠️ Внимание: Отправьте сообщение, которое хотите разослать.

Напишите текст сообщения для рассылки:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ Отмена', callback_data: 'cancel_broadcast' }
          ]
        ]
      }
    });
    
    // Сохраняем состояние "ожидание сообщения для рассылки"
    // Используем временное хранилище (можно улучшить с Redis или базой данных)
    broadcastPendingState.set(userId, true);
    
  } catch (error) {
    console.error('Ошибка инициализации рассылки:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при инициализации рассылки.');
  }
});

// Хранилище для состояния рассылки (временное, в памяти)


// ============================================
// ФУНКЦИИ УВЕДОМЛЕНИЙ
// ============================================

// Функция отправки уведомления клиенту
async function sendNotificationToClient(clientId, message) {
  try {
    console.log(`   📤 Попытка отправить уведомление клиенту с ID: ${clientId}`);
    const clientDoc = await db.collection('clients').doc(clientId).get();
    if (!clientDoc.exists) {
      console.error(`   ❌ Клиент с ID ${clientId} не найден в базе данных`);
      return false;
    }

    const client = clientDoc.data();
    if (!client.telegramId) {
      console.error(`   ❌ У клиента ${client.clientName || clientId} нет telegramId`);
      return false;
    }

    console.log(`   📱 Отправка сообщения в Telegram ID: ${client.telegramId}`);
    await bot.sendMessage(client.telegramId, message);
    console.log(`   ✅ Сообщение успешно отправлено в Telegram ID: ${client.telegramId}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Ошибка отправки уведомления клиенту ${clientId}:`, error.message);
    console.error(`   📋 Код ошибки:`, error.code);
    
    // Специальная обработка ошибок Telegram API
    if (error.response) {
      console.error(`   📡 Статус ответа: ${error.response.statusCode}`);
      if (error.response.body) {
        console.error(`   📄 Тело ответа:`, JSON.stringify(error.response.body, null, 2));
      }
    }
    
    return false;
  }
}

// Функция отправки уведомления в группу администраторов
async function sendNotificationToAdmins(message) {
  try {
    console.log(`📤 Попытка отправить уведомление администраторам в группу ${ADMIN_GROUP_ID}`);
    console.log(`📝 Длина сообщения: ${message.length} символов`);
    await bot.sendMessage(ADMIN_GROUP_ID, message);
    console.log(`✅ Уведомление успешно отправлено администраторам в группу ${ADMIN_GROUP_ID}`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка отправки уведомления администраторам:', error);
    console.error(`📋 Код ошибки: ${error.code}`);
    console.error(`📋 Сообщение ошибки: ${error.message}`);
    if (error.response) {
      console.error(`📡 Статус ответа: ${error.response.statusCode}`);
      if (error.response.body) {
        console.error(`📄 Тело ответа:`, JSON.stringify(error.response.body, null, 2));
      }
    }
    return false;
  }
}

// Функция форматирования даты для уведомлений
function formatDateForNotification(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long'
  });
}

// Функция получения названий услуг
function getServiceNames(serviceKeys) {
  const serviceLabels = {
    weekday_ps1: 'PS5 (1 джойстик)',
    weekday_ps2: 'PS5 (2 джойстика)',
    weekday_vr1: 'VR очки (1 шт.) | Будни',
    weekday_vr2: 'VR очки (2 шт.) | Будни',
    weekday_vr3: 'VR очки (3 шт.) | Будни',
    weekday_vr4: 'VR очки (4 шт.) | Будни',
    weekend_vr1: 'VR очки (1 шт.) | Выходные',
    weekend_vr2: 'VR очки (2 шт.) | Выходные',
    weekend_vr3: 'VR очки (3 шт.) | Выходные',
    weekend_vr4: 'VR очки (4 шт.) | Выходные',
    xbox_kinnect: 'X-Box Kinnect (до 8 чел.)',
    xbox1: 'X-Box (1 джойстик)',
    xbox2: 'X-Box (2 джойстика)',
    xbox3: 'X-Box (3 джойстика)',
    xbox4: 'X-Box (4 джойстика)',
    karaoke: 'Караоке',
    board_games: 'Настольные игры',
    hostess: 'Ведущая',
    birthday: 'Аренда всего (День Рождения)'
  };
  
  return serviceKeys.map(key => serviceLabels[key] || key).join(', ');
}

// Функция расчета суммы бронирования
function calculateBookingTotal(booking) {
  const servicePrices = {
    // PS5
    weekday_ps1: 150,
    weekday_ps2: 300,
    // VR очки будни
    weekday_vr1: 500,
    weekday_vr2: 1000,
    weekday_vr3: 1500,
    weekday_vr4: 2000,
    // VR очки выходные
    weekend_vr1: 750,
    weekend_vr2: 1500,
    weekend_vr3: 2250,
    weekend_vr4: 3000,
    // X-Box
    xbox_kinnect: 500,
    xbox1: 250,
    xbox2: 500,
    xbox3: 750,
    xbox4: 1000,
    // Другие услуги
    karaoke: 1000,
    board_games: 500,
    hostess: 2000,
    // День рождения
    birthday: {
      1: 4000, 2: 3500, 3: 3000, 4: 3000, 5: 3000,
      6: 3000, 7: 3000, 8: 3000, 9: 3000, 10: 3000,
      11: 3000, 12: 3000
    }
  };

  let total = 0;
  const duration = booking.duration || 1;
  const selectedServices = booking.selectedServices || [];
  const bookingDate = new Date(booking.bookingDate);
  const isWeekendDay = bookingDate.getDay() === 0 || bookingDate.getDay() === 6;

  for (const serviceKey of selectedServices) {
    if (serviceKey === 'birthday') {
      // Расчет для Дня Рождения
      let birthdayTotal = 0;
      for (let hour = 1; hour <= duration; hour++) {
        const hourPrice = servicePrices.birthday[Math.min(hour, 12)] || 3000;
        birthdayTotal += hourPrice;
      }
      total += birthdayTotal;
    } else if (serviceKey === 'hostess') {
      // Ведущая - фиксированная стоимость
      total += servicePrices.hostess;
    } else if (servicePrices[serviceKey]) {
      // Остальные услуги - цена за час * длительность
      total += servicePrices[serviceKey] * duration;
    }
  }

  // Применяем скидку
  let finalTotal = total;
  if (booking.discountPercent > 0) {
    finalTotal = total * (1 - booking.discountPercent / 100);
  } else if (booking.discountAmount > 0) {
    finalTotal = Math.max(0, total - booking.discountAmount);
  }

  return {
    total: Math.round(total),
    finalTotal: Math.round(finalTotal)
  };
}

// Слушатель новых записей в Firestore
// ИСПРАВЛЕНО: Используем более эффективный подход - проверяем только новые записи по времени создания
function setupNewBookingListener() {
  console.log('🔔 Настройка слушателя новых записей...');
  
  let processedBookingIds = new Set();
  let lastCheckTime = admin.firestore.Timestamp.now();
  
  // Используем периодическую проверку вместо onSnapshot для экономии лимита
  // Проверяем каждые 30 секунд только новые записи (увеличен интервал для экономии лимита)
  const checkInterval = setInterval(async () => {
    try {
      const now = admin.firestore.Timestamp.now();
      const thirtySecondsAgo = admin.firestore.Timestamp.fromMillis(
        now.toMillis() - 30 * 1000
      );
      
      // Проверяем только записи, созданные после последней проверки
      // Используем только один where для избежания необходимости в индексе
      const bookingsSnapshot = await db.collection('bookings')
        .where('createdAt', '>=', lastCheckTime)
        .limit(10) // Ограничиваем до 10 записей за раз
        .get();
      
      if (bookingsSnapshot.empty) {
        // Нет новых записей
        return;
      }
      
      console.log(`🔍 Найдено новых записей: ${bookingsSnapshot.size}`);
      
      for (const doc of bookingsSnapshot.docs) {
        const booking = doc.data();
        const bookingId = doc.id;
        
        // Пропускаем, если уже обработали
        if (processedBookingIds.has(bookingId)) {
          continue;
        }
        
        // Проверяем, что запись создана недавно (за последние 30 секунд)
        const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
        const createdAtTimestamp = booking.createdAt || admin.firestore.Timestamp.fromDate(createdAt);
        
        if (createdAtTimestamp.toMillis() >= thirtySecondsAgo.toMillis()) {
          console.log(`📝 Новая запись обнаружена: ${bookingId}`);
          console.log('📅 Дата создания:', createdAt);
          
          // Помечаем как обработанную
          processedBookingIds.add(bookingId);
          
          // Очищаем старые ID (старше 1 часа)
          if (processedBookingIds.size > 100) {
            const oldestIds = Array.from(processedBookingIds).slice(0, 50);
            oldestIds.forEach(id => processedBookingIds.delete(id));
          }
          
          // Формируем уведомление для админов
          const formattedDate = formatDateForNotification(booking.bookingDate);
          const serviceNames = getServiceNames(booking.selectedServices || []);
          
          // Рассчитываем сумму бронирования
          const calculation = calculateBookingTotal(booking);
          
          let adminNotificationMessage = `📝 Новая запись клиента!\n\n`;
          adminNotificationMessage += `👤 Клиент: ${booking.clientName}\n`;
          adminNotificationMessage += `📞 Телефон: ${booking.clientPhone}\n`;
          adminNotificationMessage += `📅 Дата: ${formattedDate}\n`;
          adminNotificationMessage += `⏰ Время: ${booking.startTime}\n`;
          adminNotificationMessage += `⏱ Длительность: ${booking.duration} ч\n`;
          adminNotificationMessage += `🎮 Услуги: ${serviceNames}\n`;
          adminNotificationMessage += `\n💰 Финансы:\n`;
          adminNotificationMessage += `   Сумма: ${calculation.total.toLocaleString('ru-RU')} ₽\n`;
          
          // Добавляем информацию о скидке, если есть
          if (booking.discountPercent > 0 || booking.discountAmount > 0) {
            if (booking.discountPercent > 0) {
              adminNotificationMessage += `   Скидка: ${booking.discountPercent}%\n`;
            } else {
              adminNotificationMessage += `   Скидка: ${booking.discountAmount.toLocaleString('ru-RU')} ₽\n`;
            }
            adminNotificationMessage += `   Итоговая: ${calculation.finalTotal.toLocaleString('ru-RU')} ₽\n`;
          } else {
            adminNotificationMessage += `   Итоговая: ${calculation.finalTotal.toLocaleString('ru-RU')} ₽\n`;
          }
          
          // Добавляем информацию о предоплате, если есть
          if (booking.prepayment && booking.prepayment.amount > 0) {
            const method = booking.prepayment.method === 'cash' ? 'нал' : 'перевод';
            const prepayDate = booking.prepayment.date ? 
              ` от ${new Date(booking.prepayment.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
            adminNotificationMessage += `   Предоплата: ${booking.prepayment.amount.toLocaleString('ru-RU')} ₽ (${method})${prepayDate}\n`;
          }
          
          // Добавляем информацию о доплате наличными, если есть
          if (booking.finalPaymentCash && booking.finalPaymentCash.amount > 0) {
            const cashDate = booking.finalPaymentCash.date ? 
              ` от ${new Date(booking.finalPaymentCash.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
            adminNotificationMessage += `   Доплата нал: ${booking.finalPaymentCash.amount.toLocaleString('ru-RU')} ₽${cashDate}\n`;
          }
          
          // Добавляем информацию о доплате переводом, если есть
          if (booking.finalPaymentTransfer && booking.finalPaymentTransfer.amount > 0) {
            const transferDate = booking.finalPaymentTransfer.date ? 
              ` от ${new Date(booking.finalPaymentTransfer.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
            adminNotificationMessage += `   Доплата пер: ${booking.finalPaymentTransfer.amount.toLocaleString('ru-RU')} ₽${transferDate}\n`;
          }
          
          // Добавляем примечания, если есть
          if (booking.notes && booking.notes.trim()) {
            adminNotificationMessage += `\n📝 Примечания: ${booking.notes}\n`;
          }
          
          // Добавляем источник записи
          if (booking.source === 'client_miniapp') {
            adminNotificationMessage += `\n📱 Запись создана через бот @vr_lounge_bot . СВЯЗАТЬСЯ С КЛИЕНТОМ!`;
          } else if (booking.source === 'admin_miniapp') {
            adminNotificationMessage += `\n📱 Запись создана через админ-панель`;
          }
          
          // Отправляем уведомление админам
          try {
            await sendNotificationToAdmins(adminNotificationMessage);
            console.log('✅ Уведомление отправлено в админ группу');
          } catch (error) {
            console.error('❌ Ошибка отправки уведомления в админ группу:', error);
          }
          
          // Отправляем уведомление клиенту, если есть telegramId
          const phoneDigits = booking.phoneDigits || booking.clientPhone?.replace(/\D/g, '') || '';
          console.log(`📱 Попытка отправить уведомление клиенту ${booking.clientName}:`);
          console.log(`   📞 Номер из booking: ${booking.clientPhone}`);
          console.log(`   🔢 phoneDigits: ${phoneDigits}`);
          
          if (phoneDigits) {
            try {
              // Пробуем несколько вариантов формата номера
              const phoneVariants = [];
              
              // Исходный номер
              phoneVariants.push(phoneDigits);
              
              // Если номер начинается с 7 или 8 и имеет 11 цифр, пробуем без первой цифры
              if (phoneDigits.length === 11) {
                if (phoneDigits.startsWith('7')) {
                  phoneVariants.push(phoneDigits.substring(1));
                } else if (phoneDigits.startsWith('8')) {
                  phoneVariants.push(phoneDigits.substring(1));
                }
              }
              
              // Если номер имеет 10 цифр, пробуем с 7 в начале
              if (phoneDigits.length === 10) {
                phoneVariants.push('7' + phoneDigits);
              }
              
              // Убираем дубликаты
              const uniqueVariants = [...new Set(phoneVariants)];
              console.log(`   🔍 Варианты номеров для поиска: ${uniqueVariants.join(', ')}`);
              
              let clientsSnapshot = null;
              
              // Пробуем найти клиента по каждому варианту номера
              for (const variant of uniqueVariants) {
                try {
                  clientsSnapshot = await db.collection('clients')
                    .where('phoneDigits', '==', variant)
                    .limit(1)
                    .get();
                  
                  if (!clientsSnapshot.empty) {
                    console.log(`   ✅ Клиент найден по номеру: ${variant}`);
                    break;
                  }
                } catch (queryError) {
                  console.error(`   ❌ Ошибка поиска по варианту ${variant}:`, queryError.message);
                  continue;
                }
              }
              
              if (clientsSnapshot && !clientsSnapshot.empty) {
                const client = clientsSnapshot.docs[0].data();
                const clientId = clientsSnapshot.docs[0].id;
                console.log(`   👤 Клиент найден: ${client.clientName || 'Без имени'}`);
                console.log(`   🆔 Client ID: ${clientId}`);
                console.log(`   📱 Telegram ID: ${client.telegramId || 'НЕ УКАЗАН'}`);
                
                if (client.telegramId) {
                  const clientMessage = `✅ Ваша запись успешно создана!\n\n` +
                    `📅 Дата: ${formattedDate}\n` +
                    `⏰ Время: ${booking.startTime}\n` +
                    `⏱ Длительность: ${booking.duration} ч\n` +
                    `🎮 Услуги: ${serviceNames}\n\n` +
                    `Мы свяжемся с вами для подтверждения. Ждем вас! 🎮`;
                  
                  const sent = await sendNotificationToClient(clientId, clientMessage);
                  if (sent) {
                    console.log(`   ✅ Уведомление успешно отправлено клиенту ${booking.clientName} (Telegram ID: ${client.telegramId})`);
                  } else {
                    console.error(`   ❌ Не удалось отправить уведомление клиенту ${booking.clientName}`);
                  }
                } else {
                  console.warn(`   ⚠️ У клиента ${booking.clientName} нет telegramId. Уведомление не отправлено.`);
                  console.warn(`   💡 Клиент должен зарегистрироваться через бота командой /register`);
                }
              } else {
                console.warn(`   ⚠️ Клиент с номером ${booking.clientPhone} не найден в базе clients.`);
                console.warn(`   🔍 Проверенные варианты: ${uniqueVariants.join(', ')}`);
                console.warn(`   💡 Убедитесь, что клиент зарегистрирован через бота командой /register`);
              }
            } catch (error) {
              console.error('❌ Ошибка отправки уведомления клиенту:', error);
              console.error('   📋 Детали ошибки:', error.message);
              console.error('   🔢 Код ошибки:', error.code);
            }
          } else {
            console.warn(`   ⚠️ Не удалось извлечь номер телефона из booking для клиента ${booking.clientName}`);
            console.warn(`   📋 booking.phoneDigits: ${booking.phoneDigits}`);
            console.warn(`   📋 booking.clientPhone: ${booking.clientPhone}`);
          }
        }
      }
      
      // Обновляем время последней проверки
      lastCheckTime = now;
      
    } catch (error) {
      console.error('Ошибка проверки новых записей:', error);
      console.error('Детали ошибки:', error.message, error.code);
      
      // Если превышен лимит, увеличиваем интервал проверки до 60 секунд
      if (error.code === 8 || error.message.includes('Quota exceeded')) {
        console.warn('⚠️ Превышен лимит Firestore. Увеличиваем интервал проверки до 60 секунд.');
        clearInterval(checkInterval);
        setTimeout(() => {
          setupNewBookingListener();
        }, 60000);
      }
    }
  }, 30000); // Проверяем каждые 30 секунд (увеличен интервал для экономии лимита)
  
  console.log('✅ Слушатель новых записей настроен (периодическая проверка каждые 30 секунд)');
  
  // Возвращаем функцию для отмены интервала
  return () => clearInterval(checkInterval);
}

// Функция рассылки всем клиентам (только для админов)
async function broadcastToClients(message, adminUserId) {
  // Проверяем, что отправитель - админ
  const role = await getUserRole(adminUserId);
  if (role !== 'admin') {
    return { success: false, error: 'Только администраторы могут делать рассылки' };
  }

  try {
    const clientsSnapshot = await db.collection('clients')
      .where('isActive', '==', true)
      .get();

    let successCount = 0;
    let failCount = 0;

    for (const clientDoc of clientsSnapshot.docs) {
      const client = clientDoc.data();
      if (client.telegramId) {
        try {
          await bot.sendMessage(client.telegramId, message);
          successCount++;
        } catch (error) {
          console.error(`Ошибка отправки клиенту ${client.clientName}:`, error.message);
          failCount++;
        }
      } else {
        failCount++;
      }
    }

    return {
      success: true,
      total: clientsSnapshot.size,
      successCount,
      failCount
    };
  } catch (error) {
    console.error('Ошибка рассылки клиентам:', error);
    return { success: false, error: error.message };
  }
}

// Функция проверки предстоящих событий и отправки напоминаний
async function checkUpcomingEvents() {
  const startTime = Date.now();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔔 Запуск проверки предстоящих событий...');
  console.log(`📅 Время запуска: ${new Date().toISOString()}`);
  console.log(`🆔 Process ID: ${process.pid}`);
  
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // Сегодняшняя дата для проверки отправленных уведомлений
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`   📅 Сегодня: ${todayStr}`);
    console.log(`   📅 Завтра: ${tomorrowStr}`);
    console.log(`   🕐 Текущее время: ${now.toLocaleTimeString('ru-RU')}`);

    // Проверяем события на завтра (напоминание за 1 день)
    const tomorrowBookings = await db.collection('bookings')
      .where('bookingDate', '==', tomorrowStr)
      .get();

    console.log(`   📊 Найдено записей на завтра: ${tomorrowBookings.size}`);

    for (const bookingDoc of tomorrowBookings.docs) {
      const booking = bookingDoc.data();
      const bookingId = bookingDoc.id;
      const phoneDigits = booking.phoneDigits || booking.clientPhone?.replace(/\D/g, '') || '';
      
      if (!phoneDigits) {
        console.log(`   ⚠️ У записи ${bookingId} нет номера телефона, пропускаем`);
        continue;
      }

      console.log(`   📝 Обработка записи ${bookingId} (клиент: ${booking.clientName}, телефон: ${booking.clientPhone})`);

      // Проверяем, было ли уже отправлено уведомление за 1 день сегодня
      const reminderSent1Day = booking.reminderSent1Day;
      const reminderSent1DayDate = reminderSent1Day?.toDate ? reminderSent1Day.toDate() : 
                                   (reminderSent1Day ? new Date(reminderSent1Day) : null);
      
      if (reminderSent1DayDate) {
        const reminderDateStr = reminderSent1DayDate.toISOString().split('T')[0];
        if (reminderDateStr === todayStr) {
          console.log(`   ⏭️ Уведомление за 1 день уже отправлено сегодня для записи ${bookingId}`);
          continue; // Пропускаем, так как уведомление уже отправлено сегодня
        }
      }

      // Пробуем несколько вариантов формата номера для поиска клиента
      const phoneVariants = [];
      phoneVariants.push(phoneDigits);
      
      // Если номер начинается с 7 или 8 и имеет 11 цифр, пробуем без первой цифры
      if (phoneDigits.length === 11) {
        if (phoneDigits.startsWith('7')) {
          phoneVariants.push(phoneDigits.substring(1));
        } else if (phoneDigits.startsWith('8')) {
          phoneVariants.push(phoneDigits.substring(1));
        }
      }
      
      // Если номер имеет 10 цифр, пробуем с 7 в начале
      if (phoneDigits.length === 10) {
        phoneVariants.push('7' + phoneDigits);
      }
      
      // Убираем дубликаты
      const uniqueVariants = [...new Set(phoneVariants)];
      console.log(`   🔍 Варианты номеров для поиска клиента: ${uniqueVariants.join(', ')}`);

      // Находим клиента
      let clientsSnapshot = null;
      for (const variant of uniqueVariants) {
        try {
          clientsSnapshot = await db.collection('clients')
            .where('phoneDigits', '==', variant)
            .limit(1)
        .get();
          
          if (!clientsSnapshot.empty) {
            console.log(`   ✅ Клиент найден по номеру: ${variant}`);
            break;
          }
        } catch (queryError) {
          console.error(`   ❌ Ошибка поиска клиента по варианту ${variant}:`, queryError.message);
          continue;
        }
      }

      if (!clientsSnapshot.empty) {
        const client = clientsSnapshot.docs[0].data();
        if (client.telegramId) {
          const dateStr = new Date(booking.bookingDate).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            weekday: 'long'
          });

          const message = `
🔔 Напоминание о записи

У вас запланировано посещение VR Lounge:

📅 Дата: ${dateStr}
⏰ Время: ${booking.startTime}
⏱ Длительность: ${booking.duration} ч

${booking.notes ? `📝 Примечания: ${booking.notes}` : ''}

Ждем вас! 🎮
          `;

          await sendNotificationToClient(clientsSnapshot.docs[0].id, message);
        }
      }

      // Уведомляем администраторов о предстоящем событии (для всех записей)
      const dateStr = new Date(booking.bookingDate).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        weekday: 'long'
      });
      
      const serviceNames = getServiceNames(booking.selectedServices || []);
      const calculation = calculateBookingTotal(booking);
      
      let reminderMessage = '';
      if (booking.selectedServices?.includes('birthday')) {
        reminderMessage = `🎂 Напоминание: Завтра День Рождения!\n\n`;
      } else {
        reminderMessage = `🔔 Напоминание: Завтра запись клиента!\n\n`;
      }
      
      reminderMessage += `👤 Клиент: ${booking.clientName}\n`;
      reminderMessage += `📞 Телефон: ${booking.clientPhone}\n`;
      reminderMessage += `📅 Дата: ${dateStr}\n`;
      reminderMessage += `⏰ Время: ${booking.startTime}\n`;
      reminderMessage += `⏱ Длительность: ${booking.duration} ч\n`;
      reminderMessage += `🎮 Услуги: ${serviceNames}\n`;
      reminderMessage += `\n💰 Финансы:\n`;
      reminderMessage += `   Сумма: ${calculation.total.toLocaleString('ru-RU')} ₽\n`;
      
      // Добавляем информацию о скидке, если есть
      if (booking.discountPercent > 0 || booking.discountAmount > 0) {
        if (booking.discountPercent > 0) {
          reminderMessage += `   Скидка: ${booking.discountPercent}%\n`;
        } else {
          reminderMessage += `   Скидка: ${booking.discountAmount.toLocaleString('ru-RU')} ₽\n`;
        }
        reminderMessage += `   Итоговая: ${calculation.finalTotal.toLocaleString('ru-RU')} ₽\n`;
      } else {
        reminderMessage += `   Итоговая: ${calculation.finalTotal.toLocaleString('ru-RU')} ₽\n`;
      }
      
      // Добавляем информацию о предоплате, если есть
      if (booking.prepayment && booking.prepayment.amount > 0) {
        const method = booking.prepayment.method === 'cash' ? 'нал' : 'перевод';
        const prepayDate = booking.prepayment.date ? 
          ` от ${new Date(booking.prepayment.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
        reminderMessage += `   Предоплата: ${booking.prepayment.amount.toLocaleString('ru-RU')} ₽ (${method})${prepayDate}\n`;
      }
      
      // Добавляем информацию о доплате наличными, если есть
      if (booking.finalPaymentCash && booking.finalPaymentCash.amount > 0) {
        const cashDate = booking.finalPaymentCash.date ? 
          ` от ${new Date(booking.finalPaymentCash.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
        reminderMessage += `   Доплата нал: ${booking.finalPaymentCash.amount.toLocaleString('ru-RU')} ₽${cashDate}\n`;
      }
      
      // Добавляем информацию о доплате переводом, если есть
      if (booking.finalPaymentTransfer && booking.finalPaymentTransfer.amount > 0) {
        const transferDate = booking.finalPaymentTransfer.date ? 
          ` от ${new Date(booking.finalPaymentTransfer.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
        reminderMessage += `   Доплата пер: ${booking.finalPaymentTransfer.amount.toLocaleString('ru-RU')} ₽${transferDate}\n`;
      }
      
      // Добавляем примечания, если есть
      if (booking.notes && booking.notes.trim()) {
        reminderMessage += `\n📝 Примечания: ${booking.notes}\n`;
      }
      
      reminderMessage += `\nПожалуйста, подготовьтесь к мероприятию!`;
      
      // Отправляем уведомление администраторам (для всех записей, даже если клиент не найден)
      try {
      await sendNotificationToAdmins(reminderMessage);
        console.log(`   ✅ Уведомление администраторам за 1 день отправлено для записи ${bookingId}`);
      } catch (adminError) {
        console.error(`   ❌ Ошибка отправки уведомления администраторам за 1 день:`, adminError.message);
        console.error(`   📋 Детали ошибки:`, adminError);
      }
      
      // Сохраняем timestamp отправки уведомления за 1 день
      try {
        await bookingDoc.ref.update({
          reminderSent1Day: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`   ✅ Timestamp уведомления за 1 день сохранен для записи ${bookingId}`);
      } catch (updateError) {
        console.error(`   ❌ Ошибка сохранения timestamp уведомления за 1 день:`, updateError.message);
      }
    }

    // Проверяем события через 3 часа (напоминание за 3 часа)
    // Вычисляем целевое время (текущее время + 3 часа)
    const threeHoursLater = new Date(now);
    threeHoursLater.setHours(threeHoursLater.getHours() + 3);
    const timeWindowStart = new Date(threeHoursLater.getTime() - 5 * 60 * 1000); // 5 минут до
    const timeWindowEnd = new Date(threeHoursLater.getTime() + 5 * 60 * 1000); // 5 минут после

    console.log(`   ⏰ Проверка записей через 3 часа от текущего времени`);
    console.log(`   📅 Текущее время: ${now.toISOString()}`);
    console.log(`   🎯 Целевое время (текущее + 3 часа): ${threeHoursLater.toISOString()}`);
    console.log(`   ⏱ Окно времени: ${timeWindowStart.toISOString()} - ${timeWindowEnd.toISOString()}`);

    // Получаем все записи на сегодня и завтра (чтобы не пропустить события)
    // Используем уже объявленные переменные todayStr и tomorrowStr

    // Получаем записи на сегодня
    const todayBookingsSnapshot = await db.collection('bookings')
      .where('bookingDate', '==', todayStr)
      .get();

    // Получаем записи на завтра
    const tomorrowBookingsSnapshot = await db.collection('bookings')
      .where('bookingDate', '==', tomorrowStr)
      .get();

    console.log(`   📊 Найдено записей на сегодня (${todayStr}): ${todayBookingsSnapshot.size}`);
    console.log(`   📊 Найдено записей на завтра (${tomorrowStr}): ${tomorrowBookingsSnapshot.size}`);

    // Объединяем все записи
    const allBookingsSnapshot = [...todayBookingsSnapshot.docs, ...tomorrowBookingsSnapshot.docs];

    // Фильтруем записи по времени в коде
    const threeHoursBookings = [];
    for (const bookingDoc of allBookingsSnapshot) {
      const booking = bookingDoc.data();
      const bookingId = bookingDoc.id;
      
      if (!booking.startTime) {
        console.log(`   ⚠️ У записи ${bookingId} нет startTime, пропускаем`);
        continue;
      }
      
      // Парсим время из записи (может быть в формате "HH:MM" или "HH:MM:SS")
      const bookingTimeParts = booking.startTime.split(':');
      const bookingHour = parseInt(bookingTimeParts[0], 10);
      const bookingMinute = parseInt(bookingTimeParts[1], 10);
      
      if (isNaN(bookingHour) || isNaN(bookingMinute)) {
        console.log(`   ⚠️ Не удалось распарсить время ${booking.startTime} для записи ${bookingId}, пропускаем`);
        continue;
      }
      
      // Создаем объект Date для времени начала события
      const bookingDateStr = booking.bookingDate; // Формат: "YYYY-MM-DD"
      const bookingDateTime = new Date(bookingDateStr + 'T' + 
        String(bookingHour).padStart(2, '0') + ':' + 
        String(bookingMinute).padStart(2, '0') + ':00');
      
      // Проверяем, попадает ли время начала события в окно ±5 минут от "текущее + 3 часа"
      if (bookingDateTime >= timeWindowStart && bookingDateTime <= timeWindowEnd) {
        threeHoursBookings.push({ doc: bookingDoc, data: booking, id: bookingId });
        console.log(`   ✅ Запись ${bookingId} (${booking.clientName}) попадает в окно времени: ${booking.bookingDate} ${booking.startTime}`);
      } else {
        const timeDiff = (bookingDateTime.getTime() - threeHoursLater.getTime()) / (1000 * 60); // разница в минутах
        if (Math.abs(timeDiff) < 30) { // Логируем только если разница меньше 30 минут
          console.log(`   ⏭️ Запись ${bookingId} (${booking.clientName}) не попадает в окно: ${booking.bookingDate} ${booking.startTime} (разница: ${timeDiff.toFixed(0)} мин)`);
        }
      }
    }

    console.log(`   📊 Отфильтровано записей через 3 часа: ${threeHoursBookings.length}`);

    for (const { doc: bookingDoc, data: booking, id: bookingId } of threeHoursBookings) {
      const phoneDigits = booking.phoneDigits || booking.clientPhone?.replace(/\D/g, '') || '';
      
      if (!phoneDigits) {
        console.log(`   ⚠️ У записи ${bookingId} нет номера телефона, пропускаем`);
        continue;
      }

      // Проверяем, было ли уже отправлено уведомление за 3 часа
      const reminderSent3Hours = booking.reminderSent3Hours;
      const reminderSent3HoursDate = reminderSent3Hours?.toDate ? reminderSent3Hours.toDate() : 
                                      (reminderSent3Hours ? new Date(reminderSent3Hours) : null);
      
      if (reminderSent3HoursDate) {
        // Проверяем, было ли отправлено в течение последних 3 часов
        const timeDiff = now.getTime() - reminderSent3HoursDate.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        if (hoursDiff < 3) {
          console.log(`   ⏭️ Уведомление за 3 часа уже отправлено недавно (${hoursDiff.toFixed(1)} ч назад) для записи ${bookingId}`);
          continue; // Пропускаем, так как уведомление уже отправлено недавно
        }
      }

      console.log(`   📝 Обработка записи за 3 часа ${bookingId} (клиент: ${booking.clientName})`);

      // Формируем уведомление для администраторов
      const dateStr = new Date(booking.bookingDate).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        weekday: 'long'
      });
      
      const serviceNames = getServiceNames(booking.selectedServices || []);
      const calculation = calculateBookingTotal(booking);
      
      let adminReminderMessage = `⏰ Напоминание: Через 3 часа запись клиента!\n\n`;
      adminReminderMessage += `👤 Клиент: ${booking.clientName}\n`;
      adminReminderMessage += `📞 Телефон: ${booking.clientPhone}\n`;
      adminReminderMessage += `📅 Дата: ${dateStr}\n`;
      adminReminderMessage += `⏰ Время: ${booking.startTime}\n`;
      adminReminderMessage += `⏱ Длительность: ${booking.duration} ч\n`;
      adminReminderMessage += `🎮 Услуги: ${serviceNames}\n`;
      adminReminderMessage += `\n💰 Финансы:\n`;
      adminReminderMessage += `   Сумма: ${calculation.total.toLocaleString('ru-RU')} ₽\n`;
      
      // Добавляем информацию о скидке, если есть
      if (booking.discountPercent > 0 || booking.discountAmount > 0) {
        if (booking.discountPercent > 0) {
          adminReminderMessage += `   Скидка: ${booking.discountPercent}%\n`;
        } else {
          adminReminderMessage += `   Скидка: ${booking.discountAmount.toLocaleString('ru-RU')} ₽\n`;
        }
        adminReminderMessage += `   Итоговая: ${calculation.finalTotal.toLocaleString('ru-RU')} ₽\n`;
      } else {
        adminReminderMessage += `   Итоговая: ${calculation.finalTotal.toLocaleString('ru-RU')} ₽\n`;
      }
      
      // Добавляем информацию о предоплате, если есть
      if (booking.prepayment && booking.prepayment.amount > 0) {
        const method = booking.prepayment.method === 'cash' ? 'нал' : 'перевод';
        const prepayDate = booking.prepayment.date ? 
          ` от ${new Date(booking.prepayment.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
        adminReminderMessage += `   Предоплата: ${booking.prepayment.amount.toLocaleString('ru-RU')} ₽ (${method})${prepayDate}\n`;
      }
      
      // Добавляем информацию о доплате наличными, если есть
      if (booking.finalPaymentCash && booking.finalPaymentCash.amount > 0) {
        const cashDate = booking.finalPaymentCash.date ? 
          ` от ${new Date(booking.finalPaymentCash.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
        adminReminderMessage += `   Доплата нал: ${booking.finalPaymentCash.amount.toLocaleString('ru-RU')} ₽${cashDate}\n`;
      }
      
      // Добавляем информацию о доплате переводом, если есть
      if (booking.finalPaymentTransfer && booking.finalPaymentTransfer.amount > 0) {
        const transferDate = booking.finalPaymentTransfer.date ? 
          ` от ${new Date(booking.finalPaymentTransfer.date).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}` : '';
        adminReminderMessage += `   Доплата пер: ${booking.finalPaymentTransfer.amount.toLocaleString('ru-RU')} ₽${transferDate}\n`;
      }
      
      // Добавляем примечания, если есть
      if (booking.notes && booking.notes.trim()) {
        adminReminderMessage += `\n📝 Примечания: ${booking.notes}\n`;
      }
      
      adminReminderMessage += `\nПожалуйста, подготовьтесь к мероприятию!`;
      
      // Отправляем уведомление администраторам
      try {
        await sendNotificationToAdmins(adminReminderMessage);
        console.log(`   ✅ Уведомление администраторам за 3 часа отправлено для записи ${bookingId}`);
      } catch (adminError) {
        console.error(`   ❌ Ошибка отправки уведомления администраторам за 3 часа:`, adminError.message);
      }

      // Отправляем уведомление клиенту
      const clientsSnapshot = await db.collection('clients')
        .where('phoneDigits', '==', phoneDigits)
        .get();

      if (!clientsSnapshot.empty) {
        const client = clientsSnapshot.docs[0].data();
        if (client.telegramId) {
          await sendNotificationToClient(clientsSnapshot.docs[0].id, `
⏰ Напоминание: До вашей записи осталось 3 часа!

Ждем вас в ${booking.startTime} 🎮
          `);
          console.log(`   ✅ Уведомление клиенту за 3 часа отправлено для записи ${bookingId}`);
        } else {
          console.log(`   ⚠️ У клиента ${booking.clientName} нет telegramId, уведомление клиенту не отправлено`);
        }
      } else {
        console.log(`   ⚠️ Клиент с номером ${booking.clientPhone} не найден в базе clients`);
      }
          
          // Сохраняем timestamp отправки уведомления за 3 часа
          try {
            await bookingDoc.ref.update({
              reminderSent3Hours: admin.firestore.FieldValue.serverTimestamp()
            });
        console.log(`   ✅ Timestamp уведомления за 3 часа сохранен для записи ${bookingId}`);
          } catch (updateError) {
            console.error(`   ❌ Ошибка сохранения timestamp уведомления за 3 часа:`, updateError.message);
      }
    }

  } catch (error) {
    console.error('❌ Ошибка проверки предстоящих событий:', error);
    console.error(`📋 Код ошибки: ${error.code}`);
    console.error(`📋 Сообщение ошибки: ${error.message}`);
    console.error(`📋 Стек ошибки:`, error.stack);
  } finally {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`✅ Проверка предстоящих событий завершена за ${duration} сек`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  }
}

// Запускаем проверку каждые 30 минут
setInterval(checkUpcomingEvents, 30 * 60 * 1000);

// Проверяем сразу при запуске
checkUpcomingEvents();

// Настраиваем слушатель новых записей
setupNewBookingListener();

const GIFT_PUBLIC_BASE = 'https://vr-lounge.github.io/vr-lounge-redesign/gift.html';

function giftCardClientUrl(publicCode) {
  return `${GIFT_PUBLIC_BASE}?code=${encodeURIComponent(publicCode || '')}`;
}

function giftDeepLinkForAdmin(publicCode) {
  // Deep link в бота: админ шлёт /giftlink CODE себе или пересылает
  return `https://t.me/vr_lounge33_bot?start=gift_${encodeURIComponent(publicCode || '')}`;
}

function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set([digits]);
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    variants.add(digits.slice(1));
    variants.add('7' + digits.slice(1));
    variants.add('8' + digits.slice(1));
  }
  if (digits.length === 10) {
    variants.add('7' + digits);
    variants.add('8' + digits);
  }
  return Array.from(variants);
}

async function findClientTelegramByPhone(phone) {
  const variants = normalizePhoneDigits(phone);
  for (const variant of variants) {
    try {
      const snap = await db.collection('clients')
        .where('phoneDigits', '==', variant)
        .limit(1)
        .get();
      if (!snap.empty) {
        const client = snap.docs[0].data();
        if (client.telegramId) {
          return {
            telegramId: String(client.telegramId),
            clientName: client.clientName || '',
            clientId: snap.docs[0].id,
          };
        }
      }
    } catch (err) {
      console.warn('findClientTelegramByPhone:', err.message || err);
    }
  }
  return null;
}

function buildGiftClientMessage(card) {
  const code = card.publicCode || '—';
  const link = giftCardClientUrl(code);
  const face = Number(card.faceValue || 0).toLocaleString('ru-RU');
  const balance = Number(card.balance != null ? card.balance : card.faceValue || 0).toLocaleString('ru-RU');
  const name = card.recipientName || 'гостю';
  return (
    `🎁 Ваша подарочная карта VR Lounge готова!\n\n` +
    `🔖 Код: ${code}\n` +
    `👤 Для: ${name}\n` +
    `💰 Номинал: ${face} ₽ · баланс ${balance} ₽\n\n` +
    `Откройте персональную страницу (карта переворачивается, баланс и история):\n${link}\n\n` +
    `Запись: 8 930 224-45-51 · @vr_lounge33_bot`
  );
}

async function deliverGiftCardLink(card, cardId, opts = {}) {
  const code = card.publicCode || '';
  const link = giftCardClientUrl(code);
  const clientMsg = buildGiftClientMessage(card);
  const phone = card.buyerPhone || card.buyerPhoneDigits || '';
  let deliveredTo = null;

  // 1) Явный telegram id на карте (если когда-нибудь проставят)
  if (card.buyerTelegramId) {
    try {
      await bot.sendMessage(String(card.buyerTelegramId), clientMsg, {
        disable_web_page_preview: false,
      });
      deliveredTo = String(card.buyerTelegramId);
    } catch (err) {
      console.warn('gift deliver buyerTelegramId failed:', err.message || err);
    }
  }

  // 2) Клиент в CRM по телефону покупателя
  if (!deliveredTo && phone) {
    const found = await findClientTelegramByPhone(phone);
    if (found?.telegramId) {
      try {
        await bot.sendMessage(found.telegramId, clientMsg, {
          disable_web_page_preview: false,
        });
        deliveredTo = found.telegramId;
      } catch (err) {
        console.warn('gift deliver client telegram failed:', err.message || err);
      }
    }
  }

  if (deliveredTo) {
    try {
      await db.collection('giftCards').doc(cardId).update({
        deliveryNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        deliveryChannel: 'telegram',
        deliveryTelegramId: deliveredTo,
      });
    } catch (err) {
      console.warn('gift delivery flag update failed:', err.message || err);
    }
    if (!opts.silentAdmin) {
      await sendNotificationToAdmins(
        `✅ Ссылка на карту ${code} отправлена клиенту в Telegram.\n🔗 ${link}`
      );
    }
    return { ok: true, deliveredTo, link };
  }

  // 3) Нет chat id — админу текст «отправь ссылку» + deep link
  const adminMsg =
    `🎁 Карта ${code} активирована, но Telegram покупателя не найден.\n\n` +
    `📞 Телефон: ${phone || '—'}\n` +
    `👤 Получатель: ${card.recipientName || '—'}\n\n` +
    `Отправьте клиенту ссылку вручную:\n${link}\n\n` +
    `Или команда боту: /giftlink ${code}\n` +
    `Deep link: ${giftDeepLinkForAdmin(code)}`;
  await sendNotificationToAdmins(adminMsg);
  try {
    await db.collection('giftCards').doc(cardId).update({
      deliveryNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      deliveryChannel: 'admin_manual',
    });
  } catch (err) {
    console.warn('gift delivery admin flag failed:', err.message || err);
  }
  return { ok: false, deliveredTo: null, link };
}

// Слушатель заявок на подарочные карты (тот же ADMIN_GROUP_ID)
function setupNewGiftCardListener() {
  console.log('🎁 Настройка слушателя подарочных карт...');
  let processedGiftIds = new Set();
  let lastGiftCheckTime = admin.firestore.Timestamp.now();

  setInterval(async () => {
    try {
      const now = admin.firestore.Timestamp.now();
      const thirtySecondsAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 30 * 1000);
      const giftSnapshot = await db.collection('giftCards')
        .where('createdAt', '>=', lastGiftCheckTime)
        .limit(10)
        .get();

      if (giftSnapshot.empty) {
        lastGiftCheckTime = now;
        return;
      }

      for (const docSnap of giftSnapshot.docs) {
        const card = docSnap.data();
        const cardId = docSnap.id;
        if (processedGiftIds.has(cardId)) continue;

        const createdAt = card.createdAt?.toDate ? card.createdAt.toDate() : new Date(card.createdAt);
        const createdAtTimestamp = card.createdAt || admin.firestore.Timestamp.fromDate(createdAt);
        if (createdAtTimestamp.toMillis() < thirtySecondsAgo.toMillis()) continue;

        processedGiftIds.add(cardId);
        if (processedGiftIds.size > 100) {
          Array.from(processedGiftIds).slice(0, 50).forEach((id) => processedGiftIds.delete(id));
        }

        const face = Number(card.faceValue || 0).toLocaleString('ru-RU');
        const link = giftCardClientUrl(card.publicCode);
        let message = `🎁 Новая заявка на подарочную карту!\n\n`;
        message += `🔖 Код: ${card.publicCode || '—'}\n`;
        message += `👤 Получатель: ${card.recipientName || '—'}\n`;
        message += `📞 Телефон: ${card.buyerPhone || '—'}\n`;
        message += `💰 Номинал: ${face} ₽\n`;
        message += `📊 Статус: ${card.status || '—'}\n`;
        message += `🛎 Источник: ${card.createdBy || card.source || '—'}\n`;
        message += `\n🔗 Страница карты: ${link}`;
        message += `\n➡️ CRM → «Подарочные карты» → после оплаты «Оплачено / активировать».`;

        try {
          await sendNotificationToAdmins(message);
          console.log(`✅ Уведомление о giftCards/${cardId} отправлено`);
        } catch (notifyErr) {
          console.error('❌ Ошибка уведомления gift card:', notifyErr);
        }
      }

      lastGiftCheckTime = now;
    } catch (error) {
      // Коллекция может отсутствовать до первого create / rules deploy
      if (error.code !== 9 && !String(error.message || '').includes('FAILED_PRECONDITION')) {
        console.error('❌ Ошибка слушателя giftCards:', error.message || error);
      }
    }
  }, 30000);
}

// После activate (issued): доставка ссылки клиенту через @vr_lounge33_bot
function setupGiftCardDeliveryListener() {
  console.log('🎁 Настройка доставки ссылок подарочных карт...');
  let processedDelivery = new Set();

  setInterval(async () => {
    try {
      const windowStart = admin.firestore.Timestamp.fromMillis(Date.now() - 6 * 60 * 60 * 1000);
      let snap;
      try {
        snap = await db.collection('giftCards')
          .where('status', 'in', ['issued', 'partial'])
          .where('issuedAt', '>=', windowStart)
          .limit(15)
          .get();
      } catch (indexErr) {
        // Без составного индекса — fallback: недавние issued без deliveryNotifiedAt через status
        snap = await db.collection('giftCards')
          .where('status', '==', 'issued')
          .limit(20)
          .get();
      }

      const cutoffMs = Date.now() - 6 * 60 * 60 * 1000;
      for (const docSnap of snap.docs) {
        const card = docSnap.data();
        const cardId = docSnap.id;
        if (card.deliveryNotifiedAt) continue;
        if (!card.publicCode) continue;
        if (processedDelivery.has(cardId)) continue;
        // Только реально активированные (есть paid/issued timestamp)
        const issuedMs = card.issuedAt?.toMillis
          ? card.issuedAt.toMillis()
          : card.paidAt?.toMillis
            ? card.paidAt.toMillis()
            : (card.issuedAt || card.paidAt)
              ? new Date(card.issuedAt || card.paidAt).getTime()
              : 0;
        if (!issuedMs || issuedMs < cutoffMs) continue;

        processedDelivery.add(cardId);
        if (processedDelivery.size > 120) {
          Array.from(processedDelivery).slice(0, 60).forEach((id) => processedDelivery.delete(id));
        }

        try {
          const result = await deliverGiftCardLink(card, cardId);
          console.log(
            `🎁 Delivery ${card.publicCode}:`,
            result.ok ? `sent to ${result.deliveredTo}` : 'admin manual'
          );
        } catch (err) {
          console.error('❌ gift delivery error:', err.message || err);
          processedDelivery.delete(cardId);
        }
      }
    } catch (error) {
      if (error.code !== 9 && !String(error.message || '').includes('FAILED_PRECONDITION')) {
        console.error('❌ Ошибка delivery giftCards:', error.message || error);
      }
    }
  }, 30000);
}

// Админ: /giftlink VRL-XXXXXX — повторно отправить / показать ссылку
bot.onText(/\/giftlink(?:\s+|_)?([A-Za-z0-9\-]+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const role = await getUserRole(userId);
  if (role !== 'admin') {
    await bot.sendMessage(chatId, '❌ Команда только для администраторов.\nИспользование: /giftlink VRL-XXXXXX');
    return;
  }
  const code = String(match[1] || '').trim().toUpperCase();
  if (!code) {
    await bot.sendMessage(
      chatId,
      'Использование: /giftlink VRL-XXXXXX\nОтправит ссылку клиенту (если известен Telegram) или вернёт текст для ручной отправки.'
    );
    return;
  }
  try {
    const snap = await db.collection('giftCards')
      .where('publicCode', '==', code)
      .limit(1)
      .get();
    if (snap.empty) {
      await bot.sendMessage(chatId, `Карта ${code} не найдена.`);
      return;
    }
    const docSnap = snap.docs[0];
    const card = docSnap.data();
    // Сброс флага, чтобы команда могла повторить доставку
    try {
      await docSnap.ref.update({
        deliveryNotifiedAt: admin.firestore.FieldValue.delete(),
        deliveryChannel: admin.firestore.FieldValue.delete(),
        deliveryTelegramId: admin.firestore.FieldValue.delete(),
      });
    } catch (_) { /* ignore */ }
    const result = await deliverGiftCardLink({ ...card, deliveryNotifiedAt: null }, docSnap.id, {
      silentAdmin: true,
    });
    if (result.ok) {
      await bot.sendMessage(chatId, `✅ Ссылка отправлена клиенту.\n${result.link}`);
    } else {
      await bot.sendMessage(
        chatId,
        `Telegram покупателя не найден — отправьте вручную:\n${result.link}`
      );
    }
  } catch (err) {
    console.error('/giftlink error:', err);
    await bot.sendMessage(chatId, 'Ошибка: ' + (err.message || err));
  }
});

setupNewGiftCardListener();
setupGiftCardDeliveryListener();

bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.message);
  console.error('📋 Код ошибки:', error.code);
  console.error('🔍 Полная ошибка:', JSON.stringify(error, null, 2));
  
  // Если это ошибка 409 (конфликт - другой экземпляр бота запущен)
  if (error.code === 'ETELEGRAM' && (error.message.includes('409') || error.message.includes('Conflict'))) {
    console.error('');
    console.error('⚠️═══════════════════════════════════════════════════════════⚠️');
    console.error('⚠️ КРИТИЧЕСКАЯ ОШИБКА: Обнаружен конфликт с другим экземпляром бота!');
    console.error('⚠️═══════════════════════════════════════════════════════════⚠️');
    console.error('');
    console.error('🔍 Возможные причины:');
    console.error('   1. Запущено несколько инстансов одного бота одновременно');
    console.error('   2. Бот запущен локально и одновременно на сервере');
    console.error('   3. Произошел рестарт без корректной остановки предыдущего экземпляра');
    console.error('   4. Дублирующийся деплой на хостинге');
    console.error('');
    console.error('✅ Рекомендуемые действия:');
    console.error('   1. Убедитесь, что запущен только ОДИН экземпляр бота');
    console.error('   2. Остановите все локальные экземпляры, если они запущены');
    console.error('   3. Проверьте хостинг на наличие дублирующихся деплоев');
    console.error('   4. Перезапустите сервис');
    console.error('');
    console.error('📊 Текущий процесс ID:', process.pid);
    console.error('📅 Время ошибки:', new Date().toISOString());
    console.error('');
    
    // НЕ останавливаем polling автоматически, так как это может усугубить проблему
    // Telegram API сам обработает конфликт, и один из экземпляров должен остановиться
  }
});

bot.on('error', (error) => {
  console.error('❌ Общая ошибка бота:', error.message);
  console.error('📋 Код ошибки:', error.code);
  console.error('🔍 Полная ошибка:', JSON.stringify(error, null, 2));
  console.error('📅 Время ошибки:', new Date().toISOString());
});

// Обработка сигналов остановки
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Получен сигнал ${signal}. Остановка бота...`);
  console.log('📅 Время остановки:', new Date().toISOString());
  try {
    bot.stopPolling();
    console.log('✅ Polling остановлен корректно.');
  } catch (error) {
    console.error('❌ Ошибка остановки polling:', error.message);
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Для Railway и других платформ

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное отклонение промиса:');
  console.error('📋 Причина:', reason);
  console.error('📅 Время ошибки:', new Date().toISOString());
  console.error('🔍 Promise:', promise);
  // Не останавливаем бота при необработанных ошибках, но логируем для отладки
});

// ============================================
// HTTP СЕРВЕР ДЛЯ ПРОБУЖДЕНИЯ (для бесплатного Render)
// ============================================

// Простой HTTP сервер для поддержания активности бота на бесплатном плане
const http = require('http');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  // Простой endpoint для проверки работоспособности
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      bot: 'vr_lounge33_bot',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      message: 'Telegram bot is running'
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
  console.log(`🔗 Health check endpoint: http://localhost:${PORT}/health`);
  console.log(`💡 Используйте этот endpoint для предотвращения засыпания на Render`);
  console.log('✅ Бот готов к работе!');
});


