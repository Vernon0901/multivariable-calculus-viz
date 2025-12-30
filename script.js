document.addEventListener('DOMContentLoaded', () => {

    // --- State ---
    let funcString = 'x^2 + y^2';
    let xVal = 0.5;
    let yVal = 0.5;
    
    // --- API Key ---
    // User provided key
    const apiKey = 'AIzaSyBlQCAcM_KkWoTFsHjQyvlM9LZbEJPSkJ0';

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
    const plotContainer = document.getElementById('plot-container'); 
    
    // NEW: Domain Range Elements
    const xMinInput = document.getElementById('x-min');
    const xMaxInput = document.getElementById('x-max');
    const yMinInput = document.getElementById('y-min');
    const yMaxInput = document.getElementById('y-max');

    // UI - Floating Panels
    const contextBar = document.getElementById('real-world-context-bar');
    const mathBar = document.getElementById('math-analysis-panel');
    const barHeader = document.getElementById('bar-header');
    const mathBarHeader = document.getElementById('math-bar-header');
    
    // UI - Sidebar Toggle
    const sidebarToggleBtn = document.getElementById('sidebar-toggle');

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

    // --- NEW: Range Synchronization Logic ---
    function updateSliderBounds() {
        // Synchronize the sliders with the manual range inputs
        xSlider.min = xMinInput.value;
        xSlider.max = xMaxInput.value;
        ySlider.min = yMinInput.value;
        ySlider.max = yMaxInput.value;

        // Ensure current slider values don't fall out of the new bounds
        if (parseFloat(xSlider.value) < parseFloat(xSlider.min)) xSlider.value = xSlider.min;
        if (parseFloat(xSlider.value) > parseFloat(xSlider.max)) xSlider.value = xSlider.max;
        if (parseFloat(ySlider.value) < parseFloat(ySlider.min)) ySlider.value = ySlider.min;
        if (parseFloat(ySlider.value) > parseFloat(ySlider.max)) ySlider.value = ySlider.max;

        handleSlider();
    }

    // --- Dynamic Explanation Logic (Local Math) ---
    function updateExplanation(z, dzdx, dzdy) {
        const fZ = z.toFixed(3);
        const fX = dzdx.toFixed(3);
        const fY = dzdy.toFixed(3);
        const xStr = xVal.toFixed(2);
        const yStr = yVal.toFixed(2);

        let html = `
            <div class="analysis-item">
                <strong>1. Point Evaluation</strong>
                \\[ (x, y) = (${xStr}, ${yStr}) \\]
                \\[ f(x, y) = ${fZ} \\]
                <small>The height of the surface at this coordinate.</small>
            </div>
        `;

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
            const validModels = listData.models.filter(m => m.supportedGenerationMethods.includes('generateContent'));
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
                if (match) { selected = match; break; }
            }
            if (!selected) selected = validModels.find(m => m.name.includes('flash'));
            if (!selected) selected = validModels.find(m => m.name.includes('gemini'));
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
                        userMsg = `<div class="warning-box"><strong>High Traffic</strong><br>AI service busy.<br><button id="retry-ai-btn" class="retry-btn">Try Again</button></div>`;
                    } else {
                        userMsg += `<br>Model: ${cleanName}<br>${data.error?.message}`;
                    }
                    aiContent.innerHTML = `<p style="color:#64748b; font-size:0.9em;">${userMsg}</p>`;
                    if (response.status === 429) {
                        document.getElementById('retry-ai-btn').addEventListener('click', () => triggerAIContext(funcStr));
                    }
                } else {
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    aiContent.innerHTML = text || '<p>No analysis returned.</p>';
                }
            } catch (e) {
                console.error("Network Error:", e);
                aiContent.innerHTML = `<p class="loading">Network Error: ${e.message}</p>`;
            }
        }, 1500);
    }

    // --- Plotting Logic (Updated for Dynamic Range) ---
    function generateSurfaceData() {
        const xMin = parseFloat(xMinInput.value);
        const xMax = parseFloat(xMaxInput.value);
        const yMin = parseFloat(yMinInput.value);
        const yMax = parseFloat(yMaxInput.value);
        
        const stepX = (xMax - xMin) / 40;
        const stepY = (yMax - yMin) / 40;

        const xData = [];
        const yData = [];
        const zData = [];

        for (let x = xMin; x <= xMax; x += stepX) xData.push(x);
        for (let y = yMin; y <= yMax; y += stepY) yData.push(y);

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
        if (!compiledFunc) return;
        
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
            const xMin = parseFloat(xMinInput.value), xMax = parseFloat(xMaxInput.value);
            const yMin = parseFloat(yMinInput.value), yMax = parseFloat(yMaxInput.value);

            for (let t = xMin; t <= xMax; t += (xMax-xMin)/40) {
                xLine.x.push(t); xLine.y.push(yVal); xLine.z.push(compiledFunc.evaluate({ x: t, y: yVal }));
            }
            for (let t = yMin; t <= yMax; t += (yMax-yMin)/40) {
                yLine.x.push(xVal); yLine.y.push(t); yLine.z.push(compiledFunc.evaluate({ x: xVal, y: t }));
            }
            traces.push({ type: 'scatter3d', mode: 'lines', x: xLine.x, y: xLine.y, z: xLine.z, line: { width: 5, color: '#ef4444' }, name: 'x-slice' });
            traces.push({ type: 'scatter3d', mode: 'lines', x: yLine.x, y: yLine.y, z: yLine.z, line: { width: 5, color: '#10b981' }, name: 'y-slice' });
        }

        if (toggles.partials) {
            const rangeSpan = parseFloat(xMaxInput.value) - parseFloat(xMinInput.value);
            const len = rangeSpan * 0.2;
            traces.push({ type: 'scatter3d', mode: 'lines', x: [xVal - len, xVal + len], y: [yVal, yVal], z: [zVal - dzdx * len, zVal + dzdx * len], line: { width: 5, color: 'orange' }, name: '∂f/∂x' });
            traces.push({ type: 'scatter3d', mode: 'lines', x: [xVal, xVal], y: [yVal - len, yVal + len], z: [zVal - dzdy * len, zVal + dzdy * len], line: { width: 5, color: 'purple' }, name: '∂f/∂y' });
        }

        if (toggles.gradient) {
            const scale = (parseFloat(xMaxInput.value) - parseFloat(xMinInput.value)) * 0.1;
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

    // Domain Input Handling
    [xMinInput, xMaxInput, yMinInput, yMaxInput].forEach(input => {
        input.addEventListener('change', () => {
            updateSliderBounds();
            updatePlot();
        });
    });

    funcInput.addEventListener('change', () => {
        if (parseFunction(funcInput.value)) {
            funcString = funcInput.value;
            updatePlot();
        } else {
            alert("Invalid function");
        }
    });

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
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- Math Keyboard Handling ---
    keyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-key');
            if (btn.id === 'clear-btn') {
                funcInput.value = '';
            } else if (btn.id === 'backspace-btn') {
                funcInput.value = funcInput.value.slice(0, -1);
            } else {
                const start = funcInput.selectionStart;
                const end = funcInput.selectionEnd;
                funcInput.value = funcInput.value.slice(0, start) + key + funcInput.value.slice(end);
                const newPos = start + key.length;
                funcInput.setSelectionRange(newPos, newPos);
            }
            funcInput.focus();
        });
    });

    funcInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            if (parseFunction(funcInput.value)) {
                funcString = funcInput.value;
                updatePlot();
            }
        }
    });

    // Improved tap-to-expand for touch devices
    [barHeader, mathBarHeader].forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent accidental scrolling
            const targetBar = header === barHeader ? contextBar : mathBar;
            const otherBar = header === barHeader ? mathBar : contextBar;

            targetBar.classList.toggle('collapsed');
        
        // Auto-collapse the other bar on smaller screens (iPad)
         if (!targetBar.classList.contains('collapsed') && window.innerWidth < 1024) {
            otherBar.classList.add('collapsed');
           }
      });
});
    
    // --- SIDEBAR TOGGLE LOGIC (RE-INCLUDED) ---
    if(sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
            setTimeout(() => {
                if (plotContainer && Plotly) Plotly.Plots.resize(plotContainer);
            }, 400); 
        });
    }

    document.getElementById('toggle-cross-sections').addEventListener('change', e => { toggles.crossSections = e.target.checked; updatePlot(); });
    document.getElementById('toggle-partials').addEventListener('change', e => { toggles.partials = e.target.checked; updatePlot(); });
    document.getElementById('toggle-gradient').addEventListener('change', e => { toggles.gradient = e.target.checked; updatePlot(); });

    window.addEventListener('resize', () => {
        if (plotContainer && Plotly) Plotly.Plots.resize(plotContainer);
    });

    // Optimized resize for iPad orientation changes
window.addEventListener('resize', () => {
    if (plotContainer && typeof Plotly !== 'undefined') {
        // Redraw with current container dimensions
        Plotly.Plots.resize(plotContainer);
        
        // On small screens, ensure at least one panel is collapsed to save space
        if (window.innerWidth < 1024) {
            contextBar.classList.add('collapsed');
            mathBar.classList.add('collapsed');
        }
    }
}, { passive: true });

    // Initialize
    parseFunction(funcString);
    updateSliderBounds();
    updatePlot();

});