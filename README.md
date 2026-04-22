# OTP Arrow Finder

Поиск зелёной стрелки на OTP-изображениях с вырезанием области справа от стрелки.

## Быстрый старт

### Запуск готового EXE (без Node.js)

```powershell
# С конкретным файлом
.\otp-finder.exe "./img/OTP 996943.png"

# Без аргументов (использует IMAGE_PATH из main.js)
.\otp-finder.exe
```

### Результат (JSON)

```json
{
  "found": true,
  "leftEdge": { "x": 6, "y": 169 },
  "rightEdge": { "x": 86, "y": 169 },
  "boundingBox": { "x": 6, "y": 157, "width": 81, "height": 23 },
  "greenPixelsCount": 1407,
  "savedRectBase64": "iVBORw0KGgoAAAANSUhEUgAAANY...",
  "savedRect": "rect_1776878610439_9whv0b.png"
}
```

---

## Настройки (в main.js)

```javascript
// Путь к изображению для обработки
const IMAGE_PATH = './img/OTP 996943.png';

// Отладочное изображение (или null)
const DEBUG_IMAGE_PATH = null;

// Сохранять прямоугольник в файл (true/false)
const SAVE_RECT_FILE = true;

// Путь для файла:
// - "./" — текущая папка
// - "./myfolder/" — конкретная папка
// - "./output.png" — конкретный путь
// - null — временная папка системы
const SAVE_RECT_PATH = "./";
```

---

## Компиляция EXE из исходников

### Требования

- Node.js 18+
- npm

### Шаги

1. **Установить pkg глобально:**
   ```bash
   npm install -g pkg
   ```

2. **Скомпилировать EXE:**
   ```bash
   pkg main.js --target node18-win --output otp-finder.exe --compress GZip
   ```

3. **Готово!** Файл `otp-finder.exe` появится в текущей папке (~40 МБ).

---

## Использование с аргументами

| Команда | Описание |
|---------|----------|
| `.\otp-finder.exe` | Обрабатывает `IMAGE_PATH` из `main.js` |
| `.\otp-finder.exe "./img/file.png"` | Обрабатывает конкретный файл |
| `.\otp-finder.exe "C:\path\to\file.png"` | Абсолютный путь |

> ⚠️ **Важно:** В PowerShell используйте `.\` перед именем EXE. Если путь содержит пробелы — используйте кавычки.

---

## Поля в ответе JSON

| Поле | Описание |
|------|----------|
| `found` | `true` — стрелка найдена, `false` — не найдена |
| `leftEdge` | Координаты центра левого края стрелки |
| `rightEdge` | Координаты центра правого края стрелки |
| `boundingBox` | Размер и позиция bounding box зелёных пикселей |
| `greenPixelsCount` | Количество зелёных пикселей |
| `savedRectBase64` | Base64-код вырезанной области (всегда) |
| `savedRect` | Путь к сохранённому файлу (если `SAVE_RECT_FILE = true`) |

---

## Вырезанная область

- Начинается от `rightEdge.x` (правый край стрелки)
- До правого края изображения
- Высота: 20 пикселей (`centerY ± 10`)

---

## Зависимости

- `jimp` — обработка изображений

Установка:
```bash
npm install
```