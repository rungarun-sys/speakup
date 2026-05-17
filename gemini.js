const MODEL_FALLBACKS = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite-preview"
];

let keyCursor = 0;

function getGeminiApiKeys() {
  const fromList = (process.env.GEMINI_API_KEYS || "")
    .split(",")
    .map(key => key.trim())
    .filter(Boolean);

  const fromNumbered = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4
  ].map(key => (key || "").trim()).filter(Boolean);

  const legacy = (process.env.GEMINI_API_KEY || "").trim();
  return [...new Set([...fromList, ...fromNumbered, legacy].filter(Boolean))];
}

function getRoundRobinKeys(keys) {
  const startIndex = keyCursor % keys.length;
  keyCursor = (keyCursor + 1) % keys.length;
  return [...keys.slice(startIndex), ...keys.slice(0, startIndex)];
}

async function callGeminiModel(modelName, payload, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(text || `Gemini API error ${response.status}`);
    error.status = response.status;
    error.tryNextCredential = response.status === 429 || response.status === 403;
    error.tryNextModel = response.status === 503;
    throw error;
  }

  return JSON.parse(text);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    return response.status(500).json({ error: "No Gemini API keys are configured" });
  }

  try {
    const { contents, systemInstructionText } = request.body || {};
    if (!Array.isArray(contents)) {
      return response.status(400).json({ error: "contents must be an array" });
    }

    const payload = { contents };
    if (systemInstructionText) {
      payload.systemInstruction = { parts: [{ text: systemInstructionText }] };
    }

    let lastError = null;
    const orderedKeys = getRoundRobinKeys(apiKeys);
    for (const apiKey of orderedKeys) {
      for (const modelName of MODEL_FALLBACKS) {
        try {
          const data = await callGeminiModel(modelName, payload, apiKey);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          return response.status(200).json({ text, model: modelName });
        } catch (error) {
          lastError = error;
          if (error.tryNextCredential) break;
          if (!error.tryNextModel) break;
        }
      }
    }

    return response.status(lastError?.status || 502).json({
      error: "Gemini request failed",
      status: lastError?.status || 502
    });
  } catch (error) {
    return response.status(500).json({ error: "Gemini proxy failed" });
  }
}
