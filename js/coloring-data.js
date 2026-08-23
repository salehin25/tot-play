const COLORING_PICTURES = [
    {
        name: "Fish",
        draw: ctx => {
            out(ctx);
            ellipse(ctx, 370, 330, 250, 165);
            poly(ctx, [[600, 330], [760, 220], [760, 440]]);
            ellipse(ctx, 230, 270, 32, 32);
            ellipse(ctx, 400, 210, 105, 68);
            curve(ctx, 290, 360, 470, 430, 380, 395);
            circleFrame(ctx, 700, 120, 55);
        }
    },
    {
        name: "Butterfly",
        draw: ctx => {
            out(ctx);
            ellipse(ctx, 280, 240, 140, 125);
            ellipse(ctx, 500, 240, 140, 125);
            ellipse(ctx, 315, 450, 110, 100);
            ellipse(ctx, 465, 450, 110, 100);
            roundRect(ctx, 372, 160, 44, 390, 22);
            circleFrame(ctx, 394, 130, 45);
            circleFrame(ctx, 265, 235, 30);
            circleFrame(ctx, 515, 235, 30);
        }
    },
    {
        name: "House",
        draw: ctx => {
            out(ctx);
            rect(ctx, 180, 310, 340, 260);
            poly(ctx, [[145, 310], [350, 135], [555, 310]]);
            rect(ctx, 300, 420, 104, 150, 14);
            rect(ctx, 215, 355, 68, 68, 10);
            rect(ctx, 425, 355, 68, 68, 10);
            rect(ctx, 615, 245, 52, 185, 12);
            circleFrame(ctx, 641, 190, 76);
            ellipse(ctx, 118, 560, 84, 28);
        }
    },
    {
        name: "Car",
        draw: ctx => {
            out(ctx);
            roundRect(ctx, 90, 330, 560, 150, 40);
            roundRect(ctx, 240, 200, 260, 140, 34);
            rect(ctx, 275, 225, 85, 95, 10);
            rect(ctx, 385, 225, 85, 95, 10);
            circleFrame(ctx, 220, 490, 62);
            circleFrame(ctx, 520, 490, 62);
            roundRect(ctx, 650, 380, 80, 60, 18);
        }
    }
];

function out(ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#24315e";
    ctx.lineWidth = 9;
}

function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function circleFrame(ctx, cx, cy, r) {
    ellipse(ctx, cx, cy, r, r);
}

function rect(ctx, x, y, w, h, r = 0) {
    roundRect(ctx, x, y, w, h, r);
}

function roundRect(ctx, x, y, w, h, r = 0) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
}

function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function curve(ctx, x1, y1, x2, y2, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}
