// Telegram Bot для VR Lounge CRM
// Интеграция с Firebase для управления клиентами и уведомлениями

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

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

const bot = new TelegramBot(token, { polling: true });

// Логирование всех входящих сообщений для отладки
bot.on('message', (msg) => {
  console.log(`📩 Получено сообщение от ${msg.from.first_name} (${msg.chat.type}):`, msg.text || '[не текст]');
});

// ID группы администраторов (замените на ваш)
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID || '-1001234567890'; // Пример формата

console.log('🤖 Telegram бот запущен!');
console.log('📋 ID группы администраторов:', ADMIN_GROUP_ID);

// ============================================
// СИСТЕМА РОЛЕЙ ПОЛЬЗОВАТЕЛЕЙ
// ============================================

// Функция определения роли пользователя
async function getUserRole(userId) {
  try {
    // Сначала проверяем, является ли пользователь админом (из графика смен)
    const adminSnapshot = await db.collection('admins')
      .where('telegramId', '==', userId.toString())
      .get();
    
    if (!adminSnapshot.empty) {
      return 'admin';
    }
    
    // Затем проверяем, является ли пользователь руководителем
    const managerSnapshot = await db.collection('managers')
      .where('telegramId', '==', userId.toString())
      .get();
    
    if (!managerSnapshot.empty) {
      return 'admin'; // Руководители имеют те же права, что и админы
    }
    
    // Затем проверяем, является ли пользователь клиентом
    const clientSnapshot = await db.collection('clients')
      .where('telegramId', '==', userId.toString())
      .get();
    
    if (!clientSnapshot.empty) {
      return 'client';
    }
    
    // Если не найден нигде - гость
    return 'guest';
  } catch (error) {
    console.error('Ошибка определения роли пользователя:', error);
    return 'guest';
  }
}

// ============================================
// ОСНОВНЫЕ КОМАНДЫ БОТА
// ============================================

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || msg.from.first_name;
  
  console.log(`📨 Получена команда /start от ${username} (chatId: ${chatId})`);

  // Определяем роль пользователя
  const role = await getUserRole(userId);
  console.log(`👤 Роль пользователя ${username}: ${role}`);

  // URL Mini App для админов
  const ADMIN_MINI_APP_URL = process.env.MINI_APP_URL || 'https://vr-lounge.github.io/-/telegram-miniapp.html';
  // URL Mini App для клиентов (Friendly-сервис)
  const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';

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
            [{ text: '📢 Рассылка' }, { text: '/help - Помощь' }]
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
            [{ text: '/register - Зарегистрироваться' }, { text: '/help - Помощь' }]
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

  // Проверяем, что это личный чат (не группа)
  if (msg.chat.type !== 'private') {
    await bot.sendMessage(chatId, '❌ Регистрация возможна только в личном чате с ботом. Пожалуйста, напишите боту напрямую.');
    return;
  }

  try {
    await bot.sendMessage(chatId, `
📝 Регистрация в базе клиентов

Для завершения регистрации мне нужен ваш номер телефона.

Пожалуйста, отправьте ваш номер телефона в формате:
+7 (XXX) XXX-XX-XX

Или нажмите кнопку ниже, чтобы поделиться номером:
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
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже или напишите номер телефона вручную в формате +7 (XXX) XXX-XX-XX');
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
    // Ищем клиента по телефону
    const clientsSnapshot = await db.collection('clients')
      .where('phoneDigits', '==', phoneDigits)
      .get();

    if (!clientsSnapshot.empty) {
      // Клиент существует - обновляем Telegram данные
      const clientDoc = clientsSnapshot.docs[0];
      await clientDoc.ref.update({
        telegramId: userId,
        telegramUsername: username,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await bot.sendMessage(chatId, `
✅ Отлично! Ваш Telegram успешно привязан к вашему аккаунту!

Теперь вы будете получать уведомления о ваших записях и предстоящих событиях.
      `);
    } else {
      // Клиента нет - создаем нового
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
✅ Регистрация завершена!

Вы успешно зарегистрированы в базе клиентов VR Lounge.
Теперь вы будете получать уведомления о ваших записях.
      `);
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
    try {
      await bot.sendMessage(chatId, '❌ Произошла ошибка при регистрации. Попробуйте позже.');
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
    
    // Находим все бронирования клиента
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

// Обработчик callback для кнопки "Контакты"
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const CLIENT_MINI_APP_URL = process.env.CLIENT_MINI_APP_URL || 'https://vr-lounge.github.io/-/client-booking-miniapp.html';
  
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
// ФУНКЦИИ УВЕДОМЛЕНИЙ
// ============================================

// Функция отправки уведомления клиенту
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

// Функция отправки уведомления в группу администраторов
async function sendNotificationToAdmins(message) {
  try {
    await bot.sendMessage(ADMIN_GROUP_ID, message);
    return true;
  } catch (error) {
    console.error('Ошибка отправки уведомления администраторам:', error);
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

// Слушатель новых записей в Firestore
function setupNewBookingListener() {
  console.log('🔔 Настройка слушателя новых записей...');
  
  // Отслеживаем новые документы в коллекции bookings
  // Используем timestamp для фильтрации только новых записей
  let lastCheckTime = new Date();
  
  // Проверяем новые записи каждые 10 секунд
  setInterval(async () => {
    try {
      const now = new Date();
      
      // Ищем записи, созданные за последние 30 секунд
      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
      
      const newBookings = await db.collection('bookings')
        .where('createdAt', '>=', thirtySecondsAgo)
        .get();
      
      for (const bookingDoc of newBookings.docs) {
        const booking = bookingDoc.data();
        const bookingId = bookingDoc.id;
        
        // Проверяем, что это действительно новая запись (создана после последней проверки)
        const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
        
        if (createdAt > lastCheckTime) {
          console.log(`📝 Новая запись обнаружена: ${bookingId}`);
          
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
          
          // Добавляем информацию о скидке, если есть
          if (booking.discountPercent > 0 || booking.discountAmount > 0) {
            if (booking.discountPercent > 0) {
              adminNotificationMessage += `💰 Скидка: ${booking.discountPercent}%\n`;
            } else {
              adminNotificationMessage += `💰 Скидка: ${booking.discountAmount} ₽\n`;
            }
          }
          
          // Добавляем информацию о предоплате, если есть
          if (booking.prepayment && booking.prepayment.amount > 0) {
            const method = booking.prepayment.method === 'cash' ? 'Наличные' : 'Перевод';
            adminNotificationMessage += `💵 Предоплата: ${booking.prepayment.amount} ₽ (${method})\n`;
          }
          
          // Добавляем примечания, если есть
          if (booking.notes && booking.notes.trim()) {
            adminNotificationMessage += `📝 Примечания: ${booking.notes}\n`;
          }
          
          // Добавляем источник записи
          if (booking.source === 'client_miniapp') {
            adminNotificationMessage += `\n📱 Запись создана через бот @vr_lounge_bot . СВЯЗАТЬСЯ С КЛИЕНТОМ!`;
          }
          
          // Отправляем уведомление админам
          await sendNotificationToAdmins(adminNotificationMessage);
          
          // Отправляем уведомление клиенту, если есть telegramId
          const phoneDigits = booking.clientPhone?.replace(/\D/g, '') || '';
          if (phoneDigits) {
            try {
              // Нормализуем номер телефона для поиска в базе (убираем первую 7 или 8)
              let normalizedPhoneDigits = phoneDigits;
              if (normalizedPhoneDigits.startsWith('7')) {
                normalizedPhoneDigits = normalizedPhoneDigits.substring(1);
              } else if (normalizedPhoneDigits.startsWith('8')) {
                normalizedPhoneDigits = normalizedPhoneDigits.substring(1);
              }
              
              console.log(`🔍 Поиск клиента по телефону:`, {
                original: booking.clientPhone,
                phoneDigits: phoneDigits,
                normalizedPhoneDigits: normalizedPhoneDigits
              });
              
              const clientsSnapshot = await db.collection('clients')
                .where('phoneDigits', '==', normalizedPhoneDigits)
                .get();
              
              console.log(`📋 Найдено клиентов: ${clientsSnapshot.size}`);
              
              if (!clientsSnapshot.empty) {
                const client = clientsSnapshot.docs[0].data();
                console.log(`👤 Клиент найден:`, {
                  name: client.clientName,
                  telegramId: client.telegramId,
                  phoneDigits: client.phoneDigits
                });
                
                if (client.telegramId) {
                  const clientMessage = `✅ Ваша запись успешно создана!\n\n` +
                    `📅 Дата: ${formattedDate}\n` +
                    `⏰ Время: ${booking.startTime}\n` +
                    `⏱ Длительность: ${booking.duration} ч\n` +
                    `🎮 Услуги: ${serviceNames}\n\n` +
                    `Мы свяжемся с вами для подтверждения. Ждем вас! 🎮`;
                  
                  await sendNotificationToClient(clientsSnapshot.docs[0].id, clientMessage);
                  console.log(`✅ Уведомление отправлено клиенту ${booking.clientName} (telegramId: ${client.telegramId})`);
                } else {
                  console.log(`⚠️ У клиента ${booking.clientName} нет telegramId`);
                }
              } else {
                console.log(`⚠️ Клиент с телефоном ${normalizedPhoneDigits} не найден в базе`);
              }
            } catch (error) {
              console.error('❌ Ошибка отправки уведомления клиенту:', error);
            }
          } else {
            console.log(`⚠️ Не удалось извлечь phoneDigits из ${booking.clientPhone}`);
          }
        }
      }
      
      lastCheckTime = now;
    } catch (error) {
      console.error('Ошибка проверки новых записей:', error);
    }
  }, 10000); // Проверяем каждые 10 секунд
  
  console.log('✅ Слушатель новых записей настроен');
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

      // Находим клиента
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

  } catch (error) {
    console.error('Ошибка проверки предстоящих событий:', error);
  }
}

// Запускаем проверку каждые 30 минут
setInterval(checkUpcomingEvents, 30 * 60 * 1000);

// Проверяем сразу при запуске
checkUpcomingEvents();

// Настраиваем слушатель новых записей
setupNewBookingListener();

// ============================================
// ОБРАБОТКА ОШИБОК
// ============================================

bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error.message);
  // Не останавливаем бота при ошибках polling
});

bot.on('error', (error) => {
  console.error('Общая ошибка бота:', error.message);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Остановка бота...');
  bot.stopPolling();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
  // Не останавливаем бота при необработанных ошибках
});

console.log('✅ Бот готов к работе!');

