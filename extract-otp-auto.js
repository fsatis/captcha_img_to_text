const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMG_DIR = './img';

function extractExpectedDigits(filename) {
  const match = filename.match(/(\d{6})/);
  return match ? match[1] : null;
}

// Инверсия и улучшение контраста для чёрных цифр
async function preprocessImage(buffer, threshold, invert = false) {
  const image = sharp(buffer);
  const { data: pixelData, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(pixelData.length);
  
  for (let i = 0; i < pixelData.length; i += info.channels) {
    const r = pixelData[i];
    const g = pixelData[i + 1];
    const b = pixelData[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Удаляем цветной шум (зелёный фон OTP)
    const isGreen = g > 150 && g > r * 1.3 && g > b * 1.3;
    
    let value;
    if (isGreen) {
      value = 255; // Зелёный фон -> белый
    } else if (invert) {
      value = gray < threshold ? 255 : 0; // Инверсия: чёрный текст -> белый
    } else {
      value = gray < threshold ? 0 : 255;
    }
    
    output[i] = value;
    output[i + 1] = value;
    output[i + 2] = value;
    if (info.channels === 4) output[i + 3] = 255;
  }
  
  return sharp(output, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();
}

async function tryRecognize(buffer, threshold, scale, invert) {
  try {
    let processed = await preprocessImage(buffer, threshold, invert);
    
    if (scale > 1) {
      processed = await sharp(processed)
        .resize(null, Math.round(300 * scale), { withoutEnlargement: false })
        .toBuffer();
    }
    
    const { data } = await Tesseract.recognize(processed, 'eng', {
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });
    
    return data.text.replace(/[^0-9]/g, '');
  } catch (e) {
    return null;
  }
}

async function processFile(filePath, filename) {
  const expectedDigits = extractExpectedDigits(filename);
  if (!expectedDigits) {
    console.log(`⊘ ${filename}: нет 6-значных цифр в имени`);
    return null;
  }
  
  console.log(`\n📁 ${filename} | Ожидается: ${expectedDigits}`);
  
  const buffer = await sharp(filePath).toBuffer();
  
  // Расширенный перебор параметров
  const thresholds = [80, 100, 120, 140, 160, 180, 200, 220];
  const scales = [1, 1.5, 2, 2.5, 3, 4];
  const inverts = [false, true];
  
  for (const invert of inverts) {
    for (const threshold of thresholds) {
      for (const scale of scales) {
        const digits = await tryRecognize(buffer, threshold, scale, invert);
        
        if (digits && digits.includes(expectedDigits)) {
          console.log(`✓ ПОПАДАНИЕ! Инверсия=${invert}, Порог=${threshold}, Масштаб=${scale}x → ${digits}`);
          return { filename, expected: expectedDigits, recognized: digits, threshold, scale, invert };
        }
      }
    }
  }
  
  console.log(`✗ ${filename}: не найдено совпадение`);
  return { filename, expected: expectedDigits, recognized: null, threshold: null, scale: null };
}

async function main() {
  const files = fs.readdirSync(IMG_DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  console.log(`Найдено файлов: ${files.length}\n`);
  
  const results = [];
  for (const file of files) {
    const result = await processFile(path.join(IMG_DIR, file), file);
    results.push(result);
  }
  
  const success = results.filter(r => r && r.recognized && r.recognized.includes(r.expected));
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Успешно: ${success.length}/${results.length}`);
}

main();
