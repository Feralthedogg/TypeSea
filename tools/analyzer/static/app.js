const state = {
    analysis: undefined,
    selectedPath: undefined,
    selectedLine: undefined,
    severity: "all",
    fileQuery: ""
};

const elements = {
    refreshButton: document.querySelector("#refreshButton"),
    fileSearch: document.querySelector("#fileSearch"),
    severityFilter: document.querySelector("#severityFilter"),
    metricFiles: document.querySelector("#metricFiles"),
    metricEdges: document.querySelector("#metricEdges"),
    metricFunctions: document.querySelector("#metricFunctions"),
    metricCallEdges: document.querySelector("#metricCallEdges"),
    metricCycles: document.querySelector("#metricCycles"),
    metricFindings: document.querySelector("#metricFindings"),
    metricGate: document.querySelector("#metricGate"),
    gateStatus: document.querySelector("#gateStatus"),
    profileName: document.querySelector("#profileName"),
    gateDetails: document.querySelector("#gateDetails"),
    ruleCount: document.querySelector("#ruleCount"),
    ruleList: document.querySelector("#ruleList"),
    hotspotList: document.querySelector("#hotspotList"),
    functionGraphMeta: document.querySelector("#functionGraphMeta"),
    functionList: document.querySelector("#functionList"),
    fileList: document.querySelector("#fileList"),
    findingList: document.querySelector("#findingList"),
    sourceTitle: document.querySelector("#sourceTitle"),
    sourceMeta: document.querySelector("#sourceMeta"),
    sourceView: document.querySelector("#sourceView"),
    graphCanvas: document.querySelector("#graphCanvas")
};

elements.refreshButton.addEventListener("click", () => {
    loadAnalysis(true);
});

elements.fileSearch.addEventListener("input", () => {
    state.fileQuery = elements.fileSearch.value.toLowerCase();
    renderFiles();
});

elements.severityFilter.addEventListener("change", () => {
    state.severity = elements.severityFilter.value;
    renderFindings();
});

window.addEventListener("resize", () => {
    renderGraph();
});

loadAnalysis(false);

function loadAnalysis(refresh) {
    const suffix = refresh ? "?refresh=1" : "";
    fetch(`/api/analysis${suffix}`)
        .then((response) => response.json())
        .then((analysis) => {
            state.analysis = analysis;
            render();
        })
        .then(undefined, (error) => {
            renderError(error);
        });
}

function render() {
    renderSummary();
    renderGate();
    renderRules();
    renderHotspots();
    renderFunctions();
    renderFiles();
    renderFindings();
    renderGraph();
}

function renderSummary() {
    const summary = state.analysis.summary;
    elements.metricFiles.textContent = formatNumber(summary.files);
    elements.metricEdges.textContent = formatNumber(summary.runtimeEdges);
    elements.metricFunctions.textContent = formatNumber(summary.functions);
    elements.metricCallEdges.textContent = formatNumber(summary.callEdges);
    elements.metricCycles.textContent = formatNumber(summary.cycles);
    elements.metricFindings.textContent = formatNumber(summary.findings.error + summary.findings.warning + summary.findings.info);
    elements.metricGate.textContent = state.analysis.qualityGate.status.toUpperCase();
    elements.metricGate.className = state.analysis.qualityGate.status === "passed" ? "pass" : "fail";
}

function renderGate() {
    const gate = state.analysis.qualityGate;
    elements.gateStatus.textContent = gate.status.toUpperCase();
    elements.gateStatus.className = gate.status === "passed" ? "status pass" : "status fail";
    elements.profileName.textContent = `${state.analysis.profile.name} | suppressed ${formatNumber(state.analysis.summary.suppressedFindings)}`;
    const failures = gate.failed.length === 0 ? ["All blocking budgets passed."] : gate.failed;
    elements.gateDetails.innerHTML = failures.map((item) => `<div>${escapeHtml(item)}</div>`).join("");
}

function renderRules() {
    elements.ruleCount.textContent = `${formatNumber(state.analysis.rules.length)} rules`;
    elements.ruleList.textContent = "";
    const rows = state.analysis.ruleSummary.slice(0, 10);
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const item = document.createElement("div");
        item.className = `rule-row ${row.severity}`;
        item.innerHTML = `<strong>${escapeHtml(row.rule)}</strong><span>${formatNumber(row.count)} | ${escapeHtml(row.category)} | ${escapeHtml(row.title)}</span>`;
        elements.ruleList.append(item);
    }
}

function renderHotspots() {
    elements.hotspotList.textContent = "";
    const rows = state.analysis.hotspots.slice(0, 10);
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hotspot-row";
        button.innerHTML = `<strong>${escapeHtml(row.path)}</strong><span>score ${formatNumber(row.score)} | ${formatNumber(row.findings)} finding(s)</span>`;
        button.addEventListener("click", () => {
            selectSource(row.path, undefined);
        });
        elements.hotspotList.append(button);
    }
}

function renderFunctions() {
    elements.functionGraphMeta.textContent = `${formatNumber(state.analysis.summary.functionCycles)} cycle(s)`;
    elements.functionList.textContent = "";
    const rows = state.analysis.functions
        .slice()
        .sort((left, right) => right.complexity - left.complexity || right.calls - left.calls)
        .slice(0, 10);
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "function-row";
        button.innerHTML = `<strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.path)}:${String(row.line)} | complexity ${formatNumber(row.complexity)} | calls ${formatNumber(row.calls)}</span>`;
        button.addEventListener("click", () => {
            selectSource(row.path, row.line);
        });
        elements.functionList.append(button);
    }
}

function renderFiles() {
    const files = state.analysis.files.filter((file) => file.path.toLowerCase().includes(state.fileQuery));
    elements.fileList.textContent = "";
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const button = document.createElement("button");
        button.type = "button";
        button.className = `file-row${state.selectedPath === file.path ? " active" : ""}`;
        button.innerHTML = `<strong>${escapeHtml(file.path)}</strong><span>${escapeHtml(file.layer)} | ${formatNumber(file.lines)} lines | ${formatNumber(file.imports)} imports</span>`;
        button.addEventListener("click", () => {
            selectSource(file.path, undefined);
        });
        elements.fileList.append(button);
    }
}

function renderFindings() {
    const findings = state.analysis.findings.filter((finding) => state.severity === "all" || finding.severity === state.severity);
    elements.findingList.textContent = "";
    if (findings.length === 0) {
        const empty = document.createElement("div");
        empty.className = "finding-row info";
        empty.innerHTML = "<strong>No findings in this filter.</strong><span>The analyzer did not report matching diagnostics.</span>";
        elements.findingList.append(empty);
        return;
    }
    for (let index = 0; index < findings.length; index += 1) {
        const finding = findings[index];
        const button = document.createElement("button");
        button.type = "button";
        button.className = `finding-row ${finding.severity}${finding.suppressed ? " suppressed" : ""}`;
        const suppressed = finding.suppressed ? " | suppressed" : "";
        button.innerHTML = `<strong>${escapeHtml(finding.severity.toUpperCase())} [${escapeHtml(finding.rule)}]</strong><span>${escapeHtml(finding.path)}:${String(finding.line)} | ${escapeHtml(finding.fingerprint)}${suppressed} | ${escapeHtml(finding.message)}</span>`;
        button.addEventListener("click", () => {
            selectSource(finding.path, finding.line);
        });
        elements.findingList.append(button);
    }
}

function renderGraph() {
    const canvas = elements.graphCanvas;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(600, Math.floor(rect.width * scale));
    canvas.height = Math.max(320, Math.floor(rect.height * scale));

    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = "#0d151a";
    context.fillRect(0, 0, rect.width, rect.height);

    const graph = state.analysis.graph;
    const nodes = graph.nodes.slice(0, 90);
    const nodeSet = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => !edge.typeOnly && nodeSet.has(edge.from) && nodeSet.has(edge.to));
    const positions = layoutNodes(nodes, rect.width, rect.height);

    context.lineWidth = 1;
    for (let index = 0; index < edges.length; index += 1) {
        const edge = edges[index];
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (from === undefined || to === undefined) {
            continue;
        }
        context.strokeStyle = "rgba(83, 199, 240, 0.16)";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
    }

    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const pos = positions.get(node.id);
        if (pos === undefined) {
            continue;
        }
        const radius = Math.max(4, Math.min(13, 4 + Math.sqrt(node.imports + node.exports)));
        context.fillStyle = layerColor(node.layer);
        context.beginPath();
        context.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        context.fill();
        if (node.id === state.selectedPath) {
            context.strokeStyle = "#eef6f4";
            context.lineWidth = 2;
            context.stroke();
        }
    }

    context.fillStyle = "#9db0b5";
    context.font = "12px ui-monospace, Menlo, monospace";
    context.fillText(`${formatNumber(graph.nodes.length)} modules, ${formatNumber(graph.edges.length)} edges`, 16, 24);
}

function layoutNodes(nodes, width, height) {
    const byLayer = new Map();
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (!byLayer.has(node.layer)) {
            byLayer.set(node.layer, []);
        }
        byLayer.get(node.layer).push(node);
    }
    const layers = [...byLayer.keys()].sort();
    const positions = new Map();
    const left = 42;
    const top = 50;
    const usableWidth = Math.max(200, width - 84);
    const usableHeight = Math.max(220, height - 90);
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        const layer = layers[layerIndex];
        const bucket = byLayer.get(layer) ?? [];
        const x = left + (usableWidth * (layerIndex + 0.5)) / Math.max(1, layers.length);
        for (let index = 0; index < bucket.length; index += 1) {
            const node = bucket[index];
            const y = top + (usableHeight * (index + 0.5)) / Math.max(1, bucket.length);
            positions.set(node.id, {
                x,
                y
            });
        }
    }
    return positions;
}

function selectSource(path, line) {
    state.selectedPath = path;
    state.selectedLine = line;
    renderFiles();
    renderGraph();
    fetch(`/api/source?path=${encodeURIComponent(path)}`)
        .then((response) => response.json())
        .then((payload) => {
            renderSource(payload.path, payload.source, line);
        })
        .then(undefined, (error) => {
            renderError(error);
        });
}

function renderSource(path, source, hitLine) {
    elements.sourceTitle.textContent = path;
    elements.sourceMeta.textContent = hitLine === undefined ? "" : `line ${String(hitLine)}`;
    const lines = source.split("\n");
    const html = lines.map((line, index) => {
        const lineNumber = index + 1;
        const marker = lineNumber === hitLine ? " hit" : "";
        return `<span class="line${marker}">${String(lineNumber).padStart(4, " ")} | ${escapeHtml(line)}</span>`;
    }).join("");
    elements.sourceView.innerHTML = `<code>${html}</code>`;
}

function renderError(error) {
    const message = error instanceof Error ? error.message : String(error);
    elements.findingList.innerHTML = `<div class="finding-row error"><strong>Analyzer error</strong><span>${escapeHtml(message)}</span></div>`;
}

function layerColor(layer) {
    let hash = 0;
    for (let index = 0; index < layer.length; index += 1) {
        hash = (hash * 31 + layer.charCodeAt(index)) >>> 0;
    }
    const hue = hash % 360;
    return `hsl(${String(hue)} 74% 62%)`;
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}
