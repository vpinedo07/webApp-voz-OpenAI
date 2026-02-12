/* =========================================================
   CONFIG
========================================================= */

// Inactividad (ms) para entrar en suspendido:
const INACTIVITY_MS = 7000;

// Wake word:
const WAKE_WORD = "alexa";

// Endpoint OpenAI Responses API
const OPENAI_BASE_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-4o-mini";

// URL MockAPI para obtener API Key (primer registro)
const MOCKAPI_KEY_URL = "https://698a177ac04d974bc6a15346.mockapi.io/api/v1/apyKey";

// API Key dinámica (se cargará desde MockAPI)
let OPENAI_API_KEY = "";

// Salidas válidas:
const ALLOWED = [
  "avanzar",
  "retroceder",
  "detener",
  "vuelta derecha",
  "vuelta izquierda",
  "90° derecha",
  "90° izquierda",
  "360° derecha",
  "360° izquierda",
  "Orden no reconocida"
];

/* =========================================================
   UI refs
========================================================= */

const modeBadge = document.getElementById("modeBadge");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const statusHint = document.getElementById("statusHint");

const transcriptBox = document.getElementById("transcriptBox");
const finalCommand = document.getElementById("finalCommand");
const openaiInfo = document.getElementById("openaiInfo");
const spinner = document.getElementById("spinner");
const aiStatus = document.getElementById("aiStatus");

const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnSleep = document.getElementById("btnSleep");

/* =========================================================
   SpeechRecognition setup
========================================================= */

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;

let mode = "INIT"; // INIT | ACTIVE | SLEEP | OFF
let manualStop = false;
let inactivityTimer = null;
let lastHeardAt = Date.now();

// Para evitar spamear a OpenAI con resultados repetidos:
let lastFinalTranscript = "";

/* =========================================================
   Helpers
========================================================= */

function setMode(newMode) {
  mode = newMode;

  statusDot.classList.remove("active", "sleep", "off");

  if (mode === "ACTIVE") {
    modeBadge.textContent = "Activo";
    modeBadge.className = "badge rounded-pill text-bg-success";
    statusDot.classList.add("active");
    statusText.textContent = "Escuchando órdenes…";
    statusHint.textContent = `Di una orden. Si no hay voz por ${INACTIVITY_MS / 1000}s → suspendido.`;
  } else if (mode === "SLEEP") {
    modeBadge.textContent = "Suspendido";
    modeBadge.className = "badge rounded-pill text-bg-warning";
    statusDot.classList.add("sleep");
    statusText.textContent = "Modo suspendido (wake listening)…";
    statusHint.textContent = 'Di "Alexa" para despertar.';
  } else if (mode === "OFF") {
    modeBadge.textContent = "Detenido";
    modeBadge.className = "badge rounded-pill text-bg-danger";
    statusDot.classList.add("off");
    statusText.textContent = "Reconocimiento detenido.";
    statusHint.textContent = "Presiona Iniciar para reactivar.";
  } else {
    modeBadge.textContent = "Inicializando…";
    modeBadge.className = "badge rounded-pill text-bg-secondary";
    statusText.textContent = "Preparando reconocimiento…";
    statusHint.textContent = "Permite el micrófono si se solicita.";
  }
}

function logTranscript(label, text) {
  const ts = new Date().toLocaleTimeString();
  const safe = (text || "").toString();

  if (transcriptBox.textContent.includes("Aún no hay voz")) {
    transcriptBox.innerHTML = "";
  }

  const div = document.createElement("div");
  div.innerHTML = `<span class="text-secondary">[${ts}]</span> <span class="text-info">${label}</span> ${escapeHtml(safe)}`;
  transcriptBox.appendChild(div);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startInactivityTimer() {
  clearInactivityTimer();
  inactivityTimer = setInterval(() => {
    const elapsed = Date.now() - lastHeardAt;
    if (mode === "ACTIVE" && elapsed >= INACTIVITY_MS) {
      logTranscript("SYS:", "Inactividad → entrando a SUSPENDIDO.");
      enterSleepMode();
    }
  }, 250);
}

function clearInactivityTimer() {
  if (inactivityTimer) {
    clearInterval(inactivityTimer);
    inactivityTimer = null;
  }
}

function showSpinner(on) {
  spinner.classList.toggle("d-none", !on);
}

/* =========================================================
   Load OpenAI API Key from MockAPI
========================================================= */

async function loadOpenAIKeyFromMockAPI() {
  openaiInfo.textContent = "OpenAI: cargando API Key…";
  aiStatus.textContent = "Obteniendo credenciales desde MockAPI…";

  const res = await fetch(MOCKAPI_KEY_URL, { method: "GET" });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`MockAPI HTTP ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();

  // MockAPI suele devolver arreglo; pero por si devuelve objeto:
  const first = Array.isArray(data) ? data[0] : data;

  const key = (first?.apikey || "").toString().trim();

  if (!key) {
    throw new Error("MockAPI no devolvió el campo 'apikey' en el primer registro.");
  }

  OPENAI_API_KEY = key;

  openaiInfo.textContent = "OpenAI: API Key cargada";
  aiStatus.textContent = "Listo. La IA responderá con una sola etiqueta de movimiento.";
  logTranscript("SYS:", "API Key cargada desde MockAPI (primer registro).");
}

/* =========================================================
   Recognition control
========================================================= */

function initRecognition() {
  if (!SpeechRecognition) {
    setMode("OFF");
    logTranscript("ERROR:", "SpeechRecognition no está disponible en este navegador.");
    statusText.textContent = "Tu navegador no soporta SpeechRecognition.";
    statusHint.textContent = "Prueba Chrome/Edge y HTTPS o localhost.";
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "es-MX";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onerror = (e) => {
    logTranscript("ASR_ERR:", `${e.error || "error"} ${e.message || ""}`.trim());
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      setMode("OFF");
      statusText.textContent = "Micrófono bloqueado por permisos.";
      statusHint.textContent = "Activa permisos del sitio y recarga.";
      return;
    }
  };

  recognition.onend = () => {
    if (manualStop) return;
    if (mode === "ACTIVE" || mode === "SLEEP") {
      try { recognition.start(); } catch (_) {}
    }
  };

  recognition.onresult = (event) => {
    let interim = "";
    let finals = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const txt = (res[0]?.transcript || "").trim();
      if (!txt) continue;

      if (res.isFinal) finals += (finals ? " " : "") + txt;
      else interim += (interim ? " " : "") + txt;
    }

    const heardSomething = (finals || interim).trim().length > 0;
    if (heardSomething) lastHeardAt = Date.now();

    if (interim) logTranscript("Interim:", interim);

    if (finals) {
      const normalizedFinal = finals.trim();
      logTranscript("Final:", normalizedFinal);

      if (mode === "SLEEP") {
        if (containsWakeWord(normalizedFinal)) {
          logTranscript("SYS:", 'Wake word detectada → entrando a ACTIVO.');
          enterActiveMode();
        }
        return;
      }

      if (normalizedFinal.toLowerCase() === lastFinalTranscript.toLowerCase()) return;
      lastFinalTranscript = normalizedFinal;

      handleWithOpenAI(normalizedFinal).catch((err) => {
        logTranscript("OPENAI_ERR:", err?.message || String(err));
        aiStatus.textContent = "Error al consultar OpenAI.";
        showSpinner(false);
      });
    }
  };

  return true;
}

function containsWakeWord(text) {
  return (text || "").toLowerCase().includes(WAKE_WORD);
}

function startRecognition() {
  if (!recognition && !initRecognition()) return;
  manualStop = false;
  try { recognition.start(); } catch (_) {}
}

function stopRecognition() {
  manualStop = true;
  clearInactivityTimer();
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
  }
}

function enterActiveMode() {
  setMode("ACTIVE");
  startRecognition();
  lastHeardAt = Date.now();
  startInactivityTimer();
}

function enterSleepMode() {
  setMode("SLEEP");
  startRecognition();
  clearInactivityTimer();
}

function enterOffMode() {
  setMode("OFF");
  stopRecognition();
}

/* =========================================================
   OpenAI call
========================================================= */

function normalizeCommand(cmd) {
  const raw = (cmd || "").toString().trim();

  // Caso especial: preservar exactamente el texto requerido
  if (raw.toLowerCase() === "orden no reconocida") {
    return "Orden no reconocida";
  }

  let c = raw.toLowerCase();
  c = c.replaceAll("º", "°");
  c = c.replace(/\s+/g, " ");

  const map = new Map([
    ["90 derecha", "90° derecha"],
    ["90° derecha", "90° derecha"],
    ["90 grados derecha", "90° derecha"],

    ["90 izquierda", "90° izquierda"],
    ["90° izquierda", "90° izquierda"],
    ["90 grados izquierda", "90° izquierda"],

    ["360 derecha", "360° derecha"],
    ["360° derecha", "360° derecha"],
    ["360 grados derecha", "360° derecha"],

    ["360 izquierda", "360° izquierda"],
    ["360° izquierda", "360° izquierda"],
    ["360 grados izquierda", "360° izquierda"]
  ]);

  if (map.has(c)) return map.get(c);

  return c;
}

function isAllowed(cmdNormalized) {
  return ALLOWED.includes(cmdNormalized);
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const txt = part?.text;
          if (typeof txt === "string" && txt.trim()) return txt;
        }
      }
    }
  }
  return "";
}

async function handleWithOpenAI(userText) {
  if (!OPENAI_API_KEY) {
    logTranscript("SYS:", "No hay API Key cargada. Intentando cargar desde MockAPI…");
    try {
      await loadOpenAIKeyFromMockAPI();
    } catch (e) {
      logTranscript("MOCKAPI_ERR:", e?.message || String(e));
      aiStatus.textContent = "No se pudo cargar API Key desde MockAPI.";
      openaiInfo.textContent = "OpenAI: sin API Key";
      return;
    }
  }

  showSpinner(true);
  aiStatus.textContent = "Consultando IA…";
  openaiInfo.textContent = "OpenAI: consultando…";

  const system = `
Eres un clasificador de comandos de movimiento para un robot.
Tu salida DEBE ser exactamente UNA de las siguientes opciones (sin comillas, sin puntos, sin explicación):
- avanzar
- retroceder
- detener
- vuelta derecha
- vuelta izquierda
- 90° derecha
- 90° izquierda
- 360° derecha
- 360° izquierda
- Orden no reconocida

Reglas:
1) Si el texto implica moverse hacia adelante: "avanzar".
2) Si implica atrás: "retroceder".
3) Si implica parar: "detener".
4) "vuelta derecha" o "vuelta izquierda" para giros suaves (sin grados).
5) Si menciona 90 grados a derecha/izquierda usa "90° derecha" / "90° izquierda".
6) Si menciona giro completo 360 a derecha/izquierda usa "360° derecha" / "360° izquierda".
7) Si hay ambigüedad o no es comando de movimiento, responde "Orden no reconocida".
`.trim();

  const payload = {
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: userText }
    ],
    temperature: 0
  };

  const res = await fetch(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = extractOutputText(data).trim();

  const normalized = normalizeCommand(raw);
  logTranscript("IA:", raw || "(sin texto)");

  if (!isAllowed(normalized)) {
    logTranscript("SYS:", `Salida no válida "${raw}". Forzando: Orden no reconocida`);
    finalCommand.textContent = "Orden no reconocida";
    aiStatus.textContent = "Salida fuera de lista → corregida a 'Orden no reconocida'.";
  } else {
    finalCommand.textContent = normalized;
    aiStatus.textContent =
      normalized === "Orden no reconocida"
        ? "No se identificó una orden coherente."
        : "OK: comando reconocido.";
  }

  openaiInfo.textContent = "OpenAI: listo";
  showSpinner(false);
}

/* =========================================================
   UI events
========================================================= */

btnStart.addEventListener("click", async () => {
  lastFinalTranscript = "";

  // Cargar key (si falla, igual dejamos que el ASR funcione, pero IA no)
  if (!OPENAI_API_KEY) {
    try {
      await loadOpenAIKeyFromMockAPI();
    } catch (e) {
      logTranscript("MOCKAPI_ERR:", e?.message || String(e));
      openaiInfo.textContent = "OpenAI: sin API Key";
      aiStatus.textContent = "No se pudo cargar API Key desde MockAPI. Revisa la URL o permisos.";
    }
  }

  enterActiveMode();
});

btnStop.addEventListener("click", () => {
  enterOffMode();
});

btnSleep.addEventListener("click", () => {
  enterSleepMode();
});

/* =========================================================
   Boot
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  setMode("INIT");

  // Intentar cargar la API Key al inicio (no detiene el ASR si falla)
  try {
    await loadOpenAIKeyFromMockAPI();
  } catch (e) {
    logTranscript("MOCKAPI_ERR:", e?.message || String(e));
    openaiInfo.textContent = "OpenAI: sin API Key";
    aiStatus.textContent = "No se pudo cargar API Key desde MockAPI. La app seguirá escuchando, pero no consultará IA.";
  }

  // Iniciar reconocimiento
  try {
    initRecognition();
    enterActiveMode();
    logTranscript("SYS:", "Auto-inicio solicitado. Si el navegador lo bloquea, presiona Iniciar.");
  } catch (e) {
    logTranscript("SYS:", "Auto-inicio bloqueado. Presiona Iniciar.");
    setMode("OFF");
  }
});
