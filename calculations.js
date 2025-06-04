// Функция для расчета бонуса администратора
function calculateAdminBonus(dayRevenue, dayBookings, hasHelper, servicePrices) {
    // Вычитаем стоимость ведущей из выручки дня
    let revenueForBonus = dayRevenue;
    dayBookings.forEach(booking => {
        if (booking.selectedServices && Array.isArray(booking.selectedServices) && booking.selectedServices.includes('hostess')) {
            revenueForBonus -= servicePrices.hostess || 1000; // Вычитаем стоимость ведущей
        }
    });
    
    // Рассчитываем бонус
    const bonusPercent = hasHelper ? 0.08 : 0.15;
    return revenueForBonus * bonusPercent;
}

// Функция для расчета выручки за день
function calculateDayRevenue(dayBookings, servicePrices) {
    let dayRevenue = 0;
    let birthdayRevenue = 0;

    dayBookings.forEach(booking => {
        let bookingTotalAmount = 0;
        const duration = parseFloat(booking.duration) || 0;
        
        // Определяем, является ли запись услугой "День рождения"
        const isBirthdayService = 
            (booking.selectedServices && Array.isArray(booking.selectedServices) && 
             booking.selectedServices.includes('birthday')) || 
            booking.serviceType === 'birthday';
        
        // Рассчитываем сумму до скидки
        if (booking.selectedServices && Array.isArray(booking.selectedServices)) {
            booking.selectedServices.forEach(service => {
                if (service === 'birthday') {
                    const fullHours = Math.floor(duration);
                    const hasHalfHour = duration % 1 !== 0;
                    let birthdayTotal = 0;
                    for (let hour = 1; hour <= fullHours; hour++) {
                        const hourPrice = servicePrices.birthday[hour] || servicePrices.birthday[4] || 3000;
                        birthdayTotal += hourPrice;
                    }
                    if (hasHalfHour) {
                        if (fullHours === 0) { birthdayTotal += 2000; }
                        else if (fullHours === 1) { birthdayTotal += 2000; }
                        else { birthdayTotal += (servicePrices.birthday[3] || 3000) / 2; }
                    }
                    bookingTotalAmount += birthdayTotal;
                } else if (service === 'hostess') {
                    bookingTotalAmount += servicePrices.hostess || 1000;
                } else {
                    const price = servicePrices[service] || 0;
                    bookingTotalAmount += price * duration;
                }
            });
        }
        
        // Применяем скидку
        const discountPercent = booking.discountPercent || 0;
        const discountAmount = booking.discountAmount || 0;
        let finalBookingAmount = bookingTotalAmount;
        
        if (discountPercent > 0) {
            finalBookingAmount = bookingTotalAmount * (1 - discountPercent / 100);
        } else if (discountAmount > 0) {
            finalBookingAmount = Math.max(0, bookingTotalAmount - discountAmount);
        }
        
        // Добавляем в общую выручку
        dayRevenue += finalBookingAmount;
        
        // Если услуга "День рождения", добавляем в выручку по ДР
        if (isBirthdayService) {
            birthdayRevenue += finalBookingAmount;
        }
    });

    return { dayRevenue, birthdayRevenue };
}

// Делаем функции доступными глобально
window.calculateAdminBonus = calculateAdminBonus;
window.calculateDayRevenue = calculateDayRevenue; 