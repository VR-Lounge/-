// Конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBaq_faWwfE_TXn4Xh_2U3GYSAsUzGJ1bk",
  authDomain: "vr-lounge33.firebaseapp.com",
  projectId: "vr-lounge33",
  storageBucket: "vr-lounge33.firebasestorage.app",
  messagingSenderId: "825655988090",
  appId: "1:825655988090:web:76d8e0554b8601f8bd10c3",
  measurementId: "G-WG8BDG9D4M"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Функция для входа администратора
async function adminLogin(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    return userCredential.user;
  } catch (error) {
    console.error('Ошибка входа:', error);
    throw error;
  }
}

// Функция для проверки авторизации
function checkAuth() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
      resolve(user);
    });
  });
}

// Функция для выхода
function adminLogout() {
  return auth.signOut();
}

// Функция для получения списка администраторов
async function getAdmins() {
  try {
    const snapshot = await db.collection('admins').get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Ошибка при получении списка администраторов:', error);
    throw error;
  }
}

// Функция для получения назначений администраторов
async function getAdminAssignments(date) {
  try {
    const snapshot = await db.collection('adminAssignments')
      .where('date', '==', date)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Ошибка при получении назначений:', error);
    throw error;
  }
}

// Функция для сохранения назначения администратора
async function saveAdminAssignment(assignmentData) {
  try {
    const docRef = await db.collection('adminAssignments').add({
      ...assignmentData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('Ошибка при сохранении назначения:', error);
    throw error;
  }
}

// === Модальное окно детализации дня ===
const dayDetailsModal = document.getElementById('dayDetailsModal');
const closeDayDetailsBtn = document.getElementById('closeDayDetailsBtn');
const dayDetailsTitle = document.getElementById('dayDetailsTitle');
const dayDetailsList = document.getElementById('dayDetailsList');
const dayDetailsEmpty = document.getElementById('dayDetailsEmpty');

// Открытие модалки детализации дня
function openDayDetailsModal(dateStr, bookingsForDay) {
  dayDetailsTitle.textContent = `Детализация на ${dateStr.split('-').reverse().join('.')}`;
  dayDetailsList.innerHTML = '';
  if (!bookingsForDay || bookingsForDay.length === 0) {
    dayDetailsEmpty.classList.remove('hidden');
    return;
  }
  dayDetailsEmpty.classList.add('hidden');
  bookingsForDay.forEach(b => {
    const li = document.createElement('li');
    li.className = 'border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col space-y-1 bg-gray-50';
    li.innerHTML = `
      <div class="font-semibold text-lg">${b.clientName}</div>
      <div class="text-sm text-gray-700"><i class="fas fa-phone-alt mr-1"></i>${b.clientPhone || '-'}</div>
      <div class="text-sm text-gray-700"><i class="fas fa-clock mr-1"></i>${b.startTime} (${b.duration} ч)</div>
      <div class="text-sm text-gray-700"><i class="fas fa-cube mr-1"></i>${getServiceLabel(b.serviceType)}</div>
      ${b.notes ? `<div class="text-xs text-gray-500 italic">Примечание: ${b.notes}</div>` : ''}
    `;
    dayDetailsList.appendChild(li);
  });
  dayDetailsModal.classList.remove('hidden');
}
closeDayDetailsBtn.addEventListener('click', () => dayDetailsModal.classList.add('hidden'));
dayDetailsModal.addEventListener('click', e => { if (e.target === dayDetailsModal) dayDetailsModal.classList.add('hidden'); });

// === Исправление клика по дню в календаре ===
function renderCalendar() {
  // ... (твой код до for (let day = 1; day <= daysInMonth; day++) { ... )
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDateSafe(date);
    const dayCell = document.createElement('div');
    // ... (твой стиль и подсветка)
    // ... (создание dayNumber, подсветка, и т.д.)

    // Отображение бронирований на этот день
    const dayBookings = bookings.filter(b => b.bookingDate === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    // ... (отображение мини-списка в ячейке)

    // Новый обработчик клика — открывает модалку детализации
    dayCell.addEventListener('click', (e) => {
      e.stopPropagation();
      openDayDetailsModal(dateStr, dayBookings);
    });

    calendarEl.appendChild(dayCell);
  }
}

// === Исправление кнопки "Добавить запись клиента" ===
addBookingBtn.addEventListener('click', () => openBookingModal(selectedDate || new Date()));

// === Перемещение списка записей под календарём ===
// Просто убедись, что блок с id="bookingsList" и id="noBookingsText" находится сразу после календаря (как в примере выше).

// === getServiceLabel (добавь новые варианты, если нужно) ===
function getServiceLabel(serviceType) {
  switch (serviceType) {
    case 'weekday_vr': return 'Будни - VR';
    case 'weekday_ps': return 'Будни - PS';
    case 'weekend_vr': return 'Выходные - VR';
    case 'weekend_ps': return 'Выходные - PS';
    case 'birthday': return 'День рождения';
    // Можно добавить новые, если используешь новые ключи
    default: return 'Неизвестная услуга';
  }
} 
