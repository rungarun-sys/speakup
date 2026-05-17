import http from "node:http";

const PORT = Number(process.env.LOCAL_API_PORT || 5174);
const VITE_ORIGIN = process.env.VITE_ORIGIN || "http://127.0.0.1:5173";
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

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
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
    error.tryNextModel = response.status === 503 || response.status === 404;
    throw error;
  }

  return JSON.parse(text);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function handleGemini(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { Allow: "POST" });
    response.end("Method not allowed");
    return;
  }

  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    sendJson(response, 500, { error: "No Gemini API keys are configured for local testing" });
    return;
  }

  try {
    const { contents, systemInstructionText } = await readJsonBody(request);
    if (!Array.isArray(contents)) {
      sendJson(response, 400, { error: "contents must be an array" });
      return;
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
          sendJson(response, 200, { text, model: modelName });
          return;
        } catch (error) {
          lastError = error;
          if (error.tryNextCredential) break;
          if (!error.tryNextModel) break;
        }
      }
    }

    sendJson(response, lastError?.status || 502, {
      error: "Gemini request failed",
      status: lastError?.status || 502
    });
  } catch (error) {
    sendJson(response, 500, { error: "Local Gemini proxy failed" });
  }
}

async function proxyToVite(request, response) {
  const target = new URL(request.url || "/", VITE_ORIGIN);
  const upstream = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request,
    duplex: "half"
  });

  response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
  if (upstream.body) {
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }
  }
  response.end();
}

const server = http.createServer(async (request, response) => {
  try {
    if ((request.url || "").startsWith("/api/gemini")) {
      await handleGemini(request, response);
      return;
    }
    await proxyToVite(request, response);
  } catch (error) {
    sendJson(response, 502, {
      error: "Local dev proxy failed",
      hint: "Make sure Vite is running on http://127.0.0.1:5173"
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SpeakUp AI local app with Gemini API: http://127.0.0.1:${PORT}`);
});
