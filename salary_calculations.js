// Функция для расчета зарплаты за месяц
function calculateMonthlySalary(assignments, bookings, admins, servicePrices) {
    const salaryData = {};
    let totalMonthRevenue = 0;

    // Инициализация данных по зарплате для каждого администратора
    admins.forEach(admin => {
        salaryData[admin.id] = {
            name: admin.name,
            baseSalary: 0,
            bonusSalary: 0,
            totalSalary: 0,
            daysWorked: 0,
            hoursWorked: 0,
            details: []
        };
    });

    // Группировка бронирований по датам
    const bookingsByDate = {};
    bookings.forEach(booking => {
        if (typeof booking.bookingDate === 'string') {
            const dateStr = booking.bookingDate;
            if (!bookingsByDate[dateStr]) {
                bookingsByDate[dateStr] = [];
            }
            bookingsByDate[dateStr].push(booking);
        }
    });

    // Обработка каждого назначения
    assignments.forEach(assignment => {
        const dateStr = assignment.date;
        const dayBookings = bookingsByDate[dateStr] || [];
        
        // Рассчитываем выручку дня
        const { dayRevenue } = calculateDayRevenue(dayBookings, servicePrices);
        totalMonthRevenue += dayRevenue;

        // Начисление зарплаты основному администратору
        if (assignment.mainAdminId && salaryData[assignment.mainAdminId]) {
            const adminData = salaryData[assignment.mainAdminId];
            adminData.daysWorked++;
            const basePay = 500;
            adminData.baseSalary += basePay;

            const bonus = calculateAdminBonus(dayRevenue, dayBookings, !!assignment.helperAdminId, servicePrices);
            adminData.bonusSalary += bonus;
            adminData.totalSalary += basePay + bonus;

            adminData.details.push({
                date: dateStr,
                type: 'Основная смена',
                base: basePay,
                bonus: bonus,
                revenue: dayRevenue,
                hours: 0
            });
        }

        // Начисление зарплаты помощнику
        if (assignment.helperAdminId && salaryData[assignment.helperAdminId] && assignment.helperHours) {
            const helperData = salaryData[assignment.helperAdminId];
            
            // Рассчитываем выручку только от услуг "День Рождения" и фактические часы
            let birthdayRevenue = 0;
            let actualHelperHours = 0;
            
            dayBookings.forEach(booking => {
                const isBirthdayService = 
                    (booking.selectedServices && Array.isArray(booking.selectedServices) && 
                     booking.selectedServices.includes('birthday')) || 
                    booking.serviceType === 'birthday';
                
                if (isBirthdayService) {
                    const duration = parseFloat(booking.duration) || 0;
                    actualHelperHours += duration;
                    
                    // Рассчитываем выручку от ДР
                    let bookingRevenue = 0;
                    if (booking.selectedServices && Array.isArray(booking.selectedServices)) {
                        booking.selectedServices.forEach(service => {
                            if (service === 'birthday') {
                                const fullHours = Math.floor(duration);
                                const hasHalfHour = duration % 1 !== 0;
                                for (let hour = 1; hour <= fullHours; hour++) {
                                    bookingRevenue += servicePrices.birthday[hour] || servicePrices.birthday[4] || 3000;
                                }
                                if (hasHalfHour) {
                                    if (fullHours === 0 || fullHours === 1) {
                                        bookingRevenue += 2000;
                                    } else {
                                        bookingRevenue += (servicePrices.birthday[3] || 3000) / 2;
                                    }
                                }
                            }
                        });
                    }
                    
                    // Применяем скидку к выручке ДР
                    const discountPercent = booking.discountPercent || 0;
                    const discountAmount = booking.discountAmount || 0;
                    if (discountPercent > 0) {
                        bookingRevenue *= (1 - discountPercent / 100);
                    } else if (discountAmount > 0) {
                        bookingRevenue = Math.max(0, bookingRevenue - discountAmount);
                    }
                    
                    birthdayRevenue += bookingRevenue;
                }
            });
            
            actualHelperHours = Math.round(actualHelperHours);
            
            if (actualHelperHours > 0) {
                helperData.hoursWorked += actualHelperHours;
                const basePay = actualHelperHours * 150;
                helperData.baseSalary += basePay;
                
                const bonusPercent = 0.07;
                const bonus = birthdayRevenue * bonusPercent;
                helperData.bonusSalary += bonus;
                helperData.totalSalary += basePay + bonus;

                helperData.details.push({
                    date: dateStr,
                    type: 'Помощь на смене',
                    base: basePay,
                    bonus: bonus,
                    revenue: birthdayRevenue,
                    hours: actualHelperHours
                });
                
                const assignedHours = parseInt(assignment.helperHours) || 0;
                if (assignedHours !== actualHelperHours) {
                    helperData.details[helperData.details.length - 1].note = 
                        `Назначено ${assignedHours} ч, фактически ${actualHelperHours} ч по записям ДР`;
                }
            }
        }
    });

    return { salaryData, totalMonthRevenue };
}

// Функция для расчета зарплаты за неделю
function calculateWeeklyPayroll(assignments, bookings, admins, servicePrices) {
    const weeklyPayrollData = {};

    // Инициализация данных
    admins.forEach(admin => {
        weeklyPayrollData[admin.id] = { name: admin.name, total: 0 };
    });

    // Группировка бронирований по датам
    const bookingsByDate = {};
    bookings.forEach(booking => {
        if (typeof booking.bookingDate === 'string') {
            const dateStr = booking.bookingDate;
            if (!bookingsByDate[dateStr]) {
                bookingsByDate[dateStr] = [];
            }
            bookingsByDate[dateStr].push(booking);
        }
    });

    // Обработка каждого назначения
    assignments.forEach(assignment => {
        const dateStr = assignment.date;
        const dayBookings = bookingsByDate[dateStr] || [];
        
        // Рассчитываем выручку дня
        const { dayRevenue } = calculateDayRevenue(dayBookings, servicePrices);

        // Начисление основному администратору
        if (assignment.mainAdminId && weeklyPayrollData[assignment.mainAdminId]) {
            const basePay = 500;
            const bonus = calculateAdminBonus(dayRevenue, dayBookings, !!assignment.helperAdminId, servicePrices);
            weeklyPayrollData[assignment.mainAdminId].total += basePay + bonus;
        }

        // Начисление помощнику
        if (assignment.helperAdminId && weeklyPayrollData[assignment.helperAdminId] && assignment.helperHours) {
            let birthdayRevenue = 0;
            let actualHelperHours = 0;
            
            dayBookings.forEach(booking => {
                const isBirthdayService = 
                    (booking.selectedServices && Array.isArray(booking.selectedServices) && 
                     booking.selectedServices.includes('birthday')) || 
                    booking.serviceType === 'birthday';
                
                if (isBirthdayService) {
                    const duration = parseFloat(booking.duration) || 0;
                    actualHelperHours += duration;
                    
                    // Рассчитываем выручку от ДР
                    let bookingRevenue = 0;
                    if (booking.selectedServices && Array.isArray(booking.selectedServices)) {
                        booking.selectedServices.forEach(service => {
                            if (service === 'birthday') {
                                const fullHours = Math.floor(duration);
                                const hasHalfHour = duration % 1 !== 0;
                                for (let hour = 1; hour <= fullHours; hour++) {
                                    bookingRevenue += servicePrices.birthday[hour] || servicePrices.birthday[4] || 3000;
                                }
                                if (hasHalfHour) {
                                    if (fullHours === 0 || fullHours === 1) {
                                        bookingRevenue += 2000;
                                    } else {
                                        bookingRevenue += (servicePrices.birthday[3] || 3000) / 2;
                                    }
                                }
                            }
                        });
                    }
                    
                    // Применяем скидку к выручке ДР
                    const discountPercent = booking.discountPercent || 0;
                    const discountAmount = booking.discountAmount || 0;
                    if (discountPercent > 0) {
                        bookingRevenue *= (1 - discountPercent / 100);
                    } else if (discountAmount > 0) {
                        bookingRevenue = Math.max(0, bookingRevenue - discountAmount);
                    }
                    
                    birthdayRevenue += bookingRevenue;
                }
            });
            
            actualHelperHours = Math.round(actualHelperHours);
            
            if (actualHelperHours > 0) {
                const basePay = actualHelperHours * 150;
                const bonusPercent = 0.07;
                const bonus = birthdayRevenue * bonusPercent;
                weeklyPayrollData[assignment.helperAdminId].total += basePay + bonus;
                
                const assignedHours = parseInt(assignment.helperHours) || 0;
                if (assignedHours !== actualHelperHours) {
                    if (!weeklyPayrollData[assignment.helperAdminId].warnings) {
                        weeklyPayrollData[assignment.helperAdminId].warnings = [];
                    }
                    weeklyPayrollData[assignment.helperAdminId].warnings.push(
                        `${dateStr}: Назначено ${assignedHours} ч, фактически ${actualHelperHours} ч по записям ДР`
                    );
                }
            }
        }
    });

    return weeklyPayrollData;
}

// Делаем функции доступными глобально
window.calculateMonthlySalary = calculateMonthlySalary;
window.calculateWeeklyPayroll = calculateWeeklyPayroll; 