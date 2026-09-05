(function () {
    const PALETTE = [
        "#ff3b3b", "#ff6b6b", "#e4572e", "#ff9f1c", "#ffc93c",
        "#ffd166", "#8ac926", "#17b978", "#38d996", "#209ce7",
        "#4d96ff", "#4361ee", "#2f6fed", "#6a4cff", "#9b5de5",
        "#c471f5", "#f15bb5", "#ff8ad1", "#8d5524", "#718096",
        "#ffffff"
    ];
    const BRUSH_SIZES = [
        { label: "M", dotPx: 24, width: 38 },
        { label: "L", dotPx: 40, width: 66 }
    ];
    // 2× the original 900×640 for crisp thin lines
    const W = 1800, H = 1280;
    const LINE_LUM = 140;          // pixels darker than this = outline
    const FILL_TOL = 40;           // per-component seed-color tolerance
    const WALL = 3;                // brush erosion from outline (px)

    const canvas = document.getElementById("paint");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = W;
    canvas.height = H;

    let currentColor = PALETTE[0];
    let mode = "fill";            // default: fill (bucket)
    let rainbow = true;          // default: rainbow mode on
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
        // More diverse random color selection - avoid immediate repeats
        let color;
        do {
            color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        } while (rainbow && color === lastRainbowColor && PALETTE.length > 1);
        lastRainbowColor = color;
        return color;
    }

    let lastRainbowColor = null;

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

    // ---- line mask (ORIGINAL LOGIC: luminance ONLY) ------------------------

    function buildLineMask() {
        const data = new Uint32Array(ctx.getImageData(0, 0, W, H).data.buffer);
        for (let i = 0; i < data.length; i++) {
            const v = data[i];
            // v is 0xAARRGGBB in little-endian; bytes are B,G,R,A
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

    // ---- bucket fill (strict bounded flood fill) ---------------------------

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

        // 2-pass dilation to bleed up to (but not past) outline center
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

    // ---- brush tool (region-confined strokes) ------------------------------

    // Region the brush may paint. Seeds from a non-outline pixel and floods by
    // outline boundary only (color-blind) so that anywhere in the box paints
    // the WHOLE box — including any leftover unpainted white specks and the
    // thin ring right next to the outlines. Stops at (never crosses) the lines.
    function regionFlood(sx, sy) {
        if (lineMask[sy * W + sx]) return null;
        const mask = new Uint8Array(W * H);
        const stack = [sy * W + sx];
        mask[stack[0]] = 1;
        while (stack.length) {
            const i = stack.pop();
            const x = i % W, y = (i / W) | 0;
            if (x > 0 && !mask[i - 1] && !lineMask[i - 1]) { mask[i - 1] = 1; stack.push(i - 1); }
            if (x < W - 1 && !mask[i + 1] && !lineMask[i + 1]) { mask[i + 1] = 1; stack.push(i + 1); }
            if (y > 0 && !mask[i - W] && !lineMask[i - W]) { mask[i - W] = 1; stack.push(i - W); }
            if (y < H - 1 && !mask[i + W] && !lineMask[i + W]) { mask[i + W] = 1; stack.push(i + W); }
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
    }

    function strokeSegment(x0, y0, x1, y1, r, color) {
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, r * 0.4)));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            stampCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, color);
        }
        // Commit the painted buffer back to the canvas so strokes become visible.
        ctx.putImageData(strokeData, 0, 0);
    }

    function beginStroke(p, color) {
        const open = nearestOpenPixel(p.x, p.y);
        if (!open) return false;
        strokeData = ctx.getImageData(0, 0, W, H);
        regionMask = regionFlood(open[0], open[1]);
        if (!regionMask) { strokeData = null; return false; }
        stampCircle(p.x, p.y, brushSize / 2, color);
        // Commit the first dab so the stroke is visible immediately.
        ctx.putImageData(strokeData, 0, 0);
        return true;
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
        // Eraser mode paints white to erase
        const color = mode === "rubber" ? "#ffffff" : (rainbow ? randomColor() : currentColor);
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
        // Eraser mode paints white to erase
        const color = mode === "rubber" ? "#ffffff" : (rainbow ? randomColor() : currentColor);
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

    // ---- picture loading ----------------------------------------------------

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

    // ---- toolbars -----------------------------------------------------------

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
        // Toggle active state for brush, fill, and rubber tools
        document.querySelectorAll("#toolFill, #toolBrush, #rubberBtn").forEach(b => b.classList.remove("active"));
        if (btn) btn.classList.add("active");
        canvas.style.cursor = "crosshair";
        TotAudio.pick();
    }

    document.getElementById("toolFill").addEventListener("click", e => setMode("fill", e.currentTarget));
    document.getElementById("toolBrush").addEventListener("click", e => setMode("brush", e.currentTarget));
    document.getElementById("rubberBtn").addEventListener("click", e => setMode("rubber", e.currentTarget));

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

    document.getElementById("prevBtn").addEventListener("click", () => { TotAudio.pick(); loadPicture(pictureIndex - 1); });
    document.getElementById("nextBtn").addEventListener("click", () => { TotAudio.pick(); loadPicture(pictureIndex + 1); });
    document.getElementById("randomBtn").addEventListener("click", () => { TotAudio.pick(); loadPicture(Math.floor(Math.random() * COLORING_PICTURES.length)); });

    // Defaults: fill (bucket) tool active and rainbow mode on.
    buildPalette();
    buildSizes();
    setMode("fill", document.getElementById("toolFill"));
    document.getElementById("toolRainbow").classList.add("active");

    // ---- picture selector overlay ----------------------------------------

    function closePictureGrid(grid) {
        if (grid && grid.parentNode) grid.parentNode.removeChild(grid);
    }

    function buildPictureGrid() {
        const grid = document.createElement("div");
        grid.id = "picGrid";
        grid.style.cssText = [
            "position:fixed", "inset:0", "z-index:1000",
            "background:rgba(0,0,0,0.6)", "display:grid",
            "place-items:center", "padding:clamp(10px,4vw,40px)",
            "box-sizing:border-box", "touch-action:none", "overflow:visible"
          ].join(";");

        // Close when clicking outside the panel
        grid.addEventListener("click", e => {
            if (e.target === grid) {
                closePictureGrid(grid);
            }
        });

        const panel = document.createElement("div");
        panel.style.cssText = [
            "background:#fff", "border-radius:clamp(14px,3vw,24px)",
            "padding:clamp(12px,3vw,24px)",
            "width:min(600px, calc(100vw - clamp(20px,8vw,80px)))",
            "max-height:calc(100vh - clamp(40px,10vh,100px))",
            "overflow:hidden", "display:flex", "flex-direction:column"
          ].join(";");

        const scroll = document.createElement("div");
        scroll.style.cssText = [
            "overflow:auto", "display:grid",
            "grid-template-columns:repeat(auto-fill,minmax(clamp(70px,12vw,100px),1fr))",
            "gap:clamp(8px,2vw,14px)"
          ].join(";");

        COLORING_PICTURES.forEach((pic, idx) => {
            const btn = document.createElement("button");
            btn.style.cssText = [
                "border:none", "border-radius:10px", "padding:clamp(4px,1vw,8px)",
                "cursor:pointer", "background:#fff",
                "box-shadow:0 3px 0 rgba(36,49,94,0.14)",
                "display:flex", "flex-direction:column", "align-items:center", "gap:clamp(3px,0.8vw,6px)"
              ].join(";");
            btn.innerHTML = '<img src="' + pic.src + '" alt="' + pic.name + '" style="width:clamp(50px,10vw,70px);height:clamp(50px,10vw,70px);object-fit:contain;border-radius:8px;background:#f0f0f0;">' +
                            '<span style="font-size:clamp(0.6rem,1.8vw,0.8rem);font-weight:700;color:var(--ink);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;max-width:100%;text-align:center;">' + pic.name + '</span>';
            btn.addEventListener("click", () => {
                TotAudio.pick();
                closePictureGrid(grid);
                loadPicture(idx);
            });
            scroll.appendChild(btn);
        });

        panel.appendChild(scroll);
        grid.appendChild(panel);
        document.body.appendChild(grid);
    }

    document.getElementById("selectPicture").addEventListener("click", () => {
        TotAudio.tap();
        buildPictureGrid();
    });

    loadPicture(0);
})();