const Tesseract = require('tesseract.js');
const sharp = require('sharp');

const imagePath = 'C:/Users/Satis/Desktop/каптча/photo_2026-04-22_15-46-54.jpg';

async function extractOTP(inputPath) {
  console.log('1. Поиск зелёной стрелки и вырезание области...');
  
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // Поиск зелёных пикселей (стрелка)
    const { data: pixelData, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const greenPixels = [];

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        const r = pixelData[offset];
        const g = pixelData[offset + 1];
        const b = pixelData[offset + 2];

        // Эвристика для зелёного цвета
        if (g > 150 && g > r * 1.5 && g > b * 1.5) {
          greenPixels.push({ x, y });
        }
      }
    }

    if (greenPixels.length === 0) {
      console.log('   Стрелка не найдена, использую всё изображение');
      await processImage(inputPath);
      return;
    }

    // Границы стрелки
    let minX = width, maxX = 0, minY = height, maxY = 0;
    greenPixels.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    console.log(`   Стрелка: X=[${minX}..${maxX}], Y=[${minY}..${maxY}]`);

    // Вырезаем область ПОД стрелкой (цифры обычно ниже)
    // Стрелка занимает большую часть изображения, цифры внизу
    const startX = 0;
    const startY = Math.min(height - 100, maxY + 5);
    const cropWidth = width;
    const cropHeight = height - startY;

    console.log(`   Вырезание: X=${startX}, Y=${startY}, W=${cropWidth}, H=${cropHeight}`);
    console.log(`   Размер изображения: ${width}x${height}`);

    // Проверка на корректность области
    if (cropWidth <= 0 || cropHeight <= 0 || startX + cropWidth > width || startY + cropHeight > height) {
      console.log('   Область вырезания некорректна, использую всё изображение');
      await processImage(inputPath);
      return;
    }

    // Вырезаем и сохраняем во временный буфер
    const croppedBuffer = await image
      .extract({
        left: startX,
        top: startY,
        width: cropWidth,
        height: cropHeight
      })
      .png()
      .toBuffer();

    console.log('2. Распознавание текста...');
    await processCroppedImage(croppedBuffer);
    
  } catch (error) {
    console.error('Ошибка:', error);
  }
}

async function processImage(inputPath) {
  const buffer = await sharp(inputPath).toBuffer();
  await processCroppedImage(buffer);
}

async function removeColorNoise(buffer) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { data: pixelData, info } = await image.raw().toBuffer({ resolveWithObject: true });
  
  const output = Buffer.alloc(pixelData.length);
  
  for (let i = 0; i < pixelData.length; i += info.channels) {
    const r = pixelData[i];
    const g = pixelData[i + 1];
    const b = pixelData[i + 2];
    const a = info.channels === 4 ? pixelData[i + 3] : 255;
    
    // Конвертируем в оттенки серого
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Проверка на цветной шум: если цвет сильно отличается от серого - это шум
    const colorDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
    
    // Если разница между каналами большая - это цветной пиксель (шум)
    // Оставляем только чёрные/серые пиксели (текст)
    if (colorDiff > 60) {
      // Это цветной шум - делаем белым
      output[i] = 255;
      output[i + 1] = 255;
      output[i + 2] = 255;
    } else {
      // Это текст или фон - оставляем как есть
      output[i] = gray;
      output[i + 1] = gray;
      output[i + 2] = gray;
    }
    if (info.channels === 4) {
      output[i + 3] = a;
    }
  }
  
  return sharp(output, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();
}

async function binarizeImage(buffer, threshold = 160) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { data: pixelData, info } = await image.raw().toBuffer({ resolveWithObject: true });
  
  const output = Buffer.alloc(pixelData.length);
  
  for (let i = 0; i < pixelData.length; i += info.channels) {
    const gray = pixelData[i];
    const value = gray < threshold ? 0 : 255;
    
    output[i] = value;
    output[i + 1] = value;
    output[i + 2] = value;
    if (info.channels === 4) {
      output[i + 3] = pixelData[i + 3];
    }
  }
  
  return sharp(output, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();
}

async function processCroppedImage(buffer) {
  try {
    console.log('   Предобработка: удаление цветного шума...');
    
    // Шаг 1: Удаляем цветной шум (зелёные, синие, фиолетовые, розовые линии)
    let processedBuffer = await removeColorNoise(buffer);
    
    // Шаг 2: Увеличиваем размер для лучшего распознавания
    processedBuffer = await sharp(processedBuffer)
      .resize(null, 400, { fit: 'inside', withoutEnlargement: false })
      .toBuffer();
    
    // Шаг 3: Бинаризация (чёрно-белое изображение)
    processedBuffer = await binarizeImage(processedBuffer, 160);
    
    // Шаг 4: Увеличиваем контраст
    processedBuffer = await sharp(processedBuffer)
      .normalize()
      .toBuffer();

    const { data } = await Tesseract.recognize(processedBuffer, 'eng', {
      logger: m => console.log(`   ${m.status}: ${(m.progress * 100).toFixed(0)}%`),
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE
    });

    console.log('3. Обработка результатов...');
    console.log('   Распознанный текст:', JSON.stringify(data.text));

    // Очистка строк
    const lines = data.text
      .split('\n')
      .map(line => line.replace(/[^A-Za-z0-9\s]/g, '').trim())
      .filter(line => line !== '');

    console.log('   Очищенные строки:', lines);

    // Ищем строку с буквами и цифрами
    const letterLine = lines.find(line => /^[A-Za-z]+/.test(line) && /\d/.test(line));

    let otp = null;

    if (letterLine) {
      console.log(`\n✓ Строка с буквами: "${letterLine}"`);
      // Извлекаем цифры после букв
      const numbersInLine = letterLine.match(/\d+/g);
      if (numbersInLine) {
        // Берём последнее число и обрезаем до 6 цифр
        const lastNum = numbersInLine[numbersInLine.length - 1];
        otp = lastNum.length >= 6 ? lastNum.slice(-6) : lastNum;
      }
    }

    // Если не нашли, ищем 6-значные числа
    if (!otp || otp.length !== 6) {
      const otpMatch = data.text.match(/\d{6}/g);
      if (otpMatch && otpMatch.length > 0) {
        otp = otpMatch[otpMatch.length - 1];
      }
    }

    if (otp) {
      console.log(`✓ OTP код: ${otp}`);
      return otp;
    } else {
      console.log('✗ OTP не найден');
      return null;
    }
  } catch (error) {
    console.error('Ошибка распознавания:', error);
  }
}

// Запуск
extractOTP(imagePath);
