// Чистая логика расчёта дозировки — без зависимостей от DOM

/**
 * @typedef {Object} DoseResult
 * @property {number}   singleDose      - Итоговая разовая доза (мг), с учётом кэппинга
 * @property {number}   dailyDose       - Итоговая суточная доза (мг), с учётом кэппинга
 * @property {boolean}  cappedSingle    - true, если разовая доза была обрезана по максимуму
 * @property {boolean}  cappedDaily     - true, если суточная доза была обрезана по максимуму
 * @property {boolean}  contraindicated - true, если препарат противопоказан
 * @property {string|null} warningLevel - null | "warn" | "danger"
 * @property {string[]} messages        - Список предупреждений для отображения пользователю
 */

/**
 * Рассчитывает разовую и суточную дозу препарата.
 *
 * Алгоритм:
 *   1. Проверить противопоказания по возрасту и функции почек.
 *   2. Рассчитать сырую суточную дозу: вес × базовая доза × почечный коэффициент.
 *   3. Разделить на кратность → сырая разовая доза.
 *   4. Обрезать разовую дозу по maxSingle.
 *   5. Пересчитать суточную через обрезанную разовую × кратность.
 *   6. Обрезать суточную по maxDaily (если нужно — снизить разовую повторно).
 *
 * @param {Object} drug           - Объект препарата из массива DRUGS
 * @param {string} drug.id        - Уникальный идентификатор препарата
 * @param {string} drug.name      - Отображаемое название
 * @param {Object} drug.dose      - Базовые дозы мг/кг/сутки по группам { adult, child, infant }
 * @param {Object} drug.maxSingle - Максимальная разовая доза (мг) по группам
 * @param {Object} drug.maxDaily  - Максимальная суточная доза (мг) по группам
 * @param {Object} drug.renalFactor - Коэффициенты коррекции по степени ХБП { normal, mild, moderate, severe }
 * @param {Object} drug.contraindications - Флаги противопоказаний по группам { adult, child, infant }
 *
 * @param {number} weight     - Масса тела пациента (кг), диапазон 0.5–300
 * @param {string} ageGroup   - Возрастная группа: "adult" | "child" | "infant"
 * @param {number} frequency  - Кратность приёма в сутки (1–4)
 * @param {string} renal      - Степень нарушения функции почек: "normal" | "mild" | "moderate" | "severe"
 *
 * @returns {DoseResult}
 */
function calculateDose(drug, weight, ageGroup, frequency, renal) {
  const messages = [];
  let warningLevel = null;

  // Шаг 1: Проверка возрастных противопоказаний
  if (drug.contraindications[ageGroup]) {
    return {
      singleDose: 0,
      dailyDose: 0,
      cappedSingle: false,
      cappedDaily: false,
      contraindicated: true,
      warningLevel: "danger",
      messages: [`${drug.name} противопоказан для данной возрастной группы.`],
    };
  }

  // Шаг 2: Извлечь параметры для текущей группы и степени ХБП
  const baseDose    = drug.dose[ageGroup];        // мг/кг/сутки
  const maxSingle   = drug.maxSingle[ageGroup];   // мг за один приём
  const maxDaily    = drug.maxDaily[ageGroup];    // мг в сутки
  const renalFactor = drug.renalFactor[renal];    // 0 = противопоказан, 0.5–1 = коррекция

  // Шаг 3: Проверка противопоказания по почечной функции (renalFactor === 0)
  if (renalFactor === 0) {
    return {
      singleDose: 0,
      dailyDose: 0,
      cappedSingle: false,
      cappedDaily: false,
      contraindicated: true,
      warningLevel: "danger",
      messages: [`${drug.name} противопоказан при данной степени нарушения функции почек.`],
    };
  }

  // Шаг 4: Рассчитать сырую суточную дозу по формуле мг/кг с почечной коррекцией
  const rawDaily  = roundTo(weight * baseDose * renalFactor, 1); // мг/сут
  // Шаг 5: Получить сырую разовую дозу делением суточной на кратность
  const rawSingle = roundTo(rawDaily / frequency, 1);            // мг/приём

  let singleDose  = rawSingle;
  let dailyDose   = rawDaily;
  let cappedSingle = false;
  let cappedDaily  = false;

  // Шаг 6: Кэппинг разовой дозы — не превышать maxSingle
  if (singleDose > maxSingle) {
    singleDose   = maxSingle;
    cappedSingle = true;
    messages.push(`Разовая доза ограничена максимально допустимой (${maxSingle} мг).`);
    warningLevel = "warn";
  }

  // Шаг 7: Пересчитать суточную из (возможно скорректированной) разовой
  dailyDose = roundTo(singleDose * frequency, 1);

  // Шаг 8: Кэппинг суточной дозы — если даже после шага 6 превышает maxDaily
  if (dailyDose > maxDaily) {
    // Снижаем разовую ещё раз, чтобы suточная не превысила максимум
    singleDose   = roundTo(maxDaily / frequency, 1);
    dailyDose    = maxDaily;
    cappedSingle = true;
    cappedDaily  = true;
    messages.push(`Суточная доза ограничена максимально допустимой (${maxDaily} мг/сут).`);
    warningLevel = "danger";
  }

  // Шаг 9: Добавить информационное сообщение о почечной коррекции
  if (renal !== "normal" && renalFactor < 1) {
    messages.push(
      `Применён коэффициент коррекции для почечной недостаточности (×${renalFactor}).`
    );
    if (warningLevel === null) warningLevel = "warn";
  }

  return {
    singleDose,
    dailyDose,
    cappedSingle,
    cappedDaily,
    contraindicated: false,
    warningLevel,
    messages,
  };
}

/**
 * Округляет число до заданного количества знаков после запятой.
 *
 * @param {number} value    - Исходное число
 * @param {number} decimals - Количество знаков после запятой (≥ 0)
 * @returns {number}        - Округлённое число
 */
function roundTo(value, decimals) {
  // Умножаем, округляем стандартным Math.round, делим обратно
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
