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
const FILES_FOLDER = path.join(__dirname, "../shared/server_files");

const clients = new Map();
const clientPrivileges = new Map(); // admin ose user

let totalBytesReceived = 0;
let totalBytesSent = 0;

const server = dgram.createSocket("udp4");

function getClientKey(address, port) {
  return `${address}:${port}`;
}

function registerClient(address, port,privilege = "user") {
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

    clientPrivileges.set(key, privilege);

  console.log(`[INFO] New client registered: ${key} with privilege: ${privilege}`);
  return true;
}

function isAdmin(address, port) {
  const key = getClientKey(address, port);
  return clientPrivileges.get(key) === "admin";
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
    lines.push(`  Privilege:      ${clientPrivileges.get(key)}`);
    lines.push(`  Messages:       ${client.messages}`);
    lines.push(`  Bytes received: ${client.bytesReceived}`);
    lines.push(`  Bytes sent:     ${client.bytesSent}`);
    lines.push(`  Last active:    ${new Date(client.lastActive).toLocaleString()}`);
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
function handleListCommand(rinfo) {
  fs.readdir(FILES_FOLDER, (err, files) => {
    if (err) {
      sendMessage("[ERROR] Nuk mund të lexohet folderi.", rinfo);
      return;
    }
    if (files.length === 0) {
      sendMessage("[INFO] Nuk ka file të ruajtura.", rinfo);
    } else {
      sendMessage(files.join("\n"), rinfo);
    }
  });
}

function handleReadCommand(rinfo, filename) {
  const filePath = path.join(FILES_FOLDER, filename);
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      sendMessage(`[ERROR] File "${filename}" nuk ekziston.`, rinfo);
      return;
    }
    sendMessage(data, rinfo);
  });
}

function handleInfoCommand(rinfo, filename) {
  const filePath = path.join(FILES_FOLDER, filename);
  fs.stat(filePath, (err, stats) => {
    if (err) {
      sendMessage(`[ERROR] File "${filename}" nuk ekziston.`, rinfo);
      return;
    }
    const info = `
File: ${filename}
Size: ${stats.size} bytes
Created: ${stats.birthtime.toLocaleString()}
Modified: ${stats.mtime.toLocaleString()}
`;
    sendMessage(info.trim(), rinfo);
  });
}

function handleSearchCommand(rinfo, keyword) {
  fs.readdir(FILES_FOLDER, (err, files) => {
    if (err) {
      sendMessage("[ERROR] Nuk mund të lexohet folderi.", rinfo);
      return;
    }
    const found = files.filter(f => f.includes(keyword));
    if (found.length === 0) {
      sendMessage(`[INFO] Nuk u gjet asnjë file me keyword: "${keyword}"`, rinfo);
    } else {
      sendMessage(found.join("\n"), rinfo);
    }
  });
}server.on("message", (msg, rinfo) => {
  let message = msg.toString().trim();
  const clientKey = getClientKey(rinfo.address, rinfo.port);

  const accepted = registerClient(rinfo.address, rinfo.port);
  if (!accepted) return sendMessage("ERROR: Server capacity reached. Try again later.", rinfo);

  totalBytesReceived += msg.length;
  updateClientOnMessage(rinfo.address, rinfo.port, msg.length);

  console.log(`[IN] From ${clientKey}: ${message}`);

  // --- Pastrojmë prefix-in [role=...][user=...] ---
  const prefixRegex = /^\[role=.*?\]\[user=.*?\]\s*/;
  message = message.replace(prefixRegex, "");

  const parts = message.split(" ");
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (cmd) {
    case "/list":
      handleListCommand(rinfo);
      break;
    case "/read":
      if (!arg) sendMessage("[ERROR] /read <filename> duhet të specifikohet.", rinfo);
      else handleReadCommand(rinfo, arg);
      break;
    case "/info":
      if (!arg) sendMessage("[ERROR] /info <filename> duhet të specifikohet.", rinfo);
      else handleInfoCommand(rinfo, arg);
      break;
    case "/search":
      if (!arg) sendMessage("[ERROR] /search <keyword> duhet të specifikohet.", rinfo);
      else handleSearchCommand(rinfo, arg);
      break;
    case "/stats":
      sendMessage(buildStatsString(), rinfo);
      break;
    default:
      sendMessage(`Echo from server: "${message}"`, rinfo);
  }
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