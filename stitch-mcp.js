// Servidor MCP local de Stitch (stdio).
// El agente lo levanta como proceso hijo y habla con él por stdin/stdout.
// Por dentro reenvía cada petición al servidor remoto de Stitch usando STITCH_API_KEY.
// Importante: aquí no se escribe nada en stdout, porque stdout es el canal MCP.
import { StitchProxy } from "@google/stitch-sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const proxy = new StitchProxy({ apiKey: process.env.STITCH_API_KEY });
await proxy.start(new StdioServerTransport());
