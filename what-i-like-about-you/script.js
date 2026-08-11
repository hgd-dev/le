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
  count: Number(localStorage.getItem("like-machine-count") || 0),
  firstDispense: true,
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
const heartLayer = document.getElementById("heartLayer");

dispensedCount.textContent = state.count;
refillBag();

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

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function maybeRare() {
  // About a 1 in 11 chance. Rare pulls do not affect the no-repeat rotation.
  return Math.random() < 1 / 11;
}

function emitHearts(amount = 8) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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

function setCard(text, isRare) {
  card.classList.remove("rare", "dispense-in", "swap");
  void card.offsetWidth;

  card.hidden = false;
  tapHint.hidden = true;
  cardCopy.textContent = text;
  card.classList.toggle("rare", isRare);
  cardKicker.textContent = isRare ? "RARE PULL ✦" : "TODAY'S PULL";
  cardSticker.textContent = isRare ? "✦" : "♡";
  card.classList.add(state.firstDispense ? "dispense-in" : "swap");
  state.firstDispense = false;
}

function vend() {
  if (state.busy) return;
  state.busy = true;

  vendButton.classList.add("dispensing", "is-pressed");
  machineWindow.classList.add("vending");
  displayText.textContent = randomOf(displayMessages);

  if (navigator.vibrate) navigator.vibrate(18);

  const isRare = maybeRare();
  let text;
  if (isRare) {
    text = randomOf(rareCompliments);
  } else {
    if (!state.remaining.length) refillBag();
    text = state.remaining.pop();
  }

  window.setTimeout(() => {
    setCard(text, isRare);
    state.count += 1;
    dispensedCount.textContent = state.count;
    localStorage.setItem("like-machine-count", String(state.count));
    emitHearts(isRare ? 16 : 7);
  }, 360);

  window.setTimeout(() => {
    vendButton.classList.remove("dispensing", "is-pressed");
    machineWindow.classList.remove("vending");
    state.busy = false;
  }, 850);
}

function resetRotation() {
  refillBag();
  displayText.textContent = "refilled with good things ♡";
  resetButton.animate(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: 450, easing: "ease-out" }
  );
}

vendButton.addEventListener("click", vend);
resetButton.addEventListener("click", resetRotation);
