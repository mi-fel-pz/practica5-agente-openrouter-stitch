// Práctica: Construyendo un Agente con OpenRouter y Stitch MCP
// OpenRouter = el "cerebro" (LLM)  ·  Stitch MCP = las "manos" (herramientas)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "node:fs";

dotenv.config({ quiet: true });

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
let MODELO = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5"; // si falla, usa modelos gratuitos de respaldo
const MAX_PASOS = 8;                  // límite de vueltas del bucle para no gastar créditos de más
const TIEMPO_HERRAMIENTA = 10 * 60e3; // generar una pantalla en Stitch puede tardar varios minutos
const ARCHIVO_LOG = "salida_agente.txt";

// Todo lo que se muestra en consola también se guarda en salida_agente.txt (evidencia)
fs.writeFileSync(ARCHIVO_LOG, `Ejecución: ${new Date().toLocaleString("es-MX")}\n\n`);
function log(texto = "") {
  texto = String(texto).replace(/[\p{Extended_Pictographic}\uFE0F]/gu, ""); // sin emojis
  console.log(texto);
  fs.appendFileSync(ARCHIVO_LOG, texto + "\n");
}

function revisarClave(nombre) {
  const valor = process.env[nombre];
  if (!valor || valor.includes("aqui")) {
    log(`Error: Falta ${nombre} en el archivo .env`);
    process.exit(1);
  }
  return valor;
}

const OPENROUTER_API_KEY = revisarClave("OPENROUTER_API_KEY");
const STITCH_API_KEY = revisarClave("STITCH_API_KEY");

// Cliente de OpenRouter (usa el SDK de OpenAI porque OpenRouter es compatible)
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: { "X-Title": "agente-ui-stitch" },
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Eres un Ingeniero Frontend y Experto en UX/UI.
Tu objetivo es traducir los requerimientos del usuario en interfaces funcionales
usando las herramientas de Stitch.
Reglas:
1. Analiza el requerimiento y decide qué herramientas usar.
2. Si una herramienta falla, lee el error, ajusta los parámetros y vuelve a
intentarlo.
3. Informa al usuario de tus acciones de forma concisa.`;

const USER_PROMPT = `Crea un proyecto nuevo y genera una pantalla de inicio de sesión con un botón azul
oscuro, la cual reciba un usuario y password, así como las opciones de
registrarse, olvidé mi contraseña y recordar sesión siempre.
Detalles adicionales: diseño para escritorio, fondo claro, tarjeta centrada con el
título "Iniciar sesión", campos con etiqueta e icono, el checkbox "Recordar sesión siempre",
el enlace "¿Olvidaste tu contraseña?" y abajo "¿No tienes cuenta? Regístrate".
Todos los textos en español.`;

// ---------------------------------------------------------------------------
// Agente
// ---------------------------------------------------------------------------
// Lista de modelos gratuitos de OpenRouter que soportan herramientas (respaldo si el principal falla)
async function modelosGratis() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const { data } = await res.json();
    const gratis = data.filter(m => m.id.endsWith(":free") && (m.supported_parameters || []).includes("tools"));
    const preferidos = ["qwen", "deepseek", "llama-3.3", "gemini", "mistral", "gpt-oss"];
    const rango = id => { const i = preferidos.findIndex(p => id.includes(p)); return i === -1 ? 99 : i; };
    gratis.sort((a, b) => rango(a.id) - rango(b.id) || (b.context_length || 0) - (a.context_length || 0));
    return gratis.map(m => m.id);
  } catch {
    return [];
  }
}

// Pide la respuesta al modelo; si el modelo no está disponible o no hay saldo, prueba el siguiente
let candidatos = [];
async function pedirRespuesta(mensajes, tools) {
  while (candidatos.length > 0) {
    try {
      return await openai.chat.completions.create({
        model: candidatos[0],
        messages: mensajes,
        tools,
        max_tokens: 1000, // respuesta corta: alcanza con poco saldo
      });
    } catch (error) {
      if (![400, 402, 403, 404, 429].includes(error.status) || candidatos.length === 1) throw error;
      log(`Modelo ${candidatos[0]} no disponible (${error.status}). Probando con ${candidatos[1]}...`);
      candidatos.shift();
      MODELO = candidatos[0];
    }
  }
  throw new Error("No hay modelos disponibles.");
}

async function iniciarAgente() {
  const gratis = await modelosGratis();
  candidatos = MODELO === "gratis" ? gratis : [MODELO, ...gratis.filter(m => m !== MODELO)];
  if (candidatos.length === 0) throw new Error("No se encontró ningún modelo disponible en OpenRouter.");
  MODELO = candidatos[0];
  log(`Modelo: ${MODELO}\n`);
  log("Iniciando conexión con Stitch MCP...");

  // 1. Levantar el servidor local de Stitch (MCP por stdio)
  const transport = new StdioClientTransport({
    command: process.execPath,      // el mismo "node" que ejecuta este archivo
    args: ["stitch-mcp.js"],
    env: { ...process.env, STITCH_API_KEY },
  });

  const mcpClient = new Client({ name: "agente-stitch", version: "1.0" }, { capabilities: {} });
  await mcpClient.connect(transport);

  try {
    // 2. Leer y traducir las herramientas de MCP al formato de OpenRouter
    const mcpTools = await mcpClient.listTools();
    const openRouterTools = mcpTools.tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    log(`Conexión exitosa. ${openRouterTools.length} herramientas disponibles.`);
    log(`Herramientas: ${openRouterTools.map(t => t.function.name).join(", ")}`);
    log(`\nUsuario: ${USER_PROMPT.replace(/\s+/g, " ")}\n`);

    const mensajes = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: USER_PROMPT },
    ];
    let tareaCompletada = false;
    let paso = 0;

    // 3. El Bucle del Agente (Agentic Loop)
    while (!tareaCompletada) {
      paso++;
      if (paso > MAX_PASOS) {
        // Límite alcanzado: se le pide al modelo un cierre sin más herramientas
        log(`Se alcanzó el límite de ${MAX_PASOS} pasos. Pidiendo al agente su resumen final...`);
        mensajes.push({ role: "user", content: "Ya no uses más herramientas. Resume en pocas líneas lo que hiciste." });
        const cierre = await pedirRespuesta(mensajes);
        log(`\nAgente: ${cierre.choices[0].message.content}`);
        break;
      }
      log(`Paso ${paso}: el agente está pensando...`);

      const respuesta = await pedirRespuesta(mensajes, openRouterTools); // Claude (u otro modelo) a través de OpenRouter

      const mensajeModelo = respuesta.choices[0].message;
      mensajes.push(mensajeModelo);

      if (mensajeModelo.content && mensajeModelo.tool_calls?.length) {
        log(`Agente: ${mensajeModelo.content}`);
      }

      // Si el modelo decide usar una herramienta de Stitch
      if (mensajeModelo.tool_calls && mensajeModelo.tool_calls.length > 0) {
        for (const toolCall of mensajeModelo.tool_calls) {
          log(`Acción del Agente -> Ejecutando: ${toolCall.function.name}`);
          log(`   Argumentos: ${toolCall.function.arguments}`);

          try {
            const argumentos = JSON.parse(toolCall.function.arguments || "{}");

            // Ejecutar la acción a través del servidor MCP local
            const resultado = await mcpClient.callTool(
              { name: toolCall.function.name, arguments: argumentos },
              undefined,
              { timeout: TIEMPO_HERRAMIENTA }
            );

            if (resultado.isError) {
              throw new Error(JSON.stringify(resultado.content));
            }

            // Devolver el resultado de la herramienta a la memoria del LLM
            // Solo el texto del resultado y recortado, para no gastar tokens de más
            const texto = (resultado.content || []).map(c => c.text ?? "").join("\n") || JSON.stringify(resultado);
            mensajes.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: texto.length > 3000 ? texto.slice(0, 3000) + "...(recortado)" : texto,
            });

            log(`Acción completada con éxito.`);
          } catch (error) {
            log(`Error en la herramienta: ${error.message}. Informando al agente para que corrija...`);
            mensajes.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: `Error: ${error.message}`,
            });
          }
        }
      } else {
        // Si ya no usa herramientas, terminó el trabajo y responde con texto
        log(`\nAgente: ${mensajeModelo.content}`);
        tareaCompletada = true;
      }
    }
  } finally {
    await mcpClient.close();
    log(`\nRegistro guardado en ${ARCHIVO_LOG}`);
  }
}

iniciarAgente().catch(error => {
  log(`Error: ${error.message}`);
  process.exitCode = 1;
});
