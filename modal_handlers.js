// Функция для отображения модального окна с деталями администратора
function showAdminDayDetailsModal(date, dateStr, assignment) {
    try {
        const formattedDate = date.toLocaleDateString('ru-RU', { 
            day: '2-digit', 
            month: 'long', 
            year: 'numeric', 
            weekday: 'long' 
        });
        
        // Обновляем заголовок
        document.getElementById('adminDayDetailsTitle').textContent = `Информация о смене на ${formattedDate}`;
        const adminDayDetailsContent = document.getElementById('adminDayDetailsContent');
        adminDayDetailsContent.innerHTML = ''; // Очищаем содержимое
        
        // Получаем информацию об администраторах
        const mainAdmin = assignment.mainAdminId ? admins.find(a => a.id === assignment.mainAdminId) : null;
        const helperAdmin = assignment.helperAdminId ? admins.find(a => a.id === assignment.helperAdminId) : null;
        
        // Получаем бронирования на этот день
        const dayBookings = bookings.filter(b => b.bookingDate === dateStr);
        
        // Рассчитываем выручку дня
        const { dayRevenue, birthdayRevenue } = calculateDayRevenue(dayBookings, servicePrices);
        
        // Создаем HTML для отображения информации
        let adminInfoHTML = '<div class="space-y-4">';
        
        // Основной администратор
        if (mainAdmin) {
            const bonus = calculateAdminBonus(dayRevenue, dayBookings, !!helperAdmin, servicePrices);
            const totalSalary = (500 + bonus).toFixed(0);
            
            adminInfoHTML += `
                <div>
                    <h4 class="font-semibold text-lg text-blue-800 mb-2">👑 Основной администратор</h4>
                    <p class="text-lg font-medium">${mainAdmin.name}</p>
                    <div class="mt-2 space-y-1">
                        <div class="flex justify-between">
                            <span>Фиксированная ставка:</span>
                            <span class="font-medium">500 ₽</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Бонус (${helperAdmin ? '8' : '15'}% от выручки ДР):</span>
                            <span class="font-medium">${parseInt(bonus).toLocaleString('ru-RU')} ₽</span>
                        </div>
                        <div class="flex justify-between border-t border-gray-200 pt-1 mt-1">
                            <span class="font-medium">Итого за смену:</span>
                            <span class="font-semibold text-blue-700">${parseInt(totalSalary).toLocaleString('ru-RU')} ₽</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Помощник администратора
        if (helperAdmin) {
            // Рассчитываем фактические часы помощника
            let actualHelperHours = 0;
            dayBookings.forEach(booking => {
                const isBirthdayService = 
                    (booking.selectedServices && Array.isArray(booking.selectedServices) && 
                     booking.selectedServices.includes('birthday')) || 
                    booking.serviceType === 'birthday';
                
                if (isBirthdayService) {
                    const duration = parseFloat(booking.duration) || 0;
                    actualHelperHours += duration;
                }
            });
            
            actualHelperHours = Math.round(actualHelperHours);
            
            if (actualHelperHours > 0) {
                const basePay = actualHelperHours * 150;
                const bonusPercent = 0.07;
                const bonus = birthdayRevenue * bonusPercent;
                const totalSalary = (basePay + bonus).toFixed(0);
                
                adminInfoHTML += `
                    <div>
                        <h4 class="font-semibold text-lg text-purple-800 mb-2">👥 Помощник администратора</h4>
                        <p class="text-lg font-medium">${helperAdmin.name}</p>
                        <div class="mt-2 space-y-1">
                            <div class="flex justify-between">
                                <span>Отработано часов:</span>
                                <span class="font-medium">${actualHelperHours}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Почасовая оплата (${actualHelperHours} × 150₽):</span>
                                <span class="font-medium">${basePay.toLocaleString('ru-RU')} ₽</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Бонус (7% от выручки ДР):</span>
                                <span class="font-medium">${parseInt(bonus).toLocaleString('ru-RU')} ₽</span>
                            </div>
                            <div class="flex justify-between border-t border-gray-200 pt-1 mt-1">
                                <span class="font-medium">Итого за смену:</span>
                                <span class="font-semibold text-purple-700">${parseInt(totalSalary).toLocaleString('ru-RU')} ₽</span>
                            </div>
                        </div>
                    </div>
                `;
                
                // Если фактические часы отличаются от назначенных
                const assignedHours = parseInt(assignment.helperHours) || 0;
                if (assignedHours !== actualHelperHours) {
                    adminInfoHTML += `
                        <div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p class="text-sm text-yellow-800">
                                <i class="fas fa-exclamation-triangle text-yellow-600 mr-1"></i>
                                Назначено ${assignedHours} ч, фактически ${actualHelperHours} ч по записям ДР
                            </p>
                        </div>
                    `;
                }
            }
        }
        
        // Финансовая сводка
        adminInfoHTML += `
            <div class="mt-4">
                <h4 class="font-semibold text-lg text-green-800 mb-3">Финансовая сводка</h4>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span>Общая выручка за день:</span>
                        <span class="font-semibold text-green-700">${dayRevenue.toLocaleString('ru-RU')} ₽</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Выручка за "Аренду ДР":</span>
                        <span class="font-semibold text-green-700">${birthdayRevenue.toLocaleString('ru-RU')} ₽</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Кол-во записей:</span>
                        <span class="font-semibold">${dayBookings.length}</span>
                    </div>
                </div>
            </div>
        `;
        
        adminInfoHTML += '</div>';
        adminDayDetailsContent.innerHTML = adminInfoHTML;
        
        // Показываем модальное окно
        document.getElementById('adminDayDetailsModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Ошибка при отображении деталей дня:', error);
        alert('Произошла ошибка при отображении деталей дня. Пожалуйста, попробуйте еще раз.');
    }
}

// Делаем функцию доступной глобально
window.showAdminDayDetailsModal = showAdminDayDetailsModal; 