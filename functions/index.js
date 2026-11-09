// Firebase Cloud Functions для Telegram бота VR Lounge
// Адаптированная версия для работы через Webhook

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const TelegramBot = require('node-telegram-bot-api');

// Инициализация Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();

// Инициализация Telegram бота (БЕЗ polling!)
const token = functions.config().telegram.bot_token;
const ADMIN_GROUP_ID = functions.config().telegram.admin_group_id || '-1002640127163';
const ADMIN_MINI_APP_URL = functions.config().telegram.mini_app_url || 'https://vr-lounge.github.io/-/telegram-miniapp.html';
const CLIENT_MINI_APP_URL = functions.config().telegram.client_mini_app_url || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';

const bot = new TelegramBot(token);

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
// ФУНКЦИИ УВЕДОМЛЕНИЙ
// ============================================

async function sendNotificationToClient(clientId, message) {
  try {
    const clientDoc = await db.collection('clients').doc(clientId).get();
    if (!clientDoc.exists) return false;

    const client = clientDoc.data();
    if (!client.telegramId) return false;

    await bot.sendMessage(client.telegramId, message);
    return true;
  } catch (error) {
    console.error(`Ошибка отправки уведомления клиенту ${clientId}:`, error);
    return false;
  }
}

async function sendNotificationToAdmins(message) {
  try {
    await bot.sendMessage(ADMIN_GROUP_ID, message);
    return true;
  } catch (error) {
    console.error('Ошибка отправки уведомления администраторам:', error);
    return false;
  }
}

function formatDateForNotification(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long'
  });
}

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

// ============================================
// ОСНОВНЫЕ КОМАНДЫ БОТА
// ============================================
// ВАЖНО: Все обработчики команд остаются БЕЗ ИЗМЕНЕНИЙ!
// Просто скопируйте их из telegram-bot.js

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || msg.from.first_name;
  
  console.log(`📨 Получена команда /start от ${username} (chatId: ${chatId})`);

  const role = await getUserRole(userId);
  console.log(`👤 Роль пользователя ${username}: ${role}`);

  try {
    if (role === 'admin') {
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
      await bot.sendMessage(chatId, `
👋 Привет, ${username}!

Добро пожаловать в VR Lounge! 🎮

Запишитесь на удобное время и выберите услугу прямо здесь!
      `, {
        reply_markup: {
          keyboard: [
            [{ 
              text: '✨ Записаться', 
              web_app: { url: CLIENT_MINI_APP_URL }
            }],
            [{ text: '📅 Мои записи' }, { text: '📞 Контакты' }],
            [{ text: 'ℹ️ Информация' }, { text: 'Помощь' }]
          ],
          resize_keyboard: true
        }
      });
      
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
      await bot.sendMessage(chatId, `
👋 Привет, ${username}!

Добро пожаловать в VR Lounge! 🎮

Мы - игровой клуб с VR очками, PS5, X-Box и многим другим!

📍 Адрес: г. Кольчугино, ул. Зернова, д. 11
🕐 График работы:
   пн-пт: 15-20
   сб-вс: 12-21

Запишитесь на удобное время прямо здесь!
      `, {
        reply_markup: {
          keyboard: [
            [{ 
              text: '✨ Записаться', 
              web_app: { url: CLIENT_MINI_APP_URL }
            }],
            [{ text: '📞 Контакты' }, { text: 'ℹ️ О нас' }],
            [{ text: 'Регистрация' }, { text: 'Помощь' }]
          ],
          resize_keyboard: true,
          remove_keyboard: false
        }
      });
      
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
    console.error('Ошибка отправки сообщения /start:', error.message);
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
  
  if (msg.chat.type !== 'private') {
    return;
  }
  
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
    const clientsSnapshot = await db.collection('clients')
      .where('phoneDigits', '==', phoneDigits)
      .get();

    if (!clientsSnapshot.empty) {
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
            [{ text: 'ℹ️ Информация' }, { text: 'Помощь' }]
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

      // URL Mini App для клиентов (Friendly-сервис)
      const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
      
      await bot.sendMessage(chatId, `
🎉 Добро пожаловать в VR Lounge!

Ты успешно стал(а) членом нашего клуба! 🎮🎁

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
            [{ text: 'ℹ️ Информация' }, { text: 'Помощь' }]
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
  
  const contactsMessage = `
📞 Контакты VR Lounge

📍 Адрес: г. Кольчугино, ул. Зернова, д. 11

🕐 График работы:
   пн-пт: 15-20
   сб-вс: 12-21

📱 Связь с нами:
   Юлия: +7 (930) 224-45-51
   Артур: +7 (910) 678-33-17

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
          { text: '💬 Telegram Артура (@tur3321)', url: 'https://t.me/tur3321' }
        ],
        [
          { text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } }
        ]
      ]
    }
  });
});

// Обработчик кнопки "О нас" / "Информация"
bot.onText(/ℹ️ О нас|О нас|о нас|ℹ️ Информация|Информация|информация/, async (msg) => {
  const chatId = msg.chat.id;
  
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
  
  try {
    const clientsSnapshot = await db.collection('clients')
      .where('telegramId', '==', userId)
      .get();
    
    if (clientsSnapshot.empty) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы в базе клиентов.\n\nИспользуйте команду /register для регистрации.');
      return;
    }
    
    const client = clientsSnapshot.docs[0].data();
    const phoneDigits = client.phoneDigits;
    
    if (!phoneDigits) {
      await bot.sendMessage(chatId, '❌ У вас не указан номер телефона в базе. Пожалуйста, зарегистрируйтесь заново через /register');
      return;
    }
    
    // Находим все бронирования клиента
    // Убираем orderBy полностью, чтобы не требовать индекс - сортировка будет в коде
    const bookingsSnapshot = await db.collection('bookings')
      .where('phoneDigits', '==', phoneDigits)
      .limit(50) // Ограничиваем до 50 записей для безопасности
      .get();
    
    if (bookingsSnapshot.empty) {
      await bot.sendMessage(chatId, '📅 У вас пока нет записей.\n\nЗапишитесь на удобное время прямо здесь! 🎮', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } }]
          ]
        }
      });
      return;
    }
    
    // Сортируем записи по дате и времени вручную (так как используем только один orderBy)
    const bookings = bookingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Сортируем: сначала по дате (desc), затем по времени (desc)
    bookings.sort((a, b) => {
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
    
    bookings.slice(0, 10).forEach((booking, index) => {
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

// Команда /newbooking - открыть Mini App для создания записи (только для админов)
bot.onText(/\/newbooking|\/запись|\/новая_запись/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const chatType = msg.chat.type;

  console.log(`📨 Команда /newbooking от пользователя ${userId} (${msg.from.first_name || 'Unknown'}) в чате ${chatType} (chatId: ${chatId})`);

  const role = await getUserRole(userId);
  console.log(`👤 Определенная роль для пользователя ${userId}: ${role}`);
  
  if (role !== 'admin') {
    console.log(`❌ Доступ запрещен для пользователя ${userId}. Роль: ${role}`);
    
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
    const messageText = chatType === 'private' 
      ? '📝 Нажмите на кнопку ниже, чтобы открыть форму создания записи:'
      : `📝 ${msg.from.first_name || 'Администратор'}, нажмите на кнопку ниже, чтобы открыть форму создания записи:`;

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

    await bot.sendMessage(chatId, messageText, messageOptions);
    
    console.log(`✅ Кнопка Mini App отправлена в чат ${chatType} (chatId: ${chatId})`);
  } catch (error) {
    console.error('Ошибка открытия Mini App:', error.message);
    
    let errorMessage = '❌ Не удалось открыть форму. ';
    
    if (error.response) {
      errorMessage += `Код ошибки: ${error.response.statusCode}. `;
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

// Обработчик callback для кнопки "Контакты"
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'show_contacts') {
    const contactsMessage = `
📞 Контакты VR Lounge

📍 Адрес: г. Кольчугино, ул. Зернова, д. 11

🕐 График работы:
   пн-пт: 15-20
   сб-вс: 12-21

📱 Связь с нами:
   Юлия: +7 (930) 224-45-51
   Артур: +7 (910) 678-33-17

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
            { text: '💬 Telegram Артура (@tur3321)', url: 'https://t.me/tur3321' }
          ],
          [
            { text: '✨ Записаться', web_app: { url: CLIENT_MINI_APP_URL } }
          ]
        ]
      }
    });
  }
});

// ============================================
// CLOUD FUNCTION: Обработка Webhook от Telegram
// ============================================

exports.telegramBot = functions.https.onRequest(async (req, res) => {
  // Проверяем, что это POST запрос от Telegram
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const update = req.body;
    
    // Обрабатываем обновление через бота
    await bot.processUpdate(update);
    
    // Отвечаем Telegram, что обновление получено
    res.sendStatus(200);
  } catch (error) {
    console.error('Ошибка обработки обновления:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ============================================
// CLOUD FUNCTION: Установка Webhook (выполнить один раз)
// ============================================

exports.setWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // Получаем URL функции из запроса
    const projectId = process.env.GCLOUD_PROJECT || 'vr-lounge33';
    const region = 'us-central1'; // Или ваш регион
    const functionName = 'telegramBot';
    const webhookUrl = `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
    
    await bot.setWebHook(webhookUrl);
    res.send(`✅ Webhook установлен: ${webhookUrl}`);
  } catch (error) {
    console.error('Ошибка установки Webhook:', error);
    res.status(500).send(`Ошибка: ${error.message}`);
  }
});

// ============================================
// CLOUD FUNCTION TRIGGER: Уведомление о новой записи
// ============================================

exports.onNewBooking = functions.firestore
  .document('bookings/{bookingId}')
  .onCreate(async (snap, context) => {
    const booking = snap.data();
    const bookingId = context.params.bookingId;
    
    console.log(`📝 Новая запись обнаружена: ${bookingId}`);
    
    // Проверяем, что запись создана недавно (за последние 30 секунд)
    const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    
    if (createdAt < thirtySecondsAgo) {
      console.log('⚠️ Запись слишком старая, пропускаем');
      return;
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
    
    // Отправляем уведомление клиенту
    const phoneDigits = booking.phoneDigits || booking.clientPhone?.replace(/\D/g, '') || '';
    if (phoneDigits) {
      try {
        let normalizedPhoneDigits = phoneDigits;
        if (normalizedPhoneDigits.length === 11) {
          if (normalizedPhoneDigits.startsWith('7')) {
            normalizedPhoneDigits = normalizedPhoneDigits.substring(1);
          } else if (normalizedPhoneDigits.startsWith('8')) {
            normalizedPhoneDigits = normalizedPhoneDigits.substring(1);
          }
        }
        
        const clientsSnapshot = await db.collection('clients')
          .where('phoneDigits', '==', normalizedPhoneDigits)
          .get();
        
        if (!clientsSnapshot.empty) {
          const client = clientsSnapshot.docs[0].data();
          if (client.telegramId) {
            const clientMessage = `✅ Ваша запись успешно создана!\n\n` +
              `📅 Дата: ${formattedDate}\n` +
              `⏰ Время: ${booking.startTime}\n` +
              `⏱ Длительность: ${booking.duration} ч\n` +
              `🎮 Услуги: ${serviceNames}\n\n` +
              `Мы свяжемся с вами для подтверждения. Ждем вас! 🎮`;
            
            await sendNotificationToClient(clientsSnapshot.docs[0].id, clientMessage);
            console.log(`✅ Уведомление отправлено клиенту ${booking.clientName}`);
          }
        }
      } catch (error) {
        console.error('❌ Ошибка отправки уведомления клиенту:', error);
      }
    }
  });

// ============================================
// CLOUD FUNCTION: Проверка предстоящих событий (запускается по расписанию)
// ============================================

exports.checkUpcomingEvents = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Проверяем события на завтра (напоминание за 1 день)
      const tomorrowBookings = await db.collection('bookings')
        .where('bookingDate', '==', tomorrowStr)
        .get();

      for (const bookingDoc of tomorrowBookings.docs) {
        const booking = bookingDoc.data();
        const phoneDigits = booking.clientPhone?.replace(/\D/g, '') || '';
        
        if (!phoneDigits) continue;

        const clientsSnapshot = await db.collection('clients')
          .where('phoneDigits', '==', phoneDigits)
          .get();

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
        
        await sendNotificationToAdmins(reminderMessage);
      }

      // Проверяем события через 3 часа (напоминание за 3 часа)
      const threeHoursLater = new Date(now);
      threeHoursLater.setHours(threeHoursLater.getHours() + 3);
      const threeHoursDateStr = threeHoursLater.toISOString().split('T')[0];
      const threeHoursTimeStr = threeHoursLater.toTimeString().split(':').slice(0, 2).join(':');

      const threeHoursBookings = await db.collection('bookings')
        .where('bookingDate', '==', threeHoursDateStr)
        .where('startTime', '==', threeHoursTimeStr)
        .get();

      for (const bookingDoc of threeHoursBookings.docs) {
        const booking = bookingDoc.data();
        const phoneDigits = booking.clientPhone?.replace(/\D/g, '') || '';
        
        if (!phoneDigits) continue;

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
          }
        }
      }

      console.log('✅ Проверка предстоящих событий завершена');
    } catch (error) {
      console.error('Ошибка проверки предстоящих событий:', error);
    }
  });

// ============================================
// ПОДАРОЧНЫЕ КАРТЫ — уведомление в рабочую группу
// (тот же sendNotificationToAdmins, что и для bookings)
// HITL: деплой functions — только по явному ок
// ============================================

exports.onNewGiftCard = functions.firestore
  .document('giftCards/{cardId}')
  .onCreate(async (snap, context) => {
    const card = snap.data();
    const cardId = context.params.cardId;
    console.log(`🎁 Новая подарочная карта: ${cardId}`);

    const face = Number(card.faceValue || 0).toLocaleString('ru-RU');
    const source =
      card.createdBy === 'site' ? 'сайт' :
      card.createdBy === 'crm' ? 'CRM' :
      String(card.createdBy || 'неизвестно');

    let message = `🎁 Новая заявка на подарочную карту!\n\n`;
    message += `🔖 Код: ${card.publicCode || '—'}\n`;
    message += `👤 Получатель: ${card.recipientName || '—'}\n`;
    message += `📞 Телефон покупателя: ${card.buyerPhone || '—'}\n`;
    message += `💰 Номинал: ${face} ₽\n`;
    message += `📊 Статус: ${card.status || '—'}\n`;
    message += `🛎 Источник: ${source}\n`;
    message += `\n➡️ CRM → «Подарочные карты» → «Оплачено / активировать» после оплаты.`;
    message += `\n🔗 https://vr-lounge.github.io/vr-lounge-redesign/gift.html?code=${encodeURIComponent(card.publicCode || '')}`;

    try {
      await sendNotificationToAdmins(message);
      console.log('✅ Уведомление о подарочной карте отправлено');
    } catch (error) {
      console.error('❌ Ошибка уведомления о подарочной карте:', error);
    }
  });

