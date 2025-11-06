
'use strict';

import {gl , ext, canvas } from "./js/WebGL.js";
import {config, CONFIG_SCHEMA} from "./js/config.js";
import {Fluid, pointerPrototype} from "./js/Fluid.js";
import * as LGL from "./js/WebGL.js";

LGL.resizeCanvas();

let fluid = new Fluid(gl);
fluid.startGUI();
fluid.simulate();


/////// listeners and helper fxns to add pointers /////////

canvas.addEventListener('mousedown', e => {
    let posX = LGL.scaleByPixelRatio(e.offsetX);
    let posY = LGL.scaleByPixelRatio(e.offsetY);
    let pointer = fluid.pointers.find(p => p.id == -1);
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    let pointer = fluid.pointers[0];
    if (!pointer.down) return;
    let posX = LGL.scaleByPixelRatio(e.offsetX);
    let posY = LGL.scaleByPixelRatio(e.offsetY);
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
    updatePointerUpData(fluid.pointers[0]);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length >= fluid.pointers.length)
        fluid.pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
        let posX = LGL.scaleByPixelRatio(touches[i].pageX);
        let posY = LGL.scaleByPixelRatio(touches[i].pageY);
        updatePointerDownData(fluid.pointers[i + 1], touches[i].identifier, posX, posY);
    }
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = fluid.pointers[i + 1];
        if (!pointer.down) continue;
        let posX = LGL.scaleByPixelRatio(touches[i].pageX);
        let posY = LGL.scaleByPixelRatio(touches[i].pageY);
        updatePointerMoveData(pointer, posX, posY, canvas);
    }
}, false);

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
    {
        let pointer = fluid.pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
});

window.addEventListener('keydown', e => {
    if (e.code === 'KeyP')
        config.PAUSED = !config.PAUSED;
    if (e.key === ' ')
        fluid.splatStack.push(parseInt(Math.random() * 20) + 5);
});


function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}


function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = LGL.generateColor();
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}


// =============================================================================
// Layer SDK Integration: Control Simulation Shader Parameters
// =============================================================================


// =============================================================================
// App Class: Holds simulation parameters (to be passed to the simulation shader)
// =============================================================================
class App {
  constructor() {
    // Simulation parameters for our sim shader.
    this.playing = true;
  }
  setPlaying(value) {
    this.playing = value;
  }
  getPlaying() {
    return this.playing;
  }
}
const app = new App();
globalThis.addEventListener("layer:dimensionschange", (event) => {
  canvas.width = event.detail.width;
  canvas.height = event.detail.height;
});
globalThis.addEventListener("layer:play", () => {
  config.PAUSED = false;
  app.setPlaying(true);
});
globalThis.addEventListener("layer:pause", () => {
  config.PAUSED = true;
  app.setPlaying(false);
});
globalThis.addEventListener("layer:paramchange", (event) => {
  const toCamel = (s) => s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const idToKey = Object.entries(CONFIG_SCHEMA)
    .filter(([, meta]) => meta && meta.layerParam)
    .reduce((m, [key, meta]) => { m[(meta.id || toCamel(key))] = key; return m; }, {});
  const id = event.detail.id;
  if (idToKey[id]) {
    const key = idToKey[id];
    const value = event.detail.value;
    config[key] = value;
    if (key === 'PAUSED') app.setPlaying(!value);
  }
});


// Request parameters from the parent platform.
(async () => {
  const toCamel = (s) => s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  const entries = Object.entries(CONFIG_SCHEMA).filter(([, meta]) => meta && meta.layerParam);
  const idToKey = {};
  const params = {};

  for (const [key, meta] of entries) {
    const id = meta.id || toCamel(key);
    idToKey[id] = key;
    const kind = (meta.type === 'bool') ? 'BOOLEAN' : 'NUMBER';
    params[id] = {
      id,
      name: meta.label || id,
      description: meta.label || id,
      customization_level: 'CURATOR',
      kind,
      min: kind === 'NUMBER' ? meta.min : undefined,
      max: kind === 'NUMBER' ? meta.max : undefined,
      step: kind === 'NUMBER' ? (meta.step ?? 0.001) : undefined,
      default: meta.default,
    };
  }

  const values = await $layer.params(...Object.values(params));

  for (const [id, value] of Object.entries(values)) {
    const key = idToKey[id];
    if (!key) continue;
    config[key] = value;
    if (key === 'PAUSED') app.setPlaying(!value);
  }

  app.playing = !$layer.controlled;
  $layer.previewEnabled = true;
})();

addEventListener('message', (event) => {
	if (typeof event.data !== 'string') return;
	if (!event.data.startsWith('layer:')) return;
	// console.log(event.data);
});
