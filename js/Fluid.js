
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
    domainWarpProgram         = new LGL.Program(GLSL.noiseVertexShader, GLSL.domainWarpShader);

    dye;
    velocity;
    divergence;
    curl;
    pressure;
    noise;
    wind;

    picture = LGL.createTextureAsync('img/colored_noise_bg.jpg');
    ditheringTexture = LGL.createTextureAsync('img/colored_noise_bg.jpg');

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
            // this.dye = LGL.resizeDoubleFBO(this.dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering); // TODO this line is causing the horizontal bars on window resize
            this.noise = LGL.resizeDoubleFBO(this.noise, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
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
        this.wind       = LGL.createFBO      (simRes.width/2, simRes.height/2, rgba.internalFormat, rgba.format, texType, gl.LINEAR);
        this.post       = LGL.createFBO      (dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, gl.LINEAR);
        this.palette    = LGL.createFBO      (palRes.width, palRes.height, rgba.internalFormat, rgba.format, texType, gl.LINEAR);

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
        if (LGL.resizeCanvas() || (this.dye.width != config.DYE_RESOLUTION && this.dye.height != config.DYE_RESOLUTION) || (this.velocity.width != config.SIM_RESOLUTION && this.velocity.height != config.SIM_RESOLUTION)) //resize if needed 
            this.initFramebuffers();
        this.updateColors(dt); //step through our sim 
        this.applyInputs(); //take from ui (updates inputsActive)
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
        gl.uniform1f(this.noiseProgram.uniforms.uPeriod, 3.0);
        gl.uniform3f(this.noiseProgram.uniforms.uTranslate, 0.0, 0.0, 0.0);
        gl.uniform1f(this.noiseProgram.uniforms.uAmplitude, 1.0);
        gl.uniform1f(this.noiseProgram.uniforms.uSeed, this.noiseSeed);
        gl.uniform1f(this.noiseProgram.uniforms.uExponent, 1.0);
        gl.uniform1f(this.noiseProgram.uniforms.uRidgeThreshold, 1.0);
        gl.uniform1f(this.noiseProgram.uniforms.uLacunarity, 2.0);
        gl.uniform1f(this.noiseProgram.uniforms.uGain, 0.5);
        gl.uniform1i(this.noiseProgram.uniforms.uOctaves, 4);
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
            gl.uniform1f(this.splatVelProgram.uniforms.uGlobalWindScale, config.WIND_SCALE);
            gl.uniform1f(this.splatVelProgram.uniforms.uSmoothness, 0.1);
            gl.uniform1f(this.splatVelProgram.uniforms.uWindMix, 0.5);
            gl.uniform2f(this.splatVelProgram.uniforms.uCenter, 0.5, 0.5);
            gl.uniform1f(this.splatVelProgram.uniforms.uWindPattern1, config.WIND_TYPE);
            gl.uniform1f(this.splatVelProgram.uniforms.uWindPattern2, 10.0);
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
            gl.uniform1i(this.splatColorProgram.uniforms.uPaletteA, config.PALETTE_A);
            gl.uniform1i(this.splatColorProgram.uniforms.uPaletteB, config.PALETTE_B);
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
        addFromSchema(fluidFolder, 'PALETTE_A');
        addFromSchema(fluidFolder, 'PALETTE_B');
        addFromSchema(fluidFolder, 'PALETTE_MIX');
        fluidFolder.open();
        
		const pausedCtrl = addFromSchema(gui, 'PAUSED');
		if (pausedCtrl && pausedCtrl.listen) pausedCtrl.listen();
		const resetCtrl = addFromSchema(gui, 'RESET');
		if (resetCtrl) resetCtrl.onFinishChange(reset);
		const randomCtrl = addFromSchema(gui, 'RANDOM');
		if (randomCtrl) randomCtrl.onFinishChange(randomizeParams);

        function reset(){
            fluidFolder.__controllers.forEach(c => c.setValue(c.initialValue));
        }

        function randomizeParams(){
            fluidFolder.__controllers.forEach(c => c.setValue(Math.random()*(c.__max - c.__min) + c.__min));
        }

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

   