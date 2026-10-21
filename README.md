# Práctica 5: Construyendo un Agente con OpenRouter y Stitch MCP

Agente autónomo de IA que diseña interfaces: **OpenRouter** es el cerebro (LLM) y **Stitch MCP** son las manos (herramientas).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `agente.js` | El agente: conecta con Stitch MCP, traduce sus herramientas al formato de OpenRouter y ejecuta el bucle del agente (Agentic Loop) con el SYSTEM PROMPT y el USER PROMPT de la práctica |
| `stitch-mcp.js` | Servidor MCP local de Stitch (stdio) que el agente levanta como proceso hijo |
| `.env` | Claves: `OPENROUTER_API_KEY`, `STITCH_API_KEY` y el modelo `OPENROUTER_MODEL` |
| `ejecutar.bat` | Instala dependencias si faltan y corre `node agente.js` con doble clic |
| `salida_agente.txt` | Se crea al ejecutar: copia de todo lo que mostró la consola (evidencia) |

## Cómo ejecutarlo

1. Copia `.env.example` como `.env` (ejecutar.bat lo hace solo) y pega tus claves de OpenRouter y de Stitch.
2. Doble clic en `ejecutar.bat` (o en una terminal: `npm install` y luego `node agente.js`).
3. Al terminar, abre tu proyecto nuevo en stitch.withgoogle.com para ver la pantalla generada.

Reporte con evidencias (terminal y Stitch): [`docs/Practica5_Agente_OpenRouter_Stitch.pdf`](docs/Practica5_Agente_OpenRouter_Stitch.pdf)
