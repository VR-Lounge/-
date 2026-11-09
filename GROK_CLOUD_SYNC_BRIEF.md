# Grok ↔ Cloud Cursor ↔ Desktop — единый sync-бриф

**Дата:** 2026-11-09 ~20:00 (МСК)  
**Статус sync:** **DELIVERY contour** — публичная ссылка + CRM + бот  
**SoT:** `GIFT_CARD_SYNC_SOURCE_OF_TRUTH.md` (не спорить)  
**HITL:** деньги / OTP / прод vr-lounge.ru — только явное ок. Push github.io Pages + правки бота — по мандату delivery можно.

### Сообщение Grok («VR-клуб Кольчугино») — UX CRM + PDF 2026-11-09
1. CRM-тексты для Юлии: убрали jargon (Firestore / ledger / giftLedger / pending→issued в пояснениях). Человеческий сценарий: заявка → оплата → выпуск → списание при визите.
2. Поле «ID записи» → **телефон гостя** с маской RU (+7 / 8…); в ledger `bookingId` = нормализованный phone.
3. Кнопка **«Скопировать номер карты»** рядом со ссылкой.
4. Print/PDF (`&print=1`): крупная лицевая карта, Давид без обрезки, print-sheet мета + footer; панели истории на печати скрыты.
5. Runbook обновлён одной строкой для Юлии. Deploy: CRM Pages + redesign Pages.

### Ack ожидание от Grok («VR-клуб Кольчугино»)
Принять как канон выдачи клиенту:
1. Клиент получает **уникальную ссылку** `gift.html?code=VRL-XXXXXX`, не «просто PDF».
2. Страница: 3D flip (язык redesign), баланс, история RO, PDF / позвонить / записаться.
3. CRM: «Скопировать ссылку» + «Скопировать номер карты» + PDF + offer после activate.
4. Бот `@vr_lounge33_bot`: после activate доставляет ссылку (phone→telegram) или пишет админу «отправь вручную» + `/giftlink`.
5. Списание только в CRM. Публичка read-only.

---

## 1. Кто где

| Агент / канал | Статус |
|---------------|--------|
| Grok «VR-клуб Кольчугино» | Канон + этот бриф |
| Desktop Cursor | Интегратор delivery |
| GitHub redesign | `VR-Lounge/vr-lounge-redesign` → Pages |
| CRM | `VR-Lounge/-` → Pages |
| Бот | Render + `telegram-bot.js` (без Blaze) |

---

## 2. Как выдаём клиенту (полный сценарий)

**Покупатель** → форма Подарить → `pending` → Юлия звонит/оплата → CRM activate →  
**ссылка** `https://vr-lounge.github.io/vr-lounge-redesign/gift.html?code=VRL-XXXXXX`  
→ бот шлёт покупателю **или** Юлия копирует из CRM / получает текст от бота →  
**получатель** открывает страницу (flip, баланс, история) → визит → Юлия списывает в CRM.

Пример (тест): `https://vr-lounge.github.io/vr-lounge-redesign/gift.html?code=VRL-W2C7GB`

---

## 3. Пути файлов (чинить здесь)

| Зона | Файлы |
|------|-------|
| Публичная страница | `vr-lounge-redesign/gift.html`, `css/gift-page.css`, `js/gift-page.js`, `css/vrl-gift.css` |
| Shared API | `vr-lounge-redesign/js/gift-cards.js` + копия CRM `gift-cards.js` |
| CRM UI | `CRM VR Lounge/gift-cards.js`, `index.html` (секция), `gift.html` (redirect) |
| Бот | `CRM VR Lounge/telegram-bot.js` (`setupNewGiftCardListener`, `setupGiftCardDeliveryListener`, `/giftlink`) |
| Rules | `CRM VR Lounge/firestore.rules` |
| Docs | `GIFT_CARD_SYNC_SOURCE_OF_TRUTH.md`, `GIFT_CARD_OPERATOR_RUNBOOK.md`, этот бриф |

---

## 4. Как чинить типичное

| Симптом | Действие |
|---------|----------|
| Ссылка 404 / старая плоская карта | Push redesign Pages; hard refresh `gift.html` |
| CRM копирует неверный URL | `publicPageUrl()` → всегда redesign base |
| Бот не шлёт после activate | Рестарт Render; проверить `issuedAt` + `deliveryNotifiedAt`; `/giftlink CODE` |
| Нет telegram у покупателя | Ожидаемо → админу текст + ручная отправка ссылки |
| Списание с публички | Не должно быть; если появилось — баг, откатить |
| Карта не найдена | Проверить `publicCode` и rules read |

---

## 5. Запреты

1. Не плодить вторую CRM / gift-БД / нового бота.  
2. Не делать эквайринг в v1.  
3. Не деплоить vr-lounge.ru без явного HITL.  
4. Grok не запускает параллельный cloud work на выдачу без чтения SoT + этого брифа.

---

## 6. Экономика

Landed cost контура выдачи ≈ **0 ₽** новых сервисов. Экономия времени Юлии: ссылка + бот вместо ручной сборки PDF как единственного канала; PDF остаётся опцией с той же страницы (`&print=1`).
