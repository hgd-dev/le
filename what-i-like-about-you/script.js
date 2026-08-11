// Card text lives in compliments.js so it is easy to personalize.
const compliments = window.LE_COMPLIMENTS || [];
const rareCompliments = window.LE_RARE_COMPLIMENTS || [];

const displayMessages = [
  "excellent choice ♡",
  "one good thing, coming up...",
  "hmm... selecting something cute",
  "machine says: definitely true",
  "dispensing affection...",
  "this one is important",
  "okay wait i like this one"
];

const state = {
  remaining: [],
  rareRemaining: [],
  count: Number(localStorage.getItem("like-machine-count") || 0),
  busy: false
};

const vendButton = document.getElementById("vendButton");
const resetButton = document.getElementById("resetButton");
const displayText = document.getElementById("displayText");
const card = document.getElementById("complimentCard");
const cardCopy = document.getElementById("cardCopy");
const cardKicker = document.getElementById("cardKicker");
const cardSticker = document.getElementById("cardSticker");
const tapHint = document.getElementById("tapHint");
const dispensedCount = document.getElementById("dispensedCount");
const machineWindow = document.querySelector(".window");
const slot = document.getElementById("slot");
const cardStage = document.getElementById("cardStage");
const heartLayer = document.getElementById("heartLayer");
const fxLayer = document.getElementById("fxLayer");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

dispensedCount.textContent = state.count;
refillBag();
refillRareBag();

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refillBag() {
  state.remaining = shuffle(compliments);
}
function refillRareBag() {
  state.rareRemaining = shuffle(rareCompliments);
}

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function maybeRare() {
  // About a 1 in 7 chance. Rare pulls do not affect the no-repeat rotation.
  return rareCompliments.length > 0 && Math.random() < 1 / 8;
}

function centerOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function emitHearts(amount = 8) {
  if (reducedMotion.matches) return;
  const buttonRect = vendButton.getBoundingClientRect();
  const originX = buttonRect.left + buttonRect.width / 2;
  const originY = buttonRect.top + buttonRect.height / 2;

  for (let i = 0; i < amount; i++) {
    const heart = document.createElement("span");
    heart.className = "float-heart";
    heart.textContent = Math.random() > .2 ? "♡" : "♥";
    heart.style.setProperty("--x", `${originX + (Math.random() - .5) * 70}px`);
    heart.style.setProperty("--y", `${originY + (Math.random() - .5) * 24}px`);
    heart.style.setProperty("--size", `${14 + Math.random() * 17}px`);
    heart.style.setProperty("--duration", `${850 + Math.random() * 550}ms`);
    heart.style.setProperty("--drift", `${(Math.random() - .5) * 110}px`);
    heart.style.setProperty("--spin", `${(Math.random() - .5) * 70}deg`);
    heartLayer.appendChild(heart);
    window.setTimeout(() => heart.remove(), 1600);
  }
}

function emitGoldenConfetti(origin) {
  if (reducedMotion.matches) return;

  const flash = document.createElement("div");
  flash.className = "legendary-flash";
  fxLayer.appendChild(flash);
  window.setTimeout(() => flash.remove(), 800);

  const palette = ["#f6c744", "#ffe991", "#e7a827", "#fff8d4", "#f3ba36"];
  for (let i = 0; i < 34; i++) {
    const piece = document.createElement("i");
    const angle = Math.random() * Math.PI * 2;
    const distance = 110 + Math.random() * 260;
    const dy = Math.sin(angle) * distance + 110 + Math.random() * 120;
    const dx = Math.cos(angle) * distance;
    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${origin.x}px`);
    piece.style.setProperty("--y", `${origin.y}px`);
    piece.style.setProperty("--dx", `${dx}px`);
    piece.style.setProperty("--dy", `${dy}px`);
    piece.style.setProperty("--w", `${5 + Math.random() * 7}px`);
    piece.style.setProperty("--h", `${8 + Math.random() * 11}px`);
    piece.style.setProperty("--radius", Math.random() > .55 ? "50%" : "2px");
    piece.style.setProperty("--duration", `${950 + Math.random() * 650}ms`);
    piece.style.setProperty("--start-rotate", `${Math.random() * 180}deg`);
    piece.style.setProperty("--end-rotate", `${360 + Math.random() * 720}deg`);
    piece.style.setProperty("--confetti-color", randomOf(palette));
    fxLayer.appendChild(piece);
    window.setTimeout(() => piece.remove(), 1800);
  }
}

function setCard(text, isRare) {
  card.classList.remove("rare", "dispense-in", "swap", "unwrap-in");
  void card.offsetWidth;

  card.hidden = false;
  tapHint.hidden = true;
  cardCopy.textContent = text;
  card.classList.toggle("rare", isRare);
  cardKicker.textContent = isRare ? "LEGENDARY PULL ✦" : "TODAY'S PULL";
  cardSticker.textContent = isRare ? "✦" : "♡";
  card.classList.add("unwrap-in");
}

function createCapsule(isRare) {
  const capsule = document.createElement("div");
  capsule.className = `delivery-capsule${isRare ? " is-rare" : ""}`;
  capsule.innerHTML = `
    <span class="capsule-half capsule-top"></span>
    <span class="capsule-half capsule-bottom"></span>
    <span class="capsule-heart">${isRare ? "✦" : "♡"}</span>
  `;
  fxLayer.appendChild(capsule);
  return capsule;
}

async function animateCapsuleDelivery(isRare, onOpen) {
  if (reducedMotion.matches) {
    const target = centerOf(cardStage);
    onOpen(target);
    return;
  }

  const start = centerOf(machineWindow);
  const slotPoint = centerOf(slot);
  const capsule = createCapsule(isRare);
  const mobileLayout = window.matchMedia("(max-width: 790px)").matches;

  capsule.style.left = `${start.x}px`;
  capsule.style.top = `${start.y}px`;

  try {
    const drop = capsule.animate([
      { left: `${start.x}px`, top: `${start.y - 22}px`, transform: "translate(-50%, -50%) scale(.84) rotate(-10deg)" },
      { offset: .72, left: `${slotPoint.x}px`, top: `${slotPoint.y - 4}px`, transform: "translate(-50%, -50%) scale(1) rotate(12deg)" },
      { left: `${slotPoint.x}px`, top: `${slotPoint.y + 3}px`, transform: "translate(-50%, -50%) scale(.94) rotate(4deg)" }
    ], { duration: 480, easing: "cubic-bezier(.25,.8,.25,1)", fill: "forwards" });
    await drop.finished;

    let target;

    if (mobileLayout) {
      const tuck = capsule.animate([
        { opacity: 1, transform: "translate(-50%, -50%) scale(.94) rotate(4deg)" },
        { opacity: 0, transform: "translate(-50%, -25%) scale(.55) rotate(18deg)" }
      ], { duration: 150, easing: "ease-in", fill: "forwards" });
      await tuck.finished;

      cardStage.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise(resolve => window.setTimeout(resolve, 360));
      target = centerOf(cardStage);

      capsule.getAnimations().forEach(animation => animation.cancel());
      capsule.style.opacity = "1";
      capsule.style.left = `${target.x}px`;
      capsule.style.top = `${Math.max(38, target.y - 125)}px`;
      capsule.style.transform = "translate(-50%, -50%) scale(.72) rotate(-8deg)";

      const arrive = capsule.animate([
        { opacity: .25, left: `${target.x}px`, top: `${Math.max(38, target.y - 125)}px`, transform: "translate(-50%, -50%) scale(.72) rotate(-8deg)" },
        { opacity: 1, left: `${target.x}px`, top: `${target.y + 5}px`, transform: "translate(-50%, -50%) scale(1.08) rotate(3deg)" },
        { opacity: 1, left: `${target.x}px`, top: `${target.y}px`, transform: "translate(-50%, -50%) scale(1.02) rotate(0deg)" }
      ], { duration: 380, easing: "cubic-bezier(.2,.82,.25,1)", fill: "forwards" });
      await arrive.finished;
    } else {
      target = centerOf(cardStage);
      const travel = capsule.animate([
        { left: `${slotPoint.x}px`, top: `${slotPoint.y + 3}px`, transform: "translate(-50%, -50%) scale(.94) rotate(4deg)" },
        { offset: .48, left: `${(slotPoint.x + target.x) / 2}px`, top: `${Math.min(slotPoint.y, target.y) - 74}px`, transform: "translate(-50%, -50%) scale(1.06) rotate(-9deg)" },
        { left: `${target.x}px`, top: `${target.y}px`, transform: "translate(-50%, -50%) scale(1.12) rotate(0deg)" }
      ], { duration: 430, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" });
      await travel.finished;
    }

    capsule.classList.add("opening");
    if (isRare) emitGoldenConfetti(target);
    window.setTimeout(() => onOpen(target), 105);
    await new Promise(resolve => window.setTimeout(resolve, 360));
  } finally {
    capsule.remove();
  }
}

function vend() {
  if (state.busy) return;
  state.busy = true;

  vendButton.classList.add("dispensing", "is-pressed");
  machineWindow.classList.add("vending");
  displayText.textContent = randomOf(displayMessages);

  if (navigator.vibrate) navigator.vibrate(18);

  const isRare = maybeRare();
  if (!card.hidden) card.hidden = true;
  let text;
  if (isRare) {
    if (!state.rareRemaining.length) refillRareBag();
    text = state.rareRemaining.pop();
  } else {
    if (!state.remaining.length) refillBag();
    text = state.remaining.pop();
  }

  animateCapsuleDelivery(isRare, () => {
    setCard(text, isRare);
    state.count += 1;
    dispensedCount.textContent = state.count;
    localStorage.setItem("like-machine-count", String(state.count));
    emitHearts(isRare ? 18 : 7);
    if (isRare && navigator.vibrate) navigator.vibrate([30, 35, 60]);
  }).finally(() => {
    vendButton.classList.remove("dispensing", "is-pressed");
    machineWindow.classList.remove("vending");
    state.busy = false;
  });
}

function resetRotation() {
  refillBag();
  refillRareBag();
  displayText.textContent = "refilled with good things ♡";
  resetButton.animate(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: 450, easing: "ease-out" }
  );
}

vendButton.addEventListener("click", vend);
resetButton.addEventListener("click", resetRotation);
