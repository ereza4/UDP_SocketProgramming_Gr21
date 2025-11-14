// server.js - Versioni i perditesuar 

const dgram = require("dgram");
const fs = require("fs");
const path = require("path");

const SERVER_PORT = 41234;          
const SERVER_HOST = "0.0.0.0";      

const MAX_CLIENTS = 4;             
const INACTIVITY_TIMEOUT = 60_000;  
const STATS_INTERVAL = 5_000;      

const STATS_FILE = path.join(__dirname, "server_stats.txt");

const clients = new Map();

let totalBytesReceived = 0;
let totalBytesSent = 0;

const server = dgram.createSocket("udp4");

function getClientKey(address, port) {
  return `${address}:${port}`;
}

function registerClient(address, port) {
  const key = getClientKey(address, port);

  
  if (clients.has(key)) {
    return true;
  }

  if (clients.size >= MAX_CLIENTS) {
    console.log(
      `[WARN] Maximal capacity. New client refused: ${key}`
    );
    return false;
  }

  clients.set(key, {
    address,
    port,
    lastActive: Date.now(),
    messages: 0,
    bytesReceived: 0,
    bytesSent: 0,
  });

  console.log(`[INFO] New client registered: ${key}`);
  return true;
}

function updateClientOnMessage(address, port, msgLength) {
  const key = getClientKey(address, port);
  const client = clients.get(key);
  if (!client) return;

  client.lastActive = Date.now();
  client.messages += 1;
  client.bytesReceived += msgLength;
}

function updateClientOnSend(address, port, bytesLength) {
  const key = getClientKey(address, port);
  const client = clients.get(key);
  if (!client) return;

  client.bytesSent += bytesLength;
}

function sendMessage(message, rinfo) {
  const buffer = Buffer.from(message);

  server.send(buffer, 0, buffer.length, rinfo.port, rinfo.address, (err) => {
    if (err) {
      console.error("[ERROR] While sending response:", err.message);
      return;
    }

    totalBytesSent += buffer.length;
    updateClientOnSend(rinfo.address, rinfo.port, buffer.length);
  });
}

function buildStatsString() {
  const lines = [];

  lines.push("===== SERVER STATS =====");
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`Active clients: ${clients.size}`);
  lines.push("");

  for (const [key, client] of clients.entries()) {
    lines.push(`Client: ${key}`);
    lines.push(`  Messages:       ${client.messages}`);
    lines.push(`  Bytes received: ${client.bytesReceived}`);
    lines.push(`  Bytes sent:     ${client.bytesSent}`);
    lines.push(
      `  Last active:    ${new Date(client.lastActive).toLocaleString()}`
    );
    lines.push("");
  }

  lines.push("----- Totals -----");
  lines.push(`Total bytes received: ${totalBytesReceived}`);
  lines.push(`Total bytes sent:     ${totalBytesSent}`);
  lines.push("========================");

  return lines.join("\n");
}

function writeStatsToFile() {
  const stats = buildStatsString();

  fs.writeFile(STATS_FILE, stats, (err) => {
    if (err) {
      console.error("[ERROR] server_stats.txt is not updated:", err.message);
    }
  });
}


server.on("message", (msg, rinfo) => {
  const message = msg.toString().trim();
  const clientKey = getClientKey(rinfo.address, rinfo.port);

  const accepted = registerClient(rinfo.address, rinfo.port);
  if (!accepted) {
    sendMessage("ERROR: Server capacity reached. Try again later.", rinfo);
    return;
  }


  totalBytesReceived += msg.length;
  updateClientOnMessage(rinfo.address, rinfo.port, msg.length);

  console.log(`[IN] From ${clientKey}: ${message}`);


  if (message.toUpperCase() === "STATS") {
    const stats = buildStatsString();
    sendMessage(stats, rinfo);
    return;
  }

  
  const reply = `Echo from server: "${message}"`;
  sendMessage(reply, rinfo);
});


setInterval(() => {
  const now = Date.now();

  for (const [key, client] of clients.entries()) {
    const diff = now - client.lastActive;

    if (diff > INACTIVITY_TIMEOUT) {
      console.log(
        `[INFO] Client ${key} is not active for ${diff}ms. is removed from active clients list.`
      );
      clients.delete(key);
    }
  }
}, 5_000); 

setInterval(() => {
  writeStatsToFile();
}, STATS_INTERVAL);


server.on("listening", () => {
  const address = server.address();
  console.log("UDP server is listening...");
  console.log(`Address: ${address.address}`);
  console.log(`Port:    ${address.port}`);
});

server.on("error", (err) => {
  console.error("[ERROR] Server error:", err.message);
  server.close();
});

server.bind(SERVER_PORT, SERVER_HOST);
