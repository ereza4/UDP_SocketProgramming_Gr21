# UDP_SocketProgramming_Gr21# UDP File Server & Multi-Client System  

This project implements a complete UDP-based server and a multi-client system with support for admin/user privileges, file management, monitoring, traffic statistics, and automatic inactivity handling.  
All communication between clients and the server happens using **UDP sockets**, as required.

---

## 📂 Project Structure

```
project/
│
├── server/
│   ├── server.js
│   └── server_stats.txt
│
├── client/
│   └── client.js
│
└── shared/
    ├── server_files/
    └── client_files/
```

---

## 🚀 Features Overview

### ✔ Server Features
- Custom port & IP variables  
- UDP listener supporting up to **4 clients simultaneously**
- Admin & user role management
- Inactivity timeout handling
- Logging of:
  - Active clients  
  - Client IP addresses  
  - Messages received per client  
  - Bytes sent/received per client  
  - Total traffic  
- Real-time statistics accessible through:
  - **`/stats` command**  
  - **server_stats.txt** (auto-updated periodically)

---

## ✉️ Client Features

### Admin Client
Admins have full access to server-side file system operations:
- `/upload <filename>`  
- `/download <filename>`  
- `/delete <filename>`  
- `/list`  
- `/read <filename>`  
- `/info <filename>`  
- `/search <keyword>`

### User Client
Regular users have read-only access:
- `/list`
- `/read <filename>`
- `/info <filename>`
- `/search <keyword>`

Users **cannot upload, download, or delete files**.

---

## 🔐 Roles & Permissions

| Command | Admin | User |
|---------|--------|-------|
| `/list` | ✔ | ✔ |
| `/read <file>` | ✔ | ✔ |
| `/info <file>` | ✔ | ✔ |
| `/search <keyword>` | ✔ | ✔ |
| `/upload <file>` | ✔ | ❌ |
| `/download <file>` | ✔ | ❌ |
| `/delete <file>` | ✔ | ❌ |

Roles are selected during client startup.

---

## 📁 File Transfer System (UDP)

File transfer uses simple **chunk-based UDP messages** (no ACKs, no reliability layer).  
Chunk size: **4096 bytes**.

### Upload Flow (Client → Server)
1. `UPLOAD_START|filename|totalChunks`
2. `UPLOAD_DATA|filename|chunkIndex|<base64data>`
3. `UPLOAD_END|filename`

Server reconstructs the file and stores it under:
```
shared/server_files/
```

### Download Flow (Server → Client)
1. `DOWNLOAD_START|filename|totalChunks`
2. Series of `DOWNLOAD_DATA|filename|chunkIndex|<base64data>`
3. `DOWNLOAD_END|filename`

Client saves the file to:
```
shared/client_files/
```

---

## 📊 Monitoring & Statistics

Server tracks:
- Active clients  
- Role of client  
- Number of messages received  
- Bytes received and sent  
- Inactivity status  
- Total traffic

Statistics are available:
### Command:
```
/stats
```

### Log file:
```
server/server_stats.txt
```

Updated every **5 seconds**.

---

## 🔌 Inactivity Timeout

If a client is inactive (no messages sent) for:
```
60 seconds
```
The server automatically removes it from the active list and frees the slot.

This ensures resources are available for new clients.

---

## ▶️ How to Run

### 1. Start the Server
```
cd server
node server.js
```

### 2. Start a Client
```
cd client
node client.js 127.0.0.1
```

Or connect to another device on the LAN:
```
node client.js 192.168.X.X
```

---

## 🧪 Testing the System

### Upload a file (admin only)
Place a file in:
```
shared/client_files/
```

Then run:
```
/upload example.txt
```

### Download a file (admin only)
```
/download example.txt
```

File saved to:
```
shared/client_files/
```

### Delete a file (admin only)
```
/delete example.txt
```

### List files
```
/list
```

---

## 🛠 Technologies Used
- **Node.js**  
- **UDP sockets (dgram module)**  
- **Base64 encoding for file transfer**  
- **Filesystem module (fs)**  
