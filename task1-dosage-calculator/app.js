// UI-слой: связывает DOM-форму с логикой calculator.js и отображает результат

(function () {
  // ── Кэш DOM-узлов ────────────────────────────────────────────────────────────
  const drugSelect    = document.getElementById("drug");
  const drugInfo      = document.getElementById("drug-info");
  const form          = document.getElementById("calc-form");
  const resultSection = document.getElementById("result");

  // ── Инициализация: заполнить выпадающий список препаратов ────────────────────

  // Входные данные: глобальный массив DRUGS из drugs.js
  // Результат: добавлены <option> в #drug
  DRUGS.forEach((d) => {
    const opt       = document.createElement("option");
    opt.value       = d.id;
    opt.textContent = d.name;
    drugSelect.appendChild(opt);
  });

  // ── Событие: смена препарата → показать справочную подсказку ────────────────

  drugSelect.addEventListener("change", () => {
    // Ищем выбранный препарат по id
    const drug = DRUGS.find((d) => d.id === drugSelect.value);

    if (drug) {
      // Показываем поле drug-info с кратким описанием препарата
      drugInfo.textContent = drug.info;
      drugInfo.classList.add("visible");
    } else {
      // Пользователь выбрал пустой вариант — скрываем подсказку
      drugInfo.classList.remove("visible");
    }
  });

  // ── Событие: отправка формы → валидация + расчёт + рендер ───────────────────

  form.addEventListener("submit", (e) => {
    e.preventDefault();   // Не перезагружать страницу
    clearErrors();        // Убрать ошибки прошлого запуска

    // Шаг 1: Собрать значения полей формы
    const drug      = DRUGS.find((d) => d.id === drugSelect.value);
    const weight    = parseFloat(document.getElementById("weight").value);
    const ageGroup  = document.getElementById("age-group").value;
    const frequency = parseInt(document.getElementById("frequency").value, 10);
    const renal     = document.getElementById("renal").value;

    // Шаг 2: Клиентская валидация обязательных полей
    let hasError = false;

    if (!drug) {
      markError("drug", "Выберите препарат");
      hasError = true;
    }
    if (!weight || weight <= 0 || weight > 300) {
      markError("weight", "Введите корректную массу тела (0.5 – 300 кг)");
      hasError = true;
    }

    if (hasError) return;  // Прерываем, если есть ошибки ввода

    // Шаг 3: Вызвать ядро расчёта (calculator.js)
    const result = calculateDose(drug, weight, ageGroup, frequency, renal);

    // Шаг 4: Отобразить результат
    renderResult(drug, weight, frequency, ageGroup, renal, result);
  });

  // ── renderResult ─────────────────────────────────────────────────────────────

  /**
   * Строит и вставляет HTML-блок с результатом расчёта.
   *
   * @param {Object}     drug      - Объект препарата из DRUGS
   * @param {number}     weight    - Масса тела (кг)
   * @param {number}     frequency - Кратность приёма (р/сут)
   * @param {string}     ageGroup  - "adult" | "child" | "infant"
   * @param {string}     renal     - "normal" | "mild" | "moderate" | "severe"
   * @param {DoseResult} result    - Объект, возвращённый calculateDose()
   * @returns {void}               - Побочный эффект: обновляет innerHTML #result
   */
  function renderResult(drug, weight, frequency, ageGroup, renal, result) {
    // Словари для перевода кодов в читаемые строки
    const ageLabels = { adult: "Взрослый", child: "Ребёнок", infant: "Младенец" };
    const renalLabels = {
      normal: "Норма", mild: "Лёгкое", moderate: "Умеренное", severe: "Тяжёлое",
    };

    // Шаг 1: Определить визуальный статус заголовка по уровню предупреждения
    let headerClass = "";
    let headerText  = "Результат расчёта";

    if (result.contraindicated) {
      headerClass = "danger";
      headerText  = "Применение противопоказано";
    } else if (result.warningLevel === "danger") {
      headerClass = "danger";
      headerText  = "Доза скорректирована — требует внимания";
    } else if (result.warningLevel === "warn") {
      headerClass = "warn";
      headerText  = "Доза скорректирована";
    }

    // Шаг 2: Собрать строки-параметры для таблицы результата
    const rows = [
      ["Препарат",                  drug.name],
      ["Масса тела",                `${weight} кг`],
      ["Возрастная группа",         ageLabels[ageGroup]],
      ["Нарушение функции почек",   renalLabels[renal]],
      ["Кратность приёма",          `${frequency} р/сут`],
    ];

    // Дозы добавляем только если нет противопоказания
    if (!result.contraindicated) {
      rows.push(["Разовая доза",  `${result.singleDose} мг`]);
      rows.push(["Суточная доза", `${result.dailyDose} мг/сут`]);
    }

    // Шаг 3: Сгенерировать HTML строк таблицы
    const rowsHtml = rows
      .map(
        ([label, val]) => `
        <div class="result-row">
          <span class="result-label">${label}</span>
          <span class="result-value">${val}</span>
        </div>`
      )
      .join("");

    // Шаг 4: Сгенерировать HTML блоков предупреждений
    // Последнее предупреждение при уровне "danger" окрашивается красным
    const alertsHtml = result.messages
      .map((msg, i) => {
        const isDangerLast =
          i === result.messages.length - 1 && result.warningLevel === "danger";
        const cls = isDangerLast ? "alert-box danger" : "alert-box";
        return `<div class="${cls}">${msg}</div>`;
      })
      .join("");

    // Шаг 5: Вставить итоговый HTML и прокрутить к результату
    resultSection.innerHTML = `
      <div class="result-header ${headerClass}">${headerText}</div>
      <div class="result-body">
        ${rowsHtml}
        ${alertsHtml}
      </div>
    `;
    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── markError ────────────────────────────────────────────────────────────────

  /**
   * Подсвечивает поле формы и добавляет текст ошибки под ним.
   *
   * @param {string} fieldId - id HTML-элемента поля (например, "weight")
   * @param {string} message - Текст ошибки для отображения пользователю
   * @returns {void}         - Побочный эффект: модифицирует DOM
   */
  function markError(fieldId, message) {
    const field = document.getElementById(fieldId);

    // Добавляем CSS-класс для красной рамки
    field.classList.add("error");

    // Создаём <span> с текстом ошибки и вставляем после поля
    const hint       = document.createElement("span");
    hint.className   = "error-hint";
    hint.style.cssText = "color:#dc2626;font-size:0.8rem;margin-top:2px;";
    hint.textContent = message;
    field.parentNode.appendChild(hint);
  }

  // ── clearErrors ──────────────────────────────────────────────────────────────

  /**
   * Убирает все подсветки ошибок и hint-подписи с формы.
   *
   * @returns {void} - Побочный эффект: удаляет CSS-класс "error" и элементы ".error-hint"
   */
  function clearErrors() {
    // Сбрасываем красные рамки
    document.querySelectorAll(".error").forEach((el) => el.classList.remove("error"));
    // Удаляем подписи с текстом ошибок
    document.querySelectorAll(".error-hint").forEach((el) => el.remove());
  }
})();
