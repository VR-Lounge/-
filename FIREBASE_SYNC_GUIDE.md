# 🔄 Автоматическая синхронизация с Firebase Firestore

## 📋 Что можно делать с Firebase

### ✅ Я могу работать с Firebase через:

1. **Firebase Admin SDK** (как в `telegram-bot.js`)
   - Чтение данных из Firestore
   - Запись данных в Firestore
   - Обновление документов
   - Удаление документов

2. **Firebase CLI** (командная строка)
   - Экспорт данных
   - Импорт данных
   - Бэкапы
   - Управление правилами безопасности

3. **Скрипты автоматизации**
   - Автоматические бэкапы
   - Синхронизация между проектами
   - Экспорт в JSON/CSV
   - Импорт из файлов

---

## ❌ Что НЕ работает как с GitHub

**Firebase НЕ является Git репозиторием:**
- ❌ Нет команды `git push/pull`
- ❌ Нет истории коммитов
- ❌ Нет веток (branches)
- ❌ Нет автоматической синхронизации "из коробки"

**Firebase - это база данных:**
- ✅ Данные хранятся в реальном времени
- ✅ Можно читать/писать через API
- ✅ Можно настроить автоматизацию через скрипты

---

## ✅ Что МОЖНО настроить для автоматизации

### 1. Автоматические бэкапы Firestore

**Через Firebase CLI:**
```bash
# Установка Firebase CLI
npm install -g firebase-tools

# Авторизация
firebase login

# Экспорт данных
firebase firestore:export gs://ваш-bucket/backup-$(date +%Y%m%d)
```

**Через скрипт Node.js:**
```javascript
const admin = require('firebase-admin');
const fs = require('fs');

async function backupFirestore() {
  const collections = ['bookings', 'clients', 'admins'];
  const backup = {};
  
  for (const collection of collections) {
    const snapshot = await admin.firestore().collection(collection).get();
    backup[collection] = snapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));
  }
  
  fs.writeFileSync(`backup-${Date.now()}.json`, JSON.stringify(backup, null, 2));
  console.log('✅ Бэкап создан!');
}
```

### 2. Автоматическая синхронизация между проектами

**Скрипт для синхронизации:**
```javascript
// sync-firestore.js
const admin = require('firebase-admin');

// Инициализация двух проектов
const sourceDb = admin.initializeApp({
  credential: admin.credential.cert(require('./source-service-account.json'))
}, 'source').firestore();

const targetDb = admin.initializeApp({
  credential: admin.credential.cert(require('./target-service-account.json'))
}, 'target').firestore();

async function syncCollection(collectionName) {
  const sourceSnapshot = await sourceDb.collection(collectionName).get();
  
  for (const doc of sourceSnapshot.docs) {
    await targetDb.collection(collectionName).doc(doc.id).set(doc.data());
  }
  
  console.log(`✅ Синхронизировано: ${collectionName}`);
}

// Использование
syncCollection('bookings');
syncCollection('clients');
```

### 3. Автоматический экспорт в JSON/CSV

**Скрипт для экспорта:**
```javascript
// export-firestore.js
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-writer');

async function exportToJSON(collectionName) {
  const snapshot = await admin.firestore().collection(collectionName).get();
  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  fs.writeFileSync(`${collectionName}.json`, JSON.stringify(data, null, 2));
  console.log(`✅ Экспортировано в ${collectionName}.json`);
}

async function exportToCSV(collectionName) {
  const snapshot = await admin.firestore().collection(collectionName).get();
  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  if (data.length === 0) return;
  
  const csvWriter = csv.createObjectCsvWriter({
    path: `${collectionName}.csv`,
    header: Object.keys(data[0]).map(key => ({ id: key, title: key }))
  });
  
  await csvWriter.writeRecords(data);
  console.log(`✅ Экспортировано в ${collectionName}.csv`);
}
```

### 4. Автоматическое обновление через Cloud Functions

**Cloud Function для автоматизации:**
```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Автоматическое обновление статистики клиентов
exports.updateClientStats = functions.firestore
  .document('bookings/{bookingId}')
  .onCreate(async (snap, context) => {
    const booking = snap.data();
    const clientRef = admin.firestore()
      .collection('clients')
      .where('phoneDigits', '==', booking.phoneDigits)
      .limit(1);
    
    const clientSnapshot = await clientRef.get();
    if (!clientSnapshot.empty) {
      const clientDoc = clientSnapshot.docs[0];
      await clientDoc.ref.update({
        totalBookings: admin.firestore.FieldValue.increment(1),
        totalSpent: admin.firestore.FieldValue.increment(booking.totalAmount),
        lastBookingDate: booking.bookingDate
      });
    }
  });
```

---

## 🚀 Рекомендуемые решения

### Для автоматических бэкапов:

1. **Используйте Firebase CLI** (проще всего)
   ```bash
   # Настройте cron job для ежедневных бэкапов
   0 2 * * * firebase firestore:export gs://ваш-bucket/backup-$(date +\%Y\%m\%d)
   ```

2. **Используйте Cloud Functions** (автоматически)
   - Настройте функцию, которая создает бэкапы
   - Запускается автоматически по расписанию

### Для синхронизации данных:

1. **Скрипты Node.js** (как показано выше)
2. **Cloud Functions** (для автоматической синхронизации)
3. **Firebase CLI** (для ручной синхронизации)

---

## 📝 Практический пример: Настройка автоматических бэкапов

### Шаг 1: Установка Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### Шаг 2: Инициализация проекта
```bash
firebase init firestore
```

### Шаг 3: Создание скрипта бэкапа
```bash
# backup.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
firebase firestore:export ./backups/backup_$DATE
echo "✅ Бэкап создан: backup_$DATE"
```

### Шаг 4: Настройка автоматического запуска (cron)
```bash
# Добавьте в crontab (crontab -e)
0 2 * * * /path/to/backup.sh
```

---

## ✅ Итого

**Что я могу делать:**
- ✅ Читать/писать данные через Firebase Admin SDK
- ✅ Создавать скрипты для автоматизации
- ✅ Настраивать бэкапы и синхронизацию
- ✅ Помогать с настройкой автоматизации

**Что нужно для автоматизации:**
- 📝 Написать скрипты (я могу помочь!)
- ⚙️ Настроить расписание (cron или Cloud Functions)
- 🔄 Регулярно запускать синхронизацию

**Отличие от GitHub:**
- GitHub - система контроля версий (git push/pull)
- Firebase - база данных (API для чтения/записи)
- Но можно настроить автоматизацию через скрипты!

---

## 🎯 Хотите настроить автоматизацию?

Я могу помочь создать:
1. Скрипт для автоматических бэкапов
2. Скрипт для синхронизации данных
3. Скрипт для экспорта в JSON/CSV
4. Настройку Cloud Functions для автоматизации

Просто скажите, что нужно автоматизировать! 🚀

