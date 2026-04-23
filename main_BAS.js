const PNG = require('pngjs').PNG;
const path = require('path');
const os = require('os');
const fs = require('fs');

// ============================================
// НАСТРОЙКИ ЛОГГИРОВАНИЯ
// ============================================

// Включить логирование (true = да, false = нет)
const ENABLE_LOGS = true;

// Вспомогательная функция для логирования
function log(message) {
  if (ENABLE_LOGS) {
    console.log(message);
  }
}

log('Используется библиотека pngjs для обработки изображений');

async function findOTPArrowLeftCenter(imagePath) {
  log('=== Начало функции findOTPArrowLeftCenter ===');
  log('Путь к изображению: ' + imagePath);
  
  // Проверка существования файла
  log('Проверка существования файла...');
  if (!fs.existsSync(imagePath)) {
    log('ФАЙЛ НЕ НАЙДЕН!');
    BAS_VARS["RESULT"] = JSON.stringify({ found: false, error: 'Файл не найден: ' + imagePath });
    return null;
  }
  log('Файл найден.');

  // Проверка размера файла
  const stats = fs.statSync(imagePath);
  log('Размер файла: ' + stats.size + ' байт');
  
  try {
    log('Чтение PNG файла в буфер...');
    const fileBuffer = fs.readFileSync(imagePath);
    log('Буфер прочитан: ' + fileBuffer.length + ' байт');
    
    log('Парсинг PNG через pngjs...');
    const png = PNG.sync.read(fileBuffer);
    log('PNG распарсен. Размер: ' + png.width + 'x' + png.height);
    
    const width = png.width;
    const height = png.height;
    const data = png.data;
    log('Размер данных: ' + data.length + ' байт');

    // 1. Поиск зелёных пикселей
    log('Начало поиска зелёных пикселей...');
    const greenPixels = [];
    const bytesPerPixel = 4; // RGBA

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * bytesPerPixel;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // const a = data[idx + 3]; // alpha, не используем
        
        // 2. Диапазон для ЯРКО-ЗЕЛЁНОЙ стрелки
        if (r <= 100 && g >= 150 && b <= 100 && g > r && g > b) {
          greenPixels.push({ x, y });
        }
      }
    }

    log('Поиск завершён. Найдено зелёных пикселей: ' + greenPixels.length);

    if (greenPixels.length === 0) {
      BAS_VARS["RESULT"] = JSON.stringify({ found: false, error: 'Зелёные пиксели не найдены' });
      log('Результат записан в BAS_VARS["RESULT"]');
      return null;
    }

    // 3. Находим bounding box зелёных пикселей
    log('Вычисление bounding box...');
    let minX = width, maxX = 0, minY = height, maxY = 0;
    
    for (const pixel of greenPixels) {
      if (pixel.x < minX) minX = pixel.x;
      if (pixel.x > maxX) maxX = pixel.x;
      if (pixel.y < minY) minY = pixel.y;
      if (pixel.y > maxY) maxY = pixel.y;
    }

    const rectWidth = maxX - minX + 1;
    const rectHeight = maxY - minY + 1;
    log('Bounding box вычислен: ' + rectWidth + 'x' + rectHeight);
    log('minX=' + minX + ', maxX=' + maxX + ', minY=' + minY + ', maxY=' + maxY);

    // 4. Фильтр по размерам - тут ищем зеленную стрелку
    log('Проверка размеров объекта...');
    if (rectHeight <= 5 || rectWidth <= 15) {    // настройки минимальная высота и длина
      log('Объект слишком мал, отмена.');
      BAS_VARS["RESULT"] = JSON.stringify({ found: false, error: 'Найденный объект слишком мал', size: { width: rectWidth, height: rectHeight } });
      log('Результат записан в BAS_VARS["RESULT"]');
      return null;
    }
    log('Размеры в норме.');

    const centerY = minY + (rectHeight / 2);
    const leftEdgeX = minX;
    const rightEdgeX = maxX;

    const result = {
      found: true,
      leftEdge: { x: leftEdgeX, y: Math.round(centerY) },
      rightEdge: { x: rightEdgeX, y: Math.round(centerY) },
      boundingBox: {
        x: minX,
        y: minY,
        width: rectWidth,
        height: rectHeight
      },
      greenPixelsCount: greenPixels.length
    };

    // 5. Отладочное изображение (опционально)
    if (DEBUG_IMAGE_PATH) {
      log('Сохранение отладочного изображения...');
      const debugBuffer = PNG.sync.write(png);
      fs.writeFileSync(DEBUG_IMAGE_PATH, debugBuffer);
      result.debugImage = DEBUG_IMAGE_PATH;
      log('Отладочное изображение сохранено: ' + DEBUG_IMAGE_PATH);
    }

    // 6. Сохранение прямоугольника
    log('Начало сохранения прямоугольника...');
    const cropY = Math.max(0, Math.round(centerY) - 15);
    const cropHeight = 45;
    const cropX = rightEdgeX;
    const cropWidth = Math.max(1, width - rightEdgeX);
    log('Параметры crop: x=' + cropX + ', y=' + cropY + ', width=' + cropWidth + ', height=' + cropHeight);

    // Создаём новое PNG для обрезанной области
    const cropped = new PNG({
      width: cropWidth,
      height: cropHeight,
      filterType: -1
    });

    // Копируем пиксели из оригинала в обрезанную область
    for (let y = 0; y < cropHeight; y++) {
      for (let x = 0; x < cropWidth; x++) {
        const srcIdx = ((cropY + y) * width + (cropX + x)) * 4;
        const dstIdx = (y * cropWidth + x) * 4;
        
        cropped.data[dstIdx] = data[srcIdx];
        cropped.data[dstIdx + 1] = data[srcIdx + 1];
        cropped.data[dstIdx + 2] = data[srcIdx + 2];
        cropped.data[dstIdx + 3] = data[srcIdx + 3];
      }
    }
    log('Изображение обрезано.');

    // Кодирование в base64
    log('Кодирование в base64...');
    const croppedBuffer = PNG.sync.write(cropped);
    result.savedRectBase64 = croppedBuffer.toString('base64');
    log('Base64 получен, длина: ' + result.savedRectBase64.length);

    // Сохранение файла
    if (SAVE_RECT_FILE) {
      log('Сохранение файла...');
      let savePath = SAVE_RECT_PATH;
      if (!savePath) {
        const randomName = `rect_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
        savePath = path.join(os.tmpdir(), randomName);
      } else if (savePath.endsWith('/') || savePath.endsWith('\\') || !savePath.includes('.')) {
        const randomName = `rect_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
        savePath = path.join(savePath, randomName);
      }
      fs.writeFileSync(savePath, croppedBuffer);
      result.savedRect = path.normalize(savePath);
      log('Прямоугольник сохранён: ' + savePath);
    }
    log('Сохранение прямоугольника завершено.');

    // Возвращаем результат в BAS
    log('Запись результата в BAS_VARS["RESULT"]...');
    BAS_VARS["RESULT"] = JSON.stringify(result);
    log('Результат записан в BAS_VARS["RESULT"]');
    log('JSON результат: ' + JSON.stringify(result, null, 2));
    log('=== Функция findOTPArrowLeftCenter завершена ===');

    return result;
    
  } catch (err) {
    log('=== ОШИБКА в try/catch ===');
    log('Тип ошибки: ' + err.name);
    log('Сообщение: ' + err.message);
    log('Стек: ' + err.stack);
    log('=== Конец обработки ошибки ===');
    BAS_VARS["RESULT"] = JSON.stringify({ found: false, error: err.message });
    return null;
  }
}

// ============================================
// НАСТРОЙКИ BAS
// ============================================

// Путь к изображению - передаётся из переменной BAS [[IMAGE_PATH]]
const imagePath = [[IMAGE_PATH]];

// Путь для отладочного изображения
const DEBUG_IMAGE_PATH = null;

// Сохранять прямоугольник в файл (true = да, false = нет)
const SAVE_RECT_FILE = false;

// Путь для сохранения прямоугольника (если SAVE_RECT_FILE = true)
const SAVE_RECT_PATH = 'C:\\rects\\';

// ============================================

log('=== Скрипт запущен ===');
log('Путь к изображению: ' + imagePath);

// Проверка что путь не остался шаблоном
if (imagePath.startsWith('[[') || !imagePath || imagePath === 'null') {
  BAS_VARS["RESULT"] = JSON.stringify({ found: false, error: 'IMAGE_PATH не передан. Проверь переменную BAS.' });
  log('Ошибка: IMAGE_PATH не передан корректно');
  return;
}

// Проверка загрузки pngjs
if (typeof PNG !== 'function') {
  log('pngjs модуль загружен неправильно. Тип PNG: ' + typeof PNG);
  BAS_VARS["RESULT"] = JSON.stringify({ found: false, error: 'pngjs модуль не загружен корректно' });
  return;
}

log('Запуск функции findOTPArrowLeftCenter...');

findOTPArrowLeftCenter(imagePath).then(() => {
  log('=== Скрипт завершён успешно ===');
}).catch(err => {
  BAS_VARS["RESULT"] = JSON.stringify({ found: false, error: err.message });
  log('=== Скрипт завершён с ошибкой ===');
  log('Ошибка: ' + err.message);
  log('Стек: ' + err.stack);
});