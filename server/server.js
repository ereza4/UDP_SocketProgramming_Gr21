const dgram = require("dgram");
const fs = require("fs");
const path = require("path");

const SERVER_PORT = 41234;
const SERVER_HOST = "0.0.0.0";

const MAX_CLIENTS = 4;
const INACTIVITY_TIMEOUT = 60_000;
const STATS_INTERVAL = 5_000;
const USER_RESPONSE_DELAY = 800; 


const STATS_FILE = path.join(__dirname, "server_stats.txt");
 const FILES_FOLDER = path.join(__dirname, "..", "shared", "server_files");

if (!fs.existsSync(FILES_FOLDER)) {
  fs.mkdirSync(FILES_FOLDER, { recursive: true });
}


const clients = new Map();
const clientPrivileges = new Map();

let totalBytesReceived = 0;
let totalBytesSent = 0;

const server = dgram.createSocket("udp4");

function getClientKey(address, port) {
  return `${address}:${port}`;
}

function registerClient(address, port, privilege = "user") {
  const key = getClientKey(address, port);
  if (clients.has(key)) {
    return true;
  }
  if (clients.size >= MAX_CLIENTS) {
    console.log(
      `[WARN] Kapacitet maksimal. Klient i ri u refuzua: ${key}`
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
  console.log(`[INFO] Klient i ri u regjistrua: ${key} me privilegj: ${privilege}`);
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

  const key = getClientKey(rinfo.address, rinfo.port);
  const privilege = clientPrivileges.get(key) || "user";
  const isAdminClient = privilege === "admin";

  const doSend = () => {
    server.send(buffer, 0, buffer.length, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error("[ERROR] Gjatë dërgimit të përgjigjes:", err.message);
        return;
      }

      totalBytesSent += buffer.length;
      updateClientOnSend(rinfo.address, rinfo.port, buffer.length);
    });
  };

  if (isAdminClient) {
  
    doSend();
  } else {
  
    setTimeout(doSend, USER_RESPONSE_DELAY);
  }
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
      console.error("[ERROR] server_stats.txt nuk u përditësua:", err.message);
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
}

const CHUNK_SIZE = 4096;
const uploadStates = new Map();

server.on("message", (msg, rinfo) => {
  let message = msg.toString().trim();
  const clientKey = getClientKey(rinfo.address, rinfo.port);

  const prefixRegex = /^\[role=(.*?)\]\[user=(.*?)\]\s*/;
  const m = message.match(prefixRegex);
  let role = "user";
  let user = "anon";
  if (m) {
    role = m[1];
    user = m[2];
  }

  const accepted = registerClient(rinfo.address, rinfo.port, role);
  if (!accepted) return sendMessage("ERROR: Kapaciteti i serverit u mbush. Provoni më vonë.", rinfo);

  totalBytesReceived += msg.length;
  updateClientOnMessage(rinfo.address, rinfo.port, msg.length);

  message = message.replace(prefixRegex, "");

  if (message.startsWith("UPLOAD_START|")) {
    const parts = message.split("|");
    const filename = parts[1];
    const total = Number(parts[2]) || 0;
    uploadStates.set(clientKey, { filename, total, chunks: [] });
    console.log(`[UPLOAD] ${user} filloi upload të file "${filename}" (${total} pjesë)`);
    return sendMessage(`UPLOAD_ACK_START|${filename}`, rinfo);
  }

  if (message.startsWith("UPLOAD_DATA|")) {
    const parts = message.split("|");
    const filename = parts[1];
    const seq = Number(parts[2]);
    const data64 = parts.slice(3).join("|");
    const state = uploadStates.get(clientKey);
    if (!state || state.filename !== filename) return;
    state.chunks[seq] = Buffer.from(data64, "base64");
    return;
  }

  if (message.startsWith("UPLOAD_END|")) {
    const parts = message.split("|");
    const filename = parts[1];
    const state = uploadStates.get(clientKey);
    if (!state || state.filename !== filename) {
      return sendMessage(`[ERROR] Upload state missing for ${filename}`, rinfo);
    }
    const outPath = path.join(FILES_FOLDER, filename);
    const ws = fs.createWriteStream(outPath);
    for (let i = 0; i < state.total; i++) {
      const chunk = state.chunks[i];
      if (!chunk) {
        ws.end();
        uploadStates.delete(clientKey);
        return sendMessage(`[ERROR] Mungon chunk #${i} për ${filename}`, rinfo);
      }
      ws.write(chunk);
    }
    ws.end();
    uploadStates.delete(clientKey);
    console.log(`[UPLOAD] ${user} përfundoi upload të file "${filename}" -> ${outPath}`);
    return sendMessage(`[OK] Upload i file "${filename}" përfundoi.`, rinfo);
  }

  if (message.startsWith("/download")) {
    const filename = message.split(" ")[1];
    if (!isAdmin(rinfo.address, rinfo.port)) {
      return sendMessage("[ERROR] Nuk ke privilegje për të shkarkuar file.", rinfo);
    }
    const filePath = path.join(FILES_FOLDER, filename);
    if (!fs.existsSync(filePath)) {
      return sendMessage(`[ERROR] File "${filename}" nuk ekziston.`, rinfo);
    }
    const data = fs.readFileSync(filePath);
    const total = Math.ceil(data.length / CHUNK_SIZE);
    sendMessage(`DOWNLOAD_START|${filename}|${total}`, rinfo);
    for (let i = 0; i < total; i++) {
      const chunk = data.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE);
      sendMessage(`DOWNLOAD_DATA|${filename}|${i}|${chunk.toString("base64")}`, rinfo);
    }
    return sendMessage(`DOWNLOAD_END|${filename}`, rinfo);
  }

  if (message.startsWith("/delete")) {
    if (!isAdmin(rinfo.address, rinfo.port)) {
      return sendMessage("[ERROR] Nuk ke privilegje për të fshirë file.", rinfo);
    }
    const filename = message.split(" ")[1];
    const filePath = path.join(FILES_FOLDER, filename);
    if (!fs.existsSync(filePath)) {
      return sendMessage(`[ERROR] File "${filename}" nuk ekziston.`, rinfo);
    }
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      return sendMessage(`[ERROR] Fshirja dështoi për file "${filename}".`, rinfo);
    }
    return sendMessage(`[OK] File "${filename}" u fshi.`, rinfo);
  }

  const parts = message.split(" ");
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

    console.log(
    `[CMD] ${user} (role=${role}) from ${clientKey} executed: ${cmd}` +
      (arg ? " " + arg : "")
  );


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
      sendMessage(`Përgjigje nga serveri: "${message}"`, rinfo);
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [key, client] of clients.entries()) {
    const diff = now - client.lastActive;
    if (diff > INACTIVITY_TIMEOUT) {
      console.log(
        `[INFO] Klienti ${key} nuk është aktiv për ${diff}ms. U largua nga lista.`
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
  console.log("Serveri UDP po dëgjon...");
  console.log(`Adresa: ${address.address}`);
  console.log(`Porti:  ${address.port}`);
});

server.on("error", (err) => {
  console.error("[ERROR] Gabim në server:", err.message);
  server.close();
});

server.bind(SERVER_PORT, SERVER_HOST);
