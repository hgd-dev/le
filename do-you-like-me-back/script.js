(() => {
  const card = document.getElementById('questionCard');
  const playground = document.getElementById('playground');
  const yesButton = document.getElementById('yesButton');
  const noButton = document.getElementById('noButton');
  const caption = document.getElementById('caption');
  const hint = document.getElementById('hint');
  const ending = document.getElementById('ending');
  const heartsLayer = document.getElementById('heartsLayer');
  const comeHereButton = document.getElementById('comeHereButton');

  const captions = [
    'hey 🤨',
    'why are you chasing that one',
    'wrong button',
    'it literally says yes right there',
    'okay now you’re doing this on purpose 😭',
    'PLEASE'
  ];

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let escapes = 0;
  let finished = false;
  let noX = 0;
  let noY = 0;
  let noVX = 0;
  let noVY = 0;
  let yesX = 0;
  let yesY = 0;
  let yesTargetX = 0;
  let yesTargetY = 0;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let pointerActive = false;

  function bumpCaption() {
    caption.classList.remove('bump');
    void caption.offsetWidth;
    caption.classList.add('bump');
    window.setTimeout(() => caption.classList.remove('bump'), 240);
  }

  function registerEscape() {
    if (finished) return;
    caption.textContent = captions[Math.min(escapes, captions.length - 1)];
    bumpCaption();
    escapes += 1;

    const grow = Math.min(1 + escapes * 0.055, 1.42);
    yesButton.style.scale = grow;

    if (escapes >= 4) hint.textContent = 'there is a very obvious correct answer';
    if (escapes >= 7) hint.textContent = 'i believe in you ♡';
    if (escapes >= 9) noButton.style.opacity = Math.max(.42, 1 - (escapes - 8) * .08);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getBoundsFor(button) {
    const parentRect = playground.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    return {
      parentRect,
      rect,
      minX: -rect.left + parentRect.left + 4,
      maxX: parentRect.right - rect.right - 4,
      minY: -rect.top + parentRect.top + 4,
      maxY: parentRect.bottom - rect.bottom - 4
    };
  }

  function nudgeNoAway(clientX, clientY, force = 1) {
    const rect = noButton.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = cx - clientX;
    let dy = cy - clientY;
    let dist = Math.hypot(dx, dy) || 1;

    if (dist > 155 && force <= 1) return false;

    dx /= dist;
    dy /= dist;

    const sideways = (Math.random() - .5) * 70;
    noVX += dx * 28 * force + (-dy) * sideways * .12;
    noVY += dy * 24 * force + dx * sideways * .12;
    registerEscape();
    return true;
  }

  function moveNoSomewhereElse() {
    const bounds = getBoundsFor(noButton);
    const choices = 10;
    let best = null;
    let bestScore = -Infinity;

    for (let i = 0; i < choices; i++) {
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
      const rect = noButton.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2 + x - noX;
      const centerY = rect.top + rect.height / 2 + y - noY;
      const pointerDistance = Math.hypot(centerX - pointerX, centerY - pointerY);
      const yesRect = yesButton.getBoundingClientRect();
      const yesCx = yesRect.left + yesRect.width / 2;
      const yesCy = yesRect.top + yesRect.height / 2;
      const yesDistance = Math.hypot(centerX - yesCx, centerY - yesCy);
      const score = pointerDistance + yesDistance * .35;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }

    if (best) {
      noX = best.x;
      noY = best.y;
      noVX = 0;
      noVY = 0;
      noButton.style.transform = `translate3d(${noX}px, ${noY}px, 0)`;
    }
    registerEscape();
  }

  function animate() {
    if (!finished && !reducedMotion) {
      noX += noVX;
      noY += noVY;
      noVX *= .82;
      noVY *= .82;

      const noBounds = getBoundsFor(noButton);
      if (noX < noBounds.minX) { noX = noBounds.minX; noVX = Math.abs(noVX) * .45; }
      if (noX > noBounds.maxX) { noX = noBounds.maxX; noVX = -Math.abs(noVX) * .45; }
      if (noY < noBounds.minY) { noY = noBounds.minY; noVY = Math.abs(noVY) * .45; }
      if (noY > noBounds.maxY) { noY = noBounds.maxY; noVY = -Math.abs(noVY) * .45; }

      noButton.style.transform = `translate3d(${noX}px, ${noY}px, 0)`;

      yesX += (yesTargetX - yesX) * .11;
      yesY += (yesTargetY - yesY) * .11;
      yesButton.style.transform = `translate3d(${yesX}px, ${yesY}px, 0)`;
    }
    requestAnimationFrame(animate);
  }

  function updateYesMagnet(clientX, clientY) {
    if (coarsePointer || finished) return;
    const rect = yesButton.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist < 185) {
      const strength = (1 - dist / 185) * 28;
      yesTargetX = clamp(dx * .20, -strength, strength);
      yesTargetY = clamp(dy * .20, -strength, strength);
    } else {
      yesTargetX = 0;
      yesTargetY = 0;
    }
  }

  document.addEventListener('pointermove', (event) => {
    if (finished) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerActive = true;
    if (!coarsePointer) {
      nudgeNoAway(event.clientX, event.clientY, .92);
      updateYesMagnet(event.clientX, event.clientY);
    }
  }, { passive: true });

  playground.addEventListener('pointerdown', (event) => {
    if (!coarsePointer || finished) return;
    pointerX = event.clientX;
    pointerY = event.clientY;

    const noRect = noButton.getBoundingClientRect();
    const nearNo = event.clientX >= noRect.left - 48 &&
                   event.clientX <= noRect.right + 48 &&
                   event.clientY >= noRect.top - 48 &&
                   event.clientY <= noRect.bottom + 48;

    if (nearNo) {
      event.preventDefault();
      moveNoSomewhereElse();

      const yesRect = yesButton.getBoundingClientRect();
      const dx = event.clientX - (yesRect.left + yesRect.width / 2);
      const dy = event.clientY - (yesRect.top + yesRect.height / 2);
      yesTargetX = clamp(dx * .10, -22, 22);
      yesTargetY = clamp(dy * .10, -14, 14);
    }
  }, { passive: false });

  noButton.addEventListener('pointerenter', (event) => {
    if (finished || coarsePointer) return;
    nudgeNoAway(event.clientX, event.clientY, 1.6);
  });

  noButton.addEventListener('click', (event) => {
    if (finished) return;
    event.preventDefault();
    moveNoSomewhereElse();
  });

  noButton.addEventListener('focus', () => {
    if (!finished && !coarsePointer) moveNoSomewhereElse();
  });

  function heartBurst(count = 42, intensity = 1) {
    const symbols = ['♥', '♡'];
    for (let i = 0; i < count; i++) {
      const heart = document.createElement('span');
      heart.className = 'particle-heart';
      heart.textContent = symbols[Math.random() > .28 ? 0 : 1];

      const angle = Math.random() * Math.PI * 2;
      const distance = (100 + Math.random() * 430) * intensity;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const size = 13 + Math.random() * 24;
      const duration = 900 + Math.random() * 1100;
      const scale = .7 + Math.random() * 1.3;
      const rot = `${-120 + Math.random() * 240}deg`;

      heart.style.setProperty('--x', `${x}px`);
      heart.style.setProperty('--y', `${y}px`);
      heart.style.setProperty('--scale', scale.toFixed(2));
      heart.style.setProperty('--rot', rot);
      heart.style.setProperty('--duration', `${duration}ms`);
      heart.style.fontSize = `${size}px`;
      heart.style.color = Math.random() > .32 ? '#e65f84' : '#f5a3b8';
      heartsLayer.appendChild(heart);

      window.setTimeout(() => heart.remove(), duration + 120);
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    yesButton.disabled = true;
    noButton.disabled = true;
    card.classList.add('goodbye');
    document.body.style.transition = 'background 900ms ease';
    document.body.style.background = 'radial-gradient(circle at 50% 40%, #fffefe 0%, #ffe7ed 52%, #ffd5df 100%)';

    window.setTimeout(() => {
      card.hidden = true;
      ending.setAttribute('aria-hidden', 'false');
      ending.classList.add('show');
      heartBurst(coarsePointer ? 28 : 48, coarsePointer ? .78 : 1);
    }, reducedMotion ? 0 : 420);
  }

  yesButton.addEventListener('click', finish);

  comeHereButton.addEventListener('click', () => {
    heartBurst(coarsePointer ? 36 : 70, coarsePointer ? .9 : 1.25);
    comeHereButton.textContent = '♡ ♡ ♡';
    comeHereButton.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.12) rotate(-2deg)' },
        { transform: 'scale(1)' }
      ],
      { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  });

  window.addEventListener('resize', () => {
    noX = 0;
    noY = 0;
    noVX = 0;
    noVY = 0;
    yesX = yesY = yesTargetX = yesTargetY = 0;
    noButton.style.transform = '';
    yesButton.style.transform = '';
  });

  if (coarsePointer) {
    hint.textContent = 'tap your answer ♡';
  }

  animate();
})();
