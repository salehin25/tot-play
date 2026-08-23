(function () {
    const PALETTE = [
        "#e4572e", "#ff9f1c", "#ffc93c", "#8ac926", "#17b978",
        "#209ce7", "#4361ee", "#9b5de5", "#f15bb5", "#8d5524"
    ];
    const W = 900, H = 640;

    const canvas = document.getElementById("paint");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = W;
    canvas.height = H;

    let currentColor = PALETTE[0];
    let mode = "fill";
    let pictureIndex = 0;
    let drawing = false;
    const undoStack = [];

    function snapshot() {
        undoStack.push(ctx.getImageData(0, 0, W, H));
        if (undoStack.length > 20) undoStack.shift();
    }

    function hexToRgb(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }

    function floodFill(sx, sy, hex) {
        const img = ctx.getImageData(0, 0, W, H);
        const data = new Uint32Array(img.data.buffer);
        sx |= 0; sy |= 0;
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
        const target = data[sy * W + sx];
        const fc = hexToRgb(hex);
        const fillVal = (255 << 24) | (fc.b << 16) | (fc.g << 8) | fc.r;
        if (target === fillVal) return;
        const tr = target & 255, tg = (target >> 8) & 255, tb = (target >> 16) & 255;
        const tol = 96;
        const match = v => {
            const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
            return Math.abs(r - tr) <= tol && Math.abs(g - tg) <= tol && Math.abs(b - tb) <= tol;
        };
        const stack = [[sx, sy]];
        while (stack.length) {
            const [x, y] = stack.pop();
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const i = y * W + x;
            if (!match(data[i])) continue;
            let left = x, right = x;
            while (left > 0 && match(data[y * W + left - 1])) left--;
            while (right < W - 1 && match(data[y * W + right + 1])) right++;
            for (let xi = left; xi <= right; xi++) {
                data[y * W + xi] = fillVal;
                if (y > 0 && match(data[(y - 1) * W + xi])) stack.push([xi, y - 1]);
                if (y < H - 1 && match(data[(y + 1) * W + xi])) stack.push([xi, y + 1]);
            }
        }
        ctx.putImageData(img, 0, 0);
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
        if (mode === "fill") {
            floodFill(p.x, p.y, currentColor);
        } else {
            drawing = true;
            canvas.setPointerCapture(e.pointerId);
            ctx.strokeStyle = currentColor;
            ctx.fillStyle = currentColor;
            ctx.lineWidth = 44;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.ellipse(p.x, p.y, 22, 22, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    canvas.addEventListener("pointermove", e => {
        if (!drawing) return;
        e.preventDefault();
        const p = canvasPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    });

    ["pointerup", "pointercancel"].forEach(ev =>
        canvas.addEventListener(ev, () => { drawing = false; })
    );

    function loadPicture(index) {
        pictureIndex = (index + COLORING_PICTURES.length) % COLORING_PICTURES.length;
        undoStack.length = 0;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        COLORING_PICTURES[pictureIndex].draw(ctx);
        document.getElementById("picName").textContent = COLORING_PICTURES[pictureIndex].name;
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

    function setMode(m, btn) {
        mode = m;
        document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        canvas.style.cursor = m === "brush" ? "crosshair" : "pointer";
        TotAudio.pick();
    }

    document.getElementById("toolFill").addEventListener("click", e => setMode("fill", e.currentTarget));
    document.getElementById("toolBrush").addEventListener("click", e => setMode("brush", e.currentTarget));

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

    buildPalette();
    setMode("fill", document.getElementById("toolFill"));
    loadPicture(0);
})();
