
const dgram = require("dgram");
const readline = require("readline");


// Ndrysho IP nëse serveri është në pajisje tjetër, p.sh. "192.168.1.50"
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
  const role = currentUser.role || "user";

  console.log(`\nRoli aktual: ${role.toUpperCase()}`);

  console.log("\nKomandat që mund t'i përdorësh me këtë rol:");

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

  console.log(`-> ${payload}`);

  client.send(buffer, 0, buffer.length, SERVER_PORT, SERVER_HOST, (err) => {
    if (err) {
      console.error("Gjatë dërgimit të mesazhit:", err.message);
    }
  });
}

client.on("message", (msg, rinfo) => {
  const text = msg.toString().trim();
  const from = `${rinfo.address}:${rinfo.port}`;
  console.log(`\nNga serveri (${from}): ${text}`);
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

client.bind();

askLogin();
