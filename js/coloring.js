(function () {
    const PALETTE = [
        "#ff3b3b", "#ff6b6b", "#e4572e", "#ff9f1c", "#ffc93c",
        "#ffd166", "#8ac926", "#17b978", "#38d996", "#209ce7",
        "#4d96ff", "#4361ee", "#2f6fed", "#6a4cff", "#9b5de5",
        "#c471f5", "#f15bb5", "#ff8ad1", "#8d5524", "#718096"
    ];
    const BRUSH_SIZES = [
        { label: "S", dotPx: 14, width: 16 },
        { label: "M", dotPx: 24, width: 38 },
        { label: "L", dotPx: 40, width: 66 }
    ];
    // Internal fixed resolution before it is drawn scaled to the canvas.
    const W = 1800, H = 1280;
    const LINE_LUM = 150;
    const FILL_TOL_MIN = 32;   // seed-color match tolerance
    const FILL_TOL_LINE = 60;  // "is an outline pixel" tolerance
    const WALL = 3;            // enforcement width (px) left unfilled by the brush

    const canvas = document.getElementById("paint");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = W;
    canvas.height = H;

    let currentColor = PALETTE[0];
    let mode = "brush"; // default: brush, not bucket
    let rainbow = false;
    let brushSize = BRUSH_SIZES[1].width;
    let pictureIndex = 0;
    let drawing = false;
    let lastPt = null;
    let lineMask = new Uint8Array(W * H);
    let regionMask = null;
    let strokeData = null;
    const undoStack = [];

    // ---- helpers -----------------------------------------------------------

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

    // Signature checks: dark-and-bright, or opaque, treating a semi-transparent
    // fringe/anti-aliased edge as NOT a live painting pixel (skippable).
    function isLineVal(a, r, g, b) {
        return (a >= 250 && lum(r, g, b) < LINE_LUM) || a >= 254;
    }

    function isLineAt(dataArr, i) {
        return isLineVal(dataArr[i + 3], dataArr[i], dataArr[i + 1], dataArr[i + 2]);
    }

    // ---- line mask ---------------------------------------------------------

    function buildLineMask() {
        const data = new Uint8Array(ctx.getImageData(0, 0, W, H).data);
        for (let i = 0; i < W * H; i++) {
            lineMask[i] = isLineVal(data[i * 4 + 3], data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 1 : 0;
        }
    }

    function clearLineMask() {
        lineMask.fill(0);
    }

    // ---- brute fill tool ---------------------------------------------------

    // Strict bounded flood fill: expands only into pixels that are (a) not an
    // outline/dark-boundary pixel and (b) within FILL_TOL_MIN of the clicked
    // region's color, so it stops at and never crosses the outline.
    function floodFill(px, py, hex) {
        if (px < 0 || py < 0 || px >= W || py >= H) return;
        const start = py * W + px;
        if (lineMask[start]) return;
        const img = ctx.getImageData(0, 0, W, H);
        const arr = img.data;
        const tr = arr[start * 4], tg = arr[start * 4 + 1], tb = arr[start * 4 + 2];
        const fc = hexToRgb(hex);
        const tol = FILL_TOL_MIN * FILL_TOL_MIN;
        const canFill = i => {
            if (lineMask[i]) return false;
            const dr = arr[i * 4] - tr, dg = arr[i * 4 + 1] - tg, db = arr[i * 4 + 2] - tb;
            return dr * dr + dg * dg + db * db <= tol;
        };
        if (!canFill(start)) return;
        const mask = new Uint8Array(W * H);
        const stack = [start];
        mask[start] = 1;
        while (stack.length) {
            const i = stack.pop();
            const x = i % W, y = (i / W) | 0;
            if (x > 0 && !mask[i - 1] && canFill(i - 1)) { mask[i - 1] = 1; stack.push(i - 1); }
            if (x < W - 1 && !mask[i + 1] && canFill(i + 1)) { mask[i + 1] = 1; stack.push(i + 1); }
            if (y > 0 && !mask[i - W] && canFill(i - W)) { mask[i - W] = 1; stack.push(i - W); }
            if (y < H - 1 && !mask[i + W] && canFill(i + W)) { mask[i + W] = 1; stack.push(i + W); }
        }
        const fr = fc.r | 0, fg = fc.g | 0, fb = fc.b | 0;
        for (let i = 0; i < mask.length; i++) {
            if (mask[i]) { arr[i * 4] = fr; arr[i * 4 + 1] = fg; arr[i * 4 + 2] = fb; }
        }
        ctx.putImageData(img, 0, 0);
    }

    // ---- brush tool (region-confined strokes) -------------------------------

    function regionFlood(sx, sy) {
        if (lineMask[sy * W + sx]) return null;
        const data = new Uint8Array(ctx.getImageData(0, 0, W, H).data);
        const v0 = (sy * W + sx) * 4;
        const tr = data[v0], tg = data[v0 + 1], tb = data[v0 + 2];
        const tol = FILL_TOL_MIN * FILL_TOL_MIN;
        const match = i => {
            if (lineMask[i]) return false;
            const dr = data[i * 4] - tr, dg = data[i * 4 + 1] - tg, db = data[i * 4 + 2] - tb;
            return dr * dr + dg * dg + db * db <= tol;
        };
        const mask = new Uint8Array(W * H);
        const stack = [sy * W + sx];
        mask[stack[0]] = 1;
        while (stack.length) {
            const i = stack.pop();
            const x = i % W, y = (i / W) | 0;
            if (x > 0 && !mask[i - 1] && match(i - 1)) { mask[i - 1] = 1; stack.push(i - 1); }
            if (x < W - 1 && !mask[i + 1] && match(i + 1)) { mask[i + 1] = 1; stack.push(i + 1); }
            if (y > 0 && !mask[i - W] && match(i - W)) { mask[i - W] = 1; stack.push(i - W); }
            if (y < H - 1 && !mask[i + W] && match(i + W)) { mask[i + W] = 1; stack.push(i + W); }
        }
        return mask;
    }

    // Erode the region mask by `r` pixels so painted strokes never reach the
    // centre of an outline, keeping each enclosing box cleanly separated.
    function erodeRegion(mask, r) {
        if (r <= 0) return mask;
        const out = new Uint8Array(mask);
        let w = out;
        for (let k = 0; k < r; k++) {
            const next = new Uint8Array(mask);
            for (let i = 0; i < mask.length; i++) {
                if (!out[i]) continue;
                const x = i % W, y = (i / W) | 0;
                if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) { next[i] = 0; continue; }
                if (out[i - 1] && out[i + 1] && out[i - W] && out[i + W]) next[i] = 1;
            }
            w = next; out.set(next);
        }
        return w;
    }

    function stampCircle(cx, cy, r, hex) {
        const fc = hexToRgb(hex);
        const arr = strokeData.data;
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
        if (x0 > x1 || y0 > y1) return;
        const r2 = r * r;
        for (let y = y0; y <= y1; y++) {
            const dy = y - cy;
            for (let x = x0; x <= x1; x++) {
                const dx = x - cx;
                const i = y * W + x;
                if (dx * dx + dy * dy <= r2 && regionMask[i]) {
                    arr[i * 4] = fc.r; arr[i * 4 + 1] = fc.g; arr[i * 4 + 2] = fc.b; arr[i * 4 + 3] = 255;
                }
            }
        }
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
        regionMask = erodeRegion(regionMask, WALL);
        stampCircle(p.x, p.y, brushSize / 2, color);
        return true;
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

    function canvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (W / rect.width),
            y: (e.clientY - rect.top) * (H / rect.height)
        };
    }

    // ---- pointer / tool wiring ----------------------------------------------

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

    // ---- picture loading -----------------------------------------------------

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

    // ---- toolbars -------------------------------------------------------------

    function buildPalette() {
        const pal = document.getElementById("palette");
        PALETTE.forEach(c => {
            const sw = document.createElement("button");
            sw.className = "swatch" + (c === currentColor ? " selected" : "");
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
        const wrap = document.getElementById("sizes");
        if (!wrap) return;
        wrap.innerHTML = "";
        BRUSH_SIZES.forEach(s => {
            const b = document.createElement("button");
            b.className = "size-btn" + (s.width === brushSize ? " active" : "");
            b.setAttribute("aria-label", "brush size " + s.label);
            const dot = document.createElement("span");
            dot.className = "size-dot";
            dot.style.width = dot.style.height = s.dotPx + "px";
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

    // New game defaults to the brush tool (not the bucket).
    buildPalette();
    buildSizes();
    setMode("brush", document.getElementById("toolBrush"));
    loadPicture(0);
})();