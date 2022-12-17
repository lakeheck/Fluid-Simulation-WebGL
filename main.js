
'use strict';

import {gl , ext, canvas } from "./js/WebGL.js";
import {config} from "./js/config.js";
import {Fluid, pointerPrototype} from "./js/Fluid.js";
import * as LGL from "./js/WebGL.js";

if (LGL.isMobile()) {
    config.DYE_RESOLUTION = 512;
}


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