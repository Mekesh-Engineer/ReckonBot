
/* -------------------- CONFIGURATION (EDITABLE DEFAULTS) -------------------- */

// Default camera IP address. Can be overridden by data-attributes or window globals.
const DEFAULT_CAMERA_HOST = 'http://10.54.239.221/';

// Candidate MJPEG paths to test, in order. The first one that works is used.
// Common for ESP32-CAM is either root ('') or '/stream'.
const STREAM_PATH_CANDIDATES = [
    '',
    '/stream'
];

// Optional health endpoint for fetching stats like uptime and RSSI from the camera.
const HEALTH_ENDPOINT_PATH = '/health';

// If true, appends ?quality=vga to the stream URL. Firmware may ignore this.
const APPEND_QUALITY_PARAM = false;

// --- Connection Retry Tuning ---
const RETRY_BASE_DELAY_MS = 1500; // Initial delay for the first retry.
const RETRY_MAX_DELAY_MS = 12000; // Maximum delay between retries.
const RETRY_JITTER_MS = 400;      // Randomness added to delays to prevent thundering herd.
const MAX_STREAM_FAILS_BEFORE_ALERT = 6; // How many consecutive fails before a persistent alert.
const HEALTH_PROBE_TIMEOUT_MS = 3500;    // Timeout for health check requests.

// --- Simulation Tuning ---
const SIM_UPDATE_MS = 2500; // How often simulated sensor data updates.

// --- Bot API (Currently Inactive) ---
const BOT_API_ENABLED = false;
const BOT_API_BASE = 'http://192.168.1.151/api';

/* -------------------------------------------------------------------------- */

const Bot1Dashboard = (() => {
    const state = {
        isLive: false,
        simTimer: null,
        chart: null,
        recActive: false,
        lastSync: null,
        streamActive: false,
        retryCount: 0,
        retryTimer: null,
        streamLastSuccess: null,
        streamFailures: 0,
        selectedStreamPath: null,
        selectingPath: false,
        moduleStatus: {
            cam: 'unknown',
            bot: BOT_API_ENABLED ? 'unknown' : 'disabled'
        },
        healthInfo: null,
        lastHealthCheck: 0,
        healthCheckTimer: null,
        cachedHost: null, // Lazily resolved host IP
        lastErrorMessage: null // Throttle console logs
    };

    // Cache for DOM elements
    const els = {};

    /* -------------------- DOM UTILS -------------------- */
    function qs(id) { return document.getElementById(id); }
    function stripTrailingSlash(u) { return u.replace(/\/+$/, ''); }
    function now() { return Date.now(); }

    /* -------------------- CACHE ELEMENTS -------------------- */
    function cacheElements() {
        Object.assign(els, {
            testModeBtn: qs('testModeBtn'),
            liveModeBtn: qs('liveModeBtn'),
            connectionBtn: qs('connectionBtn'),
            connectionText: qs('connectionText'),
            moduleStatusHost: qs('moduleStatusHost'),
            camStatus: qs('camStatusIndicator'),
            botStatus: qs('botStatusIndicator'),
            clock: qs('clock'),
            syncTooltip: qs('syncTooltip'),
            distanceFill: qs('distanceFill'),
            servoValue: qs('servoValue'),
            servoGauge: qs('servoGauge'),
            tempValue: qs('tempValue'),
            humidityValue: qs('humidityValue'),
            activityLog: qs('activityLog'),
            commLogBody: qs('commLogBody'),
            buzzerToggle: qs('buzzerToggle'),
            buzzerIcon: qs('buzzerIcon'),
            streamEl: qs('videoStream'),
            streamLoader: qs('streamLoader'),
            qualitySelect: qs('streamQuality'),
            recBtn: qs('recBtn'),
            toastContainer: qs('toastContainer'),
            batteryStatus: qs('batteryStatus'),
            netStrength: qs('netStrength'),
            activeAlertsCount: qs('activeAlertsCount'),
            bboxSample: qs('bboxSample'),
            bboxLabel: qs('bboxLabel'),
            streamErrorOverlay: qs('streamErrorOverlay'),
            healthStatsText: qs('cameraHealthStats'),
            // IR Sensor Elements
            irStatusBadge: qs('irStatusBadge'),
            irDetails: qs('irDetails'),
            irSignalBar: qs('irSignalBar'),
            irHint: qs('irHint')
        });
    }

    /* --- Dynamic Element Creation (if missing from HTML) --- */
    function ensureStatusIndicators() {
        // ... (Code is robust, no changes needed)
    }

    function ensureStreamErrorOverlay() {
        // ... (Code is robust, no changes needed)
    }

    /* -------------------- INITIALIZATION -------------------- */
    function init() {
        cacheElements();
        ensureStatusIndicators();
        ensureStreamErrorOverlay();
        bindUI();
        initClock();
        initChart();
        registerVisibilityHandler();
        registerNetworkHandlers();
        connectivityBootstrap();
        enterTestMode(); // Start in safe, simulated mode
        autoLiveIfRequested(); // Check if HTML attribute requests auto-start
    }

    function autoLiveIfRequested() {
        if (!els.streamEl) return;
        if (els.streamEl.dataset.autoLive === 'true') {
            // Defer until the rest of the UI is initialized
            setTimeout(() => setMode(true), 300);
        }
    }

    // ... (All other sections like Camera Host/Path, Status/Health, UI Bindings are robust and unchanged) ...
    // ... I will skip pasting them here for brevity, but they are part of the final code. ...
    // The key changes are in the Telemetry Simulation section below.

    /* -------------------- TELEMETRY SIMULATION -------------------- */
    function startSimulation(flag = false) {
        updateCycle(flag);
        state.simTimer = setInterval(() => updateCycle(flag), SIM_UPDATE_MS);
    }

    function stopSimulation() {
        clearInterval(state.simTimer);
        state.simTimer = null;
    }

    function updateCycle(isLiveSim) {
        const distance = randInt(0, 49);
        const angle = randInt(0, 179);
        const temp = (20 + Math.random() * 8).toFixed(1);
        const humidity = (45 + Math.random() * 20).toFixed(0);
        const battery = (74 + Math.random() * 12).toFixed(0);
        const alerts = randInt(0, 2);

        updateDistance(distance);
        updateServo(angle);
        updateClimate(temp, humidity);
        updateBotVitals(battery, alerts);
        updateIRSensor(); // <-- NEW: Add IR sensor to the simulation cycle
        addActivityLogEntry(isLiveSim ? 'Simulated Telemetry' : undefined);
        addCommEntry();
        updateChartData({ temp: parseFloat(temp), humidity: parseInt(humidity, 10) });
        updateSync();
        maybeShowBBox(isLiveSim);
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function updateDistance(cm) {
        if (!els.distanceFill) return;
        els.distanceFill.style.width = `${(cm / 50) * 100}%`;
        els.distanceFill.textContent = `${cm} cm`;
    }

    function updateServo(angle) {
        if (!els.servoValue || !els.servoGauge) return;
        els.servoValue.textContent = `${angle}°`;
        els.servoGauge.style.background =
            `conic-gradient(from 0deg, var(--accent-color) ${angle}deg, var(--bg-tertiary) ${angle}deg)`;
    }

    function updateClimate(temp, humidity) {
        if (!els.tempValue || !els.humidityValue) return;
        const t = parseFloat(temp);
        els.tempValue.textContent = `${t}°C`;
        els.tempValue.className =
            'climate-value ' + (t > 32 ? 'critical' : t > 28 ? 'warning' : 'normal');
        els.humidityValue.textContent = `${humidity}%`;
    }

    /**
     * NEW: Simulates the IR Sensor widget.
     */
    function updateIRSensor() {
        if (!els.irStatusBadge) return;

        const isDetected = Math.random() > 0.6; // 40% chance of detection

        if (isDetected) {
            const signalStrength = randInt(60, 100);
            els.irStatusBadge.textContent = 'OBJECT DETECTED';
            els.irStatusBadge.style.color = 'var(--warning)';
            els.irStatusBadge.style.borderColor = 'var(--warning)';
            if (els.irDetails) els.irDetails.textContent = `Signal: ${signalStrength}%`;
            if (els.irSignalBar) els.irSignalBar.style.width = `${signalStrength}%`;
        } else {
            els.irStatusBadge.textContent = 'CLEAR';
            els.irStatusBadge.style.color = 'var(--text-muted)';
            els.irStatusBadge.style.borderColor = 'var(--border-color)';
            if (els.irDetails) els.irDetails.textContent = 'No obstacle nearby';
            if (els.irSignalBar) els.irSignalBar.style.width = '0%';
        }
    }

    function updateBotVitals(battery, alerts) {
        if (els.batteryStatus) els.batteryStatus.textContent = `${battery}%`;
        if (els.activeAlertsCount) els.activeAlertsCount.textContent = alerts;
        if (els.netStrength) els.netStrength.textContent = Math.random() > 0.1 ? 'Strong' : 'Weak';
    }

    function updateSync() {
        state.lastSync = new Date();
        if (els.syncTooltip) els.syncTooltip.textContent = `Last sync: ${state.lastSync.toLocaleTimeString()}`;
    }

    function maybeShowBBox(sim) {
        if (!els.bboxSample) return;
        const show = Math.random() > 0.7;
        els.bboxSample.classList.toggle('hidden', !show);
        if (show) {
            const conf = (80 + Math.random() * 15).toFixed(0);
            els.bboxLabel.textContent = `${sim ? 'Sim' : 'Obj'}: ${conf}%`;
        }
    }

    // ... (The rest of the file: Logging, Chart, Clock, Export, Toasts, Events, and Public API are unchanged) ...

    /* -------------------- PUBLIC API -------------------- */
    return {
        init,
        refreshStream,
        pauseStream,
        setMode,
        getState: () => JSON.parse(JSON.stringify(state)),
        getCurrentStreamUrl: () => (els.streamEl ? els.streamEl.src : null),
        overrideHost: (host) => {
            state.cachedHost = stripTrailingSlash(host);
            state.selectedStreamPath = null;
            if (state.isLive) refreshStream(true);
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    Bot1Dashboard.init();
    // Expose global for debugging / external control
    window.Bot1Dashboard = Bot1Dashboard;
});