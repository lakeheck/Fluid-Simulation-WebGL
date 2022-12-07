
import * as GLSL from "./Shaders.js";
import * as LGL from "./WebGL.js";
import {gl , ext, canvas } from "./WebGL.js";
import {config} from "./config.js";
export class Noise{

    constructor(gl){
        this.displayMaterial = new LGL.Material(GLSL.baseVertexShader, GLSL.displayShaderSource);
        this.canvas = canvas;
        this.lastUpdateTime = 0.0;
        this.noiseSeed = 0.0;
        this.colorUpdateTimer = 0.0;
    }

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
    noiseProgram              = new LGL.Program(GLSL.noiseVertexShader, GLSL.noiseShader); //noise generator 
    errataNoiseProgram        = new LGL.Program(GLSL.noiseVertexShader, GLSL.errataNoiseShader); //noise generator    



    bloom;
    bloomFramebuffers = [];
    sunrays;
    sunraysTemp;
    noise;
    

    initFramebuffers () {
        let dyeRes = LGL.getResolution(config.DYE_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 
    
        const texType = ext.halfFloatTexType; //TODO - should be 32 bit floats? 
        const rgba    = ext.formatRGBA;
        const rg      = ext.formatRG;
        const r       = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    
        gl.disable(gl.BLEND);
    
        //use helper function to create pairs of buffer objects that will be ping pong'd for our sim 
        //this lets us define the buffer objects that we wil want to use for feedback 
        if (this.dye == null || this.noise == null){
            this.noise = LGL.createDoubleFBO(canvas.width, canvas.height, rgba.internalFormat, rgba.format, texType, filtering);
        }
        else {//resize if needed 
            this.noise = LGL.resizeDoubleFBO(this.noise, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

        }
        this.initBloomFramebuffers();
        this.initSunraysFramebuffers();
    }

    initBloomFramebuffers () {
        let res = LGL.getResolution(config.BLOOM_RESOLUTION);
    
        const texType = ext.halfFloatTexType;
        const rgba = ext.formatRGBA;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    
        this.bloom = LGL.createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);
    
        this.bloomFramebuffers.length = 0;
        for (let i = 0; i < config.BLOOM_ITERATIONS; i++)
        {
            //right shift resolution by iteration amount 
            // ie we reduce the resolution by a factor of 2^i, or rightshift(x,y) -> x/pow(2,y)
            // (1024 >> 1 = 512)
            // so basically creating mipmaps
            let width = res.width >> (i + 1);
            let height = res.height >> (i + 1);
    
            if (width < 2 || height < 2) break;
    
            let fbo = LGL.createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering);
            this.bloomFramebuffers.push(fbo);
        }
    }

    initSunraysFramebuffers () {
        let res = LGL.getResolution(config.SUNRAYS_RESOLUTION);
    
        const texType = ext.halfFloatTexType;
        const r = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    
        this.sunrays     = LGL.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
        this.sunraysTemp = LGL.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    }

    updateKeywords () {
        let displayKeywords = [];
        if (config.SHADING) displayKeywords.push("SHADING");
        if (config.BLOOM) displayKeywords.push("BLOOM");
        if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
        this.displayMaterial.setKeywords(displayKeywords);
    }
    
    simulate(){
        this.updateKeywords(this);
        this.initFramebuffers();
        this.noiseSeed = 0.0; 
        this.lastUpdateTime = Date.now();
        this.colorUpdateTimer = 0.0;
        this.update();
    }

    update () {
        //time step 
        let now = Date.now();
        let then = this.lastUpdateTime;
        let dt = (now - then) / 1000;
        dt = Math.min(dt, 0.016666); //never want to update slower than 60fps
        this.lastUpdateTime = now;
        this.noiseSeed += dt * config.NOISE_TRANSLATE_SPEED;
        if (LGL.resizeCanvas()) //resize if needed 
            this.initFramebuffers();
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

    step (dt) {
        gl.disable(gl.BLEND);

        if(config.ERRATA){
            this.errataNoiseProgram.bind();
            gl.uniform1f(this.errataNoiseProgram.uniforms.uPeriod, config.PERIOD); 
            gl.uniform3f(this.errataNoiseProgram.uniforms.uTranslate, 0.0, 0.0, 0.0);
            gl.uniform1f(this.errataNoiseProgram.uniforms.uAmplitude, config.AMP); 
            gl.uniform1f(this.errataNoiseProgram.uniforms.uSeed, this.noiseSeed); 
            gl.uniform1f(this.errataNoiseProgram.uniforms.uExponent, config.EXPONENT); 
            gl.uniform1f(this.errataNoiseProgram.uniforms.uRidgeThreshold, config.RIDGE); 
            gl.uniform1f(this.errataNoiseProgram.uniforms.uLacunarity, config.LACUNARITY); 
            gl.uniform1f(this.errataNoiseProgram.uniforms.uGain, config.GAIN); 
            gl.uniform1f(this.errataNoiseProgram.uniforms.uOctaves, config.OCTAVES); 
            gl.uniform3f(this.errataNoiseProgram.uniforms.uScale, 1., 1., 1.); 
            gl.uniform1f(this.errataNoiseProgram.uniforms.uAspect, config.ASPECT); 
            LGL.blit(this.noise.write);
            this.noise.swap(); 
        }
        else{
            this.noiseProgram.bind();
            gl.uniform1f(this.noiseProgram.uniforms.uPeriod, config.PERIOD); 
            gl.uniform3f(this.noiseProgram.uniforms.uTranslate, 0.0, 0.0, 0.0);
            gl.uniform1f(this.noiseProgram.uniforms.uAmplitude, config.AMP); 
            gl.uniform1f(this.noiseProgram.uniforms.uSeed, this.noiseSeed); 
            gl.uniform1f(this.noiseProgram.uniforms.uExponent, config.EXPONENT); 
            gl.uniform1f(this.noiseProgram.uniforms.uRidgeThreshold, config.RIDGE); 
            gl.uniform1f(this.noiseProgram.uniforms.uLacunarity, config.LACUNARITY); 
            gl.uniform1f(this.noiseProgram.uniforms.uGain, config.GAIN); 
            gl.uniform1f(this.noiseProgram.uniforms.uOctaves, config.OCTAVES); 
            gl.uniform3f(this.noiseProgram.uniforms.uScale, 1., 1., 1.); 
            gl.uniform1f(this.noiseProgram.uniforms.uAspect, config.ASPECT); 
            LGL.blit(this.noise.write);
            this.noise.swap();
        }
    }

    render (target) {
        if (config.BLOOM)
            this.applyBloom(this.noise.read, this.bloom);
            if (config.SUNRAYS) {
                this.applySunrays(this.noise.read, this.noise.write, this.sunrays);
                this.blur(this.sunrays, this.sunraysTemp, 1);
            }
            
            if (target == null || !config.TRANSPARENT) {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.enable(gl.BLEND);
            }
            else {
                gl.disable(gl.BLEND);
            }
            this.drawDisplay(this.noise);
    }
    
    drawDisplay (target) {
        let width = target == null ? gl.drawingBufferWidth : target.width;
        let height = target == null ? gl.drawingBufferHeight : target.height;
            
        this.displayMaterial.bind();
        if (config.SHADING)
            gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);

        gl.uniform1i(this.displayMaterial.uniforms.uTexture, this.noise.read.attach(0));

        if (config.BLOOM) {
            gl.uniform1i(this.displayMaterial.uniforms.uBloom, this.bloom.attach(1));
            gl.uniform1i(this.displayMaterial.uniforms.uDithering, this.ditheringTexture.attach(2));
            let scale = getTextureScale(this.ditheringTexture, width, height);
            gl.uniform2f(this.displayMaterial.uniforms.ditherScale, scale.x, scale.y);
        }
        if (config.SUNRAYS)
            gl.uniform1i(this.displayMaterial.uniforms.uSunrays, this.sunrays.attach(3));
        LGL.blit(target);
    }

    applyBloom (source, destination) {
        if (this.bloomFramebuffers.length < 2)
            return;
    
        let last = destination;
    
        gl.disable(gl.BLEND);
        this.bloomPrefilterProgram.bind();
        let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
        let curve0 = config.BLOOM_THRESHOLD - knee;
        let curve1 = knee * 2;
        let curve2 = 0.25 / knee;
        gl.uniform3f(this.bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
        gl.uniform1f(this.bloomPrefilterProgram.uniforms.threshold, config.BLOOM_THRESHOLD);
        gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
        LGL.blit(last);
    
        this.bloomBlurProgram.bind();
        for (let i = 0; i < bloomFramebuffers.length; i++) {
            let dest = bloomFramebuffers[i];
            gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
            gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
            LGL.blit(dest);
            last = dest;
        }
    
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.enable(gl.BLEND);
    
        for (let i = this.bloomFramebuffers.length - 2; i >= 0; i--) {
            let baseTex = bloomFramebuffers[i];
            gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
            gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
            gl.viewport(0, 0, baseTex.width, baseTex.height);
            LGL.blit(baseTex);
            last = baseTex;
        }
    
        gl.disable(gl.BLEND);
        this.bloomFinalProgram.bind();
        gl.uniform2f(this.bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(this.bloomFinalProgram.uniforms.uTexture, last.attach(0));
        gl.uniform1f(this.bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
        LGL.blit(destination);
    }

    applySunrays (source, mask, destination) {
        gl.disable(gl.BLEND);
        this.sunraysMaskProgram.bind();
        gl.uniform1i(this.sunraysMaskProgram.uniforms.uTexture, source.attach(0));
        LGL.blit(mask);
    
        this.sunraysProgram.bind();
        gl.uniform1f(this.sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
        gl.uniform1i(this.sunraysProgram.uniforms.uTexture, mask.attach(0));
        LGL.blit(destination);
    }

    blur (target, temp, iterations) {
        this.blurProgram.bind();
        for (let i = 0; i < iterations; i++) {
            gl.uniform2f(this.blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
            gl.uniform1i(this.blurProgram.uniforms.uTexture, target.attach(0));
            LGL.blit(temp);
    
            gl.uniform2f(this.blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
            gl.uniform1i(this.blurProgram.uniforms.uTexture, temp.attach(0));
            LGL.blit(target);
        }
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
        
        let noiseFolder = gui.addFolder('Noise');
        noiseFolder.add(config, 'DYE_RESOLUTION', { 'high': 1024, 'medium': 512, 'low': 256, 'very low': 128 }).name(parName).onFinishChange(this.initFramebuffers(this));
        noiseFolder.add(config, 'PERIOD', 0, 10.0).name('Period');
        noiseFolder.add(config, 'EXPONENT', 0, 4.0).name('Exponent');
        noiseFolder.add(config, 'RIDGE', 0, 1.5).name('Ridge');
        noiseFolder.add(config, 'AMP', 0, 4.0).name('Amplitude');
        noiseFolder.add(config, 'LACUNARITY', 0, 4).name('Lacunarity');
        noiseFolder.add(config, 'NOISE_TRANSLATE_SPEED', 0, 2).name('Noise Translate Speed');
        noiseFolder.add(config, 'GAIN', 0.0, 1.0).name('Gain');
        noiseFolder.add(config, 'OCTAVES', 0, 8).name('Octaves').step(1);
        // noiseFolder.add(config, 'MONO').name('Mono');
        // noiseFolder.add(config, 'SHADING').name('Shading').onFinishChange(this.updateKeywords(this));
        noiseFolder.add(config, 'ERRATA').name('Errata').onFinishChange(this.updateKeywords(this));


        let sunraysFolder = gui.addFolder('Highlights');
        // sunraysFolder.add(config, 'SUNRAYS').name('enabled').onFinishChange(this.updateKeywords(this));
        sunraysFolder.add(config, 'SUNRAYS_WEIGHT', 0.01, 1.0).name('weight');
    
        //create a function to assign to a button, here linking my github
        let github = gui.add({ fun : () => {
            window.open('https://github.com/lakeheck/');
            ga('send', 'event', 'link button', 'github');
        } }, 'fun').name('Github');
        github.__li.className = 'cr function bigFont';
        github.__li.style.borderLeft = '3px solid #8C8C8C';
        let githubIcon = document.createElement('span');
        github.domElement.parentElement.appendChild(githubIcon);
        githubIcon.className = 'icon github';
    
        if (LGL.isMobile())
            gui.close();
    }
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

