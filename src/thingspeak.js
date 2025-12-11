import axios from 'axios';

export async function fetchLatestData(channelId, readKey) {
  try {
    const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${readKey}&results=1`;
    const r = await axios.get(url);
    return r.data;
  } catch (e) {
    console.error('fetchLatestData', e);
    throw e;
  }
}

export async function fetchLatestImage(channelId) {
  try {
    const url = `https://api.thingspeak.com/channels/${channelId}/images.json?results=1`;
    const r = await axios.get(url);
    return r.data;
  } catch (e) {
    console.error('fetchLatestImage', e);
    throw e;
  }
}
