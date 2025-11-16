const dgram = require("dgram");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const SERVER_PORT = 41234;
const SERVER_HOST = process.argv[2] || "127.0.0.1";

const client = dgram.createSocket("udp4");

let currentUser = {
  name: "",
  role: "",
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printHelp() {
  const role = (currentUser.role || "user").toLowerCase();

  console.log(`\nRoli aktual: ${role.toUpperCase()}`);
  console.log("\nKomandat që mund t'i përdorësh:\n");

  console.log("  /help                    - Shfaq këtë listë komandash");
  console.log("  /quit                    - Mbyll klientin (nëse implementohet më vonë)");

  console.log("  /list                    -  Liston file-t në server");
  console.log("  /read <filename>         -  Lexon përmbajtjen e një file-i");
  console.log("  /search <keyword>        -  Kërkon në emrat e file-ve");
  console.log("  /info <filename>         -  Info për madhësinë/datat e file-it");

  if (role === "admin") {
    console.log("  /upload <filename>       -  Upload file në server");
    console.log("  /download <filename>     -  Download file nga serveri");
    console.log("  /delete <filename>       -  Fshin file nga serveri");
  }

  console.log("\nÇdo tekst tjetër dërgohet si mesazh i thjeshtë te serveri.\n");
}


function sendToServer(text) {
  const payload = `[role=${currentUser.role}][user=${currentUser.name}] ${text}`;
  const buffer = Buffer.from(payload);
  client.send(buffer, 0, buffer.length, SERVER_PORT, SERVER_HOST, (err) => {
    if (err) {
      console.error("Gjatë dërgimit të mesazhit:", err.message);
    }
  });
}

const CLIENT_FILES = path.join(__dirname, "../shared/client_files");
fs.mkdirSync(CLIENT_FILES, { recursive: true });

const CHUNK_SIZE = 4096;
const incomingDownloads = new Map();

client.on("message", (msg, rinfo) => {
  const text = msg.toString().trim();
  if (text.startsWith("UPLOAD_ACK_START|")) {
    console.log(`[INFO] Server acknowledged start: ${text.split("|")[1]}`);
    return;
  }
  if (text.startsWith("DOWNLOAD_START|")) {
    const parts = text.split("|");
    const filename = parts[1];
    const total = Number(parts[2]);
    incomingDownloads.set(filename, { total, chunks: [] });
    console.log(`[INFO] Incoming download: ${filename} (${total} chunks)`);
    return;
  }
  if (text.startsWith("DOWNLOAD_DATA|")) {
    const parts = text.split("|");
    const filename = parts[1];
    const seq = Number(parts[2]);
    const data64 = parts.slice(3).join("|");
    const st = incomingDownloads.get(filename);
    if (!st) return;
    st.chunks[seq] = Buffer.from(data64, "base64");
    return;
  }
  if (text.startsWith("DOWNLOAD_END|")) {
    const filename = text.split("|")[1];
    const st = incomingDownloads.get(filename);
    if (!st) {
      console.log(`[ERROR] No download state for ${filename}`);
      return;
    }
    const outPath = path.join(CLIENT_FILES, filename);
    const ws = fs.createWriteStream(outPath);
    for (let i = 0; i < st.total; i++) {
      ws.write(st.chunks[i]);
    }
    ws.end();
    incomingDownloads.delete(filename);
    console.log(`[OK] Download complete: ${filename} -> ${outPath}`);
    return;
  }
  console.log(`\nNga serveri (${rinfo.address}:${rinfo.port}): ${text}`);
});

client.on("error", (err) => {
  console.error("Client error:", err.message);
  client.close();
  rl.close();
});

client.on("close", () => {
  console.log("Klienti u mbyll.");
});

client.on("listening", () => {
  const addr = client.address();
});

function startInputLoop() {
  console.log("Për ta ndalur klientin, përdor Ctrl + C.\n");
  console.log("Shkruaj /help për listën e komandave.\n");
  rl.setPrompt("> ");
  rl.prompt();
  rl.on("line", (line) => {
    const input = line.trim();
    if (input === "/help") {
      printHelp();
      rl.prompt();
      return;
    }
    if (!input) {
      rl.prompt();
      return;
    }
    const parts = input.split(" ");
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");
    if (cmd === "/upload") {
      if (currentUser.role !== "admin") {
        console.log("[ERROR] Only admin can upload files.");
        rl.prompt();
        return;
      }
      if (!arg) {
        console.log("[ERROR] /upload <filename> required (file must be in shared/client_files).");
        rl.prompt();
        return;
      }
      startUpload(arg);
      rl.prompt();
      return;
    }
    if (cmd === "/download") {
      if (currentUser.role !== "admin") {
        console.log("[ERROR] Only admin can download files.");
        rl.prompt();
        return;
      }
      if (!arg) {
        console.log("[ERROR] /download <filename> required.");
        rl.prompt();
        return;
      }
      sendToServer(`/download ${arg}`);
      rl.prompt();
      return;
    }
    if (cmd === "/delete") {
      if (currentUser.role !== "admin") {
        console.log("[ERROR] Only admin can delete files.");
        rl.prompt();
        return;
      }
      if (!arg) {
        console.log("[ERROR] /delete <filename> required.");
        rl.prompt();
        return;
      }
      sendToServer(`/delete ${arg}`);
      rl.prompt();
      return;
    }
    sendToServer(input);
    rl.prompt();
  });
}

function askLogin() {
  console.log(`Lidhja me serverin: ${SERVER_HOST}:${SERVER_PORT}\n`);
  rl.question("Shkruaj emrin e përdoruesit: ", (name) => {
    currentUser.name = name.trim() || "anon";
    rl.question('Zgjedh rolin (admin/user): ', (roleInput) => {
      let role = roleInput.trim().toLowerCase();
      if (role !== "admin" && role !== "user") {
        console.log(
          '[INFO] Roli i futur nuk është "admin" apo "user". Po vendoset "user" si default.'
        );
        role = "user";
      }
      currentUser.role = role;
      console.log(
        `\nU kyqe si: ${currentUser.name} (${currentUser.role.toUpperCase()})`
      );
      startInputLoop();
    });
  });
}

function startUpload(filename) {
  const filePath = path.join(CLIENT_FILES, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`[ERROR] File ${filePath} nuk ekziston në client_files. Vendosni file-at atje para upload.`);
    return;
  }
  const data = fs.readFileSync(filePath);
  const total = Math.ceil(data.length / CHUNK_SIZE);
  sendToServer(`UPLOAD_START|${filename}|${total}`);
  for (let i = 0; i < total; i++) {
    const chunk = data.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE);
    sendToServer(`UPLOAD_DATA|${filename}|${i}|${chunk.toString("base64")}`);
  }
  sendToServer(`UPLOAD_END|${filename}`);
  console.log(`[INFO] Upload sent for ${filename}`);
}

client.bind();
askLogin();
