/**
 * Bot 1 Surveillance Dashboard Front-End Module
 * - Test vs Live Mode (Live Mode: placeholders for future ESP32 integration)
 * - Simulated sensor updates
 * - Chart.js analytics
 * - Activity & communication logs
 * - Video controls (play/pause/fullscreen/snapshot stub)
 * - Quality dropdown integrates with camera API shape: /api/video/stream?quality=<value>
 *
 * NOTE: For real integration, wire the LIVE mode paths to your controller & camera endpoints:
 *   CAMERA STREAM:  http://<camera-ip>/api/video/stream?quality=<q>
 *   SNAPSHOT:       http://<camera-ip>/api/camera/snapshot.jpg
 *   SENSOR DATA:    http://<controller-ip>/api/sensor-data
 */
const Bot1Dashboard = (() => {
    const state = {
        isLive: false,
        simTimer: null,
        chart: null,
        recActive: false,
        lastSync: null,
    };

    const els = {};

    function qs(id) { return document.getElementById(id); }

    function cacheElements() {
        Object.assign(els, {
            testModeBtn: qs('testModeBtn'),
            liveModeBtn: qs('liveModeBtn'),
            connectionBtn: qs('connectionBtn'),
            connectionText: qs('connectionText'),
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
            bboxLabel: qs('bboxLabel')
        });
    }

    function init() {
        cacheElements();
        bindUI();
        initClock();
        initChart();
        enterTestMode(); // default
    }

    /* ---------- UI BINDINGS ---------- */
    function bindUI() {
        els.testModeBtn?.addEventListener('click', () => setMode(false));
        els.liveModeBtn?.addEventListener('click', () => setMode(true));

        document.querySelectorAll('.control-modes button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.control-modes button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        els.buzzerToggle?.addEventListener('click', () => {
            const active = els.buzzerToggle.classList.toggle('active');
            els.buzzerIcon.className = active ? 'bi bi-toggle-on text-2xl text-[--error]' : 'bi bi-toggle-off text-2xl text-[--text-muted]';
        });

        // Video controls
        document.querySelectorAll('[data-video]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.video;
                handleVideoAction(action);
            });
        });

        els.qualitySelect?.addEventListener('change', () => {
            if (state.isLive) refreshStream();
            toast(`Quality set: ${els.qualitySelect.value.toUpperCase()}`, 'info');
        });

        els.recBtn?.addEventListener('click', () => {
            state.recActive = !state.recActive;
            els.recBtn.classList.toggle('active', state.recActive);
            els.recBtn.querySelector('span').textContent = state.recActive ? 'REC ON' : 'REC';
            toast(state.recActive ? 'Recording started (simulated)' : 'Recording stopped', 'info');
        });

        document.querySelectorAll('[data-export]').forEach(btn => {
            btn.addEventListener('click', () => handleExport(btn.dataset.export));
        });
    }

    /* ---------- MODE LOGIC ---------- */
    function setMode(live) {
        if (live === state.isLive) return;
        state.isLive = live;
        els.liveModeBtn.classList.toggle('active', live);
        els.testModeBtn.classList.toggle('active', !live);
        if (live) {
            exitTestMode();
            enterLiveMode();
        } else {
            exitLiveMode();
            enterTestMode();
        }
    }

    function enterTestMode() {
        setConnectionStatus(true);
        startSimulation();
    }
    function exitTestMode() {
        stopSimulation();
    }

    function enterLiveMode() {
        setConnectionStatus(false, 'Connecting...');
        // Simulate async connection
        setTimeout(() => {
            // For real integration: attempt actual camera & controller connections
            setConnectionStatus(true, 'Live');
            refreshStream();
            startSimulation(true); // Optionally keep simulation until real data
        }, 1200);
    }
    function exitLiveMode() {
        stopSimulation();
        hideLoader();
    }

    function setConnectionStatus(connected, text) {
        els.connectionBtn.classList.toggle('connected', connected);
        els.connectionBtn.classList.toggle('disconnected', !connected);
        els.connectionText.textContent = text || (connected ? 'Connected' : 'Disconnected');
    }

    /* ---------- SIMULATION ---------- */
    function startSimulation(forceLiveColoring = false) {
        updateCycle(forceLiveColoring);
        state.simTimer = setInterval(() => updateCycle(forceLiveColoring), 2000);
    }

    function stopSimulation() {
        clearInterval(state.simTimer);
        state.simTimer = null;
    }

    function updateCycle(forceLive) {
        // Randomize data
        const distance = Math.floor(Math.random() * 50);
        const angle = Math.floor(Math.random() * 180);
        const temp = (20 + Math.random() * 15).toFixed(1);
        const humidity = (40 + Math.random() * 40).toFixed(0);
        const battery = (70 + Math.random() * 25).toFixed(0);
        const alerts = Math.floor(Math.random() * 3);

        updateDistance(distance);
        updateServo(angle);
        updateClimate(temp, humidity);
        updateBotVitals(battery, alerts);
        addActivityLogEntry();
        addCommEntry();
        updateChartData({ temp: parseFloat(temp), humidity: parseInt(humidity, 10) });
        updateSync();
        maybeShowBBox(forceLive);
    }

    function updateDistance(cm) {
        els.distanceFill.style.width = `${(cm / 50) * 100}%`;
        els.distanceFill.textContent = `${cm} cm`;
    }

    function updateServo(angle) {
        els.servoValue.textContent = `${angle}°`;
        els.servoGauge.style.background = `conic-gradient(from 0deg, var(--accent-color) ${angle}deg, var(--bg-tertiary) ${angle}deg)`;
    }

    function updateClimate(temp, humidity) {
        const t = parseFloat(temp);
        els.tempValue.textContent = `${t}°C`;
        els.tempValue.className = 'climate-value ' + (t > 30 ? 'critical' : t > 26 ? 'warning' : 'normal');
        els.humidityValue.textContent = `${humidity}%`;
    }

    function updateBotVitals(battery, alerts) {
        if (els.batteryStatus) els.batteryStatus.textContent = `${battery}%`;
        if (els.activeAlertsCount) els.activeAlertsCount.textContent = alerts;
        if (els.netStrength) els.netStrength.textContent = Math.random() > 0.15 ? 'Strong' : 'Weak';
    }

    function updateSync() {
        state.lastSync = new Date();
        els.syncTooltip.textContent = `Last sync: ${state.lastSync.toLocaleTimeString()}`;
    }

    function maybeShowBBox(liveMode) {
        if (!els.bboxSample) return;
        const show = Math.random() > 0.6;
        els.bboxSample.classList.toggle('hidden', !show);
        if (show) {
            const conf = (80 + Math.random() * 20).toFixed(0);
            els.bboxLabel.textContent = `${liveMode ? 'Object' : 'Test'}: ${conf}%`;
        }
    }

    /* ---------- COMM & ACTIVITY LOGS ---------- */
    function addCommEntry() {
        if (!els.commLogBody) return;
        const types = [
            { name: 'Critical', class: 'high', icon: 'bi-exclamation-octagon-fill', color: 'var(--error)' },
            { name: 'Warning', class: 'medium', icon: 'bi-exclamation-triangle-fill', color: 'var(--warning)' },
            { name: 'Info', class: 'low', icon: 'bi-info-circle-fill', color: 'var(--info)' }
        ];
        const messages = ['System check', 'Motion alert', 'Battery low', 'Sync complete', 'Telemetry update'];
        const type = types[Math.floor(Math.random() * types.length)];
        const msg = messages[Math.floor(Math.random() * messages.length)];
        const tr = document.createElement('tr');
        if (type.name === 'Critical' && Math.random() > 0.6) tr.classList.add('critical');
        tr.innerHTML = `
      <td>${new Date().toLocaleTimeString()}</td>
      <td><span class="alert-badge ${type.class}">${type.name}</span></td>
      <td>${msg}</td>
      <td><i class="bi bi-check-circle-fill" style="color: var(--success);"></i></td>
    `;
        els.commLogBody.prepend(tr);
        while (els.commLogBody.children.length > 25) els.commLogBody.lastChild.remove();
    }

    function addActivityLogEntry() {
        if (!els.activityLog) return;
        const acts = [
            { name: 'Motion detected', color: 'var(--error)' },
            { name: 'Patrol complete', color: 'var(--info)' },
            { name: 'Gas spike', color: 'var(--warning)' },
            { name: 'System check', color: 'var(--success)' },
        ];
        const act = acts[Math.floor(Math.random() * acts.length)];
        const wrapper = document.createElement('div');
        wrapper.style.borderLeftColor = act.color;
        wrapper.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-semibold">${act.name}</span>
        <span class="text-[10px] text-[--text-muted]">${new Date().toLocaleTimeString()}</span>
      </div>
    `;
        els.activityLog.prepend(wrapper);
        while (els.activityLog.children.length > 12) els.activityLog.lastChild.remove();
    }

    /* ---------- VIDEO HANDLERS ---------- */
    function handleVideoAction(action) {
        switch (action) {
            case 'play':
                refreshStream();
                break;
            case 'pause':
                pauseStream();
                break;
            case 'snapshot':
                snapshot();
                break;
            case 'fullscreen':
                toggleFullscreen();
                break;
        }
    }

    function refreshStream() {
        if (!els.streamEl) return;
        showLoader();
        // For real integration, plug in camera IP
        const q = els.qualitySelect?.value || 'xga';
        const demo = `https://picsum.photos/seed/${q}-${Date.now()}/800/450`;
        els.streamEl.onload = () => hideLoader();
        els.streamEl.onerror = () => {
            hideLoader();
            toast('Stream failed (demo)', 'error');
        };
        els.streamEl.src = demo;
    }

    function pauseStream() {
        if (!els.streamEl) return;
        els.streamEl.dataset.prevSrc = els.streamEl.src;
        els.streamEl.src = '';
        toast('Stream paused', 'info');
    }

    function showLoader() { els.streamLoader?.classList.remove('hidden'); }
    function hideLoader() { els.streamLoader?.classList.add('hidden'); }

    function toggleFullscreen() {
        if (!els.streamEl) return;
        const container = els.streamEl.closest('.video-container');
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(() => toast('Fullscreen denied', 'error'));
        } else {
            document.exitFullscreen();
        }
    }

    function snapshot() {
        if (!els.streamEl?.src) {
            toast('No frame to snapshot', 'warning'); return;
        }
        toast('Snapshot captured (demo)', 'success');
        // Real version: fetch stream frame & push to gallery component
    }

    /* ---------- CHART ---------- */
    function initChart() {
        const ctx = document.getElementById('analyticsChart');
        if (!ctx || typeof Chart === 'undefined') return;
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: [],
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88,166,255,0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Humidity (%)',
                        data: [],
                        borderColor: '#db9a04',
                        backgroundColor: 'rgba(219,154,4,0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 350 },
                plugins: {
                    legend: {
                        labels: {
                            color: 'var(--text-muted)',
                            font: { size: 10 }
                        }
                    },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { display: false },
                    y: {
                        grid: { color: 'rgba(46,53,58,.7)' },
                        ticks: { color: 'var(--text-muted)', font: { size: 10 } }
                    }
                }
            }
        });
    }

    function updateChartData({ temp, humidity }) {
        if (!state.chart) return;
        const labels = state.chart.data.labels;
        labels.push(new Date().toLocaleTimeString());
        if (labels.length > 20) labels.shift();
        state.chart.data.datasets[0].data.push(temp);
        state.chart.data.datasets[1].data.push(humidity);
        if (state.chart.data.datasets[0].data.length > 20) {
            state.chart.data.datasets.forEach(ds => ds.data.shift());
        }
        state.chart.update('none');
    }

    /* ---------- CLOCK ---------- */
    function initClock() {
        const tick = () => {
            if (els.clock) els.clock.textContent = new Date().toLocaleTimeString();
        };
        tick();
        setInterval(tick, 1000);
    }

    /* ---------- EXPORT ---------- */
    function handleExport(format) {
        toast(`Export ${format.toUpperCase()} requested (stub)`, 'info');
        // Real integration: POST to /api/export/<format> endpoint
    }

    /* ---------- TOASTS ---------- */
    function toast(message, type = 'info') {
        if (!els.toastContainer) return;
        const wrap = document.createElement('div');
        wrap.className = `toast toast-${type}`;
        wrap.innerHTML = `
      <i class="bi ${type === 'success'
                ? 'bi-check-circle-fill'
                : type === 'error'
                    ? 'bi-x-octagon-fill'
                    : type === 'warning'
                        ? 'bi-exclamation-triangle-fill'
                        : 'bi-info-circle-fill'
            } text-lg"></i>
      <div class="flex-1">${message}</div>
      <button type="button"><i class="bi bi-x-lg text-xs"></i></button>
    `;
        wrap.querySelector('button').addEventListener('click', () => wrap.remove());
        els.toastContainer.appendChild(wrap);
        setTimeout(() => wrap.remove(), 4500);
    }

    /* Public API (if needed externally) */
    return { init };
})();

document.addEventListener('DOMContentLoaded', () => Bot1Dashboard.init());