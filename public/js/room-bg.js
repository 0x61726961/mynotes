// room-bg.js — Generative room/wall background module (seeded, striking, theme-based)
// Performance-optimized: cached layers + 15fps + DPR cap
//
(function () {
  "use strict";

  const DPR_CAP = 1.5;
  const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const TARGET_FPS = REDUCED_MOTION ? 10 : 15;
  const FRAME_MS = 1000 / TARGET_FPS;
  const MOTION_SCALE = REDUCED_MOTION ? 0.5 : 1;

  // Motion tuning (lean + noticeable)
  const PARALLAX_STRENGTH = 10; // pixels
  const PARALLAX_LERP = 0.06;
  const DRIFT_AMPLITUDE = 5; // pixels
  const MOTION_OVERLAY_ALPHA = 0.26;

  // === PRNG (mulberry32-ish via int hash) ===
  function createPRNG(seedString) {
    let h = 0;
    for (let i = 0; i < seedString.length; i++) {
      h = (Math.imul(31, h) + seedString.charCodeAt(i)) | 0;
    }
    return function () {
      h |= 0;
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function hsla(h, s, l, a) {
    return `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${clamp01(a).toFixed(3)})`;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // === Sharp, DPR-correct resize ===
  function resizeCanvasToDisplaySize(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const rect = canvas.getBoundingClientRect();
    const displayWidth = Math.max(1, Math.round(rect.width));
    const displayHeight = Math.max(1, Math.round(rect.height));

    const needResize = canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr;
    if (needResize) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    // Draw in CSS pixels (crisp lines)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: displayWidth, height: displayHeight };
  }

  // === THEME + PALETTE ===
  function pickTheme(rand) {
    const themes = [
      {
        name: "museum-plaster",
        hueBias: 28,
        hueSpread: 18,
        sat: [10, 28],
        light: [78, 92],
        accentSat: [25, 45],
        accentLight: [35, 60],
        baseMode: "plaster",
        patternSet: ["plasterClouds", "rosettes", "hexTiles", "chevrons"],
        motion: 0.5,
      },
      {
        name: "dark-gallery",
        hueBias: 220,
        hueSpread: 80,
        sat: [18, 40],
        light: [10, 22],
        accentSat: [55, 80],
        accentLight: [45, 70],
        baseMode: "darkVignette",
        patternSet: ["nebula", "starfield", "constellation", "interference"],
        motion: 0.75,
      },
      {
        name: "felt-studio",
        hueBias: 145,
        hueSpread: 70,
        sat: [20, 45],
        light: [18, 32],
        accentSat: [35, 65],
        accentLight: [40, 65],
        baseMode: "felt",
        patternSet: ["fibers", "isoGrid", "topo", "dots"],
        motion: 0.55,
      },
      {
        name: "cool-wallpaper",
        hueBias: 305,
        hueSpread: 140,
        sat: [22, 55],
        light: [58, 80],
        accentSat: [45, 75],
        accentLight: [30, 55],
        baseMode: "paperGradient",
        patternSet: ["chevrons", "rosettes", "hexTiles", "rays"],
        motion: 0.6,
      },
      {
        name: "bright-studio-paper",
        hueBias: 40,
        hueSpread: 220,
        sat: [8, 28],
        light: [86, 96],
        accentSat: [35, 70],
        accentLight: [30, 55],
        baseMode: "paperGradient",
        patternSet: ["blueprintGrid", "isoGrid", "fibers", "dots"],
        motion: 0.45,
      },
      {
        name: "blueprint-room",
        hueBias: 200,
        hueSpread: 60,
        sat: [20, 45],
        light: [48, 65],
        accentSat: [60, 85],
        accentLight: [45, 70],
        baseMode: "paperGradient",
        patternSet: ["blueprintGrid", "isoGrid", "interference", "constellation"],
        motion: 0.5,
      },
      {
        name: "op-art",
        hueBias: 260,
        hueSpread: 120,
        sat: [25, 60],
        light: [50, 75],
        accentSat: [60, 85],
        accentLight: [35, 60],
        baseMode: "paperGradient",
        patternSet: ["interference", "chevrons", "hexTiles", "rays"],
        motion: 0.65,
      },
      {
        name: "midnight-aurora",
        hueBias: 190,
        hueSpread: 120,
        sat: [20, 55],
        light: [10, 22],
        accentSat: [60, 90],
        accentLight: [50, 70],
        baseMode: "darkVignette",
        patternSet: ["nebula", "rays", "starfield", "topo"],
        motion: 0.8,
      },
    ];

    return themes[Math.floor(rand() * themes.length)];
  }

  // === HUE BIASING (playful + avoid earthy) ===
  const PREFERRED_HUES = [195, 215, 235, 270, 305, 330, 350, 15, 25, 160, 175]; // teal/blue/purple/pink/peach/mint
  const EARTHY_RANGES = [
    { min: 25, max: 70 }, // browns/yellows/ochres
    { min: 70, max: 120 }, // olive/muddy greens
  ];

  function isEarthy(h) {
    for (let i = 0; i < EARTHY_RANGES.length; i++) {
      const r = EARTHY_RANGES[i];
      if (h >= r.min && h <= r.max) return true;
    }
    return false;
  }

  function pickPreferredHue(rand) {
    const center = PREFERRED_HUES[Math.floor(rand() * PREFERRED_HUES.length)];
    let h = (center + (rand() - 0.5) * 24 + 360) % 360;
    if (isEarthy(h)) h = (h + 60 + rand() * 40) % 360;
    return h;
  }

  function generatePalette(rand, theme) {
    // Base hue: favor preferred playful hues, still theme-biased
    let hue = pickPreferredHue(rand);

    // mix with theme hueBias to keep variety, but mostly preferred
    const themeHue = (theme.hueBias + (rand() - 0.5) * theme.hueSpread * 2 + 360) % 360;
    hue = (0.7 * hue + 0.3 * themeHue + 360) % 360;

    // avoid earthy after mix
    if (isEarthy(hue)) hue = (hue + 80 + rand() * 40) % 360;

    const sat = lerp(theme.sat[0], theme.sat[1], rand());
    const light = lerp(theme.light[0], theme.light[1], rand());

    // Accents: medium bold, with occasional monochrome
    let accentHue = 0;
    if (rand() < 0.18) {
      accentHue = (hue + (rand() - 0.5) * 8 + 360) % 360;
    } else {
      const dir = rand() < 0.5 ? -1 : 1;
      accentHue = (hue + dir * (18 + rand() * 90) + 360) % 360;
    }

    const accentSat = lerp(theme.accentSat[0], theme.accentSat[1], rand());
    const accentLight = lerp(theme.accentLight[0], theme.accentLight[1], rand());

    const shades = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const l = lerp(light - 18, light + 6, t);
      const s = sat + (rand() - 0.5) * 8;
      shades.push(hsla(hue, s, l, 1));
    }

    const accent = hsla(accentHue, accentSat, accentLight, 1);
    const ink = hsla((hue + 180) % 360, sat + 8, Math.max(8, light - 55), 1);

    return { hue, shades, accent, ink };
  }

  // === BASE ===
  function fillBase(ctx, w, h, rand, theme, palette, time) {
    const t = time * 0.00025;
    const driftX = Math.sin(t) * 0.12;
    const driftY = Math.cos(t * 0.9) * 0.12;

    const gx0 = w * (0.2 + driftX);
    const gy0 = h * (0.15 + driftY);
    const gx1 = w * (0.85 - driftX);
    const gy1 = h * (0.9 - driftY);

    const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);

    if (theme.baseMode === "darkVignette") {
      grad.addColorStop(0, palette.shades[1]);
      grad.addColorStop(0.55, palette.shades[0]);
      grad.addColorStop(1, hsla(palette.hue, 28, 8, 1));
    } else if (theme.baseMode === "felt") {
      grad.addColorStop(0, palette.shades[2]);
      grad.addColorStop(0.6, palette.shades[1]);
      grad.addColorStop(1, palette.shades[0]);
    } else if (theme.baseMode === "plaster") {
      grad.addColorStop(0, palette.shades[4]);
      grad.addColorStop(0.5, palette.shades[3]);
      grad.addColorStop(1, palette.shades[2]);
    } else {
      grad.addColorStop(0, palette.shades[4]);
      grad.addColorStop(0.55, palette.shades[3]);
      grad.addColorStop(1, palette.shades[2]);
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // vignette
    const vx = w * (0.5 + Math.sin(time * 0.00008) * 0.03);
    const vy = h * (0.45 + Math.cos(time * 0.00009) * 0.03);
    const vr = Math.max(w, h) * 0.72;

    const vign = ctx.createRadialGradient(vx, vy, vr * 0.12, vx, vy, vr);
    const vignStrength = theme.baseMode === "darkVignette" ? 0.72 : 0.4;
    vign.addColorStop(0, "rgba(0,0,0,0)");
    vign.addColorStop(1, `rgba(0,0,0,${vignStrength})`);

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    addGrain(ctx, w, h, rand, theme);
  }

  function addGrain(ctx, w, h, rand, theme) {
    const density = theme.baseMode === "darkVignette" ? 1 / 1200 : 1 / 1600;
    const count = Math.floor(w * h * density);

    ctx.save();
    ctx.globalAlpha = theme.baseMode === "darkVignette" ? 0.12 : 0.07;
    ctx.globalCompositeOperation = "overlay";

    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = rand() < 0.85 ? 0.6 : 1.2;
      const v = 120 + rand() * 80;
      ctx.fillStyle = `rgba(${v.toFixed(0)},${v.toFixed(0)},${v.toFixed(0)},1)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // === PATTERNS ===
  function drawFibers(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.42 * strength;

    const fiberCount = Math.floor((w * h) / 62000) + 40;
    for (let i = 0; i < fiberCount; i++) {
      const x = rand() * w;
      const y = rand() * h;

      const len = 90 + rand() * 240;
      const angle = rand() * Math.PI * 2;

      const thickness = 0.6 + rand() * 1.5;
      const color = rand() < 0.16 ? palette.accent : palette.shades[Math.floor(rand() * palette.shades.length)];

      const drift = Math.sin(time * 0.00035 + i * 0.7) * (6 + rand() * 10);

      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const px = -dy;
      const py = dx;

      const curl = (rand() - 0.5) * 0.9;

      const x0 = x;
      const y0 = y;
      const x3 = x + dx * len;
      const y3 = y + dy * len;

      const x1 = x + dx * (len * 0.33) + px * (curl * 40 + drift);
      const y1 = y + dy * (len * 0.33) + py * (curl * 40 + drift);
      const x2 = x + dx * (len * 0.66) - px * (curl * 40 - drift * 0.6);
      const y2 = y + dy * (len * 0.66) - py * (curl * 40 - drift * 0.6);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    ctx.globalAlpha = 0.24 * strength;
    const speckCount = Math.floor((w * h) / 8000);
    for (let s = 0; s < speckCount; s++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 0.6 + rand() * 1.6;
      const color = rand() < 0.1 ? palette.accent : palette.shades[Math.floor(rand() * palette.shades.length)];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBlobs(ctx, w, h, rand, palette, time, strength = 1) {
    const count = 5 + Math.floor(rand() * 4);

    ctx.save();
    ctx.globalAlpha = 0.72 * strength;
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < count; i++) {
      const cx = rand() * w;
      const cy = rand() * h;

      const baseRadius = 45 + rand() * 90;
      const points = 12 + Math.floor(rand() * 8);

      const fillColor = rand() < 0.22 ? palette.accent : palette.shades[2 + Math.floor(rand() * 3)];

      const pts = [];
      for (let p = 0; p < points; p++) {
        const a = (p / points) * Math.PI * 2;
        const wobble =
          Math.sin(time * 0.00032 + i * 1.7 + p * 0.85) * (5 + rand() * 6) +
          Math.sin(time * 0.00018 + i * 0.9 + p * 1.25) * (2 + rand() * 4);
        const r = baseRadius + rand() * 26 + wobble;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }

      ctx.beginPath();
      const last = pts[pts.length - 1];
      const first = pts[0];
      ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

      for (let p = 0; p < pts.length; p++) {
        const curr = pts[p];
        const next = pts[(p + 1) % pts.length];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }

      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    ctx.restore();
  }

  function drawTopo(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.5 * strength;

    const layers = 6 + Math.floor(rand() * 5);
    const spacing = 22 + rand() * 20;

    const baseY = h * (0.15 + rand() * 0.25);
    const ampBase = 18 + rand() * 24;
    const freqBase = 0.002 + rand() * 0.004;

    for (let i = 0; i < layers; i++) {
      const y0 = baseY + i * spacing;
      const amp = ampBase * (0.9 + rand() * 0.5);
      const freq = freqBase * (0.85 + rand() * 0.45);
      const phase = time * 0.00032 + rand() * Math.PI * 2;

      const stroke = i % 3 === 0 ? palette.accent : palette.shades[1 + (i % 3)];

      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= w; x += 6) {
        const y =
          y0 +
          Math.sin(x * freq + phase) * amp +
          Math.sin(x * freq * 1.9 + phase * 0.8) * (amp * 0.25);
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.1 + rand() * 2.0;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawRosettes(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.5 * strength;

    const cell = 120 + rand() * 90;
    const jitter = 12 + rand() * 18;

    const ox = (rand() * cell) | 0;
    const oy = (rand() * cell) | 0;

    for (let y = -cell; y < h + cell; y += cell) {
      for (let x = -cell; x < w + cell; x += cell) {
        const cx = x + ox + (rand() - 0.5) * jitter;
        const cy = y + oy + (rand() - 0.5) * jitter;

        const petals = 6 + Math.floor(rand() * 6);
        const radius = cell * (0.18 + rand() * 0.16);
        const spin = time * 0.00012 + rand() * Math.PI * 2;

        const stroke = rand() < 0.25 ? palette.accent : palette.ink;

        ctx.beginPath();
        for (let p = 0; p < petals; p++) {
          const a = (p / petals) * Math.PI * 2 + spin;
          const px = cx + Math.cos(a) * radius;
          const py = cy + Math.sin(a) * radius;
          ctx.moveTo(cx, cy);
          ctx.lineTo(px, py);
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1 + rand() * 2.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 1.5 + rand() * 2.0, 0, Math.PI * 2);
        ctx.fillStyle = palette.accent;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawConstellation(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.6 * strength;

    const n = 24 + Math.floor(rand() * 22);
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({ x: rand() * w, y: rand() * h, r: 1.2 + rand() * 2.6 });
    }

    ctx.globalAlpha = 0.18 * strength;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.0;

    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const links = 1 + (rand() < 0.55 ? 1 : 0);
      for (let k = 0; k < links; k++) {
        const j = (i + 1 + Math.floor(rand() * 7)) % n;
        const b = pts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > (Math.min(w, h) * 0.28) ** 2) continue;

        const wob = Math.sin(time * 0.00035 + i * 0.7 + k) * 0.7;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x + wob, b.y - wob);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 0.75 * strength;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = i % 5 === 0 ? palette.accent : palette.shades[4];
      ctx.fill();
    }

    ctx.restore();
  }

  function drawRays(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.26 * strength;
    ctx.globalCompositeOperation = "screen";

    const cx = w * (0.25 + rand() * 0.5);
    const cy = h * (0.2 + rand() * 0.35);
    const rays = 20 + Math.floor(rand() * 26);

    const baseAngle = rand() * Math.PI * 2;
    const spin = time * 0.00005;

    for (let i = 0; i < rays; i++) {
      const a = baseAngle + (i / rays) * Math.PI * 2 + spin;
      const len = Math.max(w, h) * (0.7 + rand() * 0.6);
      const spread = 0.02 + rand() * 0.03;

      const x1 = cx + Math.cos(a - spread) * len;
      const y1 = cy + Math.sin(a - spread) * len;
      const x2 = cx + Math.cos(a + spread) * len;
      const y2 = cy + Math.sin(a + spread) * len;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.closePath();

      ctx.fillStyle = i % 6 === 0 ? palette.accent : palette.shades[3];
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPlasterClouds(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.2 * strength;
    ctx.globalCompositeOperation = "multiply";

    const blobs = 16 + Math.floor(rand() * 18);
    for (let i = 0; i < blobs; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const r = 80 + rand() * 220;
      const wob = Math.sin(time * 0.0002 + i * 0.9) * 6;

      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx + wob, cy - wob, r);
      g.addColorStop(0, palette.shades[4]);
      g.addColorStop(1, palette.ink);

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawDots(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.42 * strength;

    const clusters = 4 + Math.floor(rand() * 4);
    for (let c = 0; c < clusters; c++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const clusterSize = 70 + rand() * 130;
      const dotCount = 16 + Math.floor(rand() * 22);

      const color = rand() < 0.25 ? palette.accent : palette.shades[3];

      for (let i = 0; i < dotCount; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = rand() * clusterSize;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;

        const radius = 1.6 + rand() * 4.4;
        const pulse = 1 + Math.sin(time * 0.001 + i * 0.3) * 0.12;

        ctx.beginPath();
        ctx.arc(x, y, radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // === NEW PATTERNS (Geometric / Cosmic / Drafting) ===
  function drawHexTiles(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.45 * strength;

    const size = 28 + rand() * 26;
    const hStep = size * 1.5;
    const vStep = Math.sqrt(3) * size * 0.5;
    const ox = rand() * hStep;
    const oy = rand() * vStep;

    for (let y = -vStep; y < h + vStep; y += vStep) {
      const rowOffset = (Math.floor(y / vStep) % 2) * (hStep * 0.5);
      for (let x = -hStep; x < w + hStep; x += hStep) {
        const cx = x + ox + rowOffset;
        const cy = y + oy;

        const wob = Math.sin(time * 0.00025 + (x + y) * 0.0005) * 0.6;
        const r = size + wob;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();

        const stroke = rand() < 0.15 ? palette.accent : palette.shades[2];
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.9 + rand() * 1.4;
        ctx.stroke();

        if (rand() < 0.08) {
          ctx.fillStyle = rand() < 0.5 ? palette.shades[3] : palette.accent;
          ctx.globalAlpha = 0.12 * strength;
          ctx.fill();
          ctx.globalAlpha = 0.45 * strength;
        }
      }
    }

    ctx.restore();
  }

  function drawChevrons(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.4 * strength;

    const band = 26 + rand() * 28;
    const amp = 10 + rand() * 14;

    for (let y = -band; y < h + band; y += band) {
      const phase = time * 0.00018 + y * 0.004;
      ctx.beginPath();
      let x = -band;
      let dir = 1;
      ctx.moveTo(x, y + Math.sin(phase) * 0.6);

      while (x < w + band) {
        x += band;
        const yy = y + dir * amp + Math.sin(phase + x * 0.01) * 1.4;
        ctx.lineTo(x, yy);
        dir *= -1;
      }

      ctx.strokeStyle = rand() < 0.2 ? palette.accent : palette.shades[2];
      ctx.lineWidth = 1.1 + rand() * 1.8;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawIsoGrid(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.35 * strength;

    const spacing = 26 + rand() * 24;
    const angle = Math.PI / 3; // 60°
    const dx = Math.cos(angle) * spacing;
    const dy = Math.sin(angle) * spacing;

    // horizontal-ish lines
    for (let y = -h; y < h * 2; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(w * 2, y);
      ctx.strokeStyle = palette.shades[2];
      ctx.lineWidth = 0.8 + rand() * 1.0;
      ctx.stroke();
    }

    // 60°
    for (let x = -w; x < w * 2; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, -h);
      ctx.lineTo(x + dx * 3, -h + dy * 3);
      ctx.lineTo(x + dx * 8, -h + dy * 8);
      ctx.lineTo(x + dx * 12, -h + dy * 12);
      ctx.strokeStyle = rand() < 0.12 ? palette.accent : palette.shades[3];
      ctx.lineWidth = 0.8 + rand() * 1.0;
      ctx.stroke();
    }

    // 120°
    for (let x = -w; x < w * 2; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, -h);
      ctx.lineTo(x - dx * 3, -h + dy * 3);
      ctx.lineTo(x - dx * 8, -h + dy * 8);
      ctx.lineTo(x - dx * 12, -h + dy * 12);
      ctx.strokeStyle = palette.shades[1];
      ctx.lineWidth = 0.8 + rand() * 1.0;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBlueprintGrid(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.35 * strength;
    ctx.globalCompositeOperation = "screen";

    const fine = 18 + rand() * 12;
    const majorEvery = 4;

    // fine grid
    ctx.strokeStyle = palette.shades[3];
    ctx.lineWidth = 0.6;
    for (let x = 0; x <= w; x += fine) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += fine) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // major grid
    ctx.globalAlpha = 0.45 * strength;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.1;
    for (let x = 0; x <= w; x += fine * majorEvery) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += fine * majorEvery) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // nodes
    ctx.globalAlpha = 0.55 * strength;
    const nodeCount = Math.floor((w * h) / 120000) + 12;
    for (let i = 0; i < nodeCount; i++) {
      const x = rand() * w;
      const y = rand() * h;
      ctx.beginPath();
      ctx.arc(x, y, 2 + rand() * 3, 0, Math.PI * 2);
      ctx.fillStyle = palette.accent;
      ctx.fill();

      if (rand() < 0.35) {
        ctx.globalAlpha = 0.25 * strength;
        ctx.beginPath();
        ctx.arc(x, y, 9 + rand() * 12, 0, Math.PI * 2);
        ctx.strokeStyle = palette.shades[2];
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 0.55 * strength;
      }
    }

    ctx.restore();
  }

  function drawStarfield(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.65 * strength;

    const count = Math.floor((w * h) / 16000);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = rand() < 0.7 ? 0.7 + rand() * 1.4 : 1.6 + rand() * 2.2;
      const tw = 1 + Math.sin(time * 0.001 + i * 0.3) * 0.25;

      ctx.beginPath();
      ctx.arc(x, y, r * tw, 0, Math.PI * 2);
      ctx.fillStyle = rand() < 0.2 ? palette.accent : palette.shades[4];
      ctx.fill();
    }

    ctx.restore();
  }

  function drawNebula(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.5 * strength;
    ctx.globalCompositeOperation = "screen";

    const blobs = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < blobs; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const r = 120 + rand() * 240;
      const drift = Math.sin(time * 0.0002 + i) * 6;

      const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx + drift, cy - drift, r);
      g.addColorStop(0, palette.accent);
      g.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // soft glow sweep
    ctx.globalAlpha = 0.18 * strength;
    const sweep = ctx.createLinearGradient(0, 0, w, h);
    sweep.addColorStop(0, "rgba(0,0,0,0)");
    sweep.addColorStop(0.5, palette.accent);
    sweep.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  function drawInterference(ctx, w, h, rand, palette, time, strength = 1) {
    ctx.save();
    ctx.globalAlpha = 0.38 * strength;

    const bands = 10 + Math.floor(rand() * 8);
    const amp = 14 + rand() * 18;
    const freqA = 0.003 + rand() * 0.003;
    const freqB = 0.005 + rand() * 0.005;

    for (let i = 0; i < bands; i++) {
      const y0 = (i / bands) * h;
      const phase = time * 0.0003 + i * 0.8;

      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= w; x += 8) {
        const y =
          y0 +
          Math.sin(x * freqA + phase) * amp +
          Math.sin(x * freqB + phase * 0.9) * (amp * 0.5);
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = i % 3 === 0 ? palette.accent : palette.shades[2];
      ctx.lineWidth = 1 + rand() * 1.6;
      ctx.stroke();
    }

    ctx.restore();
  }

  const PATTERN_IMPL = {
    fibers: drawFibers,
    blobs: drawBlobs,
    topo: drawTopo,
    rosettes: drawRosettes,
    constellation: drawConstellation,
    rays: drawRays,
    plasterClouds: drawPlasterClouds,
    dots: drawDots,
    hexTiles: drawHexTiles,
    chevrons: drawChevrons,
    isoGrid: drawIsoGrid,
    blueprintGrid: drawBlueprintGrid,
    starfield: drawStarfield,
    nebula: drawNebula,
    interference: drawInterference,
  };

  function buildPatternForTheme(rand, theme) {
    const set = theme.patternSet.slice();
    for (let i = set.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      [set[i], set[j]] = [set[j], set[i]];
    }
    const a = set[0];
    const b = set[1] || set[0];
    return [
      { key: a, strength: 0.8 },
      { key: b, strength: 0.55 },
    ];
  }

  function pickMotionPattern(theme, layers) {
    const preferred = ["interference", "rays", "nebula", "topo", "chevrons", "constellation", "starfield"];
    for (let i = 0; i < preferred.length; i++) {
      const key = preferred[i];
      if (theme.patternSet.includes(key)) return key;
    }
    return layers[0].key;
  }

  function drawLightSweep(ctx, w, h, time) {
    const t = time * 0.00012;
    const x = w * (0.2 + Math.sin(t) * 0.15);
    const y = h * (0.3 + Math.cos(t * 0.9) * 0.12);

    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.8);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(1, "rgba(255,255,255,0)");

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // === Main Renderer ===
  function startRoomBackground({ canvas, seedString } = {}) {
    if (!canvas) throw new Error("RoomBackground.startRoomBackground: missing canvas");
    if (!seedString) throw new Error("RoomBackground.startRoomBackground: missing seedString");

    const ctx = canvas.getContext("2d");

    const SEED_SALT = "get out of my head charles";
    let activeSeedString = String(seedString) + "|" + SEED_SALT;

    let theme = null;
    let palette = null;
    let layers = null;
    let motionKey = null;
    let seedBase = null;
    let seedA = null;
    let seedB = null;
    let seedMotion = null;

    let cacheBase = null;
    let cachePattern = null;
    let cacheMotion = null;
    let cacheW = 0,
      cacheH = 0;

    // Mouse/parallax state
    let mouseTarget = { x: 0, y: 0 };
    let mousePos = { x: 0, y: 0 };
    let moveHandler = null;
    let leaveHandler = null;

    function rebuildFromSeed(newSeed) {
      activeSeedString = String(newSeed);

      const initRand = createPRNG(activeSeedString);
      theme = pickTheme(initRand);
      palette = generatePalette(initRand, theme);
      layers = buildPatternForTheme(initRand, theme);
      motionKey = pickMotionPattern(theme, layers);

      seedBase = activeSeedString + "|bg|";
      seedA = seedBase + layers[0].key;
      seedB = seedBase + layers[1].key;
      seedMotion = seedBase + "motion|" + motionKey;

      cacheBase = null;
      cachePattern = null;
      cacheMotion = null;
    }

    function ensureCache(w, h) {
      if (cacheBase && cacheW === w && cacheH === h) return;

      cacheW = w;
      cacheH = h;

      cacheBase = document.createElement("canvas");
      cachePattern = document.createElement("canvas");
      cacheMotion = document.createElement("canvas");
      cacheBase.width = w;
      cacheBase.height = h;
      cachePattern.width = w;
      cachePattern.height = h;
      cacheMotion.width = w;
      cacheMotion.height = h;

      const bctx = cacheBase.getContext("2d");
      const pctx = cachePattern.getContext("2d");
      const mctx = cacheMotion.getContext("2d");

      // static base
      fillBase(bctx, w, h, createPRNG(seedBase + "grain"), theme, palette, 0);

      // static patterns (draw once)
      const randA = createPRNG(seedA);
      const randB = createPRNG(seedB);

      const pA = PATTERN_IMPL[layers[0].key] || PATTERN_IMPL.fibers;
      const pB = PATTERN_IMPL[layers[1].key] || PATTERN_IMPL.blobs;

      pA(pctx, w, h, randA, palette, 0, layers[0].strength * 0.7);
      pB(pctx, w, h, randB, palette, 0, layers[1].strength * 0.5);

      // contrast pop baked in
      pctx.save();
      pctx.globalAlpha = theme.baseMode === "darkVignette" ? 0.1 : 0.06;
      pctx.globalCompositeOperation = "overlay";
      pctx.fillStyle = palette.accent;
      pctx.fillRect(0, 0, w, h);
      pctx.restore();

      // motion overlay (single pattern, cached)
      const randM = createPRNG(seedMotion);
      const pM = PATTERN_IMPL[motionKey] || PATTERN_IMPL.interference;
      pM(mctx, w, h, randM, palette, 0, 0.6);

      mctx.save();
      mctx.globalCompositeOperation = "overlay";
      mctx.globalAlpha = 0.22;
      mctx.fillStyle = palette.accent;
      mctx.fillRect(0, 0, w, h);
      mctx.restore();
    }

    rebuildFromSeed(activeSeedString);

    // Mouse parallax (cheap)
    moveHandler = (e) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      mouseTarget.x = (nx - 0.5) * 2;
      mouseTarget.y = (ny - 0.5) * 2;
    };
    leaveHandler = () => {
      mouseTarget.x = 0;
      mouseTarget.y = 0;
    };

    canvas.addEventListener("mousemove", moveHandler, { passive: true });
    canvas.addEventListener("mouseleave", leaveHandler, { passive: true });

    let running = true;
    let isPaused = document.hidden;
    let animationId = null;
    let lastFrame = 0;

    function scheduleNextFrame() {
      if (running && !isPaused) {
        animationId = requestAnimationFrame(draw);
      }
    }

    function draw(time) {
      if (isPaused) return;
      if (time - lastFrame < FRAME_MS) {
        scheduleNextFrame();
        return;
      }
      lastFrame = time;

      const { width: w, height: h } = resizeCanvasToDisplaySize(canvas, ctx);
      ensureCache(w, h);

      // Smooth mouse
      mousePos.x = lerp(mousePos.x, mouseTarget.x, PARALLAX_LERP);
      mousePos.y = lerp(mousePos.y, mouseTarget.y, PARALLAX_LERP);

      const driftX = Math.sin(time * 0.00012) * DRIFT_AMPLITUDE * MOTION_SCALE;
      const driftY = Math.cos(time * 0.00011) * DRIFT_AMPLITUDE * 0.9 * MOTION_SCALE;

      const parallaxX = mousePos.x * PARALLAX_STRENGTH * MOTION_SCALE + driftX;
      const parallaxY = mousePos.y * PARALLAX_STRENGTH * MOTION_SCALE + driftY;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(cacheBase, 0, 0);

      // pattern layer (parallax)
      ctx.save();
      ctx.translate(parallaxX, parallaxY);
      ctx.drawImage(cachePattern, 0, 0);
      ctx.restore();

      // animated overlay (cheap motion + pulse)
      const pulse = (0.16 + Math.sin(time * 0.0008 + 1.1) * 0.12) * (REDUCED_MOTION ? 0.5 : 1);
      const ox = Math.sin(time * 0.00035) * 12 * MOTION_SCALE + parallaxX * 0.35;
      const oy = Math.cos(time * 0.00031) * 12 * MOTION_SCALE + parallaxY * 0.35;

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = clamp01(MOTION_OVERLAY_ALPHA * (REDUCED_MOTION ? 0.6 : 1) + pulse) * (0.9 + theme.motion * 0.2);
      ctx.translate(ox, oy);
      ctx.drawImage(cacheMotion, 0, 0);
      ctx.restore();

      // light sweep
      drawLightSweep(ctx, w, h, time);

      scheduleNextFrame();
    }

    const visibilityHandler = () => {
      isPaused = document.hidden;
      if (isPaused && animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
        return;
      }
      if (!isPaused && running && !animationId) {
        lastFrame = 0;
        scheduleNextFrame();
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);

    function redrawOnce() {
      draw(performance.now());
    }

    function stop() {
      running = false;
      if (animationId) cancelAnimationFrame(animationId);
      document.removeEventListener("visibilitychange", visibilityHandler);
      if (moveHandler) canvas.removeEventListener("mousemove", moveHandler);
      if (leaveHandler) canvas.removeEventListener("mouseleave", leaveHandler);
    }

    scheduleNextFrame();

    return {
      stop,
      redrawOnce,
    };
  }

  window.RoomBackground = { startRoomBackground };
})();
