(function () {
    const PALETTE = [
        "#e4572e", "#ff9f1c", "#ffc93c", "#8ac926", "#17b978",
        "#209ce7", "#4361ee", "#9b5de5", "#f15bb5", "#8d5524"
    ];
    const BRUSH_SIZES = [
        { label: "S", width: 16 },
        { label: "M", width: 38 },
        { label: "L", width: 66 }
    ];
    const W = 900, H = 640;
    const LINE_LUM = 140;
    const FILL_TOL = 40;

    const canvas = document.getElementById("paint");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = W;
    canvas.height = H;

    let currentColor = PALETTE[0];
    let mode = "fill";
    let rainbow = false;
    let brushSize = BRUSH_SIZES[1].width;
    let pictureIndex = 0;
    let drawing = false;
    let lastPt = null;
    let lineMask = new Uint8Array(W * H);
    let regionMask = null;
    let strokeData = null;
    const undoStack = [];

    function snapshot() {
        undoStack.push(ctx.getImageData(0, 0, W, H));
        if (undoStack.length > 20) undoStack.shift();
    }

    function randomColor() {
        return PALETTE[Math.floor(Math.random() * PALETTE.length)];
    }

    function hexToRgb(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }

    function lum(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    function buildLineMask() {
        const data = new Uint32Array(ctx.getImageData(0, 0, W, H).data.buffer);
        for (let i = 0; i < data.length; i++) {
            const v = data[i];
            lineMask[i] = lum(v & 255, (v >> 8) & 255, (v >> 16) & 255) < LINE_LUM ? 1 : 0;
        }
    }

    function clearLineMask() {
        lineMask.fill(0);
    }

    function nearestOpenPixel(cx, cy) {
        cx |= 0; cy |= 0;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
        if (!lineMask[cy * W + cx]) return [cx, cy];
        const sides = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
        for (const [x, y] of sides) {
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            if (!lineMask[y * W + x]) return [x, y];
        }
        return null;
    }

    function floodFill(px, py, hex) {
        const open = nearestOpenPixel(px, py);
        if (!open) return;
        const img = ctx.getImageData(0, 0, W, H);
        const data = new Uint32Array(img.data.buffer);
        const start = open[1] * W + open[0];
        const v0 = data[start];
        const tr = v0 & 255, tg = (v0 >> 8) & 255, tb = (v0 >> 16) & 255;
        const fc = hexToRgb(hex);
        const fillVal = (255 << 24) | (fc.b << 16) | (fc.g << 8) | fc.r;
        if (v0 === fillVal) return;

        const match = v => {
            const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
            return Math.abs(r - tr) <= FILL_TOL && Math.abs(g - tg) <= FILL_TOL && Math.abs(b - tb) <= FILL_TOL;
        };

        const mask = new Uint8Array(W * H);
        const stack = [start];
        mask[start] = 1;
        while (stack.length) {
            const i = stack.pop();
            const x = i % W, y = (i / W) | 0;
            if (x > 0 && !mask[i - 1] && !lineMask[i - 1] && match(data[i - 1])) { mask[i - 1] = 1; stack.push(i - 1); }
            if (x < W - 1 && !mask[i + 1] && !lineMask[i + 1] && match(data[i + 1])) { mask[i + 1] = 1; stack.push(i + 1); }
            if (y > 0 && !mask[i - W] && !lineMask[i - W] && match(data[i - W])) { mask[i - W] = 1; stack.push(i - W); }
            if (y < H - 1 && !mask[i + W] && !lineMask[i + W] && match(data[i + W])) { mask[i + W] = 1; stack.push(i + W); }
        }

        for (let pass = 0; pass < 2; pass++) {
            const grown = mask.slice();
            for (let i = 0; i < mask.length; i++) {
                if (mask[i] || lineMask[i]) continue;
                const x = i % W, y = (i / W) | 0;
                if ((x > 0 && mask[i - 1]) || (x < W - 1 && mask[i + 1]) ||
                    (y > 0 && mask[i - W]) || (y < H - 1 && mask[i + W])) grown[i] = 1;
            }
            mask.set(grown);
        }

        for (let i = 0; i < mask.length; i++) {
            if (mask[i]) data[i] = fillVal;
        }
        ctx.putImageData(img, 0, 0);
    }

    function regionFlood(sx, sy) {
        if (lineMask[sy * W + sx]) return null;
        const data = new Uint32Array(strokeData.data.buffer);
        const v0 = data[sy * W + sx];
        const tr = v0 & 255, tg = (v0 >> 8) & 255, tb = (v0 >> 16) & 255;
        const match = v => {
            const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
            return Math.abs(r - tr) <= FILL_TOL && Math.abs(g - tg) <= FILL_TOL && Math.abs(b - tb) <= FILL_TOL;
        };
        const mask = new Uint8Array(W * H);
        const stack = [sy * W + sx];
        mask[stack[0]] = 1;
        while (stack.length) {
            const i = stack.pop();
            const x = i % W, y = (i / W) | 0;
            if (x > 0 && !mask[i - 1] && !lineMask[i - 1] && match(data[i - 1])) { mask[i - 1] = 1; stack.push(i - 1); }
            if (x < W - 1 && !mask[i + 1] && !lineMask[i + 1] && match(data[i + 1])) { mask[i + 1] = 1; stack.push(i + 1); }
            if (y > 0 && !mask[i - W] && !lineMask[i - W] && match(data[i - W])) { mask[i - W] = 1; stack.push(i - W); }
            if (y < H - 1 && !mask[i + W] && !lineMask[i + W] && match(data[i + W])) { mask[i + W] = 1; stack.push(i + W); }
        }
        return mask;
    }

    function stampCircle(cx, cy, r, hex) {
        const fc = hexToRgb(hex);
        const fillVal = (255 << 24) | (fc.b << 16) | (fc.g << 8) | fc.r;
        const data = new Uint32Array(strokeData.data.buffer);
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
        if (x0 > x1 || y0 > y1) return;
        const r2 = r * r;
        for (let y = y0; y <= y1; y++) {
            const dy = y - cy;
            for (let x = x0; x <= x1; x++) {
                const dx = x - cx;
                const i = y * W + x;
                if (dx * dx + dy * dy <= r2 && regionMask[i]) data[i] = fillVal;
            }
        }
        ctx.putImageData(strokeData, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }

    function strokeSegment(x0, y0, x1, y1, r, color) {
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, r * 0.4)));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            stampCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, color);
        }
    }

    function beginStroke(p, color) {
        const open = nearestOpenPixel(p.x, p.y);
        if (!open) return false;
        strokeData = ctx.getImageData(0, 0, W, H);
        regionMask = regionFlood(open[0], open[1]);
        if (!regionMask) { strokeData = null; return false; }
        stampCircle(p.x, p.y, brushSize / 2, color);
        return true;
    }

    function canvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (W / rect.width),
            y: (e.clientY - rect.top) * (H / rect.height)
        };
    }

    canvas.addEventListener("pointerdown", e => {
        e.preventDefault();
        TotAudio.tap();
        const p = canvasPos(e);
        snapshot();
        const color = rainbow ? randomColor() : currentColor;
        if (mode === "fill") {
            floodFill(p.x, p.y, color);
        } else if (beginStroke(p, color)) {
            drawing = true;
            lastPt = p;
            canvas.setPointerCapture(e.pointerId);
        }
    });

    canvas.addEventListener("pointermove", e => {
        if (!drawing) return;
        e.preventDefault();
        const p = canvasPos(e);
        const color = rainbow ? randomColor() : currentColor;
        strokeSegment(lastPt.x, lastPt.y, p.x, p.y, brushSize / 2, color);
        lastPt = p;
    });

    ["pointerup", "pointercancel"].forEach(ev =>
        canvas.addEventListener(ev, () => {
            drawing = false;
            lastPt = null;
            regionMask = null;
            strokeData = null;
        })
    );

    function fitImage(img) {
        const scale = Math.min((W * 0.96) / img.width, (H * 0.96) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    }

    function loadPicture(index, blankOnly = false) {
        if (!COLORING_PICTURES.length) {
            document.getElementById("picName").textContent = "No pictures yet";
            return;
        }
        pictureIndex = (index + COLORING_PICTURES.length) % COLORING_PICTURES.length;
        undoStack.length = 0;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        clearLineMask();
        document.getElementById("picName").textContent = COLORING_PICTURES[pictureIndex].name + (blankOnly ? " (blank)" : "");
        if (!blankOnly) {
            const img = new Image();
            img.onload = () => {
                fitImage(img);
                buildLineMask();
            };
            img.src = COLORING_PICTURES[pictureIndex].src;
        }
    }

    function buildPalette() {
        const pal = document.getElementById("palette");
        PALETTE.forEach((c, i) => {
            const sw = document.createElement("button");
            sw.className = "swatch" + (i === 0 ? " selected" : "");
            sw.style.background = c;
            sw.setAttribute("aria-label", "color " + c);
            sw.addEventListener("click", () => {
                document.querySelectorAll(".swatch").forEach(s => s.classList.remove("selected"));
                sw.classList.add("selected");
                currentColor = c;
                TotAudio.pick();
            });
            pal.appendChild(sw);
        });
    }

    function buildSizes() {
        const wrapLeft = document.querySelector("#toolBrush").closest(".side-panel")?.querySelector("#sizes");
        const wrapRight = document.querySelector(".side-panel:last-of-type #sizes");
        const wraps = [wrapLeft, wrapRight].filter(Boolean);
        BRUSH_SIZES.forEach((s, i) => {
            wraps.forEach(wrap => {
                const b = document.createElement("button");
                b.className = "size-btn" + (s.width === brushSize ? " active" : "");
                b.setAttribute("aria-label", "brush size " + s.label);
                const dot = document.createElement("span");
                dot.className = "size-dot";
                dot.style.width = dot.style.height = (8 + i * 7) + "px";
                const lbl = document.createElement("span");
                lbl.className = "size-label";
                lbl.textContent = s.label;
                b.appendChild(dot);
                b.appendChild(lbl);
                b.addEventListener("click", () => {
                    brushSize = s.width;
                    document.querySelectorAll(".size-btn").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    TotAudio.pick();
                });
                wrap.appendChild(b);
            });
        });
    }

    function setMode(m, btn) {
        mode = m;
        document.querySelectorAll("#toolFill, #toolBrush").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        canvas.style.cursor = m === "brush" ? "crosshair" : "pointer";
        TotAudio.pick();
    }

    document.getElementById("toolFill").addEventListener("click", e => setMode("fill", e.currentTarget));
    document.getElementById("toolBrush").addEventListener("click", e => setMode("brush", e.currentTarget));

    document.getElementById("toolRainbow").addEventListener("click", e => {
        rainbow = !rainbow;
        e.currentTarget.classList.toggle("active", rainbow);
        TotAudio.pick();
    });

    document.getElementById("undoBtn").addEventListener("click", () => {
        const last = undoStack.pop();
        if (last) {
            ctx.putImageData(last, 0, 0);
            TotAudio.pick();
        } else {
            TotAudio.wrong();
        }
    });

    document.getElementById("clearBtn").addEventListener("click", () => {
        TotAudio.wrong();
        loadPicture(pictureIndex);
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
        TotAudio.wrong();
        loadPicture(pictureIndex, true);
    });

    document.getElementById("prevBtn").addEventListener("click", () => { TotAudio.pick(); loadPicture(pictureIndex - 1); });
    document.getElementById("nextBtn").addEventListener("click", () => { TotAudio.pick(); loadPicture(pictureIndex + 1); });

    buildPalette();
    buildSizes();
    loadPicture(0);
})();