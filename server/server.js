// server.js - Versioni BAZË 

const dgram = require("dgram");

const SERVER_PORT = 41234;
const SERVER_HOST = "0.0.0.0";

const server = dgram.createSocket("udp4");

server.on("message", (msg, rinfo) => {
  const message = msg.toString().trim();
  const clientKey = `${rinfo.address}:${rinfo.port}`;

  console.log(`[IN] Nga ${clientKey}: ${message}`);

  const reply = `Echo from server: "${message}"`;
  const buffer = Buffer.from(reply);

  server.send(buffer, 0, buffer.length, rinfo.port, rinfo.address, (err) => {
    if (err) {
      console.error("[ERROR] kur eshte derguar perjgijga:", err.message);
      return;
    }
    console.log(`[OUT] -> ${clientKey}: ${reply}`);
  });
});

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
