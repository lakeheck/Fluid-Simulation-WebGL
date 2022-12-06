
'use strict';

// Mobile promo section
import {gl , ext, canvas } from "./js/WebGL.js";
import {config} from "./js/config.js";
import {Fluid} from "./js/Fluid.js";
import * as LGL from "./js/WebGL.js";


LGL.resizeCanvas();

let f = new Fluid(gl);
console.log(f);
f.simulate();

