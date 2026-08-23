const TotAudio = (() => {
    let ctx = null;
    let muted = false;

    function ensure() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) ctx = new AC();
        }
        if (ctx && ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    function note(freq, start, dur, type = "sine", vol = 0.25) {
        if (muted) return;
        const c = ensure();
        if (!c) return;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, c.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
        o.connect(g).connect(c.destination);
        o.start(c.currentTime + start);
        o.stop(c.currentTime + start + dur + 0.05);
    }

    return {
        unlock: () => ensure(),
        setMuted: v => { muted = v; },
        isMuted: () => muted,
        tap: () => note(600, 0, 0.08, "triangle", 0.2),
        pick: () => { note(520, 0, 0.1, "triangle"); note(700, 0.06, 0.12, "triangle"); },
        match: () => { note(660, 0, 0.12); note(880, 0.1, 0.18); },
        wrong: () => note(180, 0, 0.2, "sawtooth", 0.12),
        win: () => {
            [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.25, "triangle", 0.3));
        }
    };
})();

document.addEventListener("pointerdown", () => TotAudio.unlock(), { once: true });
document.addEventListener("touchmove", e => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", e => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
}, { passive: false });

const TotFS = (() => {
    const el = document.documentElement;

    function isFs() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function enter() {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (req) req.call(el).catch?.(() => {});
    }

    function exit() {
        const ex = document.exitFullscreen || document.webkitExitFullscreen;
        if (ex) ex.call(document).catch?.(() => {});
    }

    function toggle() { isFs() ? exit() : enter(); }

    function injectExitButton() {
        if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) return;
        const btn = document.createElement("button");
        btn.id = "fs-exit";
        btn.textContent = "✕";
        btn.setAttribute("aria-label", "Exit fullscreen");
        btn.style.cssText = `position:fixed;top:max(10px, env(safe-area-inset-top));right:12px;z-index:999;width:46px;height:46px;border-radius:50%;
            border:none;background:rgba(0,24,88,.45);color:#fff;font-size:20px;font-weight:800;display:none;place-items:center;
            cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);`;
        btn.addEventListener("click", exit);
        document.body.appendChild(btn);

        const sync = () => { btn.style.display = isFs() ? "grid" : "none"; };
        document.addEventListener("fullscreenchange", sync);
        document.addEventListener("webkitfullscreenchange", sync);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectExitButton);
    } else {
        injectExitButton();
    }

    return { enter, exit, toggle, isFs };
})();

function confetti(durationMs = 1800) {
    const canvas = document.createElement("canvas");
    canvas.id = "confetti";
    document.body.appendChild(canvas);
    const ctx2d = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx2d.scale(dpr, dpr);
    const colors = ["#e4572e", "#209ce7", "#17b978", "#a55eea", "#ff6b81", "#f9bc60"];
    const pieces = Array.from({ length: 160 }, () => ({
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * innerHeight * 0.5,
        w: 8 + Math.random() * 8,
        h: 10 + Math.random() * 10,
        vy: 2.5 + Math.random() * 4,
        vx: -1.5 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: -0.15 + Math.random() * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const t0 = performance.now();
    (function frame(t) {
        ctx2d.clearRect(0, 0, innerWidth, innerHeight);
        pieces.forEach(p => {
            p.y += p.vy; p.x += p.vx; p.rot += p.vr;
            ctx2d.save();
            ctx2d.translate(p.x, p.y);
            ctx2d.rotate(p.rot);
            ctx2d.fillStyle = p.color;
            ctx2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx2d.restore();
        });
        if (t - t0 < durationMs) requestAnimationFrame(frame);
        else canvas.remove();
    })(t0);
}

function bigMessage(text) {
    const el = document.createElement("div");
    el.className = "big-msg";
    el.innerHTML = `<div class="txt">${text}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
}

function createMatchGame(config) {
    const board = document.getElementById("board");
    const linesSvg = document.getElementById("lines");
    const pairsCount = config.pairsPerRound || 5;
    let selectedFrom = null;
    let dragLine = null;
    let lockBoard = false;
    let matchesInRound = 0;
    let round = 0;

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function svgPoint(x, y) {
        const pt = new DOMPoint(x, y);
        const m = linesSvg.getScreenCTM();
        return m ? pt.matrixTransform(m.inverse()) : pt;
    }

    function makeCell(item, side) {
        const div = document.createElement("div");
        div.className = "cell";
        div.innerHTML = config.render ? config.render(item, side) : item.label;
        div.dataset.id = item.id;

        div.addEventListener("pointerdown", e => {
            if (lockBoard || div.classList.contains("matched")) return;
            TotAudio.pick();
            selectedFrom = { div, item, side };
            div.classList.add("selected");
            dragLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            const p = svgPoint(e.clientX, e.clientY);
            dragLine.setAttribute("x1", p.x);
            dragLine.setAttribute("y1", p.y);
            dragLine.setAttribute("x2", p.x);
            dragLine.setAttribute("y2", p.y);
            dragLine.setAttribute("class", "drag-line");
            linesSvg.appendChild(dragLine);
            try { div.setPointerCapture(e.pointerId); } catch {}
            e.preventDefault();
        });

        div.addEventListener("pointermove", e => {
            if (!dragLine || !selectedFrom) return;
            const p = svgPoint(e.clientX, e.clientY);
            dragLine.setAttribute("x2", p.x);
            dragLine.setAttribute("y2", p.y);
        });

        div.addEventListener("pointerup", e => {
            if (!selectedFrom) return;
            dragLine?.remove();
            dragLine = null;
            const from = selectedFrom;
            selectedFrom = null;
            from.div.classList.remove("selected");

            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".cell");
            lockBoard = true;
            if (target && target !== from.div && !target.classList.contains("matched") &&
                target.dataset.id === String(from.item.id)) {
                finalizeMatch(from.div, target);
            } else {
                if (target && target !== from.div) target.classList.add("wrong");
                else from.div.classList.add("wrong");
                TotAudio.wrong();
                setTimeout(() => {
                    document.querySelectorAll(".cell.wrong").forEach(c => c.classList.remove("wrong"));
                    lockBoard = false;
                }, 420);
            }
        });

        div.addEventListener("pointercancel", () => {
            dragLine?.remove();
            dragLine = null;
            if (selectedFrom) {
                selectedFrom.div.classList.remove("selected");
                selectedFrom = null;
            }
        });

        return div;
    }

    function finalizeMatch(a, b) {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", ra.left + ra.width / 2);
        line.setAttribute("y1", ra.top + ra.height / 2);
        line.setAttribute("x2", rb.left + rb.width / 2);
        line.setAttribute("y2", rb.top + rb.height / 2);
        line.setAttribute("class", "match-line");
        linesSvg.appendChild(line);

        a.classList.add("matched");
        b.classList.add("matched");
        TotAudio.match();
        matchesInRound++;
        lockBoard = false;
        if (matchesInRound === pairsCount) roundWon();
    }

    function roundWon() {
        lockBoard = true;
        TotAudio.win();
        confetti(1900);
        bigMessage(config.praise ? config.praise[round % config.praise.length] : "Yay!");
        round++;
        setTimeout(newRound, 2100);
    }

    function newRound() {
        linesSvg.innerHTML = "";
        matchesInRound = 0;
        const chosen = shuffle([...config.pool]).slice(0, pairsCount);
        const colL = board.querySelector(".col-left");
        const colR = board.querySelector(".col-right");
        colL.innerHTML = "";
        colR.innerHTML = "";
        shuffle([...chosen]).forEach(item => colL.appendChild(makeCell(item, "left")));
        shuffle([...chosen]).forEach(item => colR.appendChild(makeCell(item, "right")));
        lockBoard = false;
    }

    newRound();
}
