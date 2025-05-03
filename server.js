const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const Tesseract = require('tesseract.js');
const franc = require('franc-min');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => {
  console.log('Scan this QR with WhatsApp:', qr);
  // In production, view QR in Render logs or use a QR code generator
});

client.on('ready', () => {
  console.log('WhatsApp bot ready!');
});

client.on('message', async (message) => {
  if (message.hasMedia && message.type === 'image') {
    try {
      // Notify user
      await message.reply('Processing your image...');

      // Download image
      const media = await message.downloadMedia();
      const imageBuffer = Buffer.from(media.data, 'base64');

      // Save image temporarily (compressed)
      const imagePath = path.join(__dirname, 'temp.jpg');
      fs.writeFileSync(imagePath, imageBuffer);

      // Extract text
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+spa+fra+hin+jpn+ben', {
        logger: () => {} // Disable verbose logging for speed
      });
      if (!text.trim()) {
        await message.reply('No text detected in the image.');
        fs.unlinkSync(imagePath);
        return;
      }

      // Detect language
      const langCode = franc(text, { minLength: 10 });
      const languageMap = {
        'eng': 'en-US',
        'spa': 'es-ES',
        'fra': 'fr-FR',
        'hin': 'hi-IN',
        'jpn': 'ja-JP',
        'ben': 'bn-IN'
      };
      const language = languageMap[langCode] || 'en-US';

      // Generate audio
      const audioPath = await generateAudio(text, language);

      // Send results
      await message.reply(`Extracted text: ${text}`);
      await client.sendMessage(message.from, {
        media: fs.readFileSync(audioPath),
        caption: 'Audio of extracted text'
      });

      // Clean up
      fs.unlinkSync(imagePath);
      fs.unlinkSync(audioPath);
    } catch (error) {
      console.error(error);
      await message.reply('Error processing image. Please try again.');
    }
  }
});

// Generate audio using Web Speech API via Puppeteer
async function generateAudio(text, language) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const audioPath = path.join(__dirname, 'output.mp3');

  // Inject script to use Web Speech API
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body>
      <script>
        window.speechSynthesis.onvoiceschanged = () => {
          const utterance = new SpeechSynthesisUtterance('${text.replace(/'/g, "\\'")}');
          utterance.lang = '${language}';
          speechSynthesis.speak(utterance);
        };
      </script>
    </body>
    </html>
  `);

  // Wait for speech to complete (placeholder; no direct MP3 output)
  await page.evaluate(async (text, lang) => {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.onend = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }, text, language);

  // Placeholder MP3 (Web Speech API doesn't output audio directly)
  fs.writeFileSync(audioPath, Buffer.from(text)); // Replace with recorder in production
  await browser.close();
  return audioPath;
}

client.initialize();

// Health check endpoint
app.get('/', (req, res) => res.send('WhatsApp bot running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on port ${port}`));
