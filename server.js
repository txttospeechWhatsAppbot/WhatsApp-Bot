const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const Tesseract = require('tesseract.js');
const franc = require('franc-min');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth()
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

      // Download image
      const media = await message.downloadMedia();
      const imageBuffer = Buffer.from(media.data, 'base64');

      // Save image
      const imagePath = path.join(__dirname, 'temp.jpg');
      fs.writeFileSync(imagePath, imageBuffer);

      // OCR
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+spa+fra+hin+jpn+ben');
      if (!text.trim()) {
        await message.reply('No text detected in the image.');
        fs.unlinkSync(imagePath);
        return;
      }

      // Language detection
      const langCode = franc(text, { minLength: 10 });
      const languageMap = {
        'eng': 'en',
        'spa': 'es',
        'fra': 'fr',
        'hin': 'hi',
        'jpn': 'ja',
        'ben': 'bn'
      };
      const language = languageMap[langCode] || 'en';

      // Generate audio
      const audioPath = await generateAudio(text, language);

      // Send results
      await message.reply(`Extracted text: ${text}`);
      await client.sendMessage(message.from, {
        media: fs.readFileSync(audioPath),
        caption: 'Audio of extracted text'
      });

      // Cleanup
      fs.unlinkSync(imagePath);
      fs.unlinkSync(audioPath);
    } catch (error) {
      console.error(error);
      await message.reply('Error processing image. Please try again.');
    }
  }
});

// Text-to-speech using gTTS
async function generateAudio(text, language) {
  return new Promise((resolve, reject) => {
    const audioPath = path.join(__dirname, 'output.mp3');
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const command = `gtts-cli "${safeText}" --lang ${language} --output "${audioPath}"`;

    exec(command, (err) => {
      if (err) return reject(err);
      resolve(audioPath);
    });
  });
}

client.initialize();

// Health check endpoint
app.get('/', (req, res) => res.send('WhatsApp bot running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on port ${port}`));
