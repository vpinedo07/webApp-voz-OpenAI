# 🎙️ Voice Orders Web App + OpenAI

Aplicación Web moderna desarrollada con **HTML, CSS, JavaScript y Bootstrap 5** que permite:

- 🎤 Reconocer órdenes por voz desde el navegador
- 💤 Entrar en modo suspendido por inactividad
- 🔊 Activarse nuevamente con la palabra clave **"Alexa"**
- 🤖 Clasificar órdenes usando la API de OpenAI
- 🔐 Obtener dinámicamente la API Key desde MockAPI
- 🧠 Responder únicamente con comandos válidos de movimiento

---

## 🚀 Funcionalidad Principal

La aplicación:

1. Inicia el reconocimiento de voz al cargar la página.
2. Si no detecta voz durante algunos segundos, entra en modo **Suspendido**.
3. En modo suspendido solo escucha la palabra clave:


4. Al detectar la palabra clave, vuelve a modo activo.
5. Cada frase final detectada se envía a OpenAI para clasificar el comando.
6. La IA responde con una única etiqueta válida:

avanzar
retroceder
detener
vuelta derecha
vuelta izquierda
90° derecha
90° izquierda
360° derecha
360° izquierda
Orden no reconocida


---

## 🧠 Clasificación Inteligente

La IA funciona como un **clasificador estricto de comandos de movimiento**.

Si el texto:
- Es ambiguo
- No corresponde a un movimiento
- No puede interpretarse claramente

La respuesta será:


---

## 🔐 Obtención Dinámica de API Key

La API Key de OpenAI se obtiene automáticamente desde MockAPI:

GET https://698a177ac04d974bc6a15346.mockapi.io/api/v1/apyKey


Estructura del registro:

```json
{
  "apikey": "sk-xxxxxxxxxxxxxxxx",
  "id": "1"
}

voice-orders-openai/
│  index.html
└─ assets/
   ├─ css/
   │  └─ styles.css
   └─ js/
      └─ app.js

Tecnologías Utilizadas

HTML5

CSS3

Bootstrap 5

JavaScript ES6+

Web Speech API (SpeechRecognition)

Fetch API (Async/Await)

OpenAI Responses API

MockAPI

Carga página
   ↓
Carga API Key desde MockAPI
   ↓
Activa reconocimiento de voz
   ↓
¿Hay voz?
   ↓
SI → enviar a OpenAI
NO → suspender
   ↓
Modo suspendido escucha "Alexa"
   ↓
Despertar y continuar
