(function () {
    const PALETTE = ["#e4572e", "#f9bc60", "#17b978", "#209ce7", "#a55eea", "#ff6b81", "#8d5524", "#001858"];
    const art = document.getElementById("art");
    const paletteEl = document.getElementById("palette");
    let currentColor = PALETTE[0];
    let pictureIndex = 0;

    function buildPalette() {
        paletteEl.innerHTML = "";
        PALETTE.forEach((c, i) => {
            const sw = document.createElement("button");
            sw.className = "swatch" + (i === 0 ? " selected" : "");
            sw.style.background = c;
            sw.addEventListener("click", () => {
                document.querySelectorAll(".swatch").forEach(s => s.classList.remove("selected"));
                sw.classList.add("selected");
                currentColor = c;
                TotAudio.pick();
            });
            paletteEl.appendChild(sw);
        });
    }

    function loadPicture(index) {
        pictureIndex = (index + COLORING_PICTURES.length) % COLORING_PICTURES.length;
        art.innerHTML = COLORING_PICTURES[pictureIndex].svg;
        art.querySelectorAll(".fill-region").forEach(region => {
            region.addEventListener("pointerdown", () => {
                if (region.getAttribute("fill") !== currentColor) {
                    region.setAttribute("fill", currentColor);
                    TotAudio.tap();
                }
            });
        });
    }

    document.getElementById("prevBtn").addEventListener("click", () => { TotAudio.pick(); loadPicture(pictureIndex - 1); });
    document.getElementById("nextBtn").addEventListener("click", () => { TotAudio.pick(); loadPicture(pictureIndex + 1); });
    document.getElementById("clearBtn").addEventListener("click", () => { TotAudio.wrong(); loadPicture(pictureIndex); });

    buildPalette();
    loadPicture(0);
})();
