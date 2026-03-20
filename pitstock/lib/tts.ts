const TTS_URL = "https://texttospeech.googleapis.com/v1beta1/text:synthesize";

export async function synthesizeSpeech(text: string): Promise<string> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_TTS_API_KEY is required");
  }

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
        sampleRateHertz: 24000,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Google TTS API error: ${res.status} ${errorBody}`);
  }

  const data = await res.json();
  return data.audioContent; // base64-encoded MP3
}
