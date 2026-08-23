(function () {
    const btn = document.getElementById("soundBtn");
    if (!btn) return;
    let muted = sessionStorage.getItem("totMuted") === "1";
    TotAudio.setMuted(muted);
    btn.textContent = muted ? "🔇" : "🔊";
    btn.addEventListener("click", () => {
        muted = !muted;
        sessionStorage.setItem("totMuted", muted ? "1" : "0");
        TotAudio.setMuted(muted);
        btn.textContent = muted ? "🔇" : "🔊";
    });
})();
