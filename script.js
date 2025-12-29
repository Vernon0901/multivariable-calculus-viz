document.addEventListener('DOMContentLoaded', () => {

    // --- State ---
    let funcString = 'x^2 + y^2';
    let xVal = 0.5;
    let yVal = 0.5;
    // --- API Key ---
    // User provided key
    const apiKey = 'YOUR_GEMINI_API_KEY_HERE';

    const toggles = {
        crossSections: false,
        partials: false,
        gradient: false
    };

    // --- DOM Elements ---
    const funcInput = document.getElementById('function-input');
    const xSlider = document.getElementById('x-slider');
    const ySlider = document.getElementById('y-slider');
    const xDisplay = document.getElementById('x-val-display');
    const yDisplay = document.getElementById('y-val-display');
    const explanationContent = document.getElementById('explanation-content');
    const aiContent = document.getElementById('ai-content');
    const sidebar = document.getElementById('sidebar');
    const inputError = document.getElementById('input-error');
    const plotContainer = document.getElementById('plot-container'); // FIXED: Changed from string to DOM element

    // UI - Floating Panels
    const contextBar = document.getElementById('real-world-context-bar');
    const mathBar = document.getElementById('math-analysis-panel');
    const barHeader = document.getElementById('bar-header');
    const mathBarHeader = document.getElementById('math-bar-header');

    // UI - Math Keyboard
    const keyBtns = document.querySelectorAll('.key-btn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // --- Math.js Setup ---
    let compiledFunc, derivX, derivY;
    let symDerivX = '', symDerivY = '', symFunc = '';

    function parseFunction(str) {
        // Clear previous error
        inputError.style.display = 'none';
        inputError.textContent = '';
        funcInput.style.borderColor = 'var(--border)';

        // Basic check for 'z'
        if (str.toLowerCase().includes('z')) {
            showError("Variable 'z' is not supported. Use only x and y.");
            return false;
        }

        try {
            const node = math.parse(str);
            symFunc = node.toTex();

            const dxNode = math.derivative(node, 'x');
            const dyNode = math.derivative(node, 'y');

            symDerivX = dxNode.toTex();
            symDerivY = dyNode.toTex();

            compiledFunc = node.compile();
            derivX = dxNode.compile();
            derivY = dyNode.compile();

            triggerAIContext(str);
            return true;
        } catch (err) {
            console.error("Invalid function", err);
            showError("Invalid function: " + err.message);
            return false;
        }
    }

    function showError(msg) {
        inputError.textContent = msg;
        inputError.style.display = 'block';
        funcInput.style.borderColor = '#ef4444';
    }

    // --- Dynamic Explanation Logic (Local Math) ---
    function updateExplanation(z, dzdx, dzdy) {
        const fZ = z.toFixed(3);
        const fX = dzdx.toFixed(3);
        const fY = dzdy.toFixed(3);
        const xStr = xVal.toFixed(2);
        const yStr = yVal.toFixed(2);

        // Formal MathJax Content with \[ \] for display
        let html = `
            <div class="analysis-item">
                <strong>1. Point Evaluation</strong>
                \\[ (x, y) = (${xStr}, ${yStr}) \\]
                \\[ f(x, y) = ${fZ} \\]
                <small>The height of the surface at this coordinate.</small>
            </div>
        `;

        // Partials
        html += `
            <div class="analysis-item">
                <strong>2. Partial Derivatives (Worked)</strong>
                <div class="worked-step">
                    \\[ \\frac{\\partial f}{\\partial x} = ${symDerivX} \\]
                    \\[ \\left. \\frac{\\partial f}{\\partial x} \\right|_{(x, y)} = ${fX} \\]
                </div>
                <div class="worked-step">
                    \\[ \\frac{\\partial f}{\\partial y} = ${symDerivY} \\]
                    \\[ \\left. \\frac{\\partial f}{\\partial y} \\right|_{(x, y)} = ${fY} \\]
                </div>
                <small>Instantaneous slopes along the x and y axes.</small>
            </div>
        `;

        // Gradient
        const gradMag = Math.sqrt(dzdx * dzdx + dzdy * dzdy).toFixed(3);
        html += `
            <div class="analysis-item">
                <strong>3. Gradient Calculation</strong>
                \\[ \\nabla f = \\langle \\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y} \\rangle \\]
                \\[ \\nabla f(${xStr}, ${yStr}) = \\langle ${fX}, ${fY} \\rangle \\]
                \\[ |\\nabla f| = \\sqrt{(${fX})^2 + (${fY})^2} \\]
                \\[ |\\nabla f| = ${gradMag} \\]
                <small>The gradient vector points in the direction of steepest ascent.</small>
            </div>
        `;

        explanationContent.innerHTML = html;

        // Re-render MathJax
        if (window.MathJax) {
            MathJax.typesetPromise([explanationContent]);
        }
    }

    // --- Gemini API Logic ---
    let aiTimeout;
    let cachedModel = null;

    async function findWorkingModel() {
        if (cachedModel) return cachedModel;

        const version = 'v1beta';
        console.log("Discovering available models...");

        try {
            const listResponse = await fetch(`https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`);
            const listData = await listResponse.json();

            if (!listResponse.ok) {
                console.error("ListModels failed:", listData);
                return 'models/gemini-1.5-flash';
            }

            const validModels = listData.models.filter(m =>
                m.supportedGenerationMethods.includes('generateContent')
            );

            const preferences = [
                'gemini-1.5-flash',
                'gemini-1.5-flash-latest',
                'gemini-1.5-pro',
                'gemini-pro',
                'gemini-1.0-pro'
            ];

            let selected = null;

            for (const pref of preferences) {
                const match = validModels.find(m => m.name.endsWith(pref));
                if (match) {
                    selected = match;
                    break;
                }
            }

            if (!selected) {
                selected = validModels.find(m => m.name.includes('flash'));
            }

            if (!selected) {
                selected = validModels.find(m => m.name.includes('gemini'));
            }

            if (selected) {
                cachedModel = selected.name;
                return cachedModel;
            }

            throw new Error("No usable Gemini model found.");

        } catch (e) {
            console.error("Discovery error:", e);
            return 'models/gemini-1.5-flash';
        }
    }

    function triggerAIContext(funcStr) {
        if (!apiKey) {
            aiContent.innerHTML = '<p class="loading">API Key missing.</p>';
            return;
        }

        clearTimeout(aiTimeout);
        aiContent.innerHTML = '<p class="loading">Thinking... (Finding best model)</p>';

        aiTimeout = setTimeout(async () => {
            try {
                const prompt = `
                    Analyze the multivariable function f(x,y) = ${funcStr}.
                    Focus on its **REAL-WORLD APPLICATIONS**.
                    Return the response in structured HTML using the following tags:
                    - <h4> for headings (e.g., "Physical Phenomena", "Practical Use Case").
                    - <ul> and <li> for bullet points.
                    - <strong> for emphasis.
                    
                    Contents to cover:
                    1. What physical, engineering, or economic phenomena does this function model? 
                    2. How would a scientist or engineer USE this specific mathematical model in the field?
                    
                    Keep it very concise. Do not use LaTeX. **Do not use the '$' symbol for any math.** Be specific and practical.
                `;

                const modelName = await findWorkingModel();
                const cleanName = modelName.replace(/^models\//, '');

                aiContent.innerHTML = `<p class="loading" style="font-size:0.8em; color:#64748b">Using model: ${cleanName}...</p>`;

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${cleanName}:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    console.error("API Error Details:", data);
                    let userMsg = "API Error";

                    if (response.status === 429) {
                        userMsg = `
                            <div class="warning-box">
                                <strong>High Traffic (Quota Limit)</strong><br>
                                The AI explanation service is currently busy.<br>
                                <button id="retry-ai-btn" class="retry-btn">Try Again</button>
                            </div>
                        `;
                    } else {
                        userMsg += `<br>Model: ${cleanName}<br>${data.error?.message}`;
                    }

                    aiContent.innerHTML = `<p style="color:#64748b; font-size:0.9em;">${userMsg}</p>`;

                    if (response.status === 429) {
                        document.getElementById('retry-ai-btn').addEventListener('click', () => {
                            triggerAIContext(funcStr);
                        });
                    }
                } else {
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        // Directly Inject HTML for structure
                        aiContent.innerHTML = text;
                    } else {
                        aiContent.innerHTML = '<p>No analysis returned.</p>';
                    }
                }

            } catch (e) {
                console.error("Network Error:", e);
                aiContent.innerHTML = `<p class="loading">Network Error: ${e.message}</p>`;
            }
        }, 1500);
    }

    // --- Plotting Logic ---
    function generateSurfaceData() {
        const range = 2;
        const step = 0.1;
        const xData = [];
        const yData = [];
        const zData = [];

        for (let x = -range; x <= range; x += step) xData.push(x);
        for (let y = -range; y <= range; y += step) yData.push(y);

        for (let i = 0; i < yData.length; i++) {
            const row = [];
            for (let j = 0; j < xData.length; j++) {
                try {
                    row.push(compiledFunc.evaluate({ x: xData[j], y: yData[i] }));
                } catch (e) {
                    row.push(NaN);
                }
            }
            zData.push(row);
        }
        return { x: xData, y: yData, z: zData };
    }

    function updatePlot() {
        if (!compiledFunc) return; // Don't plot if function isn't compiled
        
        const data = generateSurfaceData();
        const zVal = compiledFunc.evaluate({ x: xVal, y: yVal });
        const dzdx = derivX.evaluate({ x: xVal, y: yVal });
        const dzdy = derivY.evaluate({ x: xVal, y: yVal });

        const traces = [];

        // Surface
        traces.push({
            type: 'surface',
            x: data.x, y: data.y, z: data.z,
            colorscale: 'Viridis', showscale: false, opacity: 0.8,
            contours: { z: { show: true, usecolormap: true } }
        });

        // Point
        traces.push({
            type: 'scatter3d', mode: 'markers',
            x: [xVal], y: [yVal], z: [zVal],
            marker: { size: 6, color: 'red' }, name: 'Point P'
        });

        // Visualizations
        if (toggles.crossSections) {
            const xLine = { x: [], y: [], z: [] };
            const yLine = { x: [], y: [], z: [] };
            for (let t = -2; t <= 2; t += 0.1) {
                xLine.x.push(t); xLine.y.push(yVal); xLine.z.push(compiledFunc.evaluate({ x: t, y: yVal }));
                yLine.x.push(xVal); yLine.y.push(t); yLine.z.push(compiledFunc.evaluate({ x: xVal, y: t }));
            }
            traces.push({ type: 'scatter3d', mode: 'lines', x: xLine.x, y: xLine.y, z: xLine.z, line: { width: 5, color: '#ef4444' }, name: 'x-slice' });
            traces.push({ type: 'scatter3d', mode: 'lines', x: yLine.x, y: yLine.y, z: yLine.z, line: { width: 5, color: '#10b981' }, name: 'y-slice' });
        }

        if (toggles.partials) {
            const len = 0.8;
            traces.push({ type: 'scatter3d', mode: 'lines', x: [xVal - len, xVal + len], y: [yVal, yVal], z: [zVal - dzdx * len, zVal + dzdx * len], line: { width: 5, color: 'orange' }, name: '∂f/∂x' });
            traces.push({ type: 'scatter3d', mode: 'lines', x: [xVal, xVal], y: [yVal - len, yVal + len], z: [zVal - dzdy * len, zVal + dzdy * len], line: { width: 5, color: 'purple' }, name: '∂f/∂y' });
        }

        if (toggles.gradient) {
            const scale = 0.5;
            traces.push({
                type: 'scatter3d', mode: 'lines',
                x: [xVal, xVal + dzdx * scale], y: [yVal, yVal + dzdy * scale],
                z: [zVal, zVal + (dzdx * dzdx + dzdy * dzdy) * scale],
                line: { width: 8, color: 'black' }, name: 'Gradient'
            });
        }

        const layout = {
            margin: { t: 0, b: 0, l: 0, r: 0 },
            scene: { 
                xaxis: { title: 'x' }, 
                yaxis: { title: 'y' }, 
                zaxis: { title: 'f(x,y)' }, 
                camera: { eye: { x: 1.5, y: 1.5, z: 1.5 } } 
            },
            showlegend: false
        };

        Plotly.react(plotContainer, traces, layout);
        updateExplanation(zVal, dzdx, dzdy);
    }

    // --- Input Handling ---
    function handleSlider() {
        xVal = parseFloat(xSlider.value);
        yVal = parseFloat(ySlider.value);
        xDisplay.textContent = xVal.toFixed(2);
        yDisplay.textContent = yVal.toFixed(2);
        updatePlot();
    }
    xSlider.addEventListener('input', handleSlider);
    ySlider.addEventListener('input', handleSlider);

    funcInput.addEventListener('change', () => {
        if (parseFunction(funcInput.value)) {
            funcString = funcInput.value;
            updatePlot();
        } else {
            alert("Invalid function");
        }
    });

    // Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-func');
            funcInput.value = val;
            funcString = val;
            parseFunction(val);
            updatePlot();
        });
    });

    // --- Tab Switching Logic ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // Add active to clicked tab
            btn.classList.add('active');

            // Show corresponding content
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- Math Keyboard Handling ---
    keyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-key');

            // Handle Action Buttons first
            if (btn.id === 'clear-btn') {
                funcInput.value = '';
                funcInput.focus();
                return;
            }
            if (btn.id === 'backspace-btn') {
                funcInput.value = funcInput.value.slice(0, -1);
                funcInput.focus();
                return;
            }

            // Insert text at cursor position
            const start = funcInput.selectionStart;
            const end = funcInput.selectionEnd;
            const text = funcInput.value;
            const insert = key;

            funcInput.value = text.slice(0, start) + insert + text.slice(end);

            // Move cursor
            const newPos = start + insert.length;
            funcInput.setSelectionRange(newPos, newPos);
            funcInput.focus();
        });
    });

    // Explicit Update on Enter key in input
    funcInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            if (parseFunction(funcInput.value)) {
                funcString = funcInput.value;
                updatePlot();
            }
        }
    });

    // Floating Bar Collapse/Expand with Auto-Collapse
    barHeader.addEventListener('click', () => {
        const wasCollapsed = contextBar.classList.contains('collapsed');
        contextBar.classList.toggle('collapsed');

        // If expanding AI, collapse Math
        if (wasCollapsed && !mathBar.classList.contains('collapsed')) {
            mathBar.classList.add('collapsed');
        }
    });

    mathBarHeader.addEventListener('click', () => {
        const wasCollapsed = mathBar.classList.contains('collapsed');
        mathBar.classList.toggle('collapsed');

        // If expanding Math, collapse AI
        if (wasCollapsed && !contextBar.classList.contains('collapsed')) {
            contextBar.classList.add('collapsed');
        }
    });

    document.getElementById('toggle-cross-sections').addEventListener('change', e => { toggles.crossSections = e.target.checked; updatePlot(); });
    document.getElementById('toggle-partials').addEventListener('change', e => { toggles.partials = e.target.checked; updatePlot(); });
    document.getElementById('toggle-gradient').addEventListener('change', e => { toggles.gradient = e.target.checked; updatePlot(); });

    window.addEventListener('resize', () => {
        if (plotContainer && Plotly) {
            Plotly.Plots.resize(plotContainer);
        }
    });

    // Initialize
    parseFunction(funcString);
    updatePlot();

});
