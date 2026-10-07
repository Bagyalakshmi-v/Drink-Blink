const vscode = require('vscode');

let timer;
let tick;
let nextAt = 0;
let paused = false;
let panel;
let statusItem;
let eyeItem;
let eyeTimer;
let ctx;

function startEyeBlink() {
  clearInterval(eyeTimer);
  if (!cfg('blinkEye')) {
    eyeItem.hide();
    return;
  }
  eyeItem.text = '$(eye)';
  eyeItem.show();
  eyeTimer = setInterval(() => {
    eyeItem.text = '$(eye-closed)';
    setTimeout(() => (eyeItem.text = '$(eye)'), 300);
  }, cfg('blinkEverySeconds') * 1000);
}

function cfg(key) {
  return vscode.workspace.getConfiguration('drinkBlink').get(key);
}

function todayKey() {
  return 'count-' + new Date().toISOString().slice(0, 10);
}

function getCount() {
  return ctx.globalState.get(todayKey(), 0);
}

function schedule(minutes) {
  clearTimeout(timer);
  nextAt = Date.now() + minutes * 60 * 1000;
  timer = setTimeout(showReminder, minutes * 60 * 1000);
  updateStatus();
}

function updateStatus() {
  if (paused) {
    statusItem.text = '$(debug-pause) Water paused';
  } else {
    const mins = Math.max(0, Math.ceil((nextAt - Date.now()) / 60000));
    statusItem.text = `💧 ${getCount()}/${cfg('dailyGoal')} · ${mins}m`;
  }
}

function showReminder() {
  const messages = cfg('messages');
  const message = messages.length
    ? messages[Math.floor(Math.random() * messages.length)]
    : 'Time to drink water 💧';

  if (panel) {
    panel.reveal(vscode.ViewColumn.Active);
  } else {
    panel = vscode.window.createWebviewPanel(
      'drinkBlink',
      '💧 Drink & Blink',
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'done') {
        await ctx.globalState.update(todayKey(), getCount() + 1);
        schedule(cfg('intervalMinutes'));
        panel.webview.postMessage({ type: 'count', count: getCount(), goal: cfg('dailyGoal') });
        setTimeout(() => panel && panel.dispose(), 1800);
      } else if (msg.type === 'snooze') {
        schedule(cfg('snoozeMinutes'));
        panel.dispose();
      }
    });
  }
  panel.webview.html = getHtml(message, getCount(), cfg('dailyGoal'));
  // Keep the cycle going even if the panel is just closed without a click.
  schedule(cfg('intervalMinutes'));
}

function activate(context) {
  ctx = context;
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'drinkBlink.showNow';
  statusItem.tooltip = 'Drink & Blink — click to get a reminder now';
  statusItem.show();

  eyeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  eyeItem.command = 'drinkBlink.eyeView.focus';
  eyeItem.tooltip = 'Blink! Click to open Drink & Blink';
  startEyeBlink();

  context.subscriptions.push(
    statusItem,
    eyeItem,
    vscode.window.registerWebviewViewProvider('drinkBlink.eyeView', {
      resolveWebviewView(view) {
        view.webview.options = { enableScripts: true };
        view.webview.html = getEyeHtml();
      }
    }),
    vscode.commands.registerCommand('drinkBlink.eyeTip', () => {
      vscode.window.showInformationMessage(
        '👀 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds — and blink slowly a few times.'
      );
    }),
    vscode.commands.registerCommand('drinkBlink.showNow', showReminder),
    vscode.commands.registerCommand('drinkBlink.togglePause', () => {
      paused = !paused;
      if (paused) {
        clearTimeout(timer);
      } else {
        schedule(cfg('intervalMinutes'));
      }
      updateStatus();
      vscode.window.showInformationMessage(`Drink & Blink ${paused ? 'paused' : 'resumed'}.`);
    }),
    vscode.commands.registerCommand('drinkBlink.resetCount', async () => {
      await ctx.globalState.update(todayKey(), 0);
      updateStatus();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('drinkBlink.intervalMinutes') && !paused) {
        schedule(cfg('intervalMinutes'));
      }
      if (e.affectsConfiguration('drinkBlink.blinkEye') || e.affectsConfiguration('drinkBlink.blinkEverySeconds')) {
        startEyeBlink();
      }
      updateStatus();
    }),
    { dispose: () => { clearTimeout(timer); clearInterval(tick); clearInterval(eyeTimer); } }
  );

  tick = setInterval(updateStatus, 30 * 1000);
  schedule(cfg('intervalMinutes'));
}

function deactivate() {
  clearTimeout(timer);
  clearInterval(tick);
  clearInterval(eyeTimer);
}

function getHtml(message, count, goal) {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { --skin:#f2c29b; --skin-dark:#d9a27a; --hair:#3b2a20; --shirt:#4f8ef7; --pants:#2f3e5c; --water:#5cc8ff; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: radial-gradient(circle at 50% 30%, #e8f6ff 0%, #c9e8fb 55%, #a9d6f5 100%);
    color: #1d2b3a; overflow: hidden;
  }
  .stage { display: flex; flex-direction: column; align-items: center; gap: 8px; animation: popIn .6s cubic-bezier(.2,1.4,.4,1) both; }
  @keyframes popIn { from { transform: scale(.4) translateY(80px); opacity: 0; } to { transform: none; opacity: 1; } }

  .bubble {
    position: relative; background: #fff; border-radius: 18px; padding: 16px 22px; max-width: 360px;
    font-size: 20px; font-weight: 600; text-align: center; box-shadow: 0 6px 20px rgba(0,60,120,.18);
    min-height: 60px;
  }
  .bubble::after {
    content: ""; position: absolute; bottom: -14px; left: 50%; transform: translateX(-50%);
    border: 14px solid transparent; border-top-color: #fff; border-bottom: 0;
  }
  .cursor { display: inline-block; width: 2px; height: 1em; background: #1d2b3a; margin-left: 2px; vertical-align: -2px; animation: blinkCursor .8s steps(1) infinite; }
  @keyframes blinkCursor { 50% { opacity: 0; } }

  svg { width: 240px; height: 300px; overflow: visible; }
  .person { animation: bob 1.6s ease-in-out infinite; transform-origin: 120px 280px; }
  @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

  .wave-arm { transform-origin: 160px 150px; animation: wave 1s ease-in-out infinite; }
  @keyframes wave { 0%,100% { transform: rotate(-10deg); } 50% { transform: rotate(-45deg); } }

  .drink-arm { transform-origin: 80px 150px; animation: raise 3.2s ease-in-out infinite; }
  @keyframes raise { 0%,55%,100% { transform: rotate(0deg); } 70%,85% { transform: rotate(48deg); } }

  .eyes { animation: blink 4s infinite; transform-origin: 120px 92px; }
  @keyframes blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }

  .mouth { animation: talk .25s ease-in-out infinite alternate; transform-origin: 120px 112px; }
  .mouth.quiet { animation: none; }
  @keyframes talk { from { transform: scaleY(.4); } to { transform: scaleY(1.1); } }

  .water-surface { animation: slosh 1.2s ease-in-out infinite; transform-origin: 62px 196px; }
  @keyframes slosh { 0%,100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }

  .drop { animation: fall 2.4s ease-in infinite; opacity: 0; }
  .drop.d2 { animation-delay: .8s; } .drop.d3 { animation-delay: 1.6s; }
  @keyframes fall { 0% { transform: translateY(-20px); opacity: 0; } 15% { opacity: .9; } 100% { transform: translateY(70px); opacity: 0; } }

  .buttons { display: flex; gap: 12px; margin-top: 4px; }
  button {
    border: 0; border-radius: 999px; padding: 11px 22px; font-size: 15px; font-weight: 700; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,60,120,.2); transition: transform .1s;
  }
  button:hover { transform: translateY(-2px); }
  button:active { transform: translateY(1px); }
  .done { background: #2fbf71; color: #fff; }
  .snooze { background: #fff; color: #1d2b3a; }
  .count { font-size: 14px; color: #33506b; }
  .glasses { font-size: 20px; letter-spacing: 2px; }
  .celebrate { animation: jump .5s ease-out 3; }
  @keyframes jump { 50% { transform: translateY(-24px); } }
</style>
</head>
<body>
  <div class="stage">
    <div class="bubble"><span id="text"></span><span class="cursor" id="cursor"></span></div>

    <svg viewBox="0 0 240 300" aria-label="Animated person reminding you to drink water">
      <g class="drop"><path d="M200 40 q6 10 0 14 q-6 -4 0 -14z" fill="var(--water)"/></g>
      <g class="drop d2"><path d="M30 60 q6 10 0 14 q-6 -4 0 -14z" fill="var(--water)"/></g>
      <g class="drop d3"><path d="M215 100 q5 8 0 11 q-5 -3 0 -11z" fill="var(--water)"/></g>

      <g class="person" id="person">
        <!-- legs -->
        <rect x="96" y="210" width="20" height="62" rx="9" fill="var(--pants)"/>
        <rect x="124" y="210" width="20" height="62" rx="9" fill="var(--pants)"/>
        <ellipse cx="104" cy="274" rx="16" ry="7" fill="#222"/>
        <ellipse cx="136" cy="274" rx="16" ry="7" fill="#222"/>

        <!-- body -->
        <rect x="84" y="134" width="72" height="88" rx="26" fill="var(--shirt)"/>
        <text x="120" y="186" font-size="22" text-anchor="middle">💧</text>

        <!-- arm holding glass -->
        <g class="drink-arm">
          <rect x="66" y="144" width="20" height="56" rx="10" fill="var(--shirt)"/>
          <circle cx="76" cy="202" r="10" fill="var(--skin)"/>
          <!-- glass -->
          <path d="M50 180 L74 180 L71 214 L53 214 Z" fill="rgba(255,255,255,.55)" stroke="#7fb6d9" stroke-width="2"/>
          <g class="water-surface"><path d="M51 192 L73 192 L71 213 L53 213 Z" fill="var(--water)" opacity=".85"/></g>
        </g>

        <!-- waving arm -->
        <g class="wave-arm">
          <rect x="154" y="100" width="20" height="56" rx="10" fill="var(--shirt)" transform="rotate(20 164 150)"/>
          <circle cx="178" cy="100" r="11" fill="var(--skin)"/>
        </g>

        <!-- neck + head -->
        <rect x="111" y="118" width="18" height="20" rx="6" fill="var(--skin-dark)"/>
        <circle cx="120" cy="92" r="36" fill="var(--skin)"/>
        <path d="M84 90 q2 -42 36 -42 q36 0 38 42 q-8 -22 -38 -22 q-28 0 -36 22z" fill="var(--hair)"/>
        <circle cx="85" cy="96" r="6" fill="var(--skin-dark)"/>
        <circle cx="155" cy="96" r="6" fill="var(--skin-dark)"/>

        <!-- cheeks -->
        <ellipse cx="99" cy="106" rx="7" ry="4" fill="#f59a9a" opacity=".55"/>
        <ellipse cx="141" cy="106" rx="7" ry="4" fill="#f59a9a" opacity=".55"/>

        <!-- eyes -->
        <g class="eyes">
          <ellipse cx="106" cy="92" rx="5" ry="6" fill="#222"/>
          <ellipse cx="134" cy="92" rx="5" ry="6" fill="#222"/>
          <circle cx="108" cy="90" r="1.6" fill="#fff"/>
          <circle cx="136" cy="90" r="1.6" fill="#fff"/>
        </g>
        <path d="M99 80 q7 -5 14 0" stroke="var(--hair)" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M127 80 q7 -5 14 0" stroke="var(--hair)" stroke-width="3" fill="none" stroke-linecap="round"/>

        <!-- mouth -->
        <ellipse class="mouth" id="mouth" cx="120" cy="112" rx="8" ry="6" fill="#8a2b2b"/>
      </g>
    </svg>

    <div class="count">Today: <span class="glasses" id="glasses"></span> <span id="countText"></span></div>
    <div class="buttons">
      <button class="done" id="done">I drank water ✅</button>
      <button class="snooze" id="snooze">Snooze 😴</button>
    </div>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const textEl = document.getElementById('text');
  const mouth = document.getElementById('mouth');
  const cursor = document.getElementById('cursor');

  function say(msg) {
    textEl.textContent = '';
    mouth.classList.remove('quiet');
    cursor.style.display = 'inline-block';
    let i = 0;
    const chars = Array.from(msg);
    const id = setInterval(() => {
      textEl.textContent += chars[i++] || '';
      if (i >= chars.length) {
        clearInterval(id);
        mouth.classList.add('quiet');
        cursor.style.display = 'none';
      }
    }, 45);
  }

  function renderCount(count, goal) {
    const full = Math.min(count, goal);
    document.getElementById('glasses').textContent = '🥛'.repeat(full) + '▫️'.repeat(Math.max(0, goal - full));
    document.getElementById('countText').textContent = count + '/' + goal;
  }

  renderCount(${Number(count)}, ${Number(goal)});
  say(${JSON.stringify(String(message)).replace(/</g, '\\u003c')});

  document.getElementById('done').addEventListener('click', () => {
    vscode.postMessage({ type: 'done' });
    document.getElementById('person').classList.add('celebrate');
    document.querySelectorAll('button').forEach(b => b.disabled = true);
  });
  document.getElementById('snooze').addEventListener('click', () => vscode.postMessage({ type: 'snooze' }));

  window.addEventListener('message', (e) => {
    if (e.data.type === 'count') {
      renderCount(e.data.count, e.data.goal);
      say(e.data.count >= e.data.goal ? 'Goal reached! You are a hydration hero! 🏆' : 'Great job! See you next time 👋');
    }
  });
</script>
</body>
</html>`;
}

function getEyeHtml() {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center; gap: 28px; flex-wrap: wrap;
    font-family: var(--vscode-font-family); color: var(--vscode-foreground); overflow: hidden;
  }
  svg { height: min(150px, 80vh); width: auto; }

  /* eyelids close + open, like a blink gif */
  .lid { transform-origin: center top; transform: scaleY(0); animation: blink 4s infinite; }
  @keyframes blink { 0%, 90%, 100% { transform: scaleY(0); } 94%, 96% { transform: scaleY(1); } }

  /* pupils wander around */
  .pupils { animation: look 8s ease-in-out infinite; }
  @keyframes look {
    0%, 15%  { transform: translate(0, 0); }
    22%, 35% { transform: translate(-14px, -4px); }
    42%, 55% { transform: translate(14px, 2px); }
    62%, 72% { transform: translate(0, 9px); }
    80%, 100% { transform: translate(0, 0); }
  }

  .face { animation: bob 2.4s ease-in-out infinite; }
  @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

  .sparkle { animation: twinkle 2s ease-in-out infinite; }
  .sparkle.s2 { animation-delay: 1s; }
  @keyframes twinkle { 0%,100% { opacity: 0; transform: scale(.4); } 50% { opacity: 1; transform: scale(1); } }

  .msg { text-align: center; max-width: 260px; }
  .msg h2 { margin: 0 0 6px; font-size: 18px; }
  .msg p { margin: 0; opacity: .8; font-size: 13px; }
  .big { font-size: 34px; font-weight: 700; color: #2fbf71; }
  .rest .lid { animation: none; transform: scaleY(1); }
  .rest .pupils { animation: none; }
</style>
</head>
<body>
  <svg viewBox="0 0 260 140" id="eyes" aria-label="Animated blinking eyes">
    <g class="face">
      <g class="sparkle" style="transform-origin:18px 20px"><path d="M18 8 L21 18 L31 20 L21 23 L18 33 L15 23 L5 20 L15 18Z" fill="#ffd54f"/></g>
      <g class="sparkle s2" style="transform-origin:244px 24px"><path d="M244 14 L246 22 L254 24 L246 26 L244 34 L242 26 L234 24 L242 22Z" fill="#ffd54f"/></g>

      <!-- whites -->
      <ellipse cx="78"  cy="72" rx="52" ry="44" fill="#fff" stroke="#333" stroke-width="4"/>
      <ellipse cx="182" cy="72" rx="52" ry="44" fill="#fff" stroke="#333" stroke-width="4"/>

      <!-- iris + pupil -->
      <g class="pupils">
        <circle cx="78"  cy="74" r="22" fill="#4a90e2"/><circle cx="78"  cy="74" r="11" fill="#111"/><circle cx="85"  cy="67" r="5" fill="#fff"/>
        <circle cx="182" cy="74" r="22" fill="#4a90e2"/><circle cx="182" cy="74" r="11" fill="#111"/><circle cx="189" cy="67" r="5" fill="#fff"/>
      </g>

      <!-- eyelids -->
      <clipPath id="cl"><ellipse cx="78" cy="72" rx="52" ry="44"/></clipPath>
      <clipPath id="cr"><ellipse cx="182" cy="72" rx="52" ry="44"/></clipPath>
      <rect class="lid" x="24" y="26" width="108" height="92" fill="#f2c29b" clip-path="url(#cl)" style="transform-origin:78px 28px"/>
      <rect class="lid" x="128" y="26" width="108" height="92" fill="#f2c29b" clip-path="url(#cr)" style="transform-origin:182px 28px"/>
      <ellipse cx="78"  cy="72" rx="52" ry="44" fill="none" stroke="#333" stroke-width="4"/>
      <ellipse cx="182" cy="72" rx="52" ry="44" fill="none" stroke="#333" stroke-width="4"/>

      <!-- lashes -->
      <path d="M40 38 l-8 -10 M60 30 l-4 -12 M82 28 l0 -12 M104 32 l6 -11" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <path d="M156 32 l-6 -11 M178 28 l0 -12 M200 30 l4 -12 M220 38 l8 -10" stroke="#333" stroke-width="4" stroke-linecap="round"/>
    </g>
  </svg>

  <div class="msg" id="msg">
    <h2>Blink with me 👀</h2>
    <p id="sub"></p>
  </div>

<script nonce="${nonce}">
  const msg = document.getElementById('msg');
  const eyes = document.getElementById('eyes');
  const REMIND_EVERY = 20 * 60;   // 20-20-20 rule
  let left = REMIND_EVERY;

  function fmt(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function normal() {
    eyes.classList.remove('rest');
    msg.innerHTML = '<h2>Blink with me 👀</h2><p>Next eye break in <b id="t"></b></p>';
  }

  function rest() {
    let s = 20;
    eyes.classList.add('rest');
    msg.innerHTML = '<h2>Eye break! 🌳</h2><p>Look at something far away</p><div class="big" id="cd">20</div>';
    const id = setInterval(() => {
      s--;
      document.getElementById('cd').textContent = s;
      if (s <= 0) { clearInterval(id); left = REMIND_EVERY; normal(); }
    }, 1000);
  }

  normal();
  setInterval(() => {
    if (eyes.classList.contains('rest')) return;
    left--;
    const t = document.getElementById('t');
    if (t) t.textContent = fmt(left);
    if (left <= 0) rest();
  }, 1000);
</script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
