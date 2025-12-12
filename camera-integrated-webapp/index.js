// server/index.js
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import multer from 'multer';


const upload = multer();
const app = express();
app.use(bodyParser.json());

const THINGSPEAK_WRITE_KEY = process.env.TS_WRITE_KEY || '<PUT_YOUR_WRITE_KEY_IN_ENV>';
const IMAGE_CHANNEL_ID = process.env.TS_IMAGE_CHANNEL_ID || '<IMAGE_CHANNEL_ID>';

app.post('/api/thingspeak/update', async (req, res) => {
  try {
    const { field1, field2, field3, field4 } = req.body;
    const params = new URLSearchParams();
    params.append('api_key', THINGSPEAK_WRITE_KEY);
    if (field1 !== undefined) params.append('field1', field1);
    if (field2 !== undefined) params.append('field2', field2);
    if (field3 !== undefined) params.append('field3', field3);
    if (field4 !== undefined) params.append('field4', field4);

    const r = await fetch('https://api.thingspeak.com/update.json', { method: 'POST', body: params });
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to update ThingSpeak' });
  }
});

app.post('/api/thingspeak/upload-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).send({error: 'No file'});
  try {
    const form = new FormData();
    form.append('api_key', THINGSPEAK_WRITE_KEY);
    form.append('file', req.file.buffer, { filename: 'capture.jpg', contentType: 'image/jpeg' });

    const r = await fetch(`https://data.thingspeak.com/channels/${IMAGE_CHANNEL_ID}/images`, { method: 'POST', body: form });
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Image upload failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('Server listening on ' + PORT));
