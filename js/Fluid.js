
import * as GLSL from "./Shaders.js";
import * as LGL from "./WebGL.js";
import {gl , ext, canvas } from "./WebGL.js";
import {config, CONFIG_SCHEMA} from "./config.js";
export class Fluid{

    constructor(gl){
        this.gl = gl;
        this.pointers = [];
        this.splatstack = [];
        this.pointers.push(new pointerPrototype());
        this.displayMaterial = new LGL.Material(GLSL.baseVertexShader, GLSL.displayShaderSource);
        this.canvas = canvas;
        this.lastUpdateTime = 0.0;
        this.noiseSeed = 0.0;
        this.colorUpdateTimer = 0.0;
        this.lutTex = null;
        this.lutReady = false;
        this.lutSize = 0.0;
        this.lutPlaceholderTex = null;
        this.lastFrameMs = 16.6;
        this.adaptivePressureIterations = 0;
        this.idleFrames = 0;
        this.inputsActive = true;
        this.sim = { t: 0.0, x: 0.5, y: 0.5, lastX: 0.5, lastY: 0.5, colorTimer: 0.0, color: LGL.generateColor() };
    }
    
    splatStack = [];
    uniforms;
    

    //create all our shader programs 
    clearProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.clearShader);
    colorProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.colorShader);
    splatProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.splatShader);
    splatColorClickProgram    = new LGL.Program(GLSL.baseVertexShader, GLSL.splatColorClickShader);
    splatVelProgram           = new LGL.Program(GLSL.baseVertexShader, GLSL.splatVelShader); //added to support color / vel map
    splatColorProgram         = new LGL.Program(GLSL.noiseVertexShader, GLSL.splatColorShader); //added to support color / vel map
    advectionProgram          = new LGL.Program(GLSL.baseVertexShader, GLSL.advectionShader);
    divergenceProgram         = new LGL.Program(GLSL.baseVertexShader, GLSL.divergenceShader);
    curlProgram               = new LGL.Program(GLSL.baseVertexShader, GLSL.curlShader);
    vorticityProgram          = new LGL.Program(GLSL.baseVertexShader, GLSL.vorticityShader);
    pressureProgram           = new LGL.Program(GLSL.baseVertexShader, GLSL.pressureShader);
    gradientSubtractProgram   = new LGL.Program(GLSL.baseVertexShader, GLSL.gradientSubtractShader);
    noiseProgram              = new LGL.Program(GLSL.noiseVertexShader, GLSL.noiseShader); //noise generator 
    windProgram               = new LGL.Program(GLSL.baseVertexShader, GLSL.windShader);
    pbrProgram                = new LGL.Program(GLSL.noiseVertexShader, GLSL.bdrfShader); //noise generator 
    LUTProgram                = new LGL.Program(GLSL.noiseVertexShader, GLSL.LUTShader);

    dye;
    velocity;
    divergence;
    curl;
    pressure;
    noise;
    wind;

    picture = LGL.createTextureAsync('img/gold-pal.jpg');
    ditheringTexture = LGL.createTextureAsync('img/LDR_LLL1_0.png');
    // Palette texture array (layers are 1D gradients stored as 2D images)
    paletteArray = LGL.createTexture2DArrayAsync([
        'img/gold-pal.jpg',
        'img/blue-pal.jpg',
        'img/red-pal.jpg',
        'img/ramp1.jpg',
        'img/circle.jpg',
        'img/rect.jpg',
        'img/line.jpg',
        'img/circle-filled.jpg'
    ]);

    initFramebuffers () {
        let simRes = LGL.getResolution(config.SIM_RESOLUTION,  config.FORCE_ASPECT);//getResolution basically just applies view aspect ratio to the passed resolution 
        let dyeRes = LGL.getResolution(config.DYE_RESOLUTION,  config.FORCE_ASPECT);//getResolution basically just applies view aspect ratio to the passed resolution 
        let palRes = LGL.getResolution(config.PALETTE_RESOLUTION, config.FORCE_ASPECT);
        console.log(simRes,dyeRes,palRes);
        const texType = ext.halfFloatTexType; 
        const rgba    = ext.formatRGBA;
        const rg      = ext.formatRG;
        const r       = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    
        gl.disable(gl.BLEND);
    
        //use helper function to create pairs of buffer objects that will be ping pong'd for our sim 
        //this lets us define the buffer objects that we wil want to use for feedback 
        if (this.dye == null || this.noise == null){
            this.dye = LGL.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
            this.noise = LGL.createDoubleFBO(simRes.width/2, simRes.height/2, rgba.internalFormat, rgba.format, texType, filtering);
        }
        else {//resize if needed 
            // Content-preserving resize
            this.dye = LGL.resizeDoubleFBO(this.dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
            this.noise = LGL.resizeDoubleFBO(this.noise, simRes.width/2, simRes.height/2, rgba.internalFormat, rgba.format, texType, filtering);
        }
        if (this.velocity == null){
            this.velocity = LGL.createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        }
        else{//resize if needed 
            this.velocity = LGL.resizeDoubleFBO(this.velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        } 
        //other buffer objects that dont need feedback / ping-pong 
        //notice the filtering type is set to gl.NEAREST meaning we grab just a single px, no filtering 
        this.divergence = LGL.createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.curl       = LGL.createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.pressure   = LGL.createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.post       = LGL.createFBO      (dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, gl.LINEAR);

        fetch('lut/maelstrom_gold.cube')
        .then(r => r.text())
        .then(text => {
            const { size, data } = parseCubeLUT(text); // Float32Array of length size*size*size*3 (RGB)
            if (!size || data.length !== size * size * size * 3) {
                console.error('Invalid LUT data/size');
                return;
            }
            
            // Create 3D texture
            const lutTex = gl.createTexture();
            gl.activeTexture(gl.TEXTURE1);                 // choose a unit for the LUT
            gl.bindTexture(gl.TEXTURE_3D, lutTex);
            
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
            
            // Upload as 32-bit float RGB (alpha implied)
            gl.texImage3D(
                gl.TEXTURE_3D,
                0,
                gl.RGB32F,       // internalFormat
                size, size, size,
                0,
                gl.RGB,          // format
                gl.FLOAT,        // type
                data
            );
            
            // Set uniforms
            // sTexture = your post buffer (likely on unit 0). Keep your existing binding for it.
            // Bind LUT to unit 1 and pass size/mix uniforms.
            this.lutTex = lutTex;
            this.lutReady = true;
            this.lutSize = size;
                      
            console.log('LUT loaded (WebGL2 3D):', size);
        })
        .catch(err => console.error('Error loading LUT:', err));

        // Ensure a placeholder 3D texture exists for validation when LUT not yet loaded
        if (!this.lutPlaceholderTex) {
            const placeholder = gl.createTexture();
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_3D, placeholder);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
            const data = new Uint8Array([255, 255, 255]);
            gl.texImage3D(
                gl.TEXTURE_3D,
                0,
                gl.RGB8,
                1, 1, 1,
                0,
                gl.RGB,
                gl.UNSIGNED_BYTE,
                data
            );
            this.lutPlaceholderTex = placeholder;
        }
    }

    updateSimPointer (dt) {
        // time advance
        const speed = Math.max(0.0, config.SIM_SPEED || 0.0);
        this.sim.t += dt * speed;
        const t = this.sim.t;
        // bounded travel around center
        const travel = Math.min(Math.max(config.SIM_TRAVEL || 0.42, 0.0), 0.49);
        // lightweight FBM-style motion using summed sines with different phases
        const sx = (Math.sin(t * 1.731) + 0.5 * Math.sin(t * 2.913 + 1.234) + 0.25 * Math.sin(t * 4.187 + 2.345)) / (1.0 + 0.5 + 0.25);
        const sy = (Math.sin(t * 1.521 + 0.789) + 0.5 * Math.sin(t * 2.477 + 2.468) + 0.25 * Math.sin(t * 3.963 + 0.357)) / (1.0 + 0.5 + 0.25);
        const sz = (Math.sin(t * 1.317 + 0.987) + 0.5 * Math.sin(t * 2.269 + 1.478) + 0.25 * Math.sin(t * 3.753 + 0.567)) / (1.0 + 0.5 + 0.25);
        let x = 0.5 + travel * sx;
        let y = 0.5 + travel * sy;
        // guard for edges
        x = Math.min(0.985, Math.max(0.015, x));
        y = Math.min(0.985, Math.max(0.015, y));
        // velocity from delta
        const force = Math.max(0.0, config.SIM_FORCE || 0.0);
        const dx = (x - this.sim.lastX) * force;
        const dy = (y - this.sim.lastY) * force;
        this.sim.lastX = x;
        this.sim.lastY = y;
        // occasional color change
        const colorSpeed = Math.max(0.0, config.SIM_COLOR_SPEED || 0.0);
        this.sim.colorTimer += dt * colorSpeed;
        if (this.sim.colorTimer >= 1.0) {
            this.sim.colorTimer = 0.0;
            this.sim.color = LGL.generateColor();
        }
        // drive the fluid like a pointer splat
        this.inputsActive = true; // keep sim from idling while active
        this.splat(x, y, dx, dy, this.sim.color);
    }

    
    simulate(){
        // this.updateKeywords();
        this.initFramebuffers();
        this.multipleSplats(parseInt(Math.random() * 20) + 5);
        this.noiseSeed = 0.0; 
        this.lastUpdateTime = Date.now();
        this.colorUpdateTimer = 0.0;
        this.update();
    }

    update () {
        //time step 
        let now = Date.now();
        let then = this.lastUpdateTime;
        // let dt = 0.016666;
        let frameMs = (now - then);
        this.lastFrameMs = frameMs;
        let dt = frameMs / 1000;
        dt = Math.min(dt, 0.016666); //never want to update slower than 60fps
        this.lastUpdateTime = now;
        this.noiseSeed += dt * config.NOISE_TRANSLATE_SPEED;
        // Re-init FBOs if canvas or target resolutions changed
        const _simRes = LGL.getResolution(config.SIM_RESOLUTION,  config.FORCE_ASPECT);
        const _dyeRes = LGL.getResolution(config.DYE_RESOLUTION,  config.FORCE_ASPECT);
        if (LGL.resizeCanvas()
            || this.dye.width !== _dyeRes.width || this.dye.height !== _dyeRes.height
            || this.velocity.width !== _simRes.width || this.velocity.height !== _simRes.height) {
            this.initFramebuffers();
        }
        this.updateColors(dt); //step through our sim 
        this.applyInputs(); //take from ui (updates inputsActive)
        // noise-driven simulated input (virtual pointer)
        if (config.SIM_ENABLE) this.updateSimPointer(dt);
        if (!config.PAUSED)
            this.step(dt); //do a calculation step 
        this.drawDisplay(null);
        requestAnimationFrame(() => this.update(this));
    }
    
    calcDeltaTime () {
        let now = Date.now();
        let dt = (now - this.lastUpdateTime) / 1000;
        dt = Math.min(dt, 0.016666); //never want to update slower than 60fps
        this.lastUpdateTime = now;
        return dt;
    }

    updateColors (dt) {//used to update the color map for each pointer, which happens slower than the entire sim updates 
        if (!config.COLORFUL) return;
        
        this.colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
        if (this.colorUpdateTimer >= 1) {
            this.colorUpdateTimer = LGL.wrap(this.colorUpdateTimer, 0, 1);
            this.pointers.forEach(p => {
                p.color = LGL.generateColor();
            });
        }
    }

    applyInputs () {
        let hadInput = false;
        if (this.splatStack.length > 0) {
            this.multipleSplats(this.splatStack.pop());
            hadInput = true;
        }
        this.pointers.forEach(p => {
            if (p.moved) {
                p.moved = false;
                this.splatPointer(p);
                hadInput = true;
            }
        });
        // consider force/density maps as active driving signals
        this.inputsActive = hadInput || !!config.FORCE_MAP_ENABLE || !!config.DENSITY_MAP_ENABLE;
        this.idleFrames = this.inputsActive ? 0 : (this.idleFrames + 1);
    }

    step (dt) {
        gl.disable(gl.BLEND);
                
        // Baked noise pass (sampled in BRDF/palette mapping)
        this.noiseProgram.bind();
        gl.uniform1f(this.noiseProgram.uniforms.uPeriod, config.PERIOD);
        gl.uniform3f(this.noiseProgram.uniforms.uTranslate, 0.0, 0.0, 0.0);
        gl.uniform1f(this.noiseProgram.uniforms.uAmplitude, config.AMP);
        gl.uniform1f(this.noiseProgram.uniforms.uSeed, this.noiseSeed);
        gl.uniform1f(this.noiseProgram.uniforms.uExponent, config.EXPONENT);
        gl.uniform1f(this.noiseProgram.uniforms.uRidgeThreshold, config.RIDGE);
        gl.uniform1f(this.noiseProgram.uniforms.uLacunarity, config.LACUNARITY);
        gl.uniform1f(this.noiseProgram.uniforms.uGain, config.GAIN);
        gl.uniform1i(this.noiseProgram.uniforms.uOctaves, config.OCTAVES);
        gl.uniform3f(this.noiseProgram.uniforms.uScale, 1., 1., 1.);
        gl.uniform1f(this.noiseProgram.uniforms.uAspect, config.ASPECT);
        LGL.blit(this.noise.write);
        this.noise.swap();

        this.curlProgram.bind();
        gl.uniform2f(this.curlProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.curlProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        LGL.blit(this.curl);
        
        this.vorticityProgram.bind();
        gl.uniform2f(this.vorticityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curl.attach(1));
        gl.uniform1f(this.vorticityProgram.uniforms.curl, config.CURL);
        gl.uniform1f(this.vorticityProgram.uniforms.uCurlFadeSmoothness, config.CURL_FADE_SMOOTHNESS);
        gl.uniform1f(this.vorticityProgram.uniforms.uCurlFadeAxis, config.CURL_FADE_AXIS);
        gl.uniform1f(this.vorticityProgram.uniforms.uCurlFadeValue, config.CURL_FADE_VALUE);
        gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
        LGL.blit(this.velocity.write);
        this.velocity.swap();
        
        this.divergenceProgram.bind();
        gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
        LGL.blit(this.divergence);
        
        this.clearProgram.bind();
        gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
        gl.uniform1f(this.clearProgram.uniforms.value, config.PRESSURE);
        LGL.blit(this.pressure.write);
        this.pressure.swap();
        
        this.pressureProgram.bind();
        gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
        // Adaptive pressure iterations: aim for ~16.6ms frame; reduce when slow, recover when fast
        if (this.adaptivePressureIterations === 0) this.adaptivePressureIterations = config.PRESSURE_ITERATIONS | 0;
        if (this.lastFrameMs > 18.0) this.adaptivePressureIterations = Math.max(4, Math.floor(this.adaptivePressureIterations * 0.85));
        else if (this.lastFrameMs < 14.0) this.adaptivePressureIterations = Math.min(config.PRESSURE_ITERATIONS | 0, Math.ceil(this.adaptivePressureIterations * 1.1));
        let effectiveIterations = this.adaptivePressureIterations;
        // Light idle optimization: when idle, reduce iterations every other frame
        if (!this.inputsActive && (this.idleFrames % 2 === 1)) {
            effectiveIterations = Math.max(2, Math.floor(effectiveIterations * 0.6));
        }
        for (let i = 0; i < effectiveIterations; i++) {
            gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
            LGL.blit(this.pressure.write);
            this.pressure.swap();
        }
        
        this.gradientSubtractProgram.bind();
        gl.uniform2f(this.gradientSubtractProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(this.gradientSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
        gl.uniform1i(this.gradientSubtractProgram.uniforms.uVelocity, this.velocity.read.attach(1));
        LGL.blit(this.velocity.write);
        this.velocity.swap();

        if(config.FORCE_MAP_ENABLE){
            this.splatVelProgram.bind();
            gl.uniform1i(this.splatVelProgram.uniforms.uTarget, this.velocity.read.attach(0)); 
            // density mask
            gl.uniform1i(this.splatVelProgram.uniforms.uDensityMap, this.picture.attach(1));
            // wind + noise uniforms (match splatVelShader)
            gl.uniform1i(this.splatVelProgram.uniforms.uNoise, this.noise.read.attach(2));
            const t = Date.now() * 0.001;
            const cx = 0.5 + 0.2 * Math.cos(t * 0.1);
            const cy = 0.5 + 0.2 * Math.sin(t * 0.13);
            const p2 = Math.floor((t * 0.25) % 11.0); // cycle wind pattern 0..10
            gl.uniform1f(this.splatVelProgram.uniforms.uGlobalWindScale, config.WIND_SCALE);
            gl.uniform1f(this.splatVelProgram.uniforms.uSmoothness, 0.1);
            gl.uniform1f(this.splatVelProgram.uniforms.uWindMix, 0.5);
            gl.uniform2f(this.splatVelProgram.uniforms.uCenter, cx, cy);
            gl.uniform1f(this.splatVelProgram.uniforms.uWindPattern1, config.WIND_TYPE);
            gl.uniform1f(this.splatVelProgram.uniforms.uWindPattern2, p2);
            gl.uniform1f(this.splatVelProgram.uniforms.uTimeNoise, this.noiseSeed);
            gl.uniform1f(this.splatVelProgram.uniforms.aspectRatio, canvas.width / canvas.height);
            gl.uniform1f(this.splatVelProgram.uniforms.uVelocityScale, config.VELOCITYSCALE);
            gl.uniform2f(this.splatVelProgram.uniforms.point, 0, 0);
            gl.uniform3f(this.splatVelProgram.uniforms.color, 0, 0, 1);
            gl.uniform1i(this.splatVelProgram.uniforms.uClick, 0);
            gl.uniform1f(this.splatVelProgram.uniforms.radius, this.correctRadius(config.SPLAT_RADIUS / 100.0));
            LGL.blit(this.velocity.write);
            this.velocity.swap();
        }
    
        if(config.DENSITY_MAP_ENABLE){

            this.splatColorProgram.bind();
            gl.uniform1f(this.splatColorProgram.uniforms.uFlow, config.FLOW / 1000.0);
            gl.uniform1f(this.splatColorProgram.uniforms.aspectRatio, canvas.width / canvas.height);
            gl.uniform2f(this.splatColorProgram.uniforms.point, 0, 0);
            gl.uniform1i(this.splatColorProgram.uniforms.uTarget, this.dye.read.attach(0));
            gl.uniform1i(this.splatColorProgram.uniforms.uColor, this.picture.attach(1)); //color map
            gl.uniform1i(this.splatColorProgram.uniforms.uDensityMap, this.picture.attach(2)); //density map
            gl.uniform1i(this.splatColorProgram.uniforms.uNoise, this.noise.read.attach(3)); //noise map
            gl.uniform1f(this.splatColorProgram.uniforms.uPaletteMix, config.PALETTE_MIX);
            // bind palette array and pass clamped layer indices
            gl.uniform1i(this.splatColorProgram.uniforms.uPaletteArray, this.paletteArray.attach(4));
            const depth = Math.max(1, this.paletteArray.depth || 1);
            const palA = Math.min(Math.max((config.PALETTE_A|0), 0), depth - 1);
            const palB = Math.min(Math.max((config.PALETTE_B|0), 0), depth - 1);
            const maskPal = Math.min(Math.max((config.MASK_PALETTE|0), 0), depth - 1);
            gl.uniform1i(this.splatColorProgram.uniforms.uPaletteA, palA);
            gl.uniform1f(this.splatColorProgram.uniforms.uSplitPalette, config.SPLIT_PALETTE);
            gl.uniform1f(this.splatColorProgram.uniforms.uSplitAxis, config.SPLIT_AXIS);
            gl.uniform1f(this.splatColorProgram.uniforms.uSplitSmoothness, config.SPLIT_SMOOTHNESS);
            gl.uniform1f(this.splatColorProgram.uniforms.uPaletteRemap, config.PALETTE_REMAP);
            gl.uniform1f(this.splatColorProgram.uniforms.uPaletteMultiply, config.PALETTE_MULTIPLY);
            gl.uniform1i(this.splatColorProgram.uniforms.uPaletteB, palB);
            gl.uniform1i(this.splatColorProgram.uniforms.uMaskPalette, maskPal);
            gl.uniform1f(this.splatColorProgram.uniforms.uPalettePeriod, config.PALETTE_PERIOD);
            gl.uniform1i(this.splatVelProgram.uniforms.uClick, 0);
            gl.uniform1f(this.splatColorProgram.uniforms.radius, this.correctRadius(config.SPLAT_RADIUS / 100.0));
            LGL.blit(this.dye.write);
            this.dye.swap();
        }
        
        this.advectionProgram.bind();
        gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        if (!ext.supportLinearFiltering)
        gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        let velocityId = this.velocity.read.attach(0);
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
        gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
        gl.uniform1f(this.advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
        LGL.blit(this.velocity.write);
        this.velocity.swap();
        
        if (!ext.supportLinearFiltering)
            gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.dye.texelSizeX, this.dye.texelSizeY);
            gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
            gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
            gl.uniform1f(this.advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
            LGL.blit(this.dye.write);
        this.dye.swap();
    }
    
    drawDisplay (target) {
        let width = target == null ? gl.drawingBufferWidth : target.width;
        let height = target == null ? gl.drawingBufferHeight : target.height;
        // BRDF lighting + LUT (guarded)
        this.pbrProgram.bind();
        gl.uniform1i(this.pbrProgram.uniforms.sTexture, this.dye.read.attach(0));
        gl.uniform2f(this.pbrProgram.uniforms.uRes, width, height);
        gl.uniform3f(this.pbrProgram.uniforms.uLightDir, -.5, 1.0, 1.);
        gl.uniform1f(this.pbrProgram.uniforms.uRough, config.BDRF_ROUGH);
        gl.uniform1f(this.pbrProgram.uniforms.uF0, config.BDRF_FRESNAL);
        gl.uniform1f(this.pbrProgram.uniforms.uDiffuse, config.BDRF_DIFFUSE); 
        gl.uniform1f(this.pbrProgram.uniforms.uSpec, config.BDRF_SPECULAR);
        gl.uniform1f(this.pbrProgram.uniforms.uWetDry, .5);
        gl.uniform1f(this.pbrProgram.uniforms.uNormalScale, config.BDRF_NORMALS);
        // Master post uniforms
        gl.uniform1f(this.pbrProgram.uniforms.uExposure,   config.EXPOSURE);
        gl.uniform1f(this.pbrProgram.uniforms.uContrast,   config.CONTRAST);
        gl.uniform1f(this.pbrProgram.uniforms.uGamma,      config.GAMMA);
        gl.uniform1f(this.pbrProgram.uniforms.uBrightness, config.BRIGHTNESS);

        if (this.lutReady && this.lutTex && this.lutSize > 0) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
            gl.uniform1i(this.pbrProgram.uniforms.u_LUT, 1);
            gl.uniform1f(this.pbrProgram.uniforms.u_LUTSize, this.lutSize);
            gl.uniform1f(this.pbrProgram.uniforms.u_LUTMix, config.LUT);
        } else {
            // Bind placeholder and still set u_LUT to distinct unit
            gl.activeTexture(gl.TEXTURE1);
            if (this.lutPlaceholderTex) gl.bindTexture(gl.TEXTURE_3D, this.lutPlaceholderTex);
            gl.uniform1i(this.pbrProgram.uniforms.u_LUT, 1);
            gl.uniform1f(this.pbrProgram.uniforms.u_LUTSize, 0.0);
            gl.uniform1f(this.pbrProgram.uniforms.u_LUTMix, 0.0);
        }

        LGL.blit(target);
    }

    splatPointer (pointer) {
        let dx = pointer.deltaX * config.SPLAT_FORCE;
        let dy = pointer.deltaY * config.SPLAT_FORCE;
        this.splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
    }

    multipleSplats (amount) {
        for (let i = 0; i < amount; i++) {
            const color = LGL.generateColor();
            color.r *= 10.0;
            color.g *= 10.0;
            color.b *= 10.0;
            const x = Math.random();
            const y = Math.random();
            const dx = 1000 * (Math.random() - 0.5);
            const dy = 1000 * (Math.random() - 0.5);
            this.splat(x, y, dx, dy, color);
        }
    }

    splat (x, y, dx, dy, color) {
        //when we click, we just want to add velocity to the sim locally 
        //so we use the delta in position between clicks and add that to the vel map
        this.splatProgram.bind();
        gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
        gl.uniform1f(this.splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(this.splatProgram.uniforms.point, x, y);
        gl.uniform3f(this.splatProgram.uniforms.color, dx, dy, 0.0);
        gl.uniform1f(this.splatProgram.uniforms.radius, this.correctRadius(config.SPLAT_RADIUS / 100.0));
        LGL.blit(this.velocity.write);
        this.velocity.swap();
    
        //pulling the color to add to the sim from a colormap 
        this.splatColorClickProgram.bind();
        gl.uniform1f(this.splatColorClickProgram.uniforms.uFlow, config.SPLAT_FLOW);
        gl.uniform1f(this.splatColorClickProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(this.splatColorClickProgram.uniforms.point, x, y);
        gl.uniform1i(this.splatColorClickProgram.uniforms.uTarget, this.dye.read.attach(0));
        gl.uniform1i(this.splatColorClickProgram.uniforms.uColor, this.picture.attach(1));
        gl.uniform1f(this.splatColorClickProgram.uniforms.radius, this.correctRadius(config.SPLAT_RADIUS / 100.0));
        LGL.blit(this.dye.write);
        this.dye.swap();
    }

    correctRadius (radius) {
        let aspectRatio = canvas.width / canvas.height;
        if (aspectRatio > 1)
            radius *= aspectRatio;
        return radius;
    }

    setupListener(){

        this.canvas.addEventListener('mousedown', e => {
            let posX = scaleByPixelRatio(e.offsetX);
            let posY = scaleByPixelRatio(e.offsetY);
            let pointer = this.pointers.find(p => p.id == -1);
            if (pointer == null)
                pointer = new pointerPrototype();
            updatePointerDownData(pointer, -1, posX, posY);
        });
        
        this.canvas.addEventListener('mousemove', e => {
            let pointer = this.pointers[0];
            if (!pointer.down) return;
            let posX = scaleByPixelRatio(e.offsetX);
            let posY = scaleByPixelRatio(e.offsetY);
            updatePointerMoveData(pointer, posX, posY);
        });
        
        window.addEventListener('mouseup', () => {
            updatePointerUpData(this.pointers[0]);
        });
        
        this.canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            const touches = e.targetTouches;
            while (touches.length >= this.pointers.length)
                this.pointers.push(new pointerPrototype());
            for (let i = 0; i < touches.length; i++) {
                let posX = scaleByPixelRatio(touches[i].pageX);
                let posY = scaleByPixelRatio(touches[i].pageY);
                updatePointerDownData(this.pointers[i + 1], touches[i].identifier, posX, posY, this.canvas);
            }
        });
        
        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const touches = e.targetTouches;
            for (let i = 0; i < touches.length; i++) {
                let pointer = this.pointers[i + 1];
                if (!pointer.down) continue;
                let posX = scaleByPixelRatio(touches[i].pageX);
                let posY = scaleByPixelRatio(touches[i].pageY);
                updatePointerMoveData(pointer, posX, posY, this.canvas);
            }
        }, false);
        
        window.addEventListener('touchend', e => {
            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++)
            {
                let pointer = this.pointers.find(p => p.id == touches[i].identifier);
                if (pointer == null) continue;
                updatePointerUpData(pointer);
            }
        });
        
        window.addEventListener('keydown', e => {
            if (e.code === 'KeyP')
                config.PAUSED = !config.PAUSED;
            if (e.key === ' ')
                this.splatStack.push(parseInt(Math.random() * 20) + 5);
        });
    }

    startGUI () {
        //dat is a library developed by Googles Data Team for building JS interfaces. Needs to be included in project directory 
        var gui = new dat.GUI({ width: 300 });
        
		// Helper to add controls from schema
		const addFromSchema = (folder, key) => {
			const meta = CONFIG_SCHEMA[key];
			let ctrl;
			if (!meta) return folder.add(config, key);
			if (meta.type === 'bool') {
				ctrl = folder.add(config, key);
			} else if (meta.type === 'color') {
				ctrl = folder.addColor(config, key);
			} else {
				if (meta.min !== undefined && meta.max !== undefined) ctrl = folder.add(config, key, meta.min, meta.max);
				else ctrl = folder.add(config, key);
				if (typeof meta.step === 'number') ctrl.step(meta.step);
			}
			if (meta.label) ctrl.name(meta.label);
			return ctrl;
		};

		let fluidFolder = gui.addFolder('Fluid Settings');
		addFromSchema(fluidFolder, 'DENSITY_DISSIPATION');
		addFromSchema(fluidFolder, 'FLOW');
		addFromSchema(fluidFolder, 'SPLAT_FLOW');
		addFromSchema(fluidFolder, 'VELOCITY_DISSIPATION');
		addFromSchema(fluidFolder, 'CURL');
		addFromSchema(fluidFolder, 'VELOCITYSCALE');
		addFromSchema(fluidFolder, 'PRESSURE');
		addFromSchema(fluidFolder, 'CURL');
		addFromSchema(fluidFolder, 'SPLAT_RADIUS');
		addFromSchema(fluidFolder, 'WIND_SCALE');
        addFromSchema(fluidFolder, 'WIND_TYPE');
		addFromSchema(fluidFolder, 'LUT');
		addFromSchema(fluidFolder, 'BDRF_NORMALS');
        addFromSchema(fluidFolder, 'EXPOSURE');
        addFromSchema(fluidFolder, 'CONTRAST');
        addFromSchema(fluidFolder, 'GAMMA');
        addFromSchema(fluidFolder, 'BRIGHTNESS');
        addFromSchema(fluidFolder, 'PALETTE_A');
        addFromSchema(fluidFolder, 'PALETTE_B');
        addFromSchema(fluidFolder, 'MASK_PALETTE');
        addFromSchema(fluidFolder, 'SPLIT_PALETTE');
        addFromSchema(fluidFolder, 'SPLIT_AXIS');
        addFromSchema(fluidFolder, 'SPLIT_SMOOTHNESS');
        addFromSchema(fluidFolder, 'PALETTE_MIX');
        addFromSchema(fluidFolder, 'PALETTE_PERIOD');
        addFromSchema(fluidFolder, 'PALETTE_REMAP');
        addFromSchema(fluidFolder, 'PALETTE_MULTIPLY');
        addFromSchema(fluidFolder, 'SIM_ENABLE');
        addFromSchema(fluidFolder, 'SIM_SPEED');
        addFromSchema(fluidFolder, 'SIM_TRAVEL');
        addFromSchema(fluidFolder, 'SIM_FORCE');
        addFromSchema(fluidFolder, 'SIM_COLOR_SPEED');
        addFromSchema(fluidFolder, 'CURL_FADE_SMOOTHNESS');
        addFromSchema(fluidFolder, 'CURL_FADE_AXIS');
        addFromSchema(fluidFolder, 'CURL_FADE_VALUE');
        fluidFolder.close();
        

		const resetCtrl = addFromSchema(gui, 'RESET');
		if (resetCtrl) resetCtrl.onFinishChange(reset);
		const randomCtrl = addFromSchema(gui, 'RANDOM');
		if (randomCtrl) randomCtrl.onFinishChange(randomizeParams);

        function reset(){
            fluidFolder.__controllers.forEach(c => c.setValue(c.initialValue));
        }

        function randomizeParams(){
            fluidFolder.__controllers.forEach(c => {
                const key = c.property;
                const meta = CONFIG_SCHEMA[key];
                if (!meta || meta.randomize !== true) return;
                if (meta.type === 'bool') {
                    c.setValue(Math.random() < 0.5);
                    return;
                }
                if (meta.type === 'color') {
                    // Expecting RGB object {r,g,b}; skip unless explicitly marked randomize
                    const col = LGL.generateColor ? LGL.generateColor() : { r: Math.random(), g: Math.random(), b: Math.random() };
                    // dat.GUI color controllers accept object or hex; config uses object
                    c.setValue({ r: Math.round(col.r*255), g: Math.round(col.g*255), b: Math.round(col.b*255) });
                    return;
                }
                const min = (typeof c.__min === 'number') ? c.__min : 0.0;
                const max = (typeof c.__max === 'number') ? c.__max : 1.0;
                let v = Math.random() * (max - min) + min;
                if (meta.type === 'int') v = Math.round(v);
                if (typeof meta.step === 'number' && meta.step > 0 && meta.type !== 'int') {
                    v = Math.round(v / meta.step) * meta.step;
                }
                v = Math.min(max, Math.max(min, v));
                c.setValue(v);
            });
        }

        // -------------------- Presets (Save / Load) --------------------
        const PRESET_KEY = 'maelstrom_presets_v1';
        const presetsFolder = gui.addFolder('Presets');
        const presetsModel = { name: 'Preset 1', selected: '' };

        function readPresets(){
            try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); }
            catch(e){ return {}; }
        }
        function writePresets(obj){
            try { localStorage.setItem(PRESET_KEY, JSON.stringify(obj)); }
            catch(e){ /* ignore quota */ }
        }
        function listNames(){
            return Object.keys(readPresets()).sort();
        }
        function captureCurrent(){
            const out = {};
            Object.keys(CONFIG_SCHEMA).forEach(k => { out[k] = config[k]; });
            return out;
        }
        function applyPreset(presetObj){
            if (!presetObj) return;
            Object.keys(presetObj).forEach(k => {
                if (k in config) config[k] = presetObj[k];
            });
            // sync visible controls
            fluidFolder.__controllers.forEach(c => {
                const k = c.property;
                if (k in config) c.setValue(config[k]);
            });
        }

        // UI
        const nameCtrl = presetsFolder.add(presetsModel, 'name').name('Name');
        let selectCtrl = null;
        function refreshSelect(){
            if (selectCtrl) presetsFolder.remove(selectCtrl);
            const names = listNames();
            presetsModel.selected = names[0] || '';
            selectCtrl = presetsFolder.add(presetsModel, 'selected', names).name('Select');
        }
        function saveAction(){
            const name = (presetsModel.name || '').trim();
            if (!name) return;
            const all = readPresets();
            all[name] = captureCurrent();
            writePresets(all);
            refreshSelect();
        }
        function loadAction(){
            const all = readPresets();
            const preset = all[presetsModel.selected];
            applyPreset(preset);
        }
        function deleteAction(){
            const sel = presetsModel.selected;
            if (!sel) return;
            const all = readPresets();
            delete all[sel];
            writePresets(all);
            refreshSelect();
        }
        // Export / Import helpers
        function download(filename, text){
            const blob = new Blob([text], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        function exportAction(){
            const name = (presetsModel.name || presetsModel.selected || 'Preset').trim();
            const safe = name.replace(/[\\/:*?"<>|]+/g, '_');
            const payload = {
                name,
                version: 1,
                timestamp: new Date().toISOString(),
                config: captureCurrent()
            };
            download(`${safe}.json`, JSON.stringify(payload, null, 2));
        }
        function exportAllAction(){
            const all = readPresets();
            const payload = {
                name: 'All Presets',
                version: 1,
                timestamp: new Date().toISOString(),
                presets: all
            };
            download(`presets.json`, JSON.stringify(payload, null, 2));
        }
        function importAction(){
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const data = JSON.parse(String(reader.result || ''));
                        // Accept either {config:{...}} or flat config object
                        const presetObj = data && data.config && typeof data.config === 'object' ? data.config : data;
                        applyPreset(presetObj);
                        // Optionally store under provided name
                        const all = readPresets();
                        const nm = (data && data.name) ? String(data.name) : (file.name.replace(/\.json$/i,'') || 'Imported');
                        all[nm] = presetObj;
                        writePresets(all);
                        presetsModel.name = nm;
                        refreshSelect();
                    } catch (err) {
                        console.error('Invalid preset JSON:', err);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        refreshSelect();
        presetsFolder.add({save: saveAction}, 'save').name('Save Preset');
        presetsFolder.add({load: loadAction}, 'load').name('Load Preset');
        presetsFolder.add({export: exportAction}, 'export').name('Export Preset (.json)');
        presetsFolder.add({exportAll: exportAllAction}, 'exportAll').name('Export All Presets (presets.json)');
        presetsFolder.add({import: importAction}, 'import').name('Import Preset (.json)');
        presetsFolder.add({remove: deleteAction}, 'remove').name('Delete Preset');
        presetsFolder.close();

    }
} //end class

export function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
    this.color = [30, 0, 300];
}

function correctDeltaX (delta, canvas) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta, canvas) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

function updatePointerDownData (pointer, id, posX, posY, canvas) {
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

function updatePointerMoveData (pointer, posX, posY, canvas) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX, canvas);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY, canvas);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}

function parseCubeLUT(cubeText) {
    const lines = cubeText.split('\n');
    let size = 0;
    const data = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('LUT_3D_SIZE')) {
        size = parseInt(trimmed.split(' ')[1]);
        continue;
      }
      const parts = trimmed.split(' ').filter(p => p !== '');
      if (parts.length === 3) {
        data.push(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
      }
    }
    return { size, data: new Float32Array(data) };
  }

   