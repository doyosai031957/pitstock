const TTS_URL = "https://texttospeech.googleapis.com/v1beta1/text:synthesize";

const MAX_BYTES = 4900; // TTS limit is 5000 bytes

const encoder = new TextEncoder();

const SAMPLE_RATE = 24000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function addWavHeader(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  const fileSize = 36 + dataSize;
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

function stripSpecialCharacters(text: string): string {
  return text
    .replace(/[*#\(\)\[\]\{\}<>\/\\|@&\^~`"'%$]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function textToSsml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withBreaks = escaped
    .replace(/,\s*/g, '<break time="30ms"/>')
    .replace(/\.(?=\s)/g, '.<break time="150ms"/>')
    .replace(/\?\s*/g, '?<break time="150ms"/>')
    .replace(/!\s*/g, '!<break time="150ms"/>');

  return `<speak>${withBreaks}</speak>`;
}

function ssmlByteLength(text: string): number {
  return encoder.encode(textToSsml(text)).length;
}

function splitTextIntoChunks(text: string): string[] {
  if (ssmlByteLength(text) <= MAX_BYTES) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.?!。])(?=\s)/);
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (ssmlByteLength(candidate) > MAX_BYTES && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function synthesizeChunk(text: string, apiKey: string): Promise<string> {
  const ssml = textToSsml(text);

  const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { ssml },
      voice: {
        languageCode: "ko-KR",
        name: "ko-KR-Chirp3-HD-Leda",
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        speakingRate: 1.05,
        sampleRateHertz: 24000,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Google TTS API error: ${res.status} ${errorBody}`);
  }

  const data = await res.json();
  return data.audioContent; // base64-encoded raw PCM (LINEAR16)
}

export async function synthesizeSpeech(text: string): Promise<string> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_TTS_API_KEY is required");
  }

  const cleanText = stripSpecialCharacters(text);
  const chunks = splitTextIntoChunks(cleanText);

  if (chunks.length === 1) {
    const b64 = await synthesizeChunk(chunks[0], apiKey);
    return addWavHeader(Buffer.from(b64, "base64")).toString("base64");
  }

  // Synthesize all chunks in parallel
  const audioChunks = await Promise.all(
    chunks.map((chunk) => synthesizeChunk(chunk, apiKey)),
  );

  // Concatenate raw PCM and wrap in WAV
  const buffers = audioChunks.map((b64) => Buffer.from(b64, "base64"));
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const pcm = Buffer.concat(buffers, totalLength);

  return addWavHeader(pcm).toString("base64");
}
