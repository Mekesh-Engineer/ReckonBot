class Bot2Dashboard {
    constructor() {
        this.isLiveMode = false;
        this.simulationInterval = null;
        this.chart = null;
        this.config = (window.BOT2_CONFIG || {});
        this.cacheDOM();
        this.init();
    }

    cacheDOM() {
        this.el = {
            clock: document.getElementById('clock'),
            syncTooltip: document.getElementById('syncTooltip'),
            testModeBtn: document.getElementById('testModeBtn'),
            liveModeBtn: document.getElementById('liveModeBtn'),
            connectionBtn: document.getElementById('connectionBtn'),
            connectionText: document.getElementById('connectionText'),
            videoStream: document.getElementById('videoStream'),
            streamLoader: document.getElementById('streamLoader'),
            recBtn: document.getElementById('recBtn'),
            distanceFill: document.getElementById('distanceFill'),
            servoValue: document.getElementById('servoValue'),
            servoGauge: document.getElementById('servoGauge'),
            tempValue: document.getElementById('tempValue'),
            humidityValue: document.getElementById('humidityValue'),
            batteryStatus: document.getElementById('batteryStatus'),
            netStrength: document.getElementById('netStrength'),
            activeAlertsCount: document.getElementById('activeAlertsCount'),
            buzzerToggle: document.getElementById('buzzerToggle'),
            buzzerIcon: document.getElementById('buzzerIcon'),
            activityLog: document.getElementById('activityLog'),
            commLogBody: document.getElementById('commLogBody'),
            controlModeBtns: document.querySelectorAll('.control-modes button'),
            exportBtns: document.querySelectorAll('.export-btn'),
            videoControlBtns: document.querySelectorAll('.video-control-btn'),
            toastContainer: document.getElementById('toastContainer'),
            analyzeActivityBtn: document.getElementById('analyzeActivityBtn'),
            describeSceneBtn: document.getElementById('describeSceneBtn'),
            analysisModal: document.getElementById('analysisModal'),
            modalContent: document.getElementById('modalContent'),
            modalCloseBtn: document.getElementById('modalCloseBtn'),
        };
    }

    init() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        this.initChart();
        this.bindEvents();
        this.setMode(false);
    }

    bindEvents() {
        this.el.testModeBtn.addEventListener('click', () => this.setMode(false));
        this.el.liveModeBtn.addEventListener('click', () => this.setMode(true));
        this.el.recBtn.addEventListener('click', () => this.el.recBtn.classList.toggle('active'));

        this.el.controlModeBtns.forEach(btn => btn.addEventListener('click', () => {
            this.el.controlModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.toast(`Switched to ${btn.dataset.mode} mode`, 'info');
        }));

        this.el.buzzerToggle.addEventListener('click', () => {
            const active = this.el.buzzerToggle.classList.toggle('active');
            this.el.buzzerIcon.className = active ? 'bi bi-toggle-on text-2xl text-[--error]' : 'bi bi-toggle-off text-2xl';
        });

        this.el.exportBtns.forEach(btn =>
            btn.addEventListener('click', () => this.toast(`Exporting ${btn.dataset.export.toUpperCase()} report...`, 'success')));

        this.el.videoControlBtns.forEach(btn => {
            if (btn.dataset.video === 'snapshot') {
                btn.addEventListener('click', () => this.toast('Snapshot captured!', 'success'));
            }
        });

        this.el.analyzeActivityBtn.addEventListener('click', () => this.handleAnalyzeActivity());
        this.el.describeSceneBtn.addEventListener('click', () => this.handleDescribeScene());
        this.el.modalCloseBtn.addEventListener('click', () => this.toggleModal(false));
        this.el.analysisModal.addEventListener('click', e => {
            if (e.target === this.el.analysisModal) this.toggleModal(false);
        });
    }

    // Clock
    updateClock() {
        this.el.clock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    }

    // Mode
    setMode(live) {
        this.isLiveMode = live;
        this.el.liveModeBtn.classList.toggle('active', live);
        this.el.testModeBtn.classList.toggle('active', !live);
        if (live) {
            this.stopSimulation();
            this.el.connectionText.textContent = 'Connecting...';
            this.el.connectionBtn.className = 'connection-btn disconnected';
            this.el.streamLoader.classList.remove('hidden');
            this.el.videoStream.style.opacity = '0.5';
            this.toast('Attempting to connect to live feed...', 'warning');
            // Implementation for real feed would go here
        } else {
            this.el.connectionText.textContent = 'Connected';
            this.el.connectionBtn.className = 'connection-btn connected';
            this.el.streamLoader.classList.add('hidden');
            this.el.videoStream.style.opacity = '1';
            this.startSimulation();
            this.toast('Test Mode Activated: Simulating data.', 'info');
        }
    }

    // Simulation
    startSimulation() {
        if (this.simulationInterval) clearInterval(this.simulationInterval);
        this.updateDashboard();
        this.simulationInterval = setInterval(() => this.updateDashboard(), 2500);
    }
    stopSimulation() { clearInterval(this.simulationInterval); this.simulationInterval = null; }

    updateDashboard() {
        this.updateDistance(Math.floor(Math.random() * 50));
        this.updateServo(Math.floor(Math.random() * 180));
        this.updateClimate((20 + Math.random() * 15).toFixed(1), (40 + Math.random() * 40).toFixed(0));
        this.updateStatus(Math.floor(20 + Math.random() * 80), ['Weak', 'Good', 'Strong'][Math.floor(Math.random() * 3)], Math.floor(Math.random() * 4));
        this.addCommLogEntry();
        this.addActivityLogEntry();
        this.updateChartData();
        this.el.syncTooltip.textContent = `Last sync: ${new Date().toLocaleTimeString()}`;
    }

    updateDistance(v) {
        this.el.distanceFill.style.width = `${(v / 50) * 100}%`;
        this.el.distanceFill.textContent = `${v} cm`;
    }

    updateServo(angle) {
        this.el.servoValue.textContent = `${angle}°`;
        this.el.servoGauge.style.background =
            `conic-gradient(from 0deg, var(--accent-color) ${angle}deg, var(--bg-tertiary) ${angle}deg)`;
    }

    updateClimate(temp, humidity) {
        const t = this.el.tempValue;
        t.textContent = `${temp}°C`;
        t.className = 'climate-value ' + (temp > 30 ? 'critical' : temp > 26 ? 'warning' : 'normal');
        const h = this.el.humidityValue;
        h.textContent = `${humidity}%`;
        h.className = 'climate-value ' + (humidity > 75 ? 'warning' : 'normal');
    }

    updateStatus(battery, netStrength, alerts) {
        this.el.batteryStatus.textContent = `${battery}%`;
        this.el.netStrength.textContent = netStrength;
        this.el.activeAlertsCount.textContent = alerts;
    }

    addCommLogEntry() {
        const types = [{ n: 'Critical', c: 'high' }, { n: 'Warning', c: 'medium' }, { n: 'Info', c: 'low' }];
        const msgs = ['System check', 'Motion alert', 'Battery low', 'Sync complete', 'Mode change'];
        const entry = {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type: types[Math.floor(Math.random() * types.length)],
            message: msgs[Math.floor(Math.random() * msgs.length)]
        };
        const tr = document.createElement('tr');
        if (entry.type.n === 'Critical') tr.classList.add('critical');
        tr.innerHTML =
            `<td>${entry.time}</td><td><span class="alert-badge ${entry.type.c}">${entry.type.n}</span></td><td>${entry.message}</td><td><i class="bi bi-check-circle-fill text-[--success]"></i></td>`;
        this.el.commLogBody.prepend(tr);
        if (this.el.commLogBody.children.length > 20) this.el.commLogBody.lastChild.remove();
    }

    addActivityLogEntry() {
        const types = [
            { name: 'Motion detected', color: 'var(--error)' },
            { name: 'Patrol complete', color: 'var(--info)' },
            { name: 'Gas spike', color: 'var(--warning)' },
            { name: 'System check', color: 'var(--success)' },
        ];
        const entry = types[Math.floor(Math.random() * types.length)];
        const div = document.createElement('div');
        div.style.borderLeftColor = entry.color;
        div.innerHTML =
            `<div class="flex items-center justify-between"><span class="font-semibold">${entry.name}</span><span class="text-[--text-muted]">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>`;
        this.el.activityLog.prepend(div);
        if (this.el.activityLog.children.length > 10) this.el.activityLog.lastChild.remove();
    }

    // Chart
    initChart() {
        const ctx = document.getElementById('analyticsChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(15).fill(''),
                datasets: [
                    {
                        label: 'Temp (°C)',
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
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: 'var(--text-muted)',
                            boxWidth: 12,
                            padding: 15,
                            font: { size: 10 }
                        }
                    },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { display: false },
                    y: {
                        grid: { color: '#2E353A' },
                        ticks: { color: '#5F6E7C', font: { size: 10 } }
                    }
                },
                animation: { duration: 500 }
            }
        });
    }

    updateChartData() {
        const labels = this.chart.data.labels;
        const ds = this.chart.data.datasets;
        labels.push(new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }));
        ds[0].data.push(parseFloat(this.el.tempValue.textContent));
        ds[1].data.push(parseFloat(this.el.humidityValue.textContent));
        if (labels.length > 15) {
            labels.shift();
            ds.forEach(d => d.data.shift());
        }
        this.chart.update();
    }

    // AI Integration (Gemini)
    async callGeminiAPI(payload) {
        // Expect backend proxy; direct key not embedded
        const model = this.config.geminiModel || 'gemini-2.5-flash-preview-05-20';
        const proxyUrl = `/api/gemini/${model}`; // Define server route to forward securely
        try {
            const res = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`API Error ${res.status}`);
            const data = await res.json();
            return data.text || data.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (e) {
            console.error(e);
            this.toast(e.message, 'error');
            return null;
        }
    }

    async handleAnalyzeActivity() {
        this.toggleModal(true, '<h4>Analyzing Logs...</h4><div class="flex justify-center p-8"><div class="spinner"></div></div>');
        const activityData = Array.from(this.el.activityLog.children)
            .map(el => el.textContent.trim().replace(/\s+/g, ' '))
            .join('\n');
        const commsData = Array.from(this.el.commLogBody.children)
            .map(row => `Time: ${row.cells[0].textContent}, Type: ${row.cells[1].textContent}, Message: ${row.cells[2].textContent}`)
            .join('\n');

        if (!activityData && !commsData) {
            this.toggleModal(true, '<h4>No activity to analyze.</h4>');
            return;
        }

        const systemPrompt =
            'You are a senior security analyst for a robotic surveillance system. Provide concise actionable insights.';
        const userText =
            `Analyze the following logs:\n\nActivity Log:\n${activityData}\n\nCommunication Log:\n${commsData}\n\nReturn summary, anomalies, recommendations.`;

        const payload = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userText }] }]
        };

        const analysis = await this.callGeminiAPI(payload);
        if (analysis) {
            const html = analysis
                .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
                .replace(/\n/g, '<br>');
            this.toggleModal(true, `<h4>Analysis Report</h4><p>${html}</p>`);
        } else {
            this.toggleModal(true, '<h4>Failed to retrieve analysis.</h4>');
        }
    }

    async handleDescribeScene() {
        this.toast('✨ AI is analyzing the scene...', 'info');
        const img = this.el.videoStream;
        let data64;
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            data64 = canvas.toDataURL('image/jpeg').split(',')[1];
        } catch (e) {
            console.error(e);
            this.toast('Could not capture image.', 'error');
            return;
        }
        if (!data64) return;

        const payload = {
            contents: [{
                parts: [
                    { text: 'Describe this surveillance image in detail. Note objects, risks, activities.' },
                    { inline_data: { mime_type: 'image/jpeg', data: data64 } }
                ]
            }]
        };

        const description = await this.callGeminiAPI(payload);
        if (description) {
            this.toggleModal(true, `<h4>Scene Description</h4><p>${description}</p>`);
        } else {
            this.toggleModal(true, '<h4>Failed to describe scene.</h4>');
        }
    }

    toggleModal(show, content = '') {
        if (show) {
            this.el.modalContent.innerHTML = content;
            this.el.analysisModal.classList.add('visible');
        } else {
            this.el.analysisModal.classList.remove('visible');
        }
    }

    toast(msg, type = 'info') {
        const icons = {
            info: 'bi-info-circle-fill',
            success: 'bi-check-circle-fill',
            warning: 'bi-exclamation-triangle-fill',
            error: 'bi-x-circle-fill'
        };
        const colors = {
            info: 'var(--info)',
            success: 'var(--success)',
            warning: 'var(--warning)',
            error: 'var(--error)'
        };
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerHTML = `<i class="bi ${icons[type]}" style="color:${colors[type]};"></i><div class="flex-grow">${msg}</div>`;
        this.el.toastContainer.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => new Bot2Dashboard());
