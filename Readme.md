# V2X BOT (ReckonBot) 🚗🤖

![ReckonBot Architecture & Dashboard Cover](https://via.placeholder.com/1200x400.png?text=ReckonBot+|+Vehicle-to-Everything+(V2X)+Monitoring+Platform)

> **A Full-Stack Vehicle-to-Everything (V2X) and Robotics Monitoring Platform**

ReckonBot is an end-to-end operational command center designed for viewing live telemetry and low-latency video streams from edge robotics nodes. Leveraging a decoupled architecture, it integrates robust edge firmware (C++ on ESP32-CAM) with a high-performance HTTP orchestrator (Python/Flask) and a reactive, modular frontend UI (HTML5/CSS3/Vanilla JS).

---

## 📑 Table of Contents
1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Architecture & Workflow](#architecture--workflow)
4. [Technologies Used](#technologies-used)
5. [In-Depth Component Breakdown](#in-depth-component-breakdown)
6. [Data Flow & Security Considerations](#data-flow--security-considerations)
7. [Installation & Setup](#installation--setup)
8. [Configuration](#configuration)
9. [Usage Instructions](#usage-instructions)
10. [Deployment Notes](#deployment-notes)
11. [Testing & Contribution](#testing--contribution)
12. [License](#license)

---

## 🎯 Project Overview
The core objective of ReckonBot is to furnish a unified, authenticated dashboard for IoT devices and mobile robots. By creating a scalable data pipeline—from hardware sensor acquisition to real-time web UI rendering—this project demonstrates professional integration of IoT edge computing, backend networking, and modern frontend design. 

Whether it's for remote V2X testing, autonomous fleet monitoring, or personal robotics, ReckonBot proves that constrained edge hardware can reliably drive a real-time command center.

---

## ✨ Features
* **Real-time Low-Latency Video Streaming:** Proxy-routed MJPEG streams from custom-tuned ESP32-CAM nodes natively bypassing cross-origin restrictions.
* **Live Telemetry Events:** Hardware sensor data ingestion via HTTP POST with real-time UI broadcasting via Server-Sent Events (SSE).
* **Responsive Command Dashboard:** A modern, mobile-friendly multi-page application with persistent theme configurations and modular CSS layouts.
* **Firmware Optimization:** Custom C++ directives forcing direct-to-PSRAM camera frame buffers and dual-buffer MJPEG tuning for high framerate resilience.
* **Container-Ready Environment:** Configured strictly via `ENV` variables in compliance with 12-Factor App principles.

---

## 📐 Architecture & Workflow

ReckonBot employs a **Three-Tier Architecture**:

1. **Intelligent Edge (Tier 1):** ESP32-CAM microcontrollers connected to physical sensors and motors. They host their own micro-servers to stream raw video and push state telemetry to the orchestration server.
2. **Orchestration Backend (Tier 2):** A Python/Flask server functioning as the traffic controller. It absorbs incoming telemetry, serves the secure dashboard UI, proxies video streams to avoid client-side IP exposure, and pipes live state data to browsers via SSE.
3. **Presentation UI (Tier 3):** The frontend application that dynamically updates the DOM upon receiving SSE triggers, managing user interaction and data visualization.

---

## 🛠️ Technologies Used

| Category | Technologies |
| :--- | :--- |
| **Backend Framework** | Python 3, Flask, Gunicorn |
| **Frontend UI** | HTML5, Vanilla JavaScript (ES6+), CSS3 (CSS Variables) |
| **IoT / Edge Devices** | ESP32-CAM, C++, Arduino Core |
| **Data Protocols** | HTTP, REST, MJPEG, Server-Sent Events (SSE) |
| **Networking** | Proxy Tunnels, Static DNS mapping |

---

## 🔍 In-Depth Component Breakdown

### 1. The Frontend UI (`index.html`, `global.css`, `app.js`)
*   **`index.html` & Landing:** Built with CSS3 animations and modular visual components (pulsing vectors, floating particles). It serves as the stylized entry-point for user authentication.
*   **`global.css` & Theming:** Centralized CSS variables govern light/dark modes (`theme.js`), preventing page load flash by persisting configurations back to the Flask context.
*   **`app.js` & Modules:** Operates using a modular architecture (`bot1.js`, `sidebar.js`, `dom.js`). `app.js` establishes an `EventSource` connection to the backend `/api/bot1/events`, binding incoming real-time telemetry packets directly to DOM elements.

### 2. The Backend Orchestrator (`app.py`)
*   **Routing & UI:** Uses Jinja2 to render multi-page layouts seamlessly. Routes like `/dashboard` and `/bots/1` inject unified configuration metadata (e.g., `BUILD_ID`, Theme variables).
*   **Camera Proxy (`/api/bot1/stream`):** Rather than exposing the ESP32 IP to the internet, Flask absorbs the MJPEG byte-stream locally on the backend layer and yields it safely to the client browser via HTTP chunked transfer (`stream_with_context()`).
*   **Telemetry Hub:** An in-memory robust structure (`TelemetryStore`) holds real-time states and streams changes. 

### 3. The Edge Firmware (`esp32cam.ino`)
*   **Hardware Interface:** Manages the OV2640 camera IC via SPI/SCCB protocols.
*   **Performance Tuning:** Assigns buffers entirely to PSRAM (`CAMERA_FB_IN_PSRAM`), targets `VGA` resolution (640x480), and applies a double buffer (`count = 2`) to ensure 15-20 FPS consistency over noisy 2.4Ghz bands. 
*   **Network Resilience:** Implements Hardcoded Static IP constraints (`10.54.239.150`) allowing the Flask server to always resolve the camera host.

---

## 🔄 Data Flow & Security Considerations

### Data Flow Diagram
```text
[ ESP32-CAM (Sensors/Camera) ] --- (Raw MJPEG & Telemetry POST) ---> [ Flask Backend Orchestrator ]
                                                                             |
                                                                             | (SSE & Proxy Chunk Stream)
                                                                             v
                                                               [ Browser UI (Dashboard) ]