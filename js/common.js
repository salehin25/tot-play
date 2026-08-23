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

function confetti(durationMs = 1600) {
    const canvas = document.createElement("canvas");
    canvas.id = "confetti";
    document.body.appendChild(canvas);
    const ctx2d = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx2d.scale(dpr, dpr);
    const colors = ["#e4572e", "#209ce7", "#17b978", "#a55eea", "#ff6b81", "#f9bc60"];
    const pieces = Array.from({ length: 120 }, () => ({
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
    const pairsCount = config.pairsPerRound || 3;
    let leftItems = [];
    let rightItems = [];
    let selectedLeft = null;
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

    function cellContent(item, side) {
        return config.render ? config.render(item, side) : item.label;
    }

    function makeCell(item, side) {
        const div = document.createElement("div");
        div.className = "cell";
        div.innerHTML = cellContent(item, side);
        div.dataset.id = item.id;
        div.addEventListener("pointerdown", () => onCellTap(div, item, side));
        return div;
    }

    function drawLine(a, b) {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const x1 = ra.right + 6, y1 = ra.top + ra.height / 2;
        const x2 = rb.left - 6, y2 = rb.top + rb.height / 2;
        const mid = (x1 + x2) / 2;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
        path.setAttribute("stroke", "#17b978");
        path.setAttribute("stroke-width", "7");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", "round");
        linesSvg.appendChild(path);
    }

    async function onCellTap(div, item, side) {
        if (lockBoard) return;
        TotAudio.tap();
        if (side === "left") {
            document.querySelectorAll(".cell.selected.left").forEach(c => c.classList.remove("selected"));
            div.classList.add("selected", side);
            selectedLeft = { div, item };
            TotAudio.pick();
            return;
        }
        if (!selectedLeft) return;
        lockBoard = true;
        if (item.id === selectedLeft.item.id) {
            selectedLeft.div.classList.remove("selected");
            selectedLeft.div.classList.add("matched");
            div.classList.add("matched");
            drawLine(selectedLeft.div, div);
            TotAudio.match();
            matchesInRound++;
            selectedLeft = null;
            lockBoard = false;
            if (matchesInRound === pairsCount) roundWon();
        } else {
            TotAudio.wrong();
            div.classList.add("wrong");
            selectedLeft.div.classList.add("wrong");
            setTimeout(() => {
                div.classList.remove("wrong");
                selectedLeft.div.classList.remove("wrong");
                selectedLeft.div.classList.remove("selected");
                selectedLeft = null;
                lockBoard = false;
            }, 450);
        }
    }

    function roundWon() {
        lockBoard = true;
        TotAudio.win();
        confetti(1800);
        bigMessage(config.praise ? config.praise[round % config.praise.length] : "Yay!");
        round++;
        setTimeout(newRound, 2000);
    }

    function newRound() {
        linesSvg.innerHTML = "";
        matchesInRound = 0;
        leftItems = [];
        rightItems = [];
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
