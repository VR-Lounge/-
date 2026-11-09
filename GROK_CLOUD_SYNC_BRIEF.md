# Grok ↔ Cloud Cursor ↔ Desktop — единый sync-бриф

**Дата:** 2026-11-09 18:00 (МСК)  
**Статус sync:** **выровнен каноном** (бриф → Grok 18:00; ack 18:00:26 / 18:00:55)  
**SoT:** `GIFT_CARD_SYNC_SOURCE_OF_TRUTH.md` (не спорить)  
**HITL:** деньги / публикация / прод / OTP / `firebase deploy` / Pages — **только явное «деплой»**

### Ack Grok («VR-клуб Кольчугино»)
> Принял бриф как рабочий канон. SoT = `GIFT_CARD_SYNC_SOURCE_OF_TRUTH.md`; UI — облачный Cursor; CRM/Firebase/Telegram — локальный интегратор. Вторую CRM / параллельные gift-модули не создаём. Деплой — только по явной команде «деплой».  
> Сохранил канон в памяти; старый план превью больше не актуален; ничего не запускает и не выкладывает.

---

## 1. Кто где (факт)

| Агент / канал | ID / путь | Статус |
|---------------|-----------|--------|
| GrokBot спец.агент | «VR-клуб Кольчугино» (Grok Bot.app) | **Нашёл**, чат открыт; головной «Основной Bot» закреплён |
| Cloud Cursor work | `bc-4ee4d687-0d2b-58cf-aa0e-c8437b0ae6c6`, env `gift-card-preview-e6c6` | Ссылка живая в Grok; UI gift → GitHub |
| Cloud sidebar label | «VR Lounge — превью подарочной карты» | Виден в ленте Grok (4 / 15 msgs) |
| Desktop Cursor (эта сессия) | workspace `VR Lounge` | Интегратор CRM + sync |
| GitHub redesign | `VR-Lounge/vr-lounge-redesign` | Клон локально |
| CRM live | https://vr-lounge.github.io/-/ | Истина UI CRM |
| CRM код | `/Users/LOBANOFF-PRO/Documents/VR Lounge/CRM VR Lounge` | Локальные gift-патчи применены |

**Живого API-коннекта** к cloud agent / Grok из desktop Cursor **нет**. Синхронизация = SoT + этот бриф + GitHub артефакты + сообщение в Grok (18:00).

> Computer Use **не управляет Cursor IDE** (блок политики). Cloud-статус снят через Grok-ссылки + `git`/`gh`, не через клики по Agents sidebar.

---

## 2. Git карта (redesign)

| Ветка | vs `main` | Вердикт |
|-------|-----------|---------|
| `cursor/gift-card-preview-e6c6` (+ ui/flip/name/…-e6c6) | **влито** (PR #4 MERGED) | UI gift в `origin/main` |
| `cursor/gift-crm-integrate-e6c6` | **+3 коммита** не в main | Патч-пак CRM + Firestore submit в `js/gift.js` |
| Локальный `main` redesign | `js/gift.js` **модифицирован** (реальный submit); `js/gift-cards.js`, `gift.html` untracked | Код интегратора на диске, **не запушен / не деплоен** |

**Итог:** UI cloud уже в remote main; CRM-интеграция cloud **не** в remote main, но **перенесена локально** в CRM + локальный redesign submit.

---

## 3. Карта владения (чтобы не конфликтовать)

| Зона | Владелец | Не трогать |
|------|----------|------------|
| Gift **UI** (карта, flip, hero buttons, popup UX) | Cloud Cursor works / уже в `main` redesign | Не форкать вторую визуальную ветку без нужды |
| Gift **submit** → Firestore `pending` | Desktop интегратор (локальный `js/gift.js` + `js/gift-cards.js`) | Cloud не пушить параллельный submit в обход SoT |
| **CRM** UI (`gift-cards.js`, секция в `index.html`) | Desktop / папка CRM VR Lounge | Запрет второй CRM; `crm-gift/` на redesign — архив, не прод |
| **Telegram** `setupNewGiftCardListener` | Desktop CRM `telegram-bot.js` | |
| **Firestore rules** `giftCards` / `giftLedger` | Desktop CRM `firestore.rules` (черновик) | **Deploy = HITL** |
| **Pages / prod сайт / Functions** | HITL (Юлия / Александр явным «деплой») | Никто не деплоит сам |
| Оркестрация канона / sync | Desktop Cursor + этот бриф → Grok | |

---

## 4. Канон продукта (кратко)

- Визуал: горизонтальная «банковская» карта (Давид слева, сумма/имя/номер справа).
- Вход: Play / Birthday / **Gift** → popup 1000–20000 ₽.
- Поток: phone (+ name?) → Firestore `giftCards` `pending` → CRM + Telegram → HITL Юлия (оплата) → activate / баланс / PDF-PNG вручную.
- Одна БД: Firebase `vr-lounge33`. Без эквайринга v1.

---

## 5. Что уже сделано / что ждёт

**Сделано**
- Cloud: UI gift → PR #4 merged в redesign `main`.
- Desktop: CRM `gift-cards.js`, rules draft, telegram listener, локальный redesign submit.
- Sync-бриф отправлен в Grok «VR-клуб Кольчугино» (2026-11-09 18:00).

**Не сделано (HITL)**
- `firebase deploy` (rules / functions)
- Push/Pages CRM и redesign с live submit
- Рестарт Render-бота при необходимости

---

## 6. Запреты конфликтов

1. Не плодить вторую CRM / отдельную gift-БД.  
2. Не деплоить rules/Pages/Functions без явного «деплой».  
3. Cloud не переписывает локальную CRM в обход папки `CRM VR Lounge`.  
4. Desktop не открывает параллельный UI-форк «с нуля» — UI уже в main.  
5. Grok не запускает новых cloud works на ту же фичу без чтения этого брифа + SoT.

---

## 7. Экономика (P0)

Одна CRM, ручной выпуск после оплаты → нет комиссии эквайринга; опер.стоимость ≈ 10–15 мин/заявка. Новых платных сервисов нет (reuse Firebase + Telegram). Landed cost деплоя ≈ 0 ₽ (уже оплаченные Firebase/GitHub/Render).
