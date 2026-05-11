/**
 * Bot 1 Dashboard Module
 * Version: 2.2.0
 *
 * Features:
 *  - Test Mode (simulated telemetry)
 *  - Live Mode (SSE or Polling fallback)
 *  - MJPEG stream discovery & quality switching (UI only)
 *  - Telemetry age / connection status
 *  - Activity & Communication logs
 *  - Canvas-based recording of MJPEG stream
 *  - Simple analytics chart (temperature & humidity)
 *  - Export (JSON / CSV / placeholder PDF)
 *
 * Dependencies:
 *  - Chart.js (loaded in template)
 *
 * NOTE:
 *  This file is self-contained and does NOT rely on external frameworks.
 *  All missing optional DOM nodes are handled gracefully.
 */

/* -------------------- CONFIGURATION DEFAULTS (Override via window.Bot1Config) -------------------- */
const DEFAULT_CONFIG = {
    useSSE: true, // Switched to true to make SSE the default
    cameraHost: 'http://10.54.239.221',
    proxyPreferred: false,
    stateEndpoint: '/api/bot1/state',
    eventsEndpoint: '/api/bot1/events',
    telemetryStaleSeconds: 10,
    version: '2.2.0'
};

// Candidate MJPEG stream paths (ESP32-CAM firmwares differ)
const STREAM_PATH_CANDIDATES = ['', '/stream'];

// Simulation update interval
const SIM_UPDATE_MS = 2500;

// Polling interval if SSE disabled or fails
const POLL_INTERVAL_MS = 3000;

// Recording canvas target resolution (will be scaled)
const RECORD_WIDTH = 640;
const RECORD_HEIGHT = 480;

// Maximum activity log entries
const MAX_ACTIVITY_LOG = 120;
const MAX_COMM_LOG = 200;

/* ------------------------------------------------------------------------------------------------ */

const Bot1Dashboard = (() => {

    /* -------------------- State -------------------- */
    const state = {
        mode: 'test',                    // 'test' | 'live'
        lastTelemetry: null,
        lastTelemetryTs: 0,
        telemetryTimer: null,            // polling timer
        telemetryAgeTimer: null,
        simTimer: null,
        sse: null,
        streamHost: null,
        streamPath: null,
        streamActive: false,
        streamFailCount: 0,
        recording: false,
        mediaRecorder: null,
        recordedChunks: [],
        chart: null,
        chartData: {
            labels: [],
            temp: [],
            humidity: []
        },
        chartMaxPoints: 50,
        version: DEFAULT_CONFIG.version,
    };

    /* -------------------- Elements -------------------- */
    const els = {};

    function cacheElements() {
        const byId = id => document.getElementById(id);
        Object.assign(els, {
            root: document.querySelector('.bot1-surv'),
            testModeBtn: byId('testModeBtn'),
            liveModeBtn: byId('liveModeBtn'),
            connectionBtn: byId('connectionBtn'),
            connectionText: byId('connectionText'),
            clock: byId('clock'),
            syncTooltip: byId('syncTooltip'),
            telemetryAge: byId('telemetryAge'),
            distanceFill: byId('distanceFill'),
            servoValue: byId('servoValue'),
            servoGauge: byId('servoGauge'),
            tempValue: byId('tempValue'),
            humidityValue: byId('humidityValue'),
            batteryStatus: byId('batteryStatus'),
            netStrength: byId('netStrength'),
            activeAlertsCount: byId('activeAlertsCount'),
            irStatusBadge: byId('irStatusBadge'),
            irDetails: byId('irDetails'),
            irSignalBar: byId('irSignalBar'),
            irHint: byId('irHint'),
            videoStream: byId('videoStream'),
            streamLoader: byId('streamLoader'),
            streamQuality: byId('streamQuality'),
            streamResLabel: byId('streamResLabel'),
            recBtn: byId('recBtn'),
            recIndicator: byId('recIndicator'),
            liveBadge: byId('liveBadge'),
            activityLog: byId('activityLog'),
            commLogBody: byId('commLogBody'),
            analyticsChart: document.getElementById('analyticsChart'),
            analyticsRange: byId('analyticsRange'),
            toastContainer: byId('toastContainer'),
            exportCsv: document.querySelector('[data-export="csv"]'),
            exportJson: document.querySelector('[data-export="json"]'),
            exportPdf: document.querySelector('[data-export="pdf"]'),
        });
    }

    /* -------------------- Config Merge -------------------- */
    const CFG = { ...DEFAULT_CONFIG, ...(window.Bot1Config || {}) };

    /* -------------------- Initialization -------------------- */
    function init() {
        cacheElements();
        initClock();
        initTelemetryAgeUpdater();
        bindModeButtons();
        bindStreamControls();
        bindRecording();
        bindExports();
        bindAnalyticsRange();
        startChart();
        attemptAutoLive();
        logActivity('Dashboard initialized (v' + CFG.version + ')');
        setMode('test'); // default
    }

    function attemptAutoLive() {
        if (els.videoStream && els.videoStream.dataset.autoLive === 'true') {
            setTimeout(() => setMode('live'), 400);
        }
    }

    /* -------------------- Mode Handling -------------------- */
    function setMode(mode) {
        if (mode === state.mode) return;
        // Clean up previous mode
        if (state.mode === 'test') stopSimulation();
        if (state.mode === 'live') stopLiveTelemetry();

        state.mode = mode;

        if (els.testModeBtn && els.liveModeBtn) {
            els.testModeBtn.classList.toggle('active', state.mode === 'test');
            els.liveModeBtn.classList.toggle('active', state.mode === 'live');
        }

        if (state.mode === 'test') {
            startSimulation();
            pauseStream(); // ensure we don't keep a real stream in test unless we want preview
            setConnectionStatus(true); // test mode always "connected"
            logActivity('Entered Test Mode');
        } else {
            logActivity('Entering Live Mode...');
            setConnectionStatus(false);
            startLiveTelemetry();
            startStream(); // Fire up camera stream
        }
    }

    function bindModeButtons() {
        if (els.testModeBtn) {
            els.testModeBtn.addEventListener('click', () => setMode('test'));
        }
        if (els.liveModeBtn) {
            els.liveModeBtn.addEventListener('click', () => setMode('live'));
        }
    }

    /* -------------------- Simulation -------------------- */
    function startSimulation() {
        stopSimulation();
        simulateTick(true);
        state.simTimer = setInterval(simulateTick, SIM_UPDATE_MS);
    }

    function stopSimulation() {
        if (state.simTimer) clearInterval(state.simTimer);
        state.simTimer = null;
    }

    function simulateTick(initial) {
        // Generate plausible random values
        const distance = randInt(2, 48);
        const servo = randInt(0, 179);
        const temp = +(20 + Math.random() * 10).toFixed(1);
        const humidity = randInt(40, 70);
        const battery = randInt(70, 96);
        const alerts = randInt(0, 2);
        const irDetected = Math.random() > 0.6;
        const rssi = -60 - randInt(0, 12);

        const telemetry = {
            deviceId: 'SIM_BOT1',
            ts: Math.floor(Date.now() / 1000),
            distance,
            servo,
            temperature: temp,
            humidity,
            battery,
            alerts,
            ir_obstacle: irDetected,
            rssi
        };
        applyTelemetry(telemetry, true);
        if (!initial) logComm('TELEMETRY', 'Simulated telemetry update', 'ok');
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /* -------------------- Live Telemetry -------------------- */
    function startLiveTelemetry() {
        stopLiveTelemetry();
        if (CFG.useSSE) {
            startSSE();
        } else {
            startPolling();
        }
        // Kick off a first fetch to populate quickly
        fetchTelemetryOnce();
    }

    function stopLiveTelemetry() {
        stopPolling();
        stopSSE();
    }

    // Polling Implementation
    function startPolling() {
        stopPolling();
        fetchTelemetryOnce();
        state.telemetryTimer = setInterval(fetchTelemetryOnce, POLL_INTERVAL_MS);
        logActivity('Telemetry polling started');
    }

    function stopPolling() {
        if (state.telemetryTimer) clearInterval(state.telemetryTimer);
        state.telemetryTimer = null;
    }

    async function fetchTelemetryOnce() {
        try {
            const res = await fetch(CFG.stateEndpoint, { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            const data = json.data || {};
            applyTelemetry(normalizeTelemetry(data));
        } catch (err) {
            logActivity('Polling error: ' + err.message, 'warn');
            setConnectionStatus(false);
        }
    }

    // SSE Implementation
    function startSSE() {
        stopSSE();
        try {
            state.sse = new EventSource(CFG.eventsEndpoint);
            state.sse.onmessage = ev => {
                try {
                    const data = JSON.parse(ev.data);
                    applyTelemetry(normalizeTelemetry(data));
                } catch (e) {
                    logActivity('SSE parse error: ' + e.message, 'warn');
                }
            };
            state.sse.onerror = () => {
                logActivity('SSE error: fallback to polling', 'warn');
                stopSSE();
                startPolling();
            };
            logActivity('SSE connection opened');
        } catch (err) {
            logActivity('SSE init failed, fallback to polling', 'warn');
            startPolling();
        }
    }

    function stopSSE() {
        if (state.sse) {
            state.sse.close();
            state.sse = null;
            logActivity('SSE closed');
        }
    }

    function normalizeTelemetry(d) {
        // Convert possible string numbers
        const n = (v) => (v === undefined || v === null || v === '' ? undefined : +v);
        return {
            deviceId: d.deviceId || d.id || 'BOT1',
            ts: d.ts || Math.floor(Date.now() / 1000),
            distance: n(d.distance ?? d.distanceCm),
            temperature: n(d.temperature),
            humidity: n(d.humidity),
            servo: n(d.servo),
            battery: n(d.battery),
            alerts: n(d.alerts),
            ir_obstacle: !!d.ir_obstacle,
            rssi: n(d.rssi)
        };
    }

    /* -------------------- Telemetry Application -------------------- */
    function applyTelemetry(t, simulated = false) {
        state.lastTelemetry = t;
        state.lastTelemetryTs = Date.now();

        // Distance
        if (t.distance != null && els.distanceFill) {
            const pct = Math.max(0, Math.min(100, (t.distance / 50) * 100));
            els.distanceFill.style.width = pct + '%';
            els.distanceFill.textContent = t.distance.toFixed(1) + ' cm';
        }

        // Servo
        if (t.servo != null && els.servoValue && els.servoGauge) {
            els.servoValue.textContent = t.servo + '°';
            els.servoGauge.style.background =
                `conic-gradient(from 0deg, var(--accent-color) ${t.servo}deg, var(--bg-tertiary) ${t.servo}deg)`;
        }

        // Climate
        if (t.temperature != null && els.tempValue) {
            const cls = t.temperature > 32 ? 'critical' : t.temperature > 28 ? 'warning' : 'normal';
            els.tempValue.className = 'climate-value ' + cls;
            els.tempValue.textContent = t.temperature.toFixed(1) + '°C';
        }
        if (t.humidity != null && els.humidityValue) {
            els.humidityValue.textContent = t.humidity.toFixed(0) + '%';
        }

        // Battery / Alerts / RSSI
        if (t.battery != null && els.batteryStatus) {
            els.batteryStatus.textContent = t.battery + '%';
        }
        if (t.alerts != null && els.activeAlertsCount) {
            els.activeAlertsCount.textContent = t.alerts;
        }
        if (t.rssi != null && els.netStrength) {
            els.netStrength.textContent = t.rssi + ' dBm';
        }

        // IR Sensor
        if (els.irStatusBadge) {
            if (t.ir_obstacle) {
                els.irStatusBadge.textContent = 'OBSTACLE';
                els.irStatusBadge.classList.add('alert');
                if (els.irDetails) els.irDetails.textContent = 'Obstacle detected';
                if (els.irSignalBar) els.irSignalBar.style.width = '100%';
            } else {
                els.irStatusBadge.textContent = 'CLEAR';
                els.irStatusBadge.classList.remove('alert');
                if (els.irDetails) els.irDetails.textContent = 'No obstacle';
                if (els.irSignalBar) els.irSignalBar.style.width = '8%';
            }
        }

        updateSync();
        setConnectionStatus(true);
        pushChartPoint(t.temperature, t.humidity);
        if (!simulated) logComm('TELEMETRY', 'Update received', 'ok');
    }

    function updateSync() {
        if (els.syncTooltip) {
            els.syncTooltip.textContent = 'Last sync: ' + new Date().toLocaleTimeString();
        }
    }

    /* -------------------- Telemetry Age Display -------------------- */
    function initTelemetryAgeUpdater() {
        if (state.telemetryAgeTimer) clearInterval(state.telemetryAgeTimer);
        state.telemetryAgeTimer = setInterval(() => {
            if (!els.telemetryAge) return;
            if (!state.lastTelemetryTs) {
                els.telemetryAge.textContent = '--s';
                return;
            }
            const ageSec = Math.floor((Date.now() - state.lastTelemetryTs) / 1000);
            els.telemetryAge.textContent = ageSec + 's';
            if (ageSec > CFG.telemetryStaleSeconds && state.mode === 'live') {
                setConnectionStatus(false);
            }
        }, 1000);
    }

    /* -------------------- Connection Status -------------------- */
    function setConnectionStatus(ok) {
        if (els.connectionBtn) {
            els.connectionBtn.classList.toggle('connected', ok);
            els.connectionBtn.classList.toggle('disconnected', !ok);
        }
        if (els.connectionText) {
            els.connectionText.textContent = ok ? 'Connected' : 'Disconnected';
        }
    }

    /* -------------------- Stream Handling -------------------- */
    function startStream() {
        if (!els.videoStream) return;
        if (state.streamActive) return;
        // Determine host
        let host = els.videoStream.dataset.cameraHost || CFG.cameraHost || DEFAULT_CONFIG.cameraHost;
        host = stripTrailingSlash(host);
        state.streamHost = host;

        // Select path candidate
        const path = pickStreamPath();
        state.streamPath = path;

        const quality = els.streamQuality ? els.streamQuality.value : 'xga';
        if (els.streamResLabel) els.streamResLabel.textContent = quality.toUpperCase();

        let url = `${host}${path}`;
        // Some firmwares accept query param like ?x=<res> or custom; we just annotate for potential server mapping
        url += `?quality=${encodeURIComponent(quality)}`;

        showStreamLoader(true);
        els.videoStream.src = url;
        els.videoStream.onload = () => {
            state.streamActive = true;
            showStreamLoader(false);
            logActivity('Stream started');
        };
        els.videoStream.onerror = () => {
            logActivity('Stream error - will retry', 'warn');
            showStreamLoader(false);
            state.streamActive = false;
            // Basic retry after delay
            setTimeout(() => {
                if (state.mode === 'live') startStream();
            }, 3000);
        };
    }

    function pauseStream() {
        if (!els.videoStream) return;
        els.videoStream.src = '';
        state.streamActive = false;
        showStreamLoader(false);
        logActivity('Stream paused');
    }

    function refreshStream() {
        if (state.mode !== 'live') return;
        pauseStream();
        setTimeout(startStream, 150);
    }

    function bindStreamControls() {
        // Generic data-video buttons
        document.querySelectorAll('.video-control-btn').forEach(btn => {
            const action = btn.getAttribute('data-video');
            btn.addEventListener('click', () => {
                switch (action) {
                    case 'play':
                        if (state.mode === 'live') startStream();
                        else logActivity('Switch to Live Mode to play real stream', 'info');
                        break;
                    case 'pause':
                        pauseStream();
                        break;
                    case 'snapshot':
                        doSnapshot();
                        break;
                    case 'fullscreen':
                        goFullscreen();
                        break;
                }
            });
        });

        if (els.streamQuality) {
            els.streamQuality.addEventListener('change', () => {
                logActivity('Quality changed → ' + els.streamQuality.value.toUpperCase());
                refreshStream();
            });
        }
    }

    function stripTrailingSlash(u) {
        return u.replace(/\/+$/, '');
    }

    function pickStreamPath() {
        // Heuristic: try /stream first (most common)
        // For advanced detection you'd do HEAD/GET tests; here we just pick the first
        return STREAM_PATH_CANDIDATES[1] || '/stream';
    }

    function showStreamLoader(show) {
        if (els.streamLoader) els.streamLoader.classList.toggle('hidden', !show);
    }

    function doSnapshot() {
        if (!els.videoStream || !els.videoStream.src) {
            logActivity('Snapshot failed (no stream)', 'warn');
            return;
        }
        // Directly downloading the MJPEG URL will not give single frame; need canvas
        try {
            const canvas = document.createElement('canvas');
            canvas.width = RECORD_WIDTH;
            canvas.height = RECORD_HEIGHT;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(els.videoStream, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'snapshot-' + Date.now() + '.png';
                a.click();
                URL.revokeObjectURL(url);
            }, 'image/png');
            logActivity('Snapshot captured');
        } catch (e) {
            logActivity('Snapshot error: ' + e.message, 'error');
        }
    }

    function goFullscreen() {
        if (!els.videoStream) return;
        if (els.videoStream.requestFullscreen) {
            els.videoStream.requestFullscreen();
        } else {
            logActivity('Fullscreen not supported', 'warn');
        }
    }

    /* -------------------- Recording -------------------- */
    function bindRecording() {
        if (!els.recBtn || !els.videoStream) return;
        els.recBtn.addEventListener('click', toggleRecording);
    }

    function toggleRecording() {
        if (state.recording) {
            stopRecording();
        } else {
            startRecording();
        }
    }

    function startRecording() {
        if (!els.videoStream) return;
        state.recording = true;
        els.recBtn.classList.add('active');
        if (els.recBtn) els.recBtn.setAttribute('aria-pressed', 'true');
        if (els.recIndicator) els.recIndicator.classList.remove('hidden');

        const canvas = document.createElement('canvas');
        canvas.width = RECORD_WIDTH;
        canvas.height = RECORD_HEIGHT;
        const ctx = canvas.getContext('2d');

        state.recordedChunks = [];
        function draw() {
            if (!state.recording) return;
            try {
                ctx.drawImage(els.videoStream, 0, 0, canvas.width, canvas.height);
            } catch { }
            requestAnimationFrame(draw);
        }
        draw();

        const stream = canvas.captureStream(20);
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';
        try {
            state.mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        } catch (e) {
            logActivity('MediaRecorder unsupported: ' + e.message, 'error');
            state.recording = false;
            return;
        }
        state.mediaRecorder.ondataavailable = ev => {
            if (ev.data.size > 0) state.recordedChunks.push(ev.data);
        };
        state.mediaRecorder.onstop = finalizeRecording;
        state.mediaRecorder.start();
        logActivity('Recording started');
    }

    function stopRecording() {
        if (!state.recording) return;
        state.recording = false;
        els.recBtn.classList.remove('active');
        if (els.recBtn) els.recBtn.setAttribute('aria-pressed', 'false');
        if (els.recIndicator) els.recIndicator.classList.add('hidden');
        state.mediaRecorder && state.mediaRecorder.stop();
        logActivity('Recording stopping...');
    }

    function finalizeRecording() {
        const blob = new Blob(state.recordedChunks, { type: state.recordedChunks[0]?.type || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording-' + Date.now() + '.webm';
        a.click();
        URL.revokeObjectURL(url);
        logActivity('Recording saved');
    }

    /* -------------------- Chart -------------------- */
    function startChart() {
        if (!els.analyticsChart || !window.Chart) return;
        state.chart = new Chart(els.analyticsChart.getContext('2d'), {
            type: 'line',
            data: {
                labels: state.chartData.labels,
                datasets: [
                    {
                        label: 'Temp (°C)',
                        data: state.chartData.temp,
                        borderColor: 'var(--accent-color)',
                        backgroundColor: 'rgba(255,130,80,0.15)',
                        tension: 0.25,
                        borderWidth: 2,
                        pointRadius: 0
                    },
                    {
                        label: 'Humidity (%)',
                        data: state.chartData.humidity,
                        borderColor: 'var(--info)',
                        backgroundColor: 'rgba(90,160,255,0.15)',
                        tension: 0.25,
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { intersect: false, mode: 'nearest' },
                scales: {
                    x: {
                        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                },
                plugins: {
                    legend: { display: true, labels: { boxWidth: 12 } }
                }
            }
        });
    }

    function pushChartPoint(temp, humidity) {
        if (!state.chart || temp == null || humidity == null) return;
        const label = new Date().toLocaleTimeString();
        state.chartData.labels.push(label);
        state.chartData.temp.push(temp);
        state.chartData.humidity.push(humidity);
        if (state.chartData.labels.length > state.chartMaxPoints) {
            state.chartData.labels.shift();
            state.chartData.temp.shift();
            state.chartData.humidity.shift();
        }
        state.chart.update();
    }

    function bindAnalyticsRange() {
        if (!els.analyticsRange) return;
        els.analyticsRange.addEventListener('change', () => {
            const val = els.analyticsRange.value;
            logActivity('Analytics range -> ' + val);
            // For now we only simulate; could add real historical queries here.
        });
    }

    /* -------------------- Exports -------------------- */
    function bindExports() {
        if (els.exportJson) {
            els.exportJson.addEventListener('click', exportJson);
        }
        if (els.exportCsv) {
            els.exportCsv.addEventListener('click', exportCsv);
        }
        if (els.exportPdf) {
            els.exportPdf.addEventListener('click', exportPdf);
        }
    }

    function gatherTelemetrySnapshot() {
        return {
            timestamp: new Date().toISOString(),
            mode: state.mode,
            telemetry: state.lastTelemetry,
            version: CFG.version
        };
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify(gatherTelemetrySnapshot(), null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'bot1-telemetry-' + Date.now() + '.json');
        logActivity('Exported JSON');
    }

    function exportCsv() {
        const t = state.lastTelemetry || {};
        const headers = ['timestamp', 'mode', 'deviceId', 'distance', 'servo', 'temperature', 'humidity', 'battery', 'alerts', 'ir_obstacle', 'rssi'];
        const row = [
            new Date().toISOString(),
            state.mode,
            t.deviceId || '',
            safeNum(t.distance),
            safeNum(t.servo),
            safeNum(t.temperature),
            safeNum(t.humidity),
            safeNum(t.battery),
            safeNum(t.alerts),
            t.ir_obstacle ? 1 : 0,
            safeNum(t.rssi)
        ];
        const csv = headers.join(',') + '\n' + row.join(',') + '\n';
        const blob = new Blob([csv], { type: 'text/csv' });
        downloadBlob(blob, 'bot1-telemetry-' + Date.now() + '.csv');
        logActivity('Exported CSV');
    }

    function exportPdf() {
        // Placeholder: real PDF would require a library (jsPDF, etc.)
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write('<pre>' + escapeHtml(JSON.stringify(gatherTelemetrySnapshot(), null, 2)) + '</pre>');
        w.document.close();
        logActivity('Opened PDF preview window (placeholder)');
    }

    function safeNum(v) {
        return (v === undefined || v === null || isNaN(v)) ? '' : v;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, s => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[s]));
    }

    /* -------------------- Logs -------------------- */
    function logActivity(msg, level = 'info') {
        if (!els.activityLog) return;
        const line = document.createElement('div');
        line.className = `log-line log-${level}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        els.activityLog.prepend(line);
        while (els.activityLog.children.length > MAX_ACTIVITY_LOG) {
            els.activityLog.removeChild(els.activityLog.lastChild);
        }
    }

    function logComm(type, message, status = 'ok') {
        if (!els.commLogBody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${new Date().toLocaleTimeString()}</td>
      <td>${type}</td>
      <td>${escapeHtml(message)}</td>
      <td class="${status}">${status}</td>
    `;
        els.commLogBody.prepend(tr);
        while (els.commLogBody.children.length > MAX_COMM_LOG) {
            els.commLogBody.removeChild(els.commLogBody.lastChild);
        }
    }

    /* -------------------- Clock -------------------- */
    function initClock() {
        function tick() {
            if (els.clock) {
                const d = new Date();
                els.clock.textContent = d.toLocaleTimeString();
            }
            requestAnimationFrame(tick);
        }
        tick();
    }

    /* -------------------- Public Helpers -------------------- */
    function getState() {
        return {
            mode: state.mode,
            lastTelemetry: state.lastTelemetry,
            lastTelemetryTs: state.lastTelemetryTs,
            streamUrl: getCurrentStreamUrl(),
            version: state.version
        };
    }

    function getCurrentStreamUrl() {
        return els.videoStream ? els.videoStream.src : null;
    }

    /* -------------------- API Exposure -------------------- */
    return {
        init,
        setMode,
        refreshStream,
        pauseStream,
        getState,
        getCurrentStreamUrl
    };
})();

/* -------------------- Boot -------------------- */
document.addEventListener('DOMContentLoaded', () => {
    Bot1Dashboard.init();
    window.Bot1Dashboard = Bot1Dashboard;
});