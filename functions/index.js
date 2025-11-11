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

async function getUserRole(userId) {
  try {
    const adminSnapshot = await db.collection('admins')
      .where('telegramId', '==', userId.toString())
      .get();
    
    if (!adminSnapshot.empty) {
      return 'admin';
    }
    
    const managerSnapshot = await db.collection('managers')
      .where('telegramId', '==', userId.toString())
      .get();
    
    if (!managerSnapshot.empty) {
      return 'admin';
    }
    
    const clientSnapshot = await db.collection('clients')
      .where('telegramId', '==', userId.toString())
      .get();
    
    if (!clientSnapshot.empty) {
      return 'client';
    }
    
    return 'guest';
  } catch (error) {
    console.error('Ошибка определения роли пользователя:', error);
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
            [{ text: '📢 Рассылка' }, { text: '/help - Помощь' }]
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
            [{ text: 'ℹ️ Информация' }, { text: '/help - Помощь' }]
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
            [{ text: 'Зарегистрироваться' }, { text: 'Помощь' }]
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

Чтобы мы могли отправлять тебе напоминания о записях и радовать специальными предложениями, нам нужен твой номер телефона 📱

Это займет всего пару секунд:
• Нажми кнопку ниже, чтобы поделиться номером
• Или напиши номер в формате: +7 (XXX) XXX-XX-XX

После регистрации ты будешь в курсе всех наших новинок и акций! 🚀
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

      await bot.sendMessage(chatId, `
🎉 Отлично! Твой Telegram успешно привязан к аккаунту!

Теперь ты будешь получать:
✨ Напоминания о записях (за 1 день и за 3 часа)
🎁 Специальные предложения и акции
📢 Новости о наших новинках и мероприятиях

Ждем тебя в VR Lounge! 🎮
      `);
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

      await bot.sendMessage(chatId, `
🎉 Добро пожаловать в VR Lounge!

Ты успешно зарегистрирован(а) в нашей базе клиентов! 🎮

Теперь ты будешь получать:
✨ Напоминания о записях (за 1 день и за 3 часа)
🎁 Специальные предложения и акции
📢 Новости о наших новинках и мероприятиях

Записывайся на удобное время и наслаждайся игрой! 🚀
      `);
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
    try {
      await bot.sendMessage(chatId, '😅 Упс! Что-то пошло не так при регистрации. Попробуй еще раз через минуту!');
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
    
    const bookingsSnapshot = await db.collection('bookings')
      .where('phoneDigits', '==', phoneDigits)
      .orderBy('bookingDate', 'desc')
      .orderBy('startTime', 'desc')
      .limit(10)
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
    
    let bookingsMessage = `📅 Ваши записи:\n\n`;
    
    bookingsSnapshot.docs.forEach((doc, index) => {
      const booking = doc.data();
      const date = new Date(booking.bookingDate);
      const formattedDate = date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        weekday: 'short'
      });
      
      const serviceNames = getServiceNames(booking.selectedServices || []);
      
      bookingsMessage += `${index + 1}. 📅 ${formattedDate}\n`;
      bookingsMessage += `   ⏰ ${booking.startTime} (${booking.duration} ч)\n`;
      bookingsMessage += `   🎮 ${serviceNames}\n`;
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
    await bot.sendMessage(chatId, '❌ Произошла ошибка при получении ваших записей. Попробуйте позже.');
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
    
    let adminNotificationMessage = `📝 Новая запись клиента!\n\n`;
    adminNotificationMessage += `👤 Клиент: ${booking.clientName}\n`;
    adminNotificationMessage += `📞 Телефон: ${booking.clientPhone}\n`;
    adminNotificationMessage += `📅 Дата: ${formattedDate}\n`;
    adminNotificationMessage += `⏰ Время: ${booking.startTime}\n`;
    adminNotificationMessage += `⏱ Длительность: ${booking.duration} ч\n`;
    adminNotificationMessage += `🎮 Услуги: ${serviceNames}\n`;
    
    if (booking.discountPercent > 0 || booking.discountAmount > 0) {
      if (booking.discountPercent > 0) {
        adminNotificationMessage += `💰 Скидка: ${booking.discountPercent}%\n`;
      } else {
        adminNotificationMessage += `💰 Скидка: ${booking.discountAmount} ₽\n`;
      }
    }
    
    if (booking.prepayment && booking.prepayment.amount > 0) {
      const method = booking.prepayment.method === 'cash' ? 'Наличные' : 'Перевод';
      adminNotificationMessage += `💵 Предоплата: ${booking.prepayment.amount} ₽ (${method})\n`;
    }
    
    if (booking.notes && booking.notes.trim()) {
      adminNotificationMessage += `📝 Примечания: ${booking.notes}\n`;
    }
    
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

        // Уведомляем администраторов о предстоящем событии
        if (booking.selectedServices?.includes('birthday')) {
          const dateStr = new Date(booking.bookingDate).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            weekday: 'long'
          });
          
          await sendNotificationToAdmins(`
🎂 Напоминание: Завтра День Рождения!

👤 Клиент: ${booking.clientName}
📅 Дата: ${dateStr}
⏰ Время: ${booking.startTime}
⏱ Длительность: ${booking.duration} ч

Пожалуйста, подготовьтесь к мероприятию!
          `);
        }
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

