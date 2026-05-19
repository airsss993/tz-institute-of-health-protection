// Reference data for drugs: dosing per kg, max single/daily doses, renal adjustments
const DRUGS = [
  {
    id: "amoxicillin",
    name: "Амоксициллин",
    unit: "мг",
    dose: { adult: 25, child: 40, infant: 30 },        // mg/kg/day
    maxSingle: { adult: 500, child: 250, infant: 125 },  // mg per intake
    maxDaily: { adult: 3000, child: 1500, infant: 750 }, // mg/day
    renalFactor: { normal: 1, mild: 1, moderate: 0.75, severe: 0.5 },
    info: "Аминопенициллин широкого спектра. Стандартный курс 7–10 дней.",
    contraindications: { infant: false, child: false, adult: false },
  },
  {
    id: "ibuprofen",
    name: "Ибупрофен",
    unit: "мг",
    dose: { adult: 30, child: 30, infant: 20 },
    maxSingle: { adult: 400, child: 200, infant: 100 },
    maxDaily: { adult: 1200, child: 800, infant: 400 },
    renalFactor: { normal: 1, mild: 0.75, moderate: 0.5, severe: 0 }, // 0 = противопоказан
    info: "НПВП. Принимать во время или после еды. Не применять при СКФ < 30.",
    contraindications: { infant: false, child: false, adult: false },
  },
  {
    id: "paracetamol",
    name: "Парацетамол",
    unit: "мг",
    dose: { adult: 15, child: 15, infant: 15 },
    maxSingle: { adult: 1000, child: 500, infant: 150 },
    maxDaily: { adult: 4000, child: 2000, infant: 600 },
    renalFactor: { normal: 1, mild: 1, moderate: 0.75, severe: 0.5 },
    info: "Анальгетик/антипиретик. Интервал между приёмами не менее 4 часов.",
    contraindications: { infant: false, child: false, adult: false },
  },
  {
    id: "metformin",
    name: "Метформин",
    unit: "мг",
    dose: { adult: 15, child: null, infant: null },      // null = не применяется
    maxSingle: { adult: 1000, child: null, infant: null },
    maxDaily: { adult: 2000, child: null, infant: null },
    renalFactor: { normal: 1, mild: 0.75, moderate: 0, severe: 0 }, // 0 = противопоказан
    info: "Бигуанид. Принимать с едой. Противопоказан при СКФ < 45.",
    contraindications: { infant: true, child: true, adult: false },
  },
  {
    id: "gentamicin",
    name: "Гентамицин",
    unit: "мг",
    dose: { adult: 5, child: 6, infant: 7.5 },
    maxSingle: { adult: 240, child: 120, infant: 30 },
    maxDaily: { adult: 480, child: 240, infant: 90 },
    renalFactor: { normal: 1, mild: 0.75, moderate: 0.5, severe: 0.25 },
    info: "Аминогликозид. Требует мониторинга концентрации в крови и функции почек.",
    contraindications: { infant: false, child: false, adult: false },
  },
];
