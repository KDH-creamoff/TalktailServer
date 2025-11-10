// server.js (CommonJS)
const express = require("express");
const fs = require("fs");
const path = require("path");
const { createServer } = require("http");
const { Server: WebSocketServer } = require("ws");
const cors = require("cors");
require("dotenv").config();

const db = require("./models/index.js");
const userController = require("./controller/user.js");
const hubController = require("./controller/hub.js");
const deviceController = require("./controller/device.js");
const petController = require("./controller/pet.js");
const authController = require("./controller/auth.js");
const checkController = require("./controller/check.js");
const externalController = require("./controller/external.js");
const hrvController = require("./controller/hrv.js");

const app = express();
const port = Number(process.env.PORT || 3080);
const WS_PATH = process.env.WS_PATH || "/ws";

// ---------- Middleware ----------
app.use(express.json());
app.use(express.text());

// ---------- DB Connect ----------
db.sequelize.sync().then(async () => {
  console.log("MYSQL DATABASE CONNECTED");
});

app.use(
  cors({
    origin: ["http://localhost:3000", "http://211.188.55.131:5050", "http://localhost", "http://192.168.0.14"],
    credentials: true,
  })
);

// ---------- WebSocket (Apps) ----------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: WS_PATH });
const clients = new Set();
const { addClient, removeClient } = require("./websocket/broadcaster");

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log("🔌 WS client connected:", ip);
  clients.add(ws);
  addClient(ws); // broadcaster에 클라이언트 추가

  ws.send(
    JSON.stringify({ type: "welcome", message: "connected to telemetry WS" })
  );

  ws.on("message", (msg) => {
    let data = null;
    try {
      data = JSON.parse(msg.toString());
    } catch {}
    if (data?.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      return;
    }
    console.log("💬 WS from client:", msg.toString());
  });

  ws.on("close", () => {
    console.log("🔌 WS client disconnected:", ip);
    clients.delete(ws);
    removeClient(ws); // broadcaster에서 클라이언트 제거
  });

  ws.on("error", (err) => {
    console.error("WS error:", err?.message);
    clients.delete(ws);
    removeClient(ws); // broadcaster에서 클라이언트 제거
  });
});

// ---------- Controllers ----------
app.use("/user", userController);
app.use("/hub", hubController);
app.use("/device", deviceController);
app.use("/pet", petController);
app.use("/auth", authController);
app.use("/check", checkController);
app.use("/external", externalController);
app.use("/hrv", hrvController);
// ---------- Start (single listen) ----------
server.listen(port, () => {
  console.log(`✅ HTTP+WS server listening on :${port}`);
  console.log(`   - WS for apps: ws://<host>:${port}${WS_PATH}`);
});

// ---------- Graceful Shutdown ----------
function shutdown() {
  try {
    flushAll();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
