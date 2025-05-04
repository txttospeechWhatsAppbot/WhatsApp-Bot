const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const Tesseract = require('tesseract.js');
const franc = require('franc-min');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth()
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});
});

client.on('qr', (qr) => {
  console.log('Scan this QR with WhatsApp:', qr);
});

client.on('ready', () => {
  console.log('WhatsApp bot ready!');
});

client.on('message', async (message) => {
  if (message.hasMedia && message.type === 'image') {
    try {
      await message.reply('Processing your image...');

      const media = await message.downloadMedia();
      const imageBuffer = Buffer.from(media.data, 'base64');

      const imagePath = path.join(__dirname, 'temp.jpg');
      fs.writeFileSync(imagePath, imageBuffer);

      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+spa+fra+hin+jpn+ben', {
        logger: () => {}
      });

      if (!text.trim()) {
        await message.reply('No text detected in the image.');
        fs.unlinkSync(imagePath);
        return;
      }

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

      const audioPath = await generateAudio(text, language);

      await message.reply(`Extracted text:\n${text}`);
      await client.sendMessage(message.from, {
        media: fs.readFileSync(audioPath),
        caption: 'Audio of extracted text'
      });

      fs.unlinkSync(imagePath);
      fs.unlinkSync(audioPath);
    } catch (error) {
      console.error(error);
      await message.reply('Error processing image. Please try again.');
    }
  }
});

// Generate audio using gTTS (Python)
async function generateAudio(text, language) {
  const filePath = path.join(__dirname, 'output.mp3');
  const langCode = language.split('-')[0];
  const safeText = text.replace(/'/g, "");

  const command = `python3 -c "from gtts import gTTS; gTTS(text='''${safeText}''', lang='${langCode}').save('${filePath}')"`;
  execSync(command);

  return filePath;
}

client.initialize();

app.get('/', (req, res) => res.send('WhatsApp bot running'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on port ${port}`));
