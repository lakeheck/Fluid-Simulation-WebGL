
import * as GLSL from "./Shaders.js";
import * as LGL from "./WebGL.js";
import {gl , ext, canvas } from "./WebGL.js";
import {config} from "./config.js";
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
    }

    splatStack = [];


    //create all our shader programs 
    blurProgram               = new LGL.Program(GLSL.blurVertexShader, GLSL.blurShader);
    copyProgram               = new LGL.Program(GLSL.baseVertexShader, GLSL.copyShader);
    clearProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.clearShader);
    colorProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.colorShader);
    checkerboardProgram       = new LGL.Program(GLSL.baseVertexShader, GLSL.checkerboardShader);
    bloomPrefilterProgram     = new LGL.Program(GLSL.baseVertexShader, GLSL.bloomPrefilterShader);
    bloomBlurProgram          = new LGL.Program(GLSL.baseVertexShader, GLSL.bloomBlurShader);
    bloomFinalProgram         = new LGL.Program(GLSL.baseVertexShader, GLSL.bloomFinalShader);
    sunraysMaskProgram        = new LGL.Program(GLSL.baseVertexShader, GLSL.sunraysMaskShader);
    sunraysProgram            = new LGL.Program(GLSL.baseVertexShader, GLSL.sunraysShader);
    splatProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.splatShader);
    splatColorClickProgram    = new LGL.Program(GLSL.baseVertexShader, GLSL.splatColorClickShader);
    splatVelProgram           = new LGL.Program(GLSL.baseVertexShader, GLSL.splatVelShader); //added to support color / vel map
    splatColorProgram         = new LGL.Program(GLSL.baseVertexShader, GLSL.splatColorShader); //added to support color / vel map
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
    bloom;
    bloomFramebuffers = [];
    sunrays;
    sunraysTemp;
    noise;
    wind;

    picture = LGL.createTextureAsync('img/colored_noise_bg.jpg');
    ditheringTexture = LGL.createTextureAsync('img/LDR_LLL1_0.png');
    

    initFramebuffers () {
        let simRes = LGL.getResolution(config.SIM_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 
        let dyeRes = LGL.getResolution(config.DYE_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 
    
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
            this.noise = LGL.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        }
        else {//resize if needed 
            // this.dye = LGL.resizeDoubleFBO(this.dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering); // TODO this line is causing the horizontal bars on window resize
            this.noise = LGL.resizeDoubleFBO(this.noise, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
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
        this.wind       = LGL.createFBO      (simRes.width, simRes.height, rgba.internalFormat, rgba.format, texType, gl.NEAREST);
        this.post       = LGL.createFBO      (dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, gl.NEAREST);

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
            this.LUTProgram.bind();
            gl.uniform1i(this.LUTProgram.uniforms.u_LUT, 1);
            gl.uniform1f(this.LUTProgram.uniforms.u_LUTSize, size);
            gl.uniform1f(this.LUTProgram.uniforms.u_LUTMix, 1.0);
                      
            console.log('LUT loaded (WebGL2 3D):', size);
        })
        .catch(err => console.error('Error loading LUT:', err));
    }

    updateKeywords () {
        let displayKeywords = [];
        if (config.SHADING) displayKeywords.push("SHADING");
        if (config.BLOOM) displayKeywords.push("BLOOM");
        if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
        this.displayMaterial.setKeywords(displayKeywords);
    }
    
    simulate(){
        this.updateKeywords();
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
        let dt = (now - then) / 1000;
        dt = Math.min(dt, 0.016666); //never want to update slower than 60fps
        this.lastUpdateTime = now;
        this.noiseSeed += dt * config.NOISE_TRANSLATE_SPEED;
        if (LGL.resizeCanvas() || (this.dye.width != config.DYE_RESOLUTION && this.dye.height != config.DYE_RESOLUTION) || (this.velocity.width != config.SIM_RESOLUTION && this.velocity.height != config.SIM_RESOLUTION)) //resize if needed 
            this.initFramebuffers();
        this.updateColors(dt); //step through our sim 
        this.applyInputs(); //take from ui
        if (!config.PAUSED)
            this.step(dt); //do a calculation step 
        this.render(null);
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
        // console.log(this.splatStack);
        if (this.splatStack.length > 0) //if there are splats then recreate them
        this.multipleSplats(this.splatStack.pop());//TODO - verify what elemetns of splatStack are and what splatStack.pop() will return (should be int??)
        
        
        this.pointers.forEach(p => { //create a splat for our pointers 
            if (p.moved) {
                p.moved = false;
                this.splatPointer(p);
            }
        });
    }


    step (dt) {
        gl.disable(gl.BLEND);
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

        this.windProgram.bind();
        gl.uniform1f(this.windProgram.uniforms.uGlobalWindScale, 1.5);
        gl.uniform2f(this.windProgram.uniforms.uCenter, .5, .5); 
        gl.uniform1f(this.windProgram.uniforms.uSmoothness, 0.1); 
        gl.uniform1f(this.windProgram.uniforms.uWindMix, 0); 
        gl.uniform1f(this.windProgram.uniforms.uWindPattern1, config.WIND_TYPE); 
        gl.uniform1f(this.windProgram.uniforms.uWindPattern2, 10); 
        LGL.blit(this.wind);

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
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
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
            // gl.uniformthis.1i(splatVelProgram.uniforms.uTarget, velocity.read.attach(0));
            gl.uniform1i(this.splatVelProgram.uniforms.uDensityMap, this.picture.attach(1)); //density map
            gl.uniform1i(this.splatVelProgram.uniforms.uForceMap, this.noise.read.attach(2)); //add noise for velocity map 
            gl.uniform1i(this.splatVelProgram.uniforms.uWindMap, this.wind.attach(3)); //add noise for velocity map 
            
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
            gl.uniform1f(this.splatColorProgram.uniforms.uFlow, config.FLOW / 1000);
            gl.uniform1f(this.splatColorProgram.uniforms.aspectRatio, canvas.width / canvas.height);
            gl.uniform2f(this.splatColorProgram.uniforms.point, 0, 0);
            gl.uniform1i(this.splatColorProgram.uniforms.uTarget, this.dye.read.attach(0));
            gl.uniform1i(this.splatColorProgram.uniforms.uColor, this.picture.attach(1)); //color map
            gl.uniform1i(this.splatColorProgram.uniforms.uDensityMap, this.picture.attach(2)); //density map
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

    render (target) {
        if (config.BLOOM)
            applyBloom(this.dye.read, bloom);
            if (config.SUNRAYS) {
                this.applySunrays(this.dye.read, this.dye.write, this.sunrays);
                this.blur(this.sunrays, this.sunraysTemp, 1);
            }
            
            if (target == null || !config.TRANSPARENT) {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.enable(gl.BLEND);
            }
            else {
                gl.disable(gl.BLEND);
            }
            
            if (!config.TRANSPARENT)
            drawColor(target, LGL.normalizeColor(config.BACK_COLOR), this.colorProgram);
            if (target == null && config.TRANSPARENT)
            drawCheckerboard(target, this.checkerboardProgram);
        if(config.DISPLAY_FLUID){
            this.drawDisplay(target);
        }
        else{
            this.drawDisplay(this.noise);
        }
        // LGL.blit(picture);
        
    }
    
    drawDisplay (target) {
        let width = target == null ? gl.drawingBufferWidth : target.width;
        let height = target == null ? gl.drawingBufferHeight : target.height;
        //BRDF lighting pass
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
        LGL.blit(this.post);

        this.LUTProgram.bind();
        gl.uniform1i(this.LUTProgram.uniforms.sTexture, this.post.attach(0));
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
        const parName = 'Output Resolution';
        //dat is a library developed by Googles Data Team for building JS interfaces. Needs to be included in project directory 
        var gui = new dat.GUI({ width: 300 });
    
        gui.add(config, 'DYE_RESOLUTION', { 'high': 1024, 'medium': 512, 'low': 256, 'very low': 128 }).name(parName);
        gui.add(config, 'SIM_RESOLUTION', { '32': 32, '64': 64, '128': 128, '256': 256 }).name('Fluid Sim Resolution');
        
        let fluidFolder = gui.addFolder('Fluid Settings');
        fluidFolder.add(config, 'DENSITY_DISSIPATION', 0, 4.0).name('Density Diffusion');
        fluidFolder.add(config, 'FLOW', 0, 10).name('Flow');
        fluidFolder.add(config, 'SPLAT_FLOW', 0, 1).name('Splat Flow');
        fluidFolder.add(config, 'VELOCITY_DISSIPATION', 0, 4.0).name('Velocity Diffusion');
        fluidFolder.add(config, 'VELOCITYSCALE', 0, 10.0).name('Velocity Scale');
        fluidFolder.add(config, 'PRESSURE', 0.0, 1.0).name('Pressure');
        fluidFolder.add(config, 'CURL', 0, 50).name('Vorticity').step(1);
        fluidFolder.add(config, 'SPLAT_RADIUS', 0.01, 1.0).name('Splat Radius');
        fluidFolder.add({ fun: () => {
            splatStack.push(parseInt(Math.random() * 20) + 5);
        } }, 'fun').name('Random splats');
        
        
        let mapFolder = gui.addFolder('Enable / Disable Maps');
        mapFolder.add(config, 'FORCE_MAP_ENABLE').name('force map enable');
        mapFolder.add(config, 'DENSITY_MAP_ENABLE').name('density map enable'); //adding listen() will update the ui if the parameter value changes elsewhere in the program 
        mapFolder.add(config, 'DISPLAY_FLUID').name('Toggle Show Vel Map');
        
        let noiseFolder = gui.addFolder('Velocity Map');
        noiseFolder.add(config, 'PERIOD', 0, 10.0).name('Period');
        noiseFolder.add(config, 'EXPONENT', 0, 4.0).name('Exponent');
        noiseFolder.add(config, 'RIDGE', 0, 1.5).name('Ridge');
        noiseFolder.add(config, 'AMP', 0, 4.0).name('Amplitude');
        noiseFolder.add(config, 'LACUNARITY', 0, 4).name('Lacunarity');
        noiseFolder.add(config, 'NOISE_TRANSLATE_SPEED', 0, .5).name('Noise Translate Speed');
        noiseFolder.add(config, 'GAIN', 0.0, 1.0).name('Gain');
        noiseFolder.add(config, 'OCTAVES', 0, 8).name('Octaves').step(1);
        
        gui.add(config, 'PAUSED').name('Paused').listen();
        gui.add(config, 'RESET').name('Reset').onFinishChange(reset);
        gui.add(config, 'RANDOM').name('Randomize').onFinishChange(randomizeParams);

        //not using these 
        // let bloomFolder = gui.addFolder('Bloom');
        // bloomFolder.add(config, 'BLOOM').name('enabled').onFinishChange(updateKeywords);
        // bloomFolder.add(config, 'BLOOM_INTENSITY', 0.1, 2.0).name('intensity');
        // bloomFolder.add(config, 'BLOOM_THRESHOLD', 0.0, 1.0).name('threshold');
    
        // let sunraysFolder = gui.addFolder('Sunrays');
        // sunraysFolder.add(config, 'SUNRAYS').name('enabled').onFinishChange(this.updateKeywords);
        // sunraysFolder.add(config, 'SUNRAYS_WEIGHT', 0.01, 1.0).name('weight');
    
        //create a function to assign to a button, here linking my github
        let github = gui.add({ fun : () => {
            window.open('https://github.com/lakeheck/Fluid-Simulation-WebGL');
            ga('send', 'event', 'link button', 'github');
        } }, 'fun').name('Github');
        github.__li.className = 'cr function bigFont';
        github.__li.style.borderLeft = '3px solid #8C8C8C';
        let githubIcon = document.createElement('span');
        github.domElement.parentElement.appendChild(githubIcon);
        githubIcon.className = 'icon github';
    
        if (LGL.isMobile())
            gui.close();

            
        function reset(){
            noiseFolder.__controllers.forEach(c => c.setValue(c.initialValue));
            fluidFolder.__controllers.forEach(c => c.setValue(c.initialValue));
            mapFolder.__controllers.forEach(c => c.setValue(c.initialValue));
        }


        function randomizeParams(){
            noiseFolder.__controllers.forEach(c => c.setValue(Math.random()*(c.__max - c.__min) + c.__min));
            fluidFolder.__controllers.forEach(c => c.setValue(Math.random()*(c.__max - c.__min) + c.__min));

        }

    }
}

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
    
function drawColor (target, color, colorProgram) {
    colorProgram.bind();
    gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
    LGL.blit(target);
}

function drawCheckerboard (target, checkerboardProgram) {
    checkerboardProgram.bind();
    gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    LGL.blit(target);
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
  