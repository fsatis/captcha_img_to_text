const Jimp = require('jimp');
const path = require('path');
const os = require('os');

async function findOTPArrowLeftCenter(imagePath) {
  const image = await Jimp.read(imagePath);
  const width = image.getWidth();
  const height = image.getHeight();

  // 1. Поиск зелёных пикселей
  const greenPixels = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = image.getPixelColor(x, y);
      const rgba = Jimp.intToRGBA(pixel);
      
      // 2. Диапазон для ЯРКО-ЗЕЛЁНОЙ стрелки
      // R: 0-100, G: 150-255, B: 0-100 (зелёный dominates)
      if (rgba.r <= 100 && rgba.g >= 150 && rgba.b <= 100 && rgba.g > rgba.r && rgba.g > rgba.b) {
        greenPixels.push({ x, y });
      }
    }
  }

  if (greenPixels.length === 0) {
    const result = { found: false, error: 'Зелёные пиксели не найдены' };
    console.log(JSON.stringify(result, null, 2));
    return null;
  }

  // 3. Находим bounding box зелёных пикселей
  let minX = width, maxX = 0, minY = height, maxY = 0;
  
  for (const pixel of greenPixels) {
    if (pixel.x < minX) minX = pixel.x;
    if (pixel.x > maxX) maxX = pixel.x;
    if (pixel.y < minY) minY = pixel.y;
    if (pixel.y > maxY) maxY = pixel.y;
  }

  const rectWidth = maxX - minX + 1;
  const rectHeight = maxY - minY + 1;

  // 4. Фильтр по размерам
  if (rectHeight <= 5 || rectWidth <= 15) {
    const result = { found: false, error: 'Найденный объект слишком мал', size: { width: rectWidth, height: rectHeight } };
    console.log(JSON.stringify(result, null, 2));
    return null;
  }

  const centerY = minY + (rectHeight / 2);
  const leftEdgeX = minX;   // Левый край
  const rightEdgeX = maxX;  // Правый край

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

  // 5. Отладочное изображение (укажите путь или оставьте null для отключения)
  if (DEBUG_IMAGE_PATH) {
    const debugImage = await Jimp.read(imagePath);
    const pointColor = 0xFF00FF;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 9) {
          debugImage.setPixelColor(pointColor, leftEdgeX + dx, Math.round(centerY) + dy);
        }
      }
    }
    const borderColor = 0xFF0000;
    for (let x = minX; x <= maxX; x++) {
      debugImage.setPixelColor(borderColor, x, minY);
      debugImage.setPixelColor(borderColor, x, maxY);
    }
    for (let y = minY; y <= maxY; y++) {
      debugImage.setPixelColor(borderColor, minX, y);
      debugImage.setPixelColor(borderColor, maxX, y);
    }
    debugImage.write(DEBUG_IMAGE_PATH);
    result.debugImage = DEBUG_IMAGE_PATH;
  }

  // 6. Сохранение прямоугольника от правого края стрелки до конца изображения
  const cropY = Math.round(centerY) - 20;
  const cropHeight = 40;
  const cropX = rightEdgeX;
  const cropWidth = width - rightEdgeX;

  const cropped = image.clone().crop(cropX, cropY, cropWidth, cropHeight);

  // Кодирование в base64 (всегда)
  const imageBuffer = await cropped.getBufferAsync(Jimp.MIME_PNG);
  result.savedRectBase64 = imageBuffer.toString('base64');

  // Сохранение файла
  if (SAVE_RECT_FILE) {
    let savePath = SAVE_RECT_PATH;
    if (!savePath) {
      // Сохранение во временную папку со случайным именем
      const randomName = `rect_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      savePath = path.join(os.tmpdir(), randomName);
    } else if (savePath.endsWith('/') || savePath.endsWith('\\') || !savePath.includes('.')) {
      // Если путь заканчивается на / или \ — это папка, добавляем имя файла
      const randomName = `rect_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      savePath = path.join(savePath, randomName);
    }
    cropped.write(savePath);
    result.savedRect = path.normalize(savePath);
  }

  console.log(JSON.stringify(result, null, 2));

  return result;
}

// ============================================
// НАСТРОЙКИ
// ============================================

// Путь к изображению для обработки (используется если не передан аргумент командной строки)
const IMAGE_PATH = 'C:\\img_otp\\OTP 996943.png';

// Путь для сохранения отладочного изображения (или null для отключения)
const DEBUG_IMAGE_PATH = null;

// Сохранять прямоугольник в файл (true = да, false = нет)
// Если true и SAVE_RECT_PATH = null — сохраняется во временную папку со случайным именем
const SAVE_RECT_FILE = true;

// Путь для сохранения прямоугольника (или null для временной папки)
// Вырезается область: от rightEdge.x до правого края, по высоте centerY ± 10 пикселей
const SAVE_RECT_PATH = null;

// ============================================

// Запуск: берём аргумент командной строки или используем IMAGE_PATH
const args = process.argv.slice(2);
const imagePath = args[0] || IMAGE_PATH;

findOTPArrowLeftCenter(imagePath).catch(err => {
  console.log(JSON.stringify({ found: false, error: err.message }, null, 2));
});