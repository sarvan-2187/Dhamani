import { Pool, neonConfig } from "@neondatabase/serverless";

// WebSocket Pool: needed for multi-statement migrations and real transactions.
// Node 22 ships a global WebSocket, so no `ws` package is needed.
neonConfig.webSocketConstructor = WebSocket;

export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example)");
  return new Pool({ connectionString });
}
