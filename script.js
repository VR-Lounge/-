// Обновленные услуги и цены
const services = {
  'ps5': { name: 'PS5', price: 1000, unit: 'час' },
  'ps5_2': { name: 'PS5 (2 джойстика)', price: 1500, unit: 'час' },
  'vr': { name: 'VR очки', price: 1000, unit: 'час' },
  'vr_2': { name: 'VR очки (2 шт)', price: 1800, unit: 'час' },
  'vr_3': { name: 'VR очки (3 шт)', price: 2500, unit: 'час' },
  'vr_4': { name: 'VR очки (4 шт)', price: 3000, unit: 'час' },
  'xbox': { name: 'X-Box Kinnect', price: 500, unit: 'час', maxPeople: 8 },
  'xbox_1': { name: 'X-Box (1 джойстик)', price: 250, unit: 'час' },
  'xbox_2': { name: 'X-Box (2 джойстика)', price: 500, unit: 'час' },
  'xbox_3': { name: 'X-Box (3 джойстика)', price: 750, unit: 'час' },
  'xbox_4': { name: 'X-Box (4 джойстика)', price: 1000, unit: 'час' },
  'karaoke': { name: 'Караоке', price: 1000, unit: 'час' },
  'boardgames': { name: 'Настольные игры', price: 500, unit: 'час' }
};

// Обработчик клика по дате в календаре
function handleDateClick(date) {
  const formattedDate = formatDate(date);
  const dayBookings = bookings.filter(booking => booking.date === formattedDate);
  
  if (dayBookings.length > 0) {
    showDayDetailsModal(dayBookings, formattedDate);
  }
}

// Показать модальное окно с деталями записей
function showDayDetailsModal(bookings, date) {
  const modal = document.getElementById('dayDetailsModal');
  const title = document.getElementById('dayDetailsTitle');
  const content = document.getElementById('dayDetailsContent');
  
  title.textContent = `Записи на ${formatDateForDisplay(date)}`;
  content.innerHTML = '';
  
  bookings.forEach(booking => {
    const bookingElement = document.createElement('div');
    bookingElement.className = 'bg-gray-50 rounded-xl p-4 space-y-2';
    bookingElement.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <p class="font-medium text-gray-900">${booking.clientName}</p>
          <p class="text-gray-600">${booking.phone}</p>
        </div>
        <div class="text-right">
          <p class="text-gray-900">${booking.time}</p>
          <p class="text-gray-600">${booking.duration} ч</p>
        </div>
      </div>
      <div class="mt-2">
        <p class="text-gray-900">Услуги:</p>
        <ul class="list-disc list-inside text-gray-600">
          ${booking.services.map(service => `<li>${service.name} - ${service.price} ₽/${service.unit}</li>`).join('')}
        </ul>
      </div>
      <div class="flex justify-between items-center mt-2">
        <p class="text-gray-900">Способ оплаты: ${booking.paymentMethod}</p>
        <p class="font-semibold text-gray-900">Итого: ${booking.totalAmount} ₽</p>
      </div>
    `;
    content.appendChild(bookingElement);
  });
  
  modal.classList.remove('hidden');
}

// Закрыть модальное окно
document.getElementById('closeDayDetailsModal').addEventListener('click', () => {
  document.getElementById('dayDetailsModal').classList.add('hidden');
});

// Обновленная функция для расчета общей суммы
function calculateTotal() {
  let total = 0;
  const selectedServices = Array.from(document.querySelectorAll('input[name="services"]:checked'))
    .map(input => services[input.value]);
  
  selectedServices.forEach(service => {
    const duration = parseInt(document.getElementById('duration').value);
    total += service.price * duration;
  });
  
  // Применение скидки
  const discountType = document.getElementById('discountType').value;
  const discountValue = parseFloat(document.getElementById('discountValue').value) || 0;
  
  if (discountType === 'percent') {
    total = total * (1 - discountValue / 100);
  } else {
    total = total - discountValue;
  }
  
  document.getElementById('totalAmount').textContent = total.toFixed(2);
}

// Обновленная функция для сохранения записи
async function saveBooking() {
  // ... existing validation code ...
  
  const bookingData = {
    // ... existing booking data ...
    paymentMethod: document.getElementById('paymentMethod').value,
    discountType: document.getElementById('discountType').value,
    discountValue: parseFloat(document.getElementById('discountValue').value) || 0,
    totalAmount: parseFloat(document.getElementById('totalAmount').textContent)
  };
  
  // ... rest of the function ...
}

// Исправление обработки вставки номера телефона
document.getElementById('phone').addEventListener('paste', (e) => {
  e.preventDefault();
  const pastedText = (e.clipboardData || window.clipboardData).getData('text');
  const cleanedNumber = pastedText.replace(/[^\d+]/g, '');
  document.getElementById('phone').value = cleanedNumber;
}); 