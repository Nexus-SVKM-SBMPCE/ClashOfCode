# Code Clash — Local Arena

A self-contained, LAN-accessible competitive programming platform built for offline campus coding competitions and workshops.

---

## Overview & Architecture

Code Clash runs on a single host computer connected to a local area network (LAN / Wi-Fi). Competitors connect via their browser, read problem descriptions, write solutions in a fully-featured local Monaco editor, and submit code for genuine server-side compilation, sandbox execution, and real-time verdict scoring.

```
+-------------------------------------------------------------------+
|                           Local Network                           |
|       Participants: http://192.168.0.116:5173 (or host IP)        |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| Host Machine:                                                     |
|                                                                   |
|   Frontend (Port 5173)                                            |
|   - React 18 + TypeScript + Vite                                  |
|   - Monaco Editor bundled locally (100% offline, no CDN)          |
|                                                                   |
|   Backend API (Port 8000)                                         |
|   - Python 3.12 + FastAPI + SQLite (WAL mode)                     |
|   - REST API + JWT Authentication                                 |
|                                                                   |
|   Evaluation Engine                                               |
|   - Isolated Worker / Judge0 container runner                     |
|   - Memory, time, and network-sandboxed compilation & execution   |
+-------------------------------------------------------------------+
```

---

## Prerequisites

| Requirement | Minimum Version | Verified Machine Status |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11, Linux, or macOS | Windows 11 |
| **Python** | 3.10+ | 3.12.4 (`.venv` ready) |
| **Node.js** | 18+ (LTS recommended) | v22.22.0 |
| **npm** | 9+ | 10.9.4 |
| **Docker Engine** | Docker Desktop 4+ (WSL2 / Linux containers) | Active (Server v29.9.2, Cgroups v2) |
| **Judge0 Stack** | Judge0 CE 1.13.0 | Active on port `2358` (4 containers) |

---

## Supported Languages & Verified Versions

The platform utilizes self-hosted Judge0 CE for genuine, isolated evaluation without requiring local host compiler installations.

| Language | Judge0 ID | Compiler / Runtime | Status |
| :--- | :--- | :--- | :--- |
| **C** | `48` | GCC 7.4.0 | **Verified** (AC, WA, CE) |
| **C++** | `52` | GCC 7.4.0 | **Verified** (AC, WA, CE, TLE, RE) |
| **Java** | `62` | OpenJDK 13.0.1 | **Verified** (AC, WA, CE) |
| **Python** | `71` | Python 3.8.1 | **Verified** (AC, WA, RE) |

Run the automated evaluation verification suite at any time:
```powershell
.\.venv\Scripts\python.exe tests\verify_judge0.py
```

---

## Installation & Setup

### 1. Repository Setup & Virtual Environment
```powershell
# Clone or navigate to the workspace
cd r:\ClashOfCode

# Activate existing Python virtual environment
.\.venv\Scripts\Activate.ps1

# Upgrade pip and install backend requirements (once scaffolded)
pip install -r backend/requirements.txt
```

### 2. Frontend Dependencies
```powershell
cd r:\ClashOfCode\frontend
npm install
```

---

## Environment Configuration

Configuration is managed via `.env` files.

### Backend (`backend/.env`)
```env
HOST=0.0.0.0
PORT=8000
DATABASE_URL=sqlite:///./codeclash.db
SECRET_KEY=local_arena_super_secret_key_2026
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=720
EVALUATOR_MODE=docker # or 'native'
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","http://192.168.0.116:5173"]
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL=http://192.168.0.116:8000/api
```

---

## Database Setup & Demo Credentials

The application uses an SQLite database with Write-Ahead Logging (WAL) for concurrent read-heavy operations. On initial startup, the backend automatically seeds the database with demo users and DSA benchmark problems.

### Demo User Accounts

| Role | Username | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Create/edit problems, test cases, view all submissions |
| **Contestant 1** | `contestant1` | `pass123` | Submit solutions, view personal history, leaderboard |
| **Contestant 2** | `contestant2` | `pass123` | Submit solutions, view personal history, leaderboard |
| **Contestant 3** | `contestant3` | `pass123` | Submit solutions, view personal history, leaderboard |

---

## Starting and Stopping Services

### Starting the Backend
```powershell
# From workspace root
.\.venv\Scripts\Activate.ps1
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Starting the Frontend
```powershell
# In a separate terminal
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

### Stopping Services
Press `Ctrl + C` in the respective terminal windows.

---

## LAN Access & Offline Operation

### Finding the Host LAN IP
On Windows PowerShell:
```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" }).IPAddress
```
Current host IP: `192.168.0.116`

### Participant Connection
1. Ensure participants are connected to the same Wi-Fi router / network switch as the host.
2. In client browsers, navigate to:
   ```
   http://192.168.0.116:5173
   ```
3. Test connectivity by logging in with one of the demo credentials.

### Offline Guarantee
- **No CDN dependencies**: Monaco Editor, Google Fonts, and icons are bundled locally in the build artifacts.
- **No external judge API**: Code evaluation runs 100% locally.
- **Zero internet ping**: The system will function fully with the WAN / Internet cable disconnected from the local router.

---

## Troubleshooting

1. **Cannot connect from participant phones/laptops:**
   - Verify Windows Firewall is allowing incoming connections on ports `5173` and `8000`.
   - Run in admin PowerShell:
     ```powershell
     New-NetFirewallRule -DisplayName "CodeClash Web" -Direction Inbound -LocalPort 5173,8000 -Protocol TCP -Action Allow
     ```
   - Ensure the Wi-Fi network profile on Windows is set to **Private**, not Public.

2. **Docker Service Stopped:**
   - Start Docker Desktop from the Start Menu or run:
     ```powershell
     Start-Service com.docker.service
     ```

3. **Monaco Editor syntax highlighting blank offline:**
   - Ensure local Monaco worker scripts are correctly registered in the Vite configuration without CDN fallbacks.

---

## Known Limitations

- Submissions from untrusted users must run under resource limits (RAM: 128MB, CPU: 1.0 core, Timeout: 2.0s).
- First release supports C++ (g++ 17/20); Python support will be activated in Phase 5 after C++ validation is complete.