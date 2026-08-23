document.getElementById("fsBtn")?.addEventListener("click", TotFS.toggle);

const bubblesHost = document.getElementById("bubbles");
if (bubblesHost) {
    const chars = ["🎈", "⭐", "☁️", "🌈", "🦋", "🌸", "🍀"];
    for (let i = 0; i < 10; i++) {
        const s = document.createElement("span");
        s.textContent = chars[i % chars.length];
        s.style.left = Math.random() * 96 + "vw";
        s.style.fontSize = (20 + Math.random() * 34) + "px";
        const dur = 16 + Math.random() * 18;
        s.style.animationDuration = dur + "s";
        s.style.animationDelay = -Math.random() * dur + "s";
        bubblesHost.appendChild(s);
    }
}
