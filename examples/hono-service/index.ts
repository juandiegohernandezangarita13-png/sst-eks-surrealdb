import { Hono } from "hono";
import { Surreal } from "surrealdb";

const app = new Hono();
export const db = new Surreal();

let isConnected = false;

// Configurable database credentials
export const config = {
  url: process.env.SURREALDB_URL || "ws://localhost:8000/rpc",
  user: process.env.SURREALDB_USER || "root",
  pass: process.env.SURREALDB_PASS || "root",
  namespace: process.env.SURREALDB_NS || "test",
  database: process.env.SURREALDB_DB || "test",
};

// Initialize database connection with retry
export async function initDB() {
  if (isConnected) return;
  try {
    console.log(`Connecting to SurrealDB at ${config.url}...`);
    await db.connect(config.url);
    await db.signin({
      username: config.user,
      password: config.pass,
    });
    await db.use({
      namespace: config.namespace,
      database: config.database,
    });
    isConnected = true;
    console.log(`Successfully connected to SurrealDB (${config.namespace}/${config.database})`);
  } catch (error) {
    console.error("Failed to connect to SurrealDB:", error);
    // Do not crash process immediately, allow health check to report status
  }
}

// Ensure database connection is initialized
initDB().catch(console.error);

// Middleware to ensure DB connection
app.use("*", async (c, next) => {
  if (!isConnected) {
    await initDB();
  }
  await next();
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: isConnected ? "ok" : "degraded",
    surrealdb: isConnected ? "connected" : "disconnected",
    engine: "tikv",
    namespace: config.namespace,
    database: config.database,
    endpoint: config.url,
  });
});

// Create a record
app.post("/users", async (c) => {
  try {
    const body = await c.req.json();
    const user = await db.create("user", body);
    return c.json({ success: true, data: user }, 201);
  } catch (error: any) {
    return c.json({ error: "Failed to create user", details: error?.message }, 500);
  }
});

// Retrieve all records
app.get("/users", async (c) => {
  try {
    const users = await db.select("user");
    return c.json({ success: true, data: users });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch users", details: error?.message }, 500);
  }
});

// Retrieve specific record
app.get("/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const [user] = await db.select(`user:${id}`);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ success: true, data: user });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch user", details: error?.message }, 500);
  }
});

export default app;
