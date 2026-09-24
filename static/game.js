const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const GROUND = 230;
const DINO_X = 72;
const GRAVITY = 0.58;
const JUMP_V = -11.4;
const ACTIONS = ["jump", "duck", "run"];

const ui = {
  score: document.getElementById("score"),
  prompt: document.getElementById("prompt"),
  decision: document.getElementById("decision"),
  status: document.getElementById("status"),
  assisted: document.getElementById("assisted"),
};

let mode = "watch";
let held = { jump: false, duck: false };
let action = "run";
let asking = false;
let lastAsk = 0;
let shieldCount = 0;
let modelReady = false;
const game = reset();

document.getElementById("watch").onclick = () => setMode("watch");
document.getElementById("play").onclick = () => setMode("play");
addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    held.jump = true;
    if (!game.alive) Object.assign(game, reset());
  }
  if (event.code === "ArrowDown") {
    event.preventDefault();
    held.duck = true;
  }
});
addEventListener("keyup", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") held.jump = false;
  if (event.code === "ArrowDown") held.duck = false;
});

function setMode(next) {
  mode = next;
  document.getElementById("watch").classList.toggle("active", next === "watch");
  document.getElementById("play").classList.toggle("active", next === "play");
  Object.assign(game, reset());
}

function reset() {
  shieldCount = 0;
  action = "run";
  return {
    alive: true,
    y: GROUND - 48,
    vy: 0,
    duck: false,
    speed: 5.2,
    distance: 0,
    obstacles: [],
    sinceSpawn: 0,
    gap: rollGap(5.2),
    frame: 0,
  };
}

function rollGap(speed) {
  const min = 38 * speed + 90;
  return min + Math.random() * (60 * speed + 260);
}

function heightOf(duck) {
  return duck ? 28 : 48;
}

function onGround(state) {
  return state.y >= GROUND - heightOf(state.duck) - 0.1 && state.vy >= 0;
}

function hitbox(state) {
  const ducking = state.duck && onGround(state);
  return { x: DINO_X + 6, y: state.y, w: ducking ? 52 : 30, h: heightOf(ducking) };
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function obstacleBox(obstacle) {
  return { x: obstacle.x, y: obstacle.y, w: obstacle.w, h: obstacle.h };
}

function nearest(state) {
  return state.obstacles.find((obstacle) => obstacle.x + obstacle.w > DINO_X) || null;
}

function describe(obstacle) {
  if (!obstacle) return "Nothing ahead.";
  const distance = Math.max(0, Math.round(obstacle.x - (DINO_X + 36)));
  const name = obstacle.kind === "bird" ? "one low bird" : obstacle.kind === "tall" ? "one tall cactus" : "one cactus";
  return `${name[0].toUpperCase()}${name.slice(1)} ahead, ${distance} px away.`;
}

function step(state, command, consumeJump, allowSpawn = true) {
  if (!state.alive) return false;
  const grounded = onGround(state);
  if (command === "duck" && grounded) state.duck = true;
  if (command !== "duck") state.duck = false;
  if (command === "jump" && consumeJump && grounded) {
    state.vy = JUMP_V;
    state.duck = false;
  } else if (command === "duck" && !grounded) {
    state.vy = Math.max(state.vy, 7);
  }
  state.vy += GRAVITY;
  state.y += state.vy;
  const floor = GROUND - heightOf(state.duck);
  if (state.y > floor) {
    state.y = floor;
    state.vy = 0;
  }
  for (const obstacle of state.obstacles) obstacle.x -= state.speed;
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -20);
  state.speed = Math.min(12, state.speed + 0.0016);
  state.distance += state.speed;
  state.sinceSpawn += state.speed;
  state.frame += 1;
  if (allowSpawn && state.sinceSpawn > state.gap) spawn(state);
  const dino = hitbox(state);
  if (state.obstacles.some((obstacle) => boxesOverlap(dino, obstacleBox(obstacle)))) {
    state.alive = false;
    return true;
  }
  return false;
}

function spawn(state) {
  state.sinceSpawn = 0;
  state.gap = rollGap(state.speed);
  const roll = Math.random();
  if (roll < 0.18 && state.speed > 7) {
    state.obstacles.push({ kind: "bird", x: 980, y: GROUND - 58, w: 42, h: 24 });
  } else if (roll < 0.45) {
    state.obstacles.push({ kind: "tall", x: 980, y: GROUND - 62, w: 24, h: 62 });
  } else {
    state.obstacles.push({ kind: "cactus", x: 980, y: GROUND - 44, w: 20, h: 44 });
  }
}

function clone(state) {
  return {
    ...state,
    obstacles: state.obstacles.map((obstacle) => ({ ...obstacle })),
  };
}

function cleared(state) {
  return state.obstacles.every((obstacle) => obstacle.x + obstacle.w < DINO_X + 6);
}

function playOut(origin, command) {
  const sample = clone(origin);
  const mark = nearest(sample);
  if (mark) mark.tag = true;
  for (let i = 0; i < 90; i++) {
    const cmd = i === 0 ? command : command === "duck" ? "duck" : "run";
    step(sample, cmd, i === 0 && cmd === "jump", false);
    if (!sample.alive) return false;
    const obstacle = mark && sample.obstacles.find((item) => item.tag);
    if (!obstacle || obstacle.x + obstacle.w < DINO_X + 6) return true;
  }
  return false;
}

function latestJumpFrame(origin) {
  const saved = [];
  const sample = clone(origin);
  for (let i = 0; i < 220; i++) {
    saved.push(clone(sample));
    step(sample, "run", false, false);
    if (!sample.alive || cleared(sample)) break;
  }
  for (let i = saved.length - 1; i >= 0; i--) {
    if (onGround(saved[i]) && playOut(saved[i], "jump")) return i;
  }
  return null;
}

function plan() {
  const ahead = nearest(game);
  const facts = `Dino runner game. ${onGround(game) ? "" : "The dino is in the air. "}${describe(ahead)}`;
  if (!ahead) {
    return {
      best: "run",
      results: { jump: { safe: false }, duck: { safe: false }, run: { safe: true } },
      state: `${facts} Recommended action: run.`,
      questions: questionFor({
        jump: "Too early. Nothing to jump.",
        duck: "No low bird.",
        run: "Safe. Nothing ahead. Best.",
      }),
    };
  }
  const latest = latestJumpFrame(game);
  const bird = ahead.kind === "bird";
  const duckSafe = bird && playOut(game, "duck");
  const jumpNow = latest === 0;
  const runSafe = latest === null ? playOut(game, "run") : latest > 0;
  let best = "run";
  if (duckSafe) best = "duck";
  else if (jumpNow) best = "jump";
  const criteria = {
    jump: jumpNow
      ? "Safe. Clears the obstacle. This is the last moment to jump."
      : latest !== null && latest > 0
        ? "Too early. A jump now lands on the obstacle."
        : "Collision. Hits the obstacle.",
    duck: duckSafe ? "Safe. The bird is low." : "Collision. Hits the obstacle.",
    run: runSafe ? "Safe. Stay down and jump later." : "Collision. Hits the obstacle.",
  };
  criteria[best] += " Best.";
  return {
    best,
    results: {
      jump: { safe: jumpNow },
      duck: { safe: duckSafe },
      run: { safe: runSafe },
    },
    state: `${facts} Recommended action: ${best}.`,
    questions: questionFor(criteria),
  };
}

function questionFor(criteria) {
  return {
    action: {
      type: "choice",
      instructions: ui.assisted.checked
        ? "Which action should the dinosaur take now? Pick the recommended safe action."
        : "Which action should the dinosaur take now?",
      criteria,
    },
  };
}

async function askModel(planned) {
  ui.prompt.textContent = `${planned.state}\n\njump: ${planned.questions.action.criteria.jump}\nduck: ${planned.questions.action.criteria.duck}\nrun: ${planned.questions.action.criteria.run}`;
  if (!modelReady) {
    showBars(null, planned.best, "Planner, while the model loads.");
    return;
  }
  asking = true;
  try {
    const response = await fetch("/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: planned.state, questions: planned.questions }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "No answer");
    const matched = body.choice === planned.best || planned.results[body.choice].safe;
    if (!matched) shieldCount += 1;
    const note = matched
      ? `Laya chose ${body.choice} in ${body.ms} ms.`
      : `Laya chose ${body.choice}. Shield kept ${planned.best}. Shields: ${shieldCount}. ${body.ms} ms.`;
    showBars(body.probabilities, body.choice, note);
  } catch (error) {
    showBars(null, planned.best, `Planner fallback. ${error.message}`);
  } finally {
    asking = false;
  }
}

function showBars(probabilities, chosen, note) {
  for (const name of ACTIONS) {
    const value = probabilities ? probabilities[name] : name === chosen ? 1 : 0;
    document.getElementById("bar-" + name).style.width = `${Math.round(value * 100)}%`;
    document.getElementById("p-" + name).textContent = probabilities ? value.toFixed(2) : "–";
  }
  ui.decision.textContent = note;
}

function drawDino(box) {
  const x = box.x - 8;
  const y = box.y - 6;
  const color = game.alive ? "#2a2118" : "#8a4034";
  ctx.fillStyle = color;
  ctx.fillRect(x - 18, y + 22, 22, 8);
  ctx.fillRect(x, y + 16, 36, 20);
  ctx.fillRect(x + 24, y, 22, 22);
  ctx.fillRect(x + 40, y + 6, 12, 8);
  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(x + 32, y + 6, 5, 5);
  ctx.fillStyle = color;
  const stride = Math.floor(game.distance / 14) % 2;
  ctx.fillRect(x + 8, y + 34, 7, stride ? 16 : 8);
  ctx.fillRect(x + 22, y + 34, 7, stride ? 8 : 16);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#efe6d6";
  ctx.fillRect(0, GROUND, canvas.width, 8);
  ctx.fillStyle = "#c9b89a";
  for (let x = -(game.distance % 28); x < canvas.width; x += 28) ctx.fillRect(x, GROUND + 16, 10, 3);
  for (const obstacle of game.obstacles) {
    ctx.fillStyle = obstacle.kind === "bird" ? "#3d5a4c" : "#2f6b45";
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
    if (obstacle.kind !== "bird") ctx.fillRect(obstacle.x + obstacle.w / 2 - 2, obstacle.y + 8, 4, obstacle.h - 8);
  }
  drawDino(hitbox(game));
  ui.score.textContent = String(Math.floor(game.distance / 12));
  if (!game.alive) {
    ctx.fillStyle = "#24190f";
    ctx.font = "24px sans-serif";
    ctx.fillText(mode === "watch" ? "Hit. Watching the next run." : "Hit. Press space.", 330, 80);
  }
}

function frame(now) {
  if (game.alive) {
    if (mode === "play") {
      const command = held.duck ? "duck" : held.jump ? "jump" : "run";
      step(game, command, held.jump);
      held.jump = false;
    } else {
      const planned = plan();
      action = planned.best;
      if (!asking && now - lastAsk > 90) {
        lastAsk = now;
        askModel(planned);
      }
      step(game, action, action === "jump");
    }
  } else if (mode === "watch" && now - lastAsk > 900) {
    Object.assign(game, reset());
    lastAsk = now;
  }
  draw();
}

async function pollModel() {
  try {
    const health = await (await fetch("/health")).json();
    if (health.ready) {
      modelReady = true;
      ui.status.textContent = "Laya English is loaded on this Mac.";
      return;
    }
    ui.status.textContent = health.error ? `Model unavailable. ${health.error}` : "Loading Laya English…";
  } catch {
    ui.status.textContent = "The game server is not responding.";
  }
  setTimeout(pollModel, 700);
}

pollModel();
setInterval((stamp) => frame(stamp || performance.now()), 1000 / 60);
