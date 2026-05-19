"""
Скрипт получает официальные курсы валют ЦБ РФ через публичное API,
вычисляет изменение курса относительно предыдущего дня и сохраняет
результат в CSV-файл, а также выводит форматированную таблицу в консоль.

API: https://www.cbr-xml-daily.ru/daily_json.js  — без авторизации, JSON
"""

import csv
import json
import sys
from datetime import datetime
from pathlib import Path

import requests

# URL публичного API ЦБ РФ (не требует ключа)
API_URL = "https://www.cbr-xml-daily.ru/daily_json.js"
TIMEOUT = 10  # максимальное время ожидания ответа в секундах

# Коды валют, которые включаются в итоговую выборку
CURRENCIES_OF_INTEREST = {"USD", "EUR", "CNY", "GBP", "JPY", "CHF", "TRY", "KZT", "BYN", "AED"}


def fetch_rates() -> dict:
    """
    Загружает JSON с актуальными курсами валют от API ЦБ РФ.

    Входные параметры: нет (использует модульные константы API_URL, TIMEOUT)

    Возвращает:
        dict: распарсенный JSON-ответ вида
              {
                "Date": "2026-05-19T...",
                "Valute": {
                  "USD": { "Nominal": 1, "Value": 72.35, "Previous": 73.13, ... },
                  ...
                }
              }

    Бросает:
        RuntimeError: при сетевой ошибке, таймауте, HTTP-ошибке,
                      невалидном JSON или неожиданной структуре ответа.
    """
    # Шаг 1: Выполнить HTTP GET-запрос к API
    try:
        resp = requests.get(API_URL, timeout=TIMEOUT)
        resp.raise_for_status()   # бросит HTTPError при 4xx/5xx
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Нет подключения к интернету или API недоступен.")
    except requests.exceptions.Timeout:
        raise RuntimeError(f"API не ответил за {TIMEOUT} секунд.")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"HTTP-ошибка: {e.response.status_code}")

    # Шаг 2: Десериализовать тело ответа из JSON
    try:
        data = resp.json()
    except json.JSONDecodeError:
        raise RuntimeError("Ответ API не является корректным JSON.")

    # Шаг 3: Проверить наличие ключевого поля "Valute" в ответе
    if "Valute" not in data:
        raise RuntimeError("Неожиданная структура ответа: отсутствует ключ 'Valute'.")

    return data


def process_rates(data: dict) -> list[dict]:
    """
    Обрабатывает сырой ответ API: фильтрует нужные валюты,
    нормирует курсы к 1 единице и вычисляет изменение за день.

    Входные параметры:
        data (dict): распарсенный JSON от fetch_rates(), содержащий ключи
                     "Date" (str) и "Valute" (dict со словарями по каждой валюте).

    Возвращает:
        list[dict]: список записей, отсортированных по убыванию курса.
                    Каждая запись — словарь с ключами:
                      date         (str)   — дата курса "YYYY-MM-DD"
                      code         (str)   — ISO-код валюты, напр. "USD"
                      name         (str)   — название валюты на русском
                      nominal      (int)   — номинал (1, 10 или 100 единиц)
                      rate_rub     (float) — курс за 1 единицу, текущий
                      prev_rate_rub(float) — курс за 1 единицу, вчера
                      change_abs   (float) — абсолютное изменение (руб.)
                      change_pct   (float) — изменение в процентах
    """
    # Шаг 1: Извлечь дату (первые 10 символов ISO-строки → "YYYY-MM-DD")
    date_str = data.get("Date", "")[:10]
    valutes = data["Valute"]   # dict { "USD": {...}, "EUR": {...}, ... }

    rows = []

    # Шаг 2: Перебрать все валюты из ответа, оставить только нужные
    for code, v in valutes.items():
        if code not in CURRENCIES_OF_INTEREST:
            continue

        nominal  = v["Nominal"]    # ЦБ даёт курс за номинал (1 / 10 / 100 единиц)
        current  = v["Value"]      # курс за номинал, текущий день
        previous = v["Previous"]   # курс за номинал, предыдущий день

        # Шаг 3: Нормировать к 1 единице валюты (делением на номинал)
        rate_rub   = round(current / nominal, 4)
        prev_rate  = round(previous / nominal, 4)

        # Шаг 4: Вычислить абсолютное и относительное изменение
        change_abs = round(rate_rub - prev_rate, 4)
        change_pct = round((change_abs / prev_rate) * 100, 2) if prev_rate else 0.0

        rows.append({
            "date":          date_str,
            "code":          code,
            "name":          v["Name"],
            "nominal":       nominal,
            "rate_rub":      rate_rub,
            "prev_rate_rub": prev_rate,
            "change_abs":    change_abs,
            "change_pct":    change_pct,
        })

    # Шаг 5: Отсортировать по курсу по убыванию (самая дорогая валюта первой)
    rows.sort(key=lambda r: r["rate_rub"], reverse=True)
    return rows


def save_csv(rows: list[dict], path: Path) -> None:
    """
    Сохраняет обработанные данные в CSV-файл.

    Входные параметры:
        rows (list[dict]): список записей, сформированный в process_rates()
        path (Path):       путь к файлу для записи (будет перезаписан при наличии)

    Возвращает: None (создаёт / перезаписывает файл по указанному пути)
    """
    fieldnames = ["date", "code", "name", "nominal", "rate_rub", "prev_rate_rub",
                  "change_abs", "change_pct"]

    # Шаг 1: Открыть файл для записи с UTF-8 и без лишних пустых строк (newline="")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        # Шаг 2: Записать строку заголовков
        writer.writeheader()
        # Шаг 3: Записать все строки данных
        writer.writerows(rows)


def print_table(rows: list[dict], date_str: str) -> None:
    """
    Выводит в консоль форматированную таблицу курсов.

    Входные параметры:
        rows     (list[dict]): список записей из process_rates()
        date_str (str):        дата курса в формате "YYYY-MM-DD"

    Возвращает: None (побочный эффект: вывод в stdout)
    """
    # Шаг 1: Заголовок таблицы
    print(f"\n{'='*62}")
    print(f"  Курсы ЦБ РФ на {date_str}")
    print(f"{'='*62}")
    print(f"{'Код':<6} {'Валюта':<25} {'Курс (руб.)':<14} {'Изм. руб.':<12} {'Изм. %'}")
    print(f"{'-'*62}")

    # Шаг 2: Вывести по одной строке на валюту
    for r in rows:
        # Стрелка: ▲ рост, ▼ падение, – без изменений
        arrow = "▲" if r["change_abs"] > 0 else ("▼" if r["change_abs"] < 0 else "–")
        sign  = "+" if r["change_abs"] > 0 else ""

        print(
            f"{r['code']:<6} {r['name'][:24]:<25} {r['rate_rub']:<14.4f}"
            f" {sign}{r['change_abs']:<11.4f} {arrow} {sign}{r['change_pct']:.2f}%"
        )

    print(f"{'='*62}\n")


def main() -> None:
    """
    Точка входа: оркестрирует fetch → process → print → save.

    Входные параметры: нет
    Возвращает: None
    Завершает процесс с кодом 1 при ошибке загрузки данных.
    """
    print("Загружаю данные с API ЦБ РФ...")

    # Шаг 1: Загрузить данные; при ошибке — сообщить и выйти
    try:
        data = fetch_rates()
    except RuntimeError as e:
        print(f"[ОШИБКА] {e}", file=sys.stderr)
        sys.exit(1)

    # Шаг 2: Обработать и отфильтровать нужные валюты
    rows = process_rates(data)

    # Шаг 3: Определить дату для заголовка (берём из первой записи или сегодня)
    date_str = rows[0]["date"] if rows else datetime.today().strftime("%Y-%m-%d")

    # Шаг 4: Вывести таблицу в консоль
    print_table(rows, date_str)

    # Шаг 5: Сохранить результат в CSV рядом с местом запуска скрипта
    output_path = Path("cbr_rates.csv")
    save_csv(rows, output_path)
    print(f"Данные сохранены в {output_path.resolve()}")


if __name__ == "__main__":
    main()
