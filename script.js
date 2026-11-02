// Contact links. An empty string shows the icon as "belum diisi" instead of a dead link.
const LINKS = {
  email: "gigihgeraldus@gmail.com", // mailto: is added automatically
  github: "https://github.com/GeraldusGigih",
  instagram: "https://www.instagram.com/geralduswahyudi/",
  linkedin: "https://www.linkedin.com/in/geraldus-wahyudi-388b51324/",
};

const LINK_LABELS = { email: "Email", github: "GitHub", instagram: "Instagram", linkedin: "LinkedIn" };

const root = document.documentElement;
root.classList.add("js");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;

for (const a of document.querySelectorAll("[data-link]")) {
  const key = a.dataset.link;
  const value = LINKS[key];
  if (value) {
    a.href = key === "email" ? `mailto:${value}` : value;
    if (key !== "email") {
      a.target = "_blank";
      a.rel = "noopener";
    }
  } else {
    a.classList.add("is-pending");
    a.setAttribute("role", "link");
    a.setAttribute("aria-disabled", "true");
    a.tabIndex = 0;
    a.dataset.tip = `${LINK_LABELS[key]} belum diisi`;
    a.setAttribute("aria-label", `${LINK_LABELS[key]} (belum diisi)`);
  }
}

/* ---------- Liquid glass ---------- */

// backdrop-filter: url(#svg-filter) only renders in Chromium; other engines keep the CSS blur.
const canRefract = !!window.chrome && CSS.supports("backdrop-filter", "url(#a)");
const svgNS = "http://www.w3.org/2000/svg";
const defs = document.getElementById("glass-defs");

// Encodes a per-pixel offset (R = x, G = y, 128 = none) that bends the backdrop inward
// near the rounded edge and leaves the centre untouched, like a thick lens rim.
function displacementMap(w, h, radius, bezel) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const hw = w / 2, hh = h / 2;
  const r = Math.min(radius, hw, hh);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - hw, dy = y + 0.5 - hh;
      const px = Math.abs(dx) - (hw - r), py = Math.abs(dy) - (hh - r);
      let dist, nx, ny;
      if (px > 0 && py > 0) {
        const len = Math.hypot(px, py);
        dist = r - len;
        nx = px / len;
        ny = py / len;
      } else if (px > py) {
        dist = r - px;
        nx = 1; ny = 0;
      } else {
        dist = r - py;
        nx = 0; ny = 1;
      }
      let ox = 0, oy = 0;
      if (dist > 0 && dist < bezel) {
        const t = 1 - dist / bezel;
        const m = t * t;
        ox = -Math.sign(dx) * nx * m;
        oy = -Math.sign(dy) * ny * m;
      }
      const i = (y * w + x) * 4;
      img.data[i] = 128 + ox * 127;
      img.data[i + 1] = 128 + oy * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

const glassSurfaces = [];
const glassResize = canRefract
  ? new ResizeObserver((entries) => {
      for (const entry of entries) {
        const surface = glassSurfaces.find((s) => s.el === entry.target);
        if (surface) fitGlass(surface);
      }
    })
  : null;

function addGlass(el, { scale = 40, bezel = 20, blur = 2.5 } = {}) {
  const id = `liquid-${glassSurfaces.length}`;
  const surface = { el, id, scale, bezel, blur, size: "" };
  glassSurfaces.push(surface);
  if (!canRefract) return surface;

  const filter = document.createElementNS(svgNS, "filter");
  filter.id = id;
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  filter.innerHTML = `<feImage result="map" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" scale="0"/>`;
  defs.append(filter);
  surface.filter = filter;
  surface.image = filter.querySelector("feImage");
  surface.displace = filter.querySelector("feDisplacementMap");
  glassResize.observe(el);
  return surface;
}

document.querySelectorAll("[data-glass]").forEach((el) => addGlass(el));

function fitGlass(surface) {
  if (!surface.filter) return;
  const w = surface.el.offsetWidth, h = surface.el.offsetHeight;
  if (!w || !h || surface.size === `${w}x${h}`) return;
  surface.size = `${w}x${h}`;
  const radius = parseFloat(getComputedStyle(surface.el).borderTopLeftRadius) || 0;
  for (const node of [surface.filter, surface.image]) {
    node.setAttribute("x", 0);
    node.setAttribute("y", 0);
    node.setAttribute("width", w);
    node.setAttribute("height", h);
  }
  surface.image.setAttribute("href", displacementMap(w, h, radius, surface.bezel));
  surface.el.style.backdropFilter = `url(#${surface.id}) blur(${surface.blur}px) saturate(150%)`;
}

// The rim "settles" into place: displacement springs from flat to its resting strength.
function settleGlass(surface) {
  if (!surface.displace) return;
  if (reduceMotion) {
    surface.displace.setAttribute("scale", surface.scale);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 1200, 1);
    const spring = 1 - Math.exp(-5 * t) * Math.cos(9 * t);
    surface.displace.setAttribute("scale", (surface.scale * spring).toFixed(2));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Pointer: card tilt, highlight, background parallax ---------- */

const cardView = document.getElementById("view-card");
const galleryView = document.getElementById("view-gallery");
const card = cardView.querySelector(".card");

if (finePointer && !reduceMotion) {
  let frame = 0;
  let pointer = null;
  addEventListener("pointermove", (event) => {
    pointer = event;
    if (!frame) frame = requestAnimationFrame(applyPointer);
  }, { passive: true });

  function applyPointer() {
    frame = 0;
    const { clientX: x, clientY: y } = pointer;
    for (const { el } of glassSurfaces) {
      if (el.closest("[hidden]")) continue;
      const box = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${((x - box.left) / box.width) * 100}%`);
      el.style.setProperty("--my", `${((y - box.top) / box.height) * 100}%`);
    }
    if (cardView.hidden) return;
    const nx = x / innerWidth * 2 - 1;
    const ny = y / innerHeight * 2 - 1;
    card.style.setProperty("--rx", `${(-ny * 5).toFixed(2)}deg`);
    card.style.setProperty("--ry", `${(nx * 6).toFixed(2)}deg`);
    galleryView.style.setProperty("--px", `${(-nx * 24).toFixed(1)}px`);
    galleryView.style.setProperty("--py", `${(-ny * 14).toFixed(1)}px`);
  }
}

/* ---------- Card flip ---------- */

const enterLink = card.querySelector(".enter");
const frontFace = card.querySelector(".face-front");
const backFace = card.querySelector(".face-back");
const frontFlip = frontFace.querySelector(".flip");
let flipping = false;

function setSide(side) {
  card.dataset.side = side;
  frontFace.inert = side !== "front";
  backFace.inert = side !== "back";
}

// Turns the card edge-on, swaps faces while it is invisible, then swings the new face in.
async function flipCard() {
  if (flipping) return;
  const next = card.dataset.side === "front" ? "back" : "front";
  const hadFocus = card.contains(document.activeElement);
  const done = () => {
    if (hadFocus) (next === "back" ? enterLink : frontFlip).focus();
  };

  if (reduceMotion) {
    setSide(next);
    done();
    return;
  }

  flipping = true;
  const rx = card.style.getPropertyValue("--rx") || "0deg";
  const ry = card.style.getPropertyValue("--ry") || "0deg";
  const pose = (deg) => ({ transform: `perspective(900px) rotateX(${rx}) rotateY(calc(${ry} + ${deg}deg))` });

  const out = card.animate([pose(0), pose(90)], { duration: 220, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" });
  await out.finished;
  setSide(next);
  const back = card.animate([pose(-90), pose(0)], { duration: 520, easing: "cubic-bezier(0.22, 1.3, 0.36, 1)" });
  out.cancel();
  done();
  await back.finished;
  flipping = false;
}

for (const button of card.querySelectorAll(".flip")) button.addEventListener("click", flipCard);

// Clicking anywhere on the card flips it too, except on its links and buttons.
card.addEventListener("click", (event) => {
  if (!event.target.closest("a, button")) flipCard();
});

/* ---------- Views: card <-> gallery ---------- */

const galleryTitle = document.getElementById("gallery-title");

let transition = null;

// The gallery is always on the page. On the card route it sits blurred behind the card,
// inert so keyboard and screen readers only meet the card.
function applyRoute() {
  const toGallery = location.hash === "#proyek";
  cardView.hidden = toGallery;
  galleryView.inert = !toGallery;
  root.classList.toggle("is-landing", !toGallery);
  if (!toGallery) setSide("front");
  scrollTo(0, 0);
  for (const surface of glassSurfaces) {
    if (surface.el.offsetWidth) {
      fitGlass(surface);
      settleGlass(surface);
    }
  }
}

function render(animate) {
  transition?.skipTransition();
  if ((location.hash === "#proyek") === cardView.hidden) return;

  // Reads the hash when the swap actually runs, so a fast back/forward never leaves the wrong view up.
  const swap = () => {
    if ((location.hash === "#proyek") !== cardView.hidden) applyRoute();
  };
  const focusTarget = () => (cardView.hidden ? galleryTitle : frontFlip).focus({ preventScroll: true });

  if (animate && document.startViewTransition && !reduceMotion) {
    transition = document.startViewTransition(swap);
    transition.updateCallbackDone.then(focusTarget);
    // Chromium aborts the animation in a hidden tab; the swap still runs, so the rejection is harmless.
    transition.ready.catch(() => {});
    transition.finished.finally(() => { transition = null; });
  } else {
    swap();
    if (animate) focusTarget();
  }
}

addEventListener("hashchange", () => render(true));

applyRoute();

/* ---------- Gallery: thumbnails and scroll reveal ---------- */

const relativeLuminance = (r, g, b) => {
  const lin = (c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const darkUnderPill = new WeakMap();

// Samples the bottom-centre strip of a photo, where the pill sits, and reports whether
// white icons would out-contrast dark ones there (the same comparison WCAG uses).
function isDarkUnderPill(img) {
  if (darkUnderPill.has(img)) return darkUnderPill.get(img);
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w) return false;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, w * 0.3, h * 0.82, w * 0.4, h * 0.16, 0, 0, 32, 8);
  const data = ctx.getImageData(0, 0, 32, 8).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += relativeLuminance(data[i], data[i + 1], data[i + 2]);
  const y = sum / (data.length / 4);
  const dark = 1.05 / (y + 0.05) > (y + 0.05) / 0.0561;
  darkUnderPill.set(img, dark);
  return dark;
}

const chevron = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// Swiping is native scroll-snap; the glass pill adds buttons, arrow keys and a position readout.
function buildCarousel(thumb, track) {
  thumb.classList.add("is-carousel");
  const nav = document.createElement("div");
  nav.className = "carousel-nav glass";
  nav.innerHTML = `
    <button class="carousel-step" type="button" aria-label="Foto sebelumnya">${chevron("M15 5l-7 7 7 7")}</button>
    <span class="carousel-dots" aria-hidden="true"></span>
    <button class="carousel-step" type="button" aria-label="Foto berikutnya">${chevron("M9 5l7 7-7 7")}</button>
    <span class="sr-only" aria-live="polite"></span>`;
  thumb.append(nav);

  const [prev, next] = nav.querySelectorAll("button");
  const dots = nav.querySelector(".carousel-dots");
  const status = nav.querySelector("[aria-live]");
  let count = 0;
  let index = 0;
  // Slide a button scroll is heading to; steps count from it, so fast clicks don't fall back mid-scroll.
  let target = null;
  let announce = false;

  const sync = () => {
    index = Math.round(track.scrollLeft / track.clientWidth) || 0;
    if (index === target) target = null;
    [...dots.children].forEach((dot, n) => dot.classList.toggle("is-active", n === index));
    const slide = track.querySelectorAll("img")[index];
    if (slide && !slide.complete) slide.addEventListener("load", sync, { once: true });
    else if (slide) nav.classList.toggle("on-dark", isDarkUnderPill(slide));
    if (announce && target === null) status.textContent = `Foto ${index + 1} dari ${count}`;
  };
  const go = (step) => {
    announce = true;
    target = ((target ?? index) + step + count) % count;
    track.scrollTo({ left: target * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  };

  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  nav.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    go(event.key === "ArrowRight" ? 1 : -1);
  });

  let frame = 0;
  track.addEventListener("scroll", () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync(); });
  }, { passive: true });
  // A swipe can interrupt a button scroll; once scrolling stops, the visible slide is the truth.
  track.addEventListener("scrollend", () => {
    target = null;
    sync();
  });

  const surface = addGlass(nav);
  fitGlass(surface);
  settleGlass(surface);

  return {
    update(total) {
      count = total;
      dots.replaceChildren(...Array.from({ length: total }, () => document.createElement("i")));
      sync();
    },
    remove() {
      nav.remove();
      thumb.classList.remove("is-carousel");
    },
  };
}

function setupThumb(thumb) {
  const track = thumb.querySelector(".thumb-track");
  let carousel = null;

  // A photo that fails to load is dropped, so the carousel only ever counts real slides.
  const refresh = () => {
    const total = track.querySelectorAll("img").length;
    thumb.classList.toggle("is-empty", total === 0);
    if (total > 1) {
      carousel ??= buildCarousel(thumb, track);
      carousel.update(total);
    } else if (carousel) {
      carousel.remove();
      carousel = null;
    }
  };

  for (const img of track.querySelectorAll("img")) {
    const fail = () => {
      img.remove();
      thumb.classList.remove("is-loading");
      refresh();
    };
    if (img.complete) {
      if (!img.naturalWidth) img.remove();
      continue;
    }
    thumb.classList.add("is-loading");
    img.addEventListener("load", () => thumb.classList.remove("is-loading"), { once: true });
    img.addEventListener("error", fail, { once: true });
  }
  refresh();
}

document.querySelectorAll(".thumb").forEach(setupThumb);

/* ---------- Lightbox ---------- */

const lightbox = document.querySelector(".lightbox");
const lbImg = lightbox.querySelector(".lightbox-img");
const lbCaption = lightbox.querySelector(".lightbox-caption");
const lbCount = lightbox.querySelector(".lightbox-count");
const lbNav = lightbox.querySelector(".lightbox-nav");
const lbGlass = addGlass(lbNav);
let lbSlides = [];
let lbIndex = 0;
let lbThumb = null;
let lbClosing = false;

for (const img of document.querySelectorAll(".thumb-track img")) {
  img.tabIndex = 0;
  img.setAttribute("role", "button");
  img.setAttribute("aria-label", `Perbesar foto. ${img.alt}`);
}

// Scales the lightbox photo so it starts (or ends) exactly over the thumbnail it came from.
function zoomBetween(fromRect, toRect, reverse) {
  const frames = [
    { transform: `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px) scale(${fromRect.width / toRect.width}, ${fromRect.height / toRect.height})`, borderRadius: "20px" },
    { transform: "none", borderRadius: "14px" },
  ];
  return lbImg.animate(reverse ? frames.reverse() : frames, {
    duration: reverse ? 380 : 520,
    easing: reverse ? "cubic-bezier(0.4, 0, 0.2, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "forwards",
  });
}

function showSlide(i, direction = 0) {
  lbIndex = (i + lbSlides.length) % lbSlides.length;
  const img = lbSlides[lbIndex];
  lbImg.src = img.currentSrc || img.src;
  lbImg.alt = img.alt;
  lbCaption.textContent = img.alt;
  lbCount.textContent = `${lbIndex + 1} / ${lbSlides.length}`;
  if (direction && !reduceMotion) {
    lbImg.animate(
      [{ opacity: 0.2, transform: `translateX(${direction * 24}px)` }, { opacity: 1, transform: "none" }],
      { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }
}

async function openLightbox(img) {
  if (lightbox.open) return;
  lbThumb = img.closest(".thumb");
  lbSlides = [...lbThumb.querySelectorAll(".thumb-track img")];
  lbNav.hidden = lbSlides.length < 2;
  showSlide(lbSlides.indexOf(img));
  const fromRect = img.getBoundingClientRect();

  root.classList.add("is-lightbox");
  lightbox.showModal();
  if (!lbNav.hidden) {
    fitGlass(lbGlass);
    settleGlass(lbGlass);
  }
  if (reduceMotion) return;
  await lbImg.decode().catch(() => {});
  zoomBetween(fromRect, lbImg.getBoundingClientRect()).finished.then((anim) => anim.cancel());
}

// Leaves the carousel on the photo last viewed, then shrinks back into it.
async function closeLightbox() {
  if (!lightbox.open || lbClosing) return;
  lbClosing = true;
  const track = lbThumb.querySelector(".thumb-track");
  track.scrollTo({ left: lbIndex * track.clientWidth, behavior: "instant" });

  if (!reduceMotion) {
    lightbox.classList.add("is-closing");
    const toRect = lbSlides[lbIndex].getBoundingClientRect();
    await zoomBetween(toRect, lbImg.getBoundingClientRect(), true).finished;
  }
  lightbox.close();
  lbImg.getAnimations().forEach((anim) => anim.cancel());
  lightbox.classList.remove("is-closing");
  root.classList.remove("is-lightbox");
  lbClosing = false;
}

galleryView.addEventListener("click", (event) => {
  const img = event.target.closest(".thumb-track img");
  if (img) openLightbox(img);
});

galleryView.addEventListener("keydown", (event) => {
  const img = event.target.closest(".thumb-track img");
  if (!img || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  openLightbox(img);
});

for (const button of lbNav.querySelectorAll("[data-step]")) {
  button.addEventListener("click", () => {
    const step = Number(button.dataset.step);
    showSlide(lbIndex + step, step);
  });
}

lightbox.querySelector(".lightbox-close").addEventListener("click", closeLightbox);

// Escape and clicks on the dark area close it, but through the animated path.
lightbox.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeLightbox();
});

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

lightbox.addEventListener("keydown", (event) => {
  if (lbNav.hidden || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
  event.preventDefault();
  const step = event.key === "ArrowRight" ? 1 : -1;
  showSlide(lbIndex + step, step);
});

const revealables = document.querySelectorAll("[data-reveal]");
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
  revealables.forEach((el) => io.observe(el));
} else {
  revealables.forEach((el) => el.classList.add("is-in"));
}
