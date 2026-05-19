/**
 * Apps Script: Курсы валют ЦБ РФ в Google Таблице
 *
 * Источник данных: https://www.cbr-xml-daily.ru/daily_json.js
 * Триггер: пункт меню «Обновить курсы» (ручной) +
 *          ежедневный таймер в 9:00 (устанавливается через меню).
 *
 * Структура листа «Курсы»:
 *   Строка 1 — заголовки столбцов
 *   Строка 2 — статус последнего обновления
 *   Строки 3+ — данные по валютам
 */

var SHEET_NAME = "Курсы";
var API_URL    = "https://www.cbr-xml-daily.ru/daily_json.js";

// Коды ISO-валют, которые записываются в таблицу (порядок задаёт приоритет выборки)
var CURRENCIES = ["USD", "EUR", "CNY", "GBP", "JPY", "CHF", "TRY", "KZT", "AED", "BYN"];

// ── Меню ──────────────────────────────────────────────────────────────────────

/**
 * Добавляет пользовательское меню при открытии таблицы.
 * Вызывается автоматически триггером onOpen.
 *
 * Входные параметры: нет
 * Возвращает: void (побочный эффект: добавляет меню в UI таблицы)
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Валюты ЦБ РФ")
    .addItem("Обновить курсы", "fetchAndWriteRates")
    .addSeparator()
    .addItem("Установить ежедневный триггер", "setDailyTrigger")
    .addItem("Удалить триггер", "removeDailyTrigger")
    .addToUi();
}

// ── Основная функция ──────────────────────────────────────────────────────────

/**
 * Загружает курсы с API, обрабатывает и записывает в лист «Курсы».
 * Вызывается по нажатию меню или ежедневным триггером.
 *
 * Входные параметры: нет
 * Возвращает: void
 *   Побочные эффекты:
 *     - Обновляет строки 1–(N+2) листа SHEET_NAME
 *     - Записывает статус в A2 (успех или текст ошибки)
 */
function fetchAndWriteRates() {
  // Шаг 1: Получить (или создать) рабочий лист
  var sheet = getOrCreateSheet();

  // Шаг 2: Показать статус «загрузка» до окончания запроса
  setStatus(sheet, "⏳ Загрузка…", "#f59e0b");

  // Шаг 3: Выполнить HTTP-запрос к API ЦБ РФ
  var response;
  try {
    response = UrlFetchApp.fetch(API_URL, { muteHttpExceptions: true });
  } catch (e) {
    // Сеть недоступна или Apps Script заблокировал запрос
    setStatus(sheet, "❌ Ошибка сети: " + e.message, "#dc2626");
    return;
  }

  // Шаг 4: Проверить HTTP-статус ответа (ожидаем 200 OK)
  if (response.getResponseCode() !== 200) {
    setStatus(sheet, "❌ HTTP " + response.getResponseCode(), "#dc2626");
    return;
  }

  // Шаг 5: Десериализовать тело ответа из JSON
  var data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (e) {
    setStatus(sheet, "❌ Некорректный JSON от API", "#dc2626");
    return;
  }

  // Шаг 6: Проверить наличие ключевого поля "Valute" в структуре ответа
  if (!data || !data.Valute) {
    setStatus(sheet, "❌ Неожиданная структура ответа API", "#dc2626");
    return;
  }

  // Шаг 7: Извлечь дату курса (первые 10 символов ISO-строки → "YYYY-MM-DD")
  var rateDate = (data.Date || "").substring(0, 10);

  // Шаг 8: Сформировать строки таблицы из сырых данных
  var rows = buildRows(data.Valute, rateDate);

  // Шаг 9: Записать заголовки и данные на лист
  writeHeaders(sheet);
  writeData(sheet, rows);

  // Шаг 10: Обновить статус на успешный с временем обновления
  setStatus(sheet, "✅ Обновлено: " + new Date().toLocaleString("ru-RU"), "#16a34a");
}

// ── Обработка данных ──────────────────────────────────────────────────────────

/**
 * Формирует двумерный массив строк для записи в таблицу.
 * Для каждой валюты вычисляет курс за 1 единицу и изменение за день.
 *
 * Входные параметры:
 *   valute   {Object} — объект data.Valute из ответа API;
 *                       ключи — ISO-коды ("USD", "EUR", ...),
 *                       значения — { Nominal, Value, Previous, Name, ... }
 *   rateDate {string} — дата курса "YYYY-MM-DD" для записи в первый столбец
 *
 * Возвращает:
 *   {Array<Array>} — массив строк, каждая строка:
 *     [rateDate, code, name, nominal, rateRub, prevRub, changeAbs, changePct]
 *     Отсортирован по убыванию rateRub (самая дорогая валюта первой).
 */
function buildRows(valute, rateDate) {
  var rows = [];

  // Шаг 1: Пройти по списку нужных валют и извлечь данные
  for (var i = 0; i < CURRENCIES.length; i++) {
    var code = CURRENCIES[i];
    var v    = valute[code];

    // Если валюта отсутствует в ответе API — пропускаем
    if (!v) continue;

    var nominal  = v.Nominal;    // кол-во единиц, за которое задан курс (1 / 10 / 100)
    var current  = v.Value;      // курс за nominal единиц, текущий день
    var previous = v.Previous;   // курс за nominal единиц, предыдущий день

    // Шаг 2: Нормировать курс к 1 единице валюты (деление на номинал)
    var rateRub   = roundTo(current / nominal, 4);
    var prevRub   = roundTo(previous / nominal, 4);

    // Шаг 3: Вычислить абсолютное и относительное изменение курса
    var changeAbs = roundTo(rateRub - prevRub, 4);
    var changePct = prevRub ? roundTo((changeAbs / prevRub) * 100, 2) : 0;

    rows.push([rateDate, code, v.Name, nominal, rateRub, prevRub, changeAbs, changePct]);
  }

  // Шаг 4: Отсортировать по убыванию курса (индекс 4 — rateRub)
  rows.sort(function(a, b) { return b[4] - a[4]; });
  return rows;
}

// ── Запись в лист ─────────────────────────────────────────────────────────────

/**
 * Записывает строку заголовков в первую строку листа и форматирует её.
 *
 * Входные параметры:
 *   sheet {Sheet} — объект листа Google Таблицы
 *
 * Возвращает: void
 *   Побочный эффект: строка 1 листа перезаписывается заголовками с тёмным фоном.
 */
function writeHeaders(sheet) {
  var headers = [
    "Дата курса", "Код", "Название валюты", "Номинал",
    "Курс (руб.)", "Курс вчера (руб.)", "Изм. (руб.)", "Изм. (%)"
  ];

  // Шаг 1: Записать заголовки в диапазон A1:H1
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // Шаг 2: Применить стиль (жирный текст, тёмный фон, белый цвет)
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#1e3a5f");
  headerRange.setFontColor("#ffffff");
}

/**
 * Очищает старые данные (строки 3+) и записывает новые строки курсов.
 * Форматирует числовые ячейки и подсвечивает рост/падение.
 *
 * Входные параметры:
 *   sheet {Sheet}        — объект листа Google Таблицы
 *   rows  {Array<Array>} — данные из buildRows(), двумерный массив
 *
 * Возвращает: void
 *   Побочные эффекты: строки 3+ листа перезаписываются; применяется форматирование.
 */
function writeData(sheet, rows) {
  // Шаг 1: Удалить старые данные начиная с 3-й строки (заголовок и статус сохраняются)
  var lastRow = sheet.getLastRow();
  if (lastRow >= 3) {
    sheet.getRange(3, 1, lastRow - 2, 8).clearContent().clearFormat();
  }

  // Если данных нет — выходим досрочно
  if (rows.length === 0) return;

  // Шаг 2: Записать массив строк в диапазон начиная с A3
  var dataRange = sheet.getRange(3, 1, rows.length, rows[0].length);
  dataRange.setValues(rows);

  // Шаг 3: Применить числовые форматы к нужным столбцам
  sheet.getRange(3, 5, rows.length, 1).setNumberFormat("#,##0.0000");                  // Курс (руб.)
  sheet.getRange(3, 6, rows.length, 1).setNumberFormat("#,##0.0000");                  // Курс вчера
  sheet.getRange(3, 7, rows.length, 1).setNumberFormat("+#,##0.0000;-#,##0.0000;0.0000"); // Изм. руб.
  sheet.getRange(3, 8, rows.length, 1).setNumberFormat("+0.00%;-0.00%;0.00%");         // Изм. %

  // Шаг 4: Цветовая подсветка столбца «Изм. (руб.)» (зелёный рост, красное падение)
  for (var i = 0; i < rows.length; i++) {
    var change = rows[i][6];   // changeAbs — индекс 6
    var cell   = sheet.getRange(i + 3, 7);
    if (change > 0)      cell.setFontColor("#16a34a");   // зелёный
    else if (change < 0) cell.setFontColor("#dc2626");   // красный
  }

  // Шаг 5: Автоподбор ширины столбцов для удобства просмотра
  sheet.autoResizeColumns(1, 8);
}

// ── Вспомогательные функции ───────────────────────────────────────────────────

/**
 * Возвращает лист с именем SHEET_NAME; создаёт его, если он не существует.
 *
 * Входные параметры: нет
 * Возвращает:
 *   {Sheet} — объект листа (существующего или только что созданного)
 */
function getOrCreateSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  // Если лист отсутствует — создать новый с нужным именем
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

/**
 * Записывает статусное сообщение в ячейку A2 листа.
 *
 * Входные параметры:
 *   sheet   {Sheet}  — объект листа Google Таблицы
 *   message {string} — текст для отображения (например, "✅ Обновлено: ...")
 *   color   {string} — CSS hex-цвет текста (например, "#dc2626")
 *
 * Возвращает: void (побочный эффект: изменяет ячейку A2)
 */
function setStatus(sheet, message, color) {
  var cell = sheet.getRange("A2");
  cell.setValue(message);
  cell.setFontColor(color || "#4b5563");
  cell.setFontWeight("normal");
}

/**
 * Округляет число до заданного количества знаков после запятой.
 *
 * Входные параметры:
 *   value    {number} — исходное число
 *   decimals {number} — количество знаков после запятой (целое, ≥ 0)
 *
 * Возвращает:
 *   {number} — округлённое число
 */
function roundTo(value, decimals) {
  // Умножаем на 10^decimals, округляем, делим обратно — избегаем float-артефактов
  var factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ── Управление триггером ──────────────────────────────────────────────────────

/**
 * Устанавливает ежедневный триггер запуска fetchAndWriteRates в 9:00.
 * Перед созданием удаляет дублирующие триггеры через removeDailyTrigger().
 *
 * Входные параметры: нет
 * Возвращает: void (побочный эффект: создаёт триггер в проекте Apps Script)
 */
function setDailyTrigger() {
  // Шаг 1: Удалить существующие триггеры на fetchAndWriteRates (защита от дублей)
  removeDailyTrigger();

  // Шаг 2: Создать новый триггер — ежедневно в 9:00
  ScriptApp.newTrigger("fetchAndWriteRates")
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  SpreadsheetApp.getUi().alert("Триггер установлен: ежедневно в 9:00.");
}

/**
 * Удаляет все триггеры проекта, связанные с fetchAndWriteRates.
 *
 * Входные параметры: нет
 * Возвращает: void (побочный эффект: удаляет триггеры из проекта)
 */
function removeDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();

  // Перебираем все триггеры проекта и удаляем нужные по имени обработчика
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "fetchAndWriteRates") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
