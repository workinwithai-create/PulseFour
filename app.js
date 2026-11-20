const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const STEPS = 16; // 16ths

const recipes = [
  { id:"bass-pulse", name:"Bass pulse", blurb:"Upright on every quarter. Piano holds. Kit light." },
  { id:"piano-pulse", name:"Piano pulse", blurb:"Piano accents on 2 and 4. Bass root." },
  { id:"kit-pulse", name:"Kit pulse", blurb:"Kick and snare on the pulse. Hats closed." },
  { id:"full-pulse", name:"Full pulse", blurb:"All chairs on the pulse. Drive without clutter." },
  { id:"nylon-pulse", name:"Nylon pulse", blurb:"Nylon chops the ands. Bass holds." },
  { id:"brass-pulse", name:"Brass pulse", blurb:"Trumpet stabs the downbeats." }
];

function bar(symbol, piano, guitar, bass){ return { symbol, piano, guitar, bass }; }

const grooves = [
  { id:"amber", name:"Amber Walk", bpm:98, key:"A minor",
    verse:[bar("Am",[45,48,52,57],[45,52,57],33),bar("F",[41,45,48,53],[41,48,53],41),bar("C",[48,52,55,60],[48,52,55],36),bar("G",[43,47,50,55],[43,47,50],31),bar("Am",[45,48,52,57],[45,52,57],33),bar("F",[41,45,48,53],[41,48,53],41),bar("C",[48,52,55,60],[48,52,55],36),bar("G",[43,47,50,55],[43,47,50],31)],
    pulse:[bar("Am",[45,48,52,57],[45,52,57],33),bar("Am",[45,48,52,57],[45,52,57],33),bar("Am",[45,48,52,57],[45,52,57],33),bar("Am",[45,48,52,57],[45,52,57],33)] },
  { id:"porch", name:"Porch Climb", bpm:86, key:"E major",
    verse:[bar("E",[40,44,47,52],[40,47,52],28),bar("B",[35,39,42,47],[35,42,47],23),bar("C#m",[44,47,51,56],[44,51,56],32),bar("A",[33,37,40,45],[33,40,45],33),bar("E",[40,44,47,52],[40,47,52],28),bar("B",[35,39,42,47],[35,42,47],23),bar("C#m",[44,47,51,56],[44,51,56],32),bar("A",[33,37,40,45],[33,40,45],33)],
    pulse:[bar("E",[40,44,47,52],[40,47,52],28),bar("E",[40,44,47,52],[40,47,52],28),bar("E",[40,44,47,52],[40,47,52],28),bar("E",[40,44,47,52],[40,47,52],28)] },
  { id:"fold", name:"Fold Radio", bpm:104, key:"D minor",
    verse:[bar("Dm",[38,41,45,50],[38,45,50],26),bar("Bb",[34,38,41,46],[34,41,46],34),bar("F",[41,45,48,53],[41,48,53],29),bar("C",[36,40,43,48],[36,43,48],24),bar("Dm",[38,41,45,50],[38,45,50],26),bar("Bb",[34,38,41,46],[34,41,46],34),bar("F",[41,45,48,53],[41,48,53],29),bar("C",[36,40,43,48],[36,43,48],24)],
    pulse:[bar("Dm",[38,41,45,50],[38,45,50],26),bar("Dm",[38,41,45,50],[38,45,50],26),bar("Dm",[38,41,45,50],[38,45,50],26),bar("Dm",[38,41,45,50],[38,45,50],26)] }
];

const state = {
  groove: grooves[0],
  recipe: recipes[0],
  bpm: 98,
  key: "A minor",
  bars: 12,
  playing: false,
  step: 0,
  nextStepTime: 0,
  activeSources: [],
  mutes: { piano:false, bass:false, guitar:false, kit:false, brass:false }
};

let ctx, master, compressor, buffers = {}, rawBuffers = {};
let timerId = null;
let playheadRaf = null;

const KEY_OFFSETS = { "A minor":0, "C major":3, "E major":7, "D minor":5, "G major":10 };

function transpose(midi){ return midi + (KEY_OFFSETS[state.key]||0); }

async function load() {
  if (ctx) return;
  ctx = new AudioContext();
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  const files = [
    ["kick",`${CDN}/drums/kick.mp3`],["snare",`${CDN}/drums/snare.mp3`],["hat",`${CDN}/drums/hihat.mp3`],["crash",`${CDN}/drums/crash.mp3`],
    ["pC3",`${CDN}/piano/C3.mp3`],["pC4",`${CDN}/piano/C4.mp3`],["pA3",`${CDN}/piano/A3.mp3`],
    ["bE1",`${CDN}/bass/E1.mp3`],["bA1",`${CDN}/bass/A1.mp3`],["bC2",`${CDN}/bass/C2.mp3`],
    ["gE2",`${CDN}/guitar/E2.mp3`],["gA2",`${CDN}/guitar/A2.mp3`],["gE3",`${CDN}/guitar/E3.mp3`],
    ["tC4",`${CDN}/trumpet/C4.mp3`],["vA3",`${CDN}/violin/A3.mp3`]
  ];
  const missing = [];
  let n=0;
  for (const [k,url] of files) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("bad status");
      const ab = await r.arrayBuffer();
      rawBuffers[k] = ab;
      buffers[k] = await ctx.decodeAudioData(ab.slice(0));
    } catch (e) {
      missing.push(k);
      console.warn(k, e);
    }
    n++;
    document.getElementById("status").textContent = `Seating chairs ${n}/${files.length}`;
  }
  if (missing.length) {
    document.getElementById("status").textContent = `Missing instruments: ${missing.join(", ")}. Cannot play.`;
    return false;
  }
  document.getElementById("status").textContent = "Chairs seated · live FluidR3 + kit · tap play";
  return true;
}

function playBuf(name, when, rate=1, gain=0.4, chair="kit") {
  if (state.mutes[chair]) return null;
  const b = buffers[name]; if (!b || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = b; src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  g.gain.linearRampToValueAtTime(gain * 0.7, when + 0.08);
  g.gain.linearRampToValueAtTime(0, when + 0.25);
  src.connect(g); g.connect(master);
  src.start(when);
  src.stop(when + 0.3);
  state.activeSources.push(src);
  src.onended = () => { state.activeSources = state.activeSources.filter(s => s !== src); };
  return src;
}

function rateFromMidi(midi, baseMidi){ return Math.pow(2, (midi - baseMidi)/12); }

function chordAt(barIndex){
  const g = state.groove;
  if (barIndex < 8) return g.verse[barIndex % g.verse.length];
  return g.pulse[(barIndex - 8) % g.pulse.length];
}

function zone(barIndex){ return barIndex < 8 ? "verse" : "pulse"; }

function scheduleStep(step, when){
  const barIndex = Math.floor(step / STEPS) % state.bars;
  const s = step % STEPS;
  const ch = chordAt(barIndex);
  const z = zone(barIndex);
  const rec = state.recipe.id;
  const onPulse = z === "pulse";
  const stepDur = 60 / state.bpm / 4;

  if (s % 2 === 0) playBuf("hat", when, 1, onPulse && rec==="kit-pulse" ? 0.12 : 0.06, "kit");
  if (s === 0) playBuf("kick", when, 1, 0.65, "kit");
  if (s === 8) playBuf("snare", when, 1, 0.4, "kit");
  if (onPulse && rec==="kit-pulse" && s % 4 === 0) playBuf("kick", when, 1, 0.5, "kit");

  if (s === 0 || (onPulse && rec==="bass-pulse" && s % 4 === 0)) {
    const bassMidi = transpose(ch.bass);
    const base = 33;
    const rate = Math.max(0.5, Math.min(2, rateFromMidi(bassMidi, base)));
    playBuf("bA1", when, rate, 0.45, "bass");
  }

  if (s === 0 || (onPulse && rec==="piano-pulse" && (s===4 || s===12))) {
    const pMidi = transpose(ch.piano[2] || 60);
    playBuf("pC4", when, rateFromMidi(pMidi, 60), 0.28, "piano");
    playBuf("pA3", when, rateFromMidi(transpose(ch.piano[1]||57), 57), 0.2, "piano");
  }

  if (onPulse && rec==="nylon-pulse" && s % 2 === 1) {
    playBuf("gA2", when, rateFromMidi(transpose(ch.guitar[0]||45), 45), 0.22, "guitar");
  }

  if (onPulse && rec==="brass-pulse" && s === 0) {
    playBuf("tC4", when, rateFromMidi(transpose(ch.piano[3]||69), 60), 0.35, "brass");
  }

  if (onPulse && rec==="full-pulse" && s % 4 === 0) {
    playBuf("kick", when, 1, 0.5, "kit");
    playBuf("pC4", when, rateFromMidi(transpose(ch.piano[2]||60), 60), 0.25, "piano");
  }
}

function scheduler(){
  if (!state.playing || !ctx) return;
  while (state.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(state.step, state.nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    state.nextStepTime += stepDur;
    state.step = (state.step + 1) % (state.bars * STEPS);
  }
}

function start(){
  if (!ctx || ctx.state === "suspended") return;
  stop();
  state.playing = true;
  state.nextStepTime = ctx.currentTime + 0.1;
  state.step = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

function stop(){
  state.playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  state.activeSources.forEach(s => { try { s.stop(); } catch(e){} });
  state.activeSources = [];
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  paintBars();
}

function updatePlayhead(){
  if (!state.playing || !ctx) return;
  const currentStep = Math.floor((ctx.currentTime - (state.nextStepTime - state.step * (60/state.bpm/4))) / (60/state.bpm/4)) % (state.bars * STEPS);
  const bar = Math.floor(currentStep / STEPS);
  document.querySelectorAll(".bar").forEach((el,i) => el.classList.toggle("active", i===bar));
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

async function play(mode){
  if (!ctx) {
    const ok = await load();
    if (!ok) return;
  }
  if (ctx.state === "suspended") await ctx.resume();
  if (ctx.state !== "running") {
    document.getElementById("status").textContent = "Tap to start audio…";
    return;
  }
  state.mode = mode;
  if (mode === "loop") state.bars = 8;
  else if (mode === "eight") state.bars = 4;
  else state.bars = 12;
  document.getElementById("bars").value = state.bars;
  start();
}

function saveState(){
  localStorage.setItem("pulsefour", JSON.stringify({
    bpm: state.bpm, key: state.key, recipe: state.recipe.id, groove: state.groove.id
  }));
}

function loadState(){
  try {
    const s = JSON.parse(localStorage.getItem("pulsefour")||"{}");
    if (s.bpm) { state.bpm = s.bpm; document.getElementById("bpm").value = s.bpm; }
    if (s.key) { state.key = s.key; document.getElementById("key").value = s.key; }
    if (s.recipe) state.recipe = recipes.find(r=>r.id===s.recipe) || recipes[0];
    if (s.groove) state.groove = grooves.find(g=>g.id===s.groove) || grooves[0];
  } catch(e){}
}

async function exportWav(){
  if (!ctx) await load();
  const sampleRate = 48000;
  const bars = state.bars;
  const bpm = state.bpm;
  const lengthSamples = Math.round(bars * 4 * 60 / bpm * sampleRate);
  const offline = new OfflineAudioContext(2, lengthSamples + sampleRate, sampleRate);
  const oComp = offline.createDynamicsCompressor();
  oComp.threshold.value = -12;
  oComp.connect(offline.destination);
  const oMaster = offline.createGain();
  oMaster.gain.value = 0.7;
  oMaster.connect(oComp);
  const oBuffers = {};
  for (const [k, ab] of Object.entries(rawBuffers)) {
    oBuffers[k] = await offline.decodeAudioData(ab.slice(0));
  }
  let t = 0;
  const stepDur = 60 / bpm / 4;
  for (let step=0; step < bars * STEPS; step++) {
    const barIndex = Math.floor(step / STEPS);
    const s = step % STEPS;
    const ch = chordAt(barIndex);
    const z = zone(barIndex);
    const rec = state.recipe.id;
    const onPulse = z === "pulse";
    function oPlay(name, when, rate, gain, chair){
      if (state.mutes[chair]) return;
      const b = oBuffers[name]; if (!b) return;
      const src = offline.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
      const g = offline.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when+0.01);
      g.gain.linearRampToValueAtTime(0, when+0.25);
      src.connect(g); g.connect(oMaster);
      src.start(when);
    }
    if (s%2===0) oPlay("hat", t, 1, 0.06, "kit");
    if (s===0) oPlay("kick", t, 1, 0.65, "kit");
    if (s===8) oPlay("snare", t, 1, 0.4, "kit");
    if (s===0 || (onPulse && rec==="bass-pulse" && s%4===0)) {
      const bassMidi = transpose(ch.bass);
      oPlay("bA1", t, rateFromMidi(bassMidi,33), 0.45, "bass");
    }
    if (s===0) {
      oPlay("pC4", t, rateFromMidi(transpose(ch.piano[2]||60),60), 0.28, "piano");
    }
    t += stepDur;
  }
  const rendered = await offline.startRendering();
  const main = rendered.getChannelData(0);
  const tailStart = lengthSamples;
  for (let i=0; i<sampleRate && (tailStart+i)<rendered.length; i++) {
    main[i] += rendered.getChannelData(0)[tailStart + i] * 0.5;
  }
  let peak = 0;
  for (let i=0; i<lengthSamples; i++) peak = Math.max(peak, Math.abs(main[i]));
  const scale = peak > 0.89 ? 0.89 / peak : 1;
  const wav = encodeWav(rendered, lengthSamples, sampleRate, scale);
  download(wav, `pulsefour-${state.recipe.id}-${bpm}bpm-${state.key.replace(" ","")}.wav`);
}

function encodeWav(buffer, samples, sampleRate, scale){
  const numCh = 2;
  const bytesPerSample = 3;
  const blockAlign = numCh * bytesPerSample;
  const bufferLength = 44 + samples * blockAlign;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  const writeString = (offset, str) => { for(let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); };
  writeString(0, "RIFF");
  view.setUint32(4, bufferLength-8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeString(36, "data");
  view.setUint32(40, samples * blockAlign, true);
  let offset = 44;
  for (let i=0; i<samples; i++) {
    for (let ch=0; ch<numCh; ch++) {
      let sample = buffer.getChannelData(ch)[i] * scale;
      sample = Math.max(-1, Math.min(1, sample));
      let intSample = Math.round(sample * 8388607);
      view.setInt8(offset, intSample & 0xff);
      view.setInt8(offset+1, (intSample >> 8) & 0xff);
      view.setInt8(offset+2, (intSample >> 16) & 0xff);
      offset += 3;
    }
  }
  return new Blob([arrayBuffer], {type:"audio/wav"});
}

function download(blob, name){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function exportMidi(){
  const bpm = state.bpm;
  const ticksPerBeat = 480;
  const stepTicks = ticksPerBeat / 4;
  const tracks = [[],[],[],[],[]];
  let t = 0;
  for (let step=0; step < state.bars * STEPS; step++) {
    const barIndex = Math.floor(step / STEPS);
    const s = step % STEPS;
    const ch = chordAt(barIndex);
    if (s===0) {
      tracks[0].push({t, note: transpose(ch.piano[2]||60), vel:80, dur: stepTicks*4});
      tracks[1].push({t, note: transpose(ch.bass), vel:90, dur: stepTicks*2});
    }
    if (s===0 || s===8) tracks[3].push({t, note: 36, vel:100, dur: stepTicks});
    t += stepTicks;
  }
  const mid = buildMidi(tracks, bpm, ticksPerBeat);
  download(new Blob([mid], {type:"audio/midi"}), `pulsefour-${state.recipe.id}-${bpm}bpm-${state.key.replace(" ","")}.mid`);
}

function buildMidi(tracks, bpm, tpq){
  const header = [0x4d,0x54,0x68,0x64, 0,0,0,6, 0,1, 0,tracks.length, (tpq>>8)&0xff, tpq&0xff];
  const trackData = tracks.map(events => {
    const bytes = [];
    bytes.push(0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20);
    events.forEach(e => {
      bytes.push(0, 0x90, e.note, e.vel);
    });
    bytes.push(0, 0xff, 0x2f, 0);
    const len = bytes.length;
    return [0x4d,0x54,0x72,0x6b, (len>>24)&0xff,(len>>16)&0xff,(len>>8)&0xff,len&0xff, ...bytes];
  });
  return new Uint8Array([...header, ...trackData.flat()]);
}

function punch(){
  const g=state.groove, r=state.recipe;
  return `PulseFour punch list\n${g.name} · ${state.bpm} BPM · ${state.key} · ${r.name}\n\nThe problem: static loops have no drive. Session players write four live bars of pulse so the pocket moves and the track can finish.\nThe move: ${r.blurb}\n\nVerse (bars 1-8)\n${g.verse.map((b,i)=>`  ${i+1}. ${b.symbol}`).join("\n")}\n\nPulse (bars 9-12) — ${r.name}\n${g.pulse.map((b,i)=>`  ${i+9}. ${b.symbol}`).join("\n")}\n\nLive chairs only. Distinct from TagFour, ModEight, LiftTwo, PreEight, AfterHook, EndEight, LastHook, LockFour.\nDrop the WAV on bar 1 of a ${state.bpm} BPM session. Loop is seamless.`;
}

function paint(){
  const gEl = document.getElementById("grooves"); gEl.innerHTML="";
  grooves.forEach(g=>{
    const b=document.createElement("button");
    b.className="card"+(state.groove.id===g.id?" on":"");
    b.innerHTML=`<b>${g.name}</b><span>${g.bpm} BPM · ${g.key}</span>`;
    b.onclick=()=>{ state.groove=g; state.bpm=g.bpm; state.key=g.key; document.getElementById("bpm").value=g.bpm; document.getElementById("key").value=g.key; saveState(); render(); };
    gEl.appendChild(b);
  });
  const rEl = document.getElementById("recipes"); rEl.innerHTML="";
  recipes.forEach(r=>{
    const b=document.createElement("button");
    b.className="card"+(state.recipe.id===r.id?" on":"");
    b.innerHTML=`<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick=()=>{ state.recipe=r; saveState(); render(); };
    rEl.appendChild(b);
  });
  paintBars();
  document.getElementById("punch").textContent = punch();
}

function paintBars(){
  const el=document.getElementById("barsDisplay"); el.innerHTML="";
  for(let i=0;i<state.bars;i++){
    const ch=chordAt(i); const z=zone(i);
    const d=document.createElement("div");
    d.className="bar "+z;
    d.innerHTML=`<div class="n">${i+1} · ${z==="verse"?"V":"P"}</div><div class="c">${ch.symbol}</div>`;
    el.appendChild(d);
  }
}

function render(){ paint(); }

document.getElementById("bpm").onchange = e => { state.bpm = Math.max(60,Math.min(180,+e.target.value)); saveState(); };
document.getElementById("key").onchange = e => { state.key = e.target.value; saveState(); };
document.getElementById("playA").onclick = () => play("loop");
document.getElementById("playB").onclick = () => play("cut");
document.getElementById("play8").onclick = () => play("eight");
document.getElementById("stop").onclick = stop;
document.getElementById("exportWav").onclick = exportWav;
document.getElementById("exportMid").onclick = exportMidi;
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(punch());

document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });

loadState();
render();
document.getElementById("status").textContent = "Tap play to start audio";
