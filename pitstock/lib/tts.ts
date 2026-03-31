const TTS_URL = "https://texttospeech.googleapis.com/v1beta1/text:synthesize";

const MAX_BYTES = 4900; // TTS limit is 5000 bytes

const encoder = new TextEncoder();

export const SAMPLE_RATE = 24000;
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

function textByteLength(text: string): number {
  return encoder.encode(text).length;
}

function splitTextIntoChunks(text: string): string[] {
  if (textByteLength(text) <= MAX_BYTES) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.?!。])(?=\s)/);
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (textByteLength(candidate) > MAX_BYTES && current) {
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
  const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
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

// 텍스트 → raw PCM Buffer (WAV 헤더 없음)
export async function synthesizeSegmentToPCM(text: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_TTS_API_KEY is required");
  }

  const cleanText = stripSpecialCharacters(text);
  const chunks = splitTextIntoChunks(cleanText);

  const audioChunks = await Promise.all(
    chunks.map((chunk) => synthesizeChunk(chunk, apiKey)),
  );

  const buffers = audioChunks.map((b64) => Buffer.from(b64, "base64"));
  return Buffer.concat(buffers);
}

// PCM Buffer 배열 → WAV base64 (세그먼트 사이 0.3초 무음 삽입)
export function combinePCMToWav(pcmBuffers: Buffer[]): string {
  const silenceDuration = 0.3; // seconds
  const silenceBytes = Math.floor(SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8) * silenceDuration);
  const silence = Buffer.alloc(silenceBytes);

  const parts: Buffer[] = [];
  for (let i = 0; i < pcmBuffers.length; i++) {
    parts.push(pcmBuffers[i]);
    if (i < pcmBuffers.length - 1) {
      parts.push(silence);
    }
  }

  const pcm = Buffer.concat(parts);
  return addWavHeader(pcm).toString("base64");
}

// === 네이버 클로바 TTS ===
const CLOVA_TTS_URL = "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts";

async function synthesizeChunkClova(text: string, clientId: string, clientSecret: string): Promise<Buffer> {
  const params = new URLSearchParams({
    speaker: "nara",       // 아라 - 차분한 여성 음성
    text,
    volume: "0",           // -5 ~ 5
    speed: "-1.5",           // -5 ~ 5 (살짝 느리게 → 브리핑 청취 편의)
    pitch: "0",            // -5 ~ 5
    format: "wav",
  });

  const res = await fetch(CLOVA_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Clova TTS API error: ${res.status} ${errorBody}`);
  }

  // 클로바는 WAV 바이너리를 직접 반환
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function stripWavHeader(wav: Buffer): Buffer {
  // WAV 헤더는 보통 44바이트, "data" 청크 찾기
  const dataIndex = wav.indexOf("data");
  if (dataIndex === -1) return wav.subarray(44);
  // "data" + 4바이트(chunk size) 이후가 PCM
  return wav.subarray(dataIndex + 8);
}

// 클로바 TTS: 텍스트 → raw PCM Buffer
// 클로바 글자 수 제한: 약 2000자 (바이트가 아닌 글자 수 기준)
const CLOVA_MAX_CHARS = 1900;

function splitTextIntoChunksClova(text: string): string[] {
  if (text.length <= CLOVA_MAX_CHARS) return [text];

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.?!。])(?=\s)/);
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > CLOVA_MAX_CHARS && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function synthesizeSegmentToPCMClova(text: string): Promise<Buffer> {
  const clientId = process.env.CLOVA_TTS_CLIENT_ID;
  const clientSecret = process.env.CLOVA_TTS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CLOVA_TTS_CLIENT_ID and CLOVA_TTS_CLIENT_SECRET are required");
  }

  const cleanText = stripSpecialCharacters(text);
  const chunks = splitTextIntoChunksClova(cleanText);

  const pcmBuffers: Buffer[] = [];
  for (const chunk of chunks) {
    const wavBuffer = await synthesizeChunkClova(chunk, clientId, clientSecret);
    pcmBuffers.push(stripWavHeader(wavBuffer));
  }

  return Buffer.concat(pcmBuffers);
}

// 클로바 TTS 샘플레이트 (24000Hz)
// 클로바 Premium은 기본 24000Hz WAV 반환
export const CLOVA_SAMPLE_RATE = 24000;

// 기존 호환: 텍스트 → WAV base64
export async function synthesizeSpeech(text: string): Promise<string> {
  const pcm = await synthesizeSegmentToPCM(text);
  return combinePCMToWav([pcm]);
}
