import {gl, ext, compileShader} from "./WebGL.js";

export const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
precision highp float;

attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;

void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`);
//need to have a separate vert shader for noise so that we can access more recent version of GLSL compiler
export const noiseVertexShader = compileShader(gl.VERTEX_SHADER, `#version 300 es
precision highp float;

in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;

void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`);
export const LUTShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
#ifdef GL_ES
precision mediump float;
precision mediump sampler3D;
precision mediump sampler2D;
#endif

uniform sampler3D u_LUT;
uniform float u_LUTSize;
uniform float u_LUTMix;
uniform sampler2D sTexture;

in vec2 vUv;
out vec4 fragColor;
// A helper function to apply the 3D LUT.
// It assumes color values are in the [0,1] range.
vec3 applyLUT(vec3 color, sampler3D lut, float size) {
    if(size > 0.0) {
        color = clamp(color, 0.0, 1.0);
        float scale = (size - 1.0) / size;
        float offset = 0.5 / size;
        vec3 lutCoord = color * scale + offset;
        return texture(lut, lutCoord).rgb;
    }
    return color;
}

void main() {
    vec3 color = texture(sTexture, vUv).rgb;
    vec3 lutColor = applyLUT(color, u_LUT, u_LUTSize);
    fragColor = vec4(mix(color, lutColor, u_LUTMix), 1.0);
}
`)
//lets get some noise! 
//noise shader saved in project dir
export const noiseShader = compileShader(gl.FRAGMENT_SHADER, ` #version 300 es
precision highp float;

uniform float uPeriod;
uniform vec3 uTranslate;
uniform float uAmplitude;
uniform float uSeed;
uniform float uExponent;
uniform float uRidgeThreshold;
uniform vec3 uScale;
uniform float uAspect;
uniform float uLacunarity;
uniform float uGain;
uniform int uOctaves;

#define Index 1
#define PI 3.141592653589793
#define TWOPI 6.28318530718

in vec2 vUv;
out vec4 fragColor;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

// vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
// float snoise(vec2 v, sampler2D tex){
// 	return texture(tex, vUV.st).r;
// }
//	Simplex 3D Noise 
//	by Ian McEwan, Ashima Arts
//
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
vec3 i  = floor(v + dot(v, C.yyy) );
vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
vec3 g = step(x0.yzx, x0.xyz);
vec3 l = 1.0 - g;
vec3 i1 = min( g.xyz, l.zxy );
vec3 i2 = max( g.xyz, l.zxy );

//  x0 = x0 - 0. + 0.0 * C 
vec3 x1 = x0 - i1 + 1.0 * C.xxx;
vec3 x2 = x0 - i2 + 2.0 * C.xxx;
vec3 x3 = x0 - 1. + 3.0 * C.xxx;

// Permutations
i = mod(i, 289.0 ); 
vec4 p = permute( permute( permute( 
    i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
    + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    
    // Gradients
    // ( N*N points uniformly over a square, mapped onto an octahedron.)
    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    
    vec3 p0 = vec3(a0.xy,h.x);
vec3 p1 = vec3(a0.zw,h.y);
vec3 p2 = vec3(a1.xy,h.z);
vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
p0 *= norm.x;
p1 *= norm.y;
p2 *= norm.z;
p3 *= norm.w;

// Mix final noise value
vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
m = m * m;
return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                            dot(p2,x2), dot(p3,x3) ) );
}
// float ridge(vec2 st, float t){
//     float n = snoise(st);
//     n = abs(t + (n-t));
//     return n/t;
// }

float ridge(float n, float threshold){
return (abs(threshold + (n - threshold))/threshold);
}

float power_noise(float n, float power){
return pow(n, power);
}

float monoNoise(vec3 st){
st.x /= uAspect;
st *= uScale;
st *= uPeriod;
st.z += uSeed;
st += uTranslate;
float noise = snoise(st);
noise *= uAmplitude;
noise = ridge(noise, uRidgeThreshold);
noise = power_noise(noise, uExponent);
return noise;
}


#define FBM(NOISE, SEED) float G=uGain; float freq = 1.0; float a = 1.0; float t = 0.0;for(int i=0; i<uOctaves; i++){t+= a*NOISE(freq*st, SEED);freq*=uLacunarity;a*=G;}


float monoSimplex(vec3 st, float seed){ 
st.x /= uAspect;
st *= uScale;
st *= uPeriod;
st.z += uSeed + seed;
st += uTranslate;
float noise = snoise(st);
noise *= uAmplitude;
noise = ridge(noise, uRidgeThreshold);
noise = power_noise(noise, uExponent);
return noise;
}

float monoSimplex(vec3 st){
st.x /= uAspect;
st *= uScale;
st *= uPeriod;
st.z += uSeed;
st += uTranslate;
float noise = snoise(st);
noise *= uAmplitude;
noise = ridge(noise, uRidgeThreshold);
noise = power_noise(noise, uExponent);
return noise;
}
vec2 rotate2D(vec2 _st, float _angle){
_st -= 0.5;
_st =  mat2(cos(_angle),-sin(_angle),
            sin(_angle),cos(_angle)) * _st;
_st += 0.5;
return _st;
}

vec2 tile(vec2 _st, float _zoom){
_st *= _zoom;
return fract(_st);
}

float box(vec2 _st, vec2 _size, float _smoothEdges){
_size = vec2(0.5)-_size*0.5;
vec2 aa = vec2(_smoothEdges*0.5);
vec2 uv = smoothstep(_size,_size+aa,_st);
uv *= smoothstep(_size,_size+aa,vec2(1.0)-_st);
return uv.x*uv.y;
}

float grid(vec2 st, float res, float smoothEdges, float rotate){
// Divide the space in 4
vec2 uv = st;
uv.x /= uAspect; 
uv = tile(uv,res);
// Use a matrix to rotate the space 45 degrees
uv = rotate2D(uv,rotate);

// Draw a square
return box(uv, vec2(.9), smoothEdges);
}

vec4 rgbSimplex(vec3 st){
float n1 = monoSimplex(st, 0.0); //take orig seed 
float n2 = monoSimplex(st, uSeed +500.0);
return vec4(n1, n2, 1.0, 1.0);
}

vec4 rgbSimplex(vec3 st, float seed){
float n1 = monoSimplex(st, 0.0 + seed); //take orig seed 
float n2 = monoSimplex(st, uSeed + 500.0 + seed);
return vec4(n1, n2, 1.0, 1.0);
}


vec2 displace(vec2 st, vec2 vector, float scale){
vec2 offset = vec2(0.5);
vec2 midpoint = vec2(0.5);
vec2 uvi = st + scale * (vector.xy - midpoint.xy); 
return uvi;
}

vec3 displace(vec3 st , vec2 vector, float scale){ //overload to pass vec3s
vec2 offset = vec2(0.5);
vec2 midpoint = vec2(0.5);
vec2 uvi = st.xy * scale * (vector.xy);
return vec3(uvi, st.z);
}

#define NOISE_RGB(NOISE, SEED) vec3 noiseRGB = vec3(NOISE(st, uSeed + SEED), NOISE(st, uSeed + 500.0 + SEED), NOISE(st, uSeed - 500.0 + SEED));

vec3 displace(vec3 st , vec2 vector, vec2 offset, vec2 midpoint, float scale){ //overload to pass vec3s
vec2 uvi = st.xy + scale * (vector.xy); 
return vec3(uvi, st.z);
}

float recursiveWarpNoise(vec3 st, float seed){
float color = monoSimplex( st*st.x, 2.0) * monoSimplex(displace(st, st.xy, vec2(0.5), vec2(0.5), 0.1));
for(int i = 0; i<5; i++){
NOISE_RGB(monoSimplex, 2.4);

color = monoSimplex(displace(st, noiseRGB.rg*float(i)/5.0, vec2(.5), vec2(0.5), 0.05*float(i)), seed*float(i));
}
return color;
}

float ang(vec3 st){
return sin(st.y*st.x);
}


float dis(vec3 st){
float d = grid(vUv, 7.0, 0.45, PI/4.);
FBM(monoSimplex, -743.4838)
return d *t;
}

float dis2(vec3 st){
NOISE_RGB(monoSimplex, 2.4);
FBM(recursiveWarpNoise, 2.4);
return t;
}


#define EPSILON 0.0001

#define GRAD(NOISE, SEED) float st1 = NOISE(vec3(st.x + EPSILON, st.y, st.z), SEED).r;  float st2 = NOISE(vec3(st.x - EPSILON, st.y, st.z), SEED).r; float st3 = NOISE(vec3(st.x, st.y + EPSILON, st.z), SEED).r; float st4 = NOISE(vec3(st.x, st.y - EPSILON, st.z), SEED).r; vec2 grad = normalize(vec2(st1-st2, st3-st4));

#define DISP(ANG, DIST, MAX) st.xy = st.xy + vec2(cos(ANG(st)*TWOPI), sin(ANG(st)*TWOPI)) * DIST(st) * MAX;


//vec4[] palette = {vec4(.875, .0859375, 0.16796875, 1.0), vec4(1.), vec4(0,.3203125, 0.64453125, 1.0), vec4(0.0, 0.0, 0.0, 1.0), vec4(1.0, 1.0, 1.0, 1.0)};

vec4 fbm(vec3 st, float seed){
float G=uGain; 
float freq = 1.0; 
float a = 1.0; 
vec4 t = vec4(0.0);
for(int i=0; i<uOctaves; i++){
t += a*rgbSimplex(freq*st, seed);
freq*= uLacunarity;
//freq = pow(2.0, float(i));
a*=G;
}
return t;
}

void main()
{
//create vec3 with z value for translate
vec3 st = vec3(vUv, 0.0);
NOISE_RGB(monoSimplex, 2.4);
// FBM(recursiveWarpNoise, 2.4);
vec4 color = fbm(st, uSeed) - vec4(0.5); 
//output
fragColor = (color);

}
`);

export const clearShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;
precision mediump sampler2D;

varying highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;

void main () {
    gl_FragColor = value * texture2D(uTexture, vUv);
}
`);

export const colorShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;

uniform vec4 color;

void main () {
    gl_FragColor = color;
}
`);

export const splatShader = compileShader(gl.FRAGMENT_SHADER, `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;

void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
}
`);

export const splatColorClickShader = compileShader(gl.FRAGMENT_SHADER, `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uColor;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float uFlow;

void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * texture2D(uColor, vUv).xyz;
    splat *= uFlow;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
}
`);

export const splatVelShader = compileShader(gl.FRAGMENT_SHADER, `
precision highp float;
precision highp sampler2D;


uniform int uClick;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float uVelocityScale;
uniform sampler2D uDensityMap;
uniform sampler2D uNoise;
// Wind controls (copied from wind shader)
uniform float uGlobalWindScale, uSmoothness, uWindMix;
uniform vec2 uCenter;
uniform float uWindPattern1, uWindPattern2;

// Minimal baked-noise generation (fbm) for force field
uniform float uTimeNoise;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i);
    float b=hash(i+vec2(1.0,0.0));
    float c=hash(i+vec2(0.0,1.0));
    float d=hash(i+vec2(1.0,1.0));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
    // baked constants (previous defaults)
    float G = 0.5;      // gain
    float lac = 2.0;    // lacunarity
    float amp = 1.0;    // amplitude
    int oct = 4;        // octaves
    float v = 0.0;
    float a = amp;
    float f = 1.0;
    for(int i=0;i<8;i++){
        if(i>=oct) break;
        v += a * noise(p * f);
        f *= lac;
        a *= G;
    }
    return v;
}

vec2 noiseVec(vec2 uv){
    // animate with time; baked period
    float period = 3.0;
    vec2 p = uv * period + vec2(uTimeNoise * 0.1);
    float nx = fbm(p + 13.7);
    float ny = fbm(p + 41.3);
    return vec2(nx, ny) * 2.0 - 1.0;
}

vec2 wind(vec2 uv, float thres, float smoothness, int windpattern) {
    vec2 up = vec2(0.0, 1.0);
    vec2 down = vec2(0.0, -1.0);
    vec2 left = vec2(1.0, 0.0);
    vec2 right = vec2(-1.0, 0.0);
    vec2 w = vec2(0.0);
    if( windpattern == 0) w = -vec2(smoothstep(0.0, thres, uv.s), 0.0);
    else if( windpattern == 1) w = vec2(smoothstep(1.0-thres, 1.0, uv.s), 0.0);
    else if( windpattern == 2 ) w = vec2(0.0, smoothstep(0.0, thres, uv.t));
    else if( windpattern == 3 ) w = -vec2(0.0, smoothstep(1.0-thres, 1.0, uv.t));
    else if( windpattern == 4 ) w = mix(right,left, smoothstep(thres-smoothness,thres+smoothness, uv.s));
    else if( windpattern == 5 ) w = mix(up,down, smoothstep(thres-smoothness,thres+smoothness, uv.t));
    else if( windpattern == 6 ) w = mix(left,right, smoothstep(thres-smoothness,thres+smoothness, uv.s));
    else if( windpattern == 7 ) w = mix(up,down, smoothstep(thres-smoothness, thres+smoothness, uv.t));
    else if( windpattern == 8) {
        float thres1 = 1.0/3.0;
        float thres2 = 2.0/3.0;
        float m = smoothstep(thres1-smoothness, thres1+smoothness, uv.s);
        m *= smoothstep(thres2+smoothness, thres2-smoothness, uv.s);
        w = mix(down, up, m);
    }
    else if( windpattern == 9 ) w = mix(left, right, smoothstep(thres-smoothness, thres+smoothness, uv.t));
    else if( windpattern == 10 ) {
        vec2 coord = uv - uCenter;
        w += -mix(up, down, smoothstep(thres-smoothness,thres+smoothness, coord.s));
        w += mix(left, right, smoothstep(thres-smoothness,thres+smoothness, coord.t));
        w = mix(w, -coord, 0.95);
        w *= 1.0 / max(length(coord), 1e-4);
    }
    else {
        vec2 coord = uv - uCenter;
        w += -mix(up, down, smoothstep(thres-smoothness,thres+smoothness, coord.s));
        w += mix(left, right, smoothstep(thres-smoothness,thres+smoothness, coord.t));
        w = mix(w, -coord, 0.95);
        w *= 1.0 / max(length(coord), 1e-4);
    }
    return w;
}

void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = vec3(0.0);
    splat = smoothstep(0.0, 1.0, texture2D(uDensityMap, vUv).xyz);
    // Generate procedural force (noise + wind)
    vec2 fNoise = texture2D(uNoise, vUv).rg * uVelocityScale;
    vec2 fWind = wind(vUv, 0.5, uSmoothness, int(uWindPattern1)) * uGlobalWindScale;
    vec3 force = vec3(mix(fNoise, fWind, clamp(uWindMix, 0.0, 1.0)), 0.0);
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + (force), 1.0);
}
`);

export const splatColorShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler2DArray;

in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec2 point;
uniform float radius;

uniform float uFlow;

uniform int uClick;
uniform sampler2D uDensityMap;
uniform sampler2D uColor;
uniform sampler2D uNoise;

uniform sampler2DArray uPaletteArray;
uniform int uPaletteA;
uniform int uPaletteB;
uniform float uPaletteRemap;
uniform float uPaletteMultiply;
uniform float uPaletteMix;
uniform float uPalettePeriod;
//////// COLOR PALETTES ////////
vec4 palette1[5] = vec4[5](
  vec4(200.0/255.0, 192.0/255.0, 184.0/255.0, 1.0),
  vec4(218.0/255.0, 218.0/255.0, 218.0/255.0, 1.0),
  vec4(173.0/255.0, 201.0/255.0, 236.0/255.0, 1.0),
  vec4(147.0/255.0, 188.0/255.0, 235.0/255.0, 1.0),
  vec4(47.0/255.0, 42.0/255.0, 36.0/255.0, 1.0)
);
vec4 palette2[5] = vec4[5](
  vec4(0.095690206,0.34556606,0.65443015,1),
  vec4(0.65443015,0.90430737,0.99975336,1),
  vec4(0.99975336,0.9043108,0.65443563,1),
  vec4(0.65443546,0.3455713,0.09569348,1),
  vec4(0.09569348,0.00024671858,0.09568856,1)
);
vec4 palette3[5] = vec4[5](
  vec4(0.88235295,0.9764706,0.8980392,1),
  vec4(0.7529412,0.35686275,0.43529412,1),
  vec4(0.27058825,0.28627452,0.3764706,1),
  vec4(0,0.16470589,0.32941177,1),
  vec4(0.05882353,0.08235294,0.30588236,1)
);
vec4 palette4[5] = vec4[5](
  vec4(0.6509804,0.76862746,0.7372549,1),
  vec4(0.89411765,0.8627451,0.7921569,1),
  vec4(0.91764706,0.48235294,0.34901962,1),
  vec4(0.80784315,0.27450982,0.2784314,1),
  vec4(0.32156864,0.27450982,0.3372549,1)
);
vec4 palette5[5] = vec4[5](
  vec4(0.0627451,0.3019608,0.4509804,1),
  vec4(0.4,0.7490196,0.6901961,1),
  vec4(0.90588236,1,0.91764706,1),
  vec4(1,1,0.92941177,1),
  vec4(0,0,0,1)
);


vec4[5] getPalette(int index){
  index = index % 5;
  vec4 pal[5];
  if(index == 0){
    pal = palette1;
  }else if(index == 1){
    pal = palette2;
  }else if(index == 2){
    pal = palette3;
  }else if(index == 3){
    pal = palette4;
  }
  else if (index == 4){
    pal = palette5;
  }
  return pal;
}
vec4 lookupColor(float lu, int index){
  vec4 pal[5] = getPalette(index);
  lu = fract(lu)*5.0;
  int i = int(lu);
  float f = fract(lu);
  vec4 c0 = pal[i%5];
  vec4 c1 = pal[(i+1)%5];
  vec4 c = mix(c0, c1, f);
  return vec4(c.rgb, 1.0);
}

vec4 lookupColor(float lu, vec4 pal[5]){
  lu = fract(lu)*5.0;
  int i = int(lu);
  float f = fract(lu);

  vec4 c0 = pal[i%5];
  vec4 c1 = pal[(i+1)%5];
  vec4 c = mix(c0, c1, f);

  return vec4(c.rgb, 1.0);
}

vec4[5] mixPalette(vec4 pal[5], vec4 pal2[5], float m){

  vec4 p[5] = vec4[5](
    mix(pal[0], pal2[0], m),
    mix(pal[1], pal2[1], m),
    mix(pal[2], pal2[2], m),
    mix(pal[3], pal2[3], m),
    mix(pal[4], pal2[4], m)
  );

  return p;
}



void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;

    vec3 splat = vec3(0);

    vec2 noise = texture(uNoise, vUv/uPalettePeriod).rg;
    noise.rg = mix(vUv.st, noise.rg, uPaletteRemap);
    vec3 colA = texture(uPaletteArray, vec3(fract(noise), float(max(0, uPaletteA)))).rgb;
    vec3 colB = texture(uPaletteArray, vec3(fract(noise), float(max(0, uPaletteB)))).rgb;
    splat = mix(colA, colB, clamp(uPaletteMix, 0.0, 1.0));
    splat = mix(splat, colA * colB, uPaletteMultiply);
    splat = smoothstep(0.0, 1.0, splat);
    splat *= uFlow;
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base + splat, 1.0);
}
`);

//here we use keywords to define whether we need to use manual filtering for advection 
export const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;

vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
    vec2 st = uv / tsize - 0.5;

    vec2 iuv = floor(st);
    vec2 fuv = fract(st);

    vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
    vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
    vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
    vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

    return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main () {
#ifdef MANUAL_FILTERING
    vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
    vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    vec4 result = texture2D(uSource, coord);
#endif
    float decay = 1.0 + dissipation * dt;
    gl_FragColor = result / decay;
}`,
ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'] //keyword assignment 
);

export const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;
precision mediump sampler2D;

varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;

void main () {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;

    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }

    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`);

export const curlShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;
precision mediump sampler2D;

varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;

void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`);

export const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;

void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;

    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity += force * dt;
    velocity = min(max(velocity, -1000.0), 1000.0);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`);

export const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;
precision mediump sampler2D;

varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;

void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float C = texture2D(uPressure, vUv).x;
    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`);

export const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;
precision mediump sampler2D;

varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;

void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`);

export const windShader = compileShader(gl.FRAGMENT_SHADER, `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;


uniform float uGlobalWindScale, uSmoothness, uWindMix;
uniform vec2 uCenter;
uniform float uWindPattern1, uWindPattern2;


vec2 wind(vec2 uv, float thres, float smoothness, int windpattern) {

    vec2 up = vec2(0.0, 1.0);
    vec2 down = vec2(0.0, -1.0);
    vec2 left = vec2(1.0, 0.0);
    vec2 right = vec2(-1.0, 0.0);
    
    vec2 wind = vec2(0.0);

	if( windpattern == 0) wind = -vec2(smoothstep(0.0, thres, uv.s), 0);
	else if( windpattern == 1)wind = vec2(smoothstep(1.0-thres, 1.0, uv.s), 0);
	else if( windpattern == 2 )wind = vec2(0, smoothstep(0.0, thres, uv.t)); 
	else if( windpattern == 3 )wind = -vec2(0, smoothstep(1.0-thres, 1.0, uv.t)); 
	else if( windpattern == 4 )wind = mix(right,left, smoothstep(thres-smoothness,thres+smoothness, uv.s));
	else if( windpattern == 5 )wind = mix(up,down, smoothstep(thres-smoothness,thres+smoothness, uv.t));
	else if( windpattern == 6 )wind = mix(left,right, smoothstep(thres-smoothness,thres+smoothness, uv.s));
	else if( windpattern == 7 )wind = mix(up,down, smoothstep(thres-smoothness, thres+smoothness, uv.t)); 
	else if( windpattern == 8) {
		float thres1 = 1./3.;
		float thres2 = 2./3.;
		float m = smoothstep(thres1-smoothness, thres1+smoothness, uv.s);
		m *= smoothstep(thres2+smoothness, thres2-smoothness, uv.s);
		wind = mix(down, up, m);
	}
	else if( windpattern == 9 )wind = mix(left, right, smoothstep(thres-smoothness, thres+smoothness, uv.t));
	else if( windpattern == 10 ) {
		vec2 coord = uv.st - uCenter;
		wind += -mix(up, down, smoothstep(thres-smoothness, thres+smoothness, coord.s));
		wind += mix(left, right, smoothstep(thres-smoothness, thres+smoothness, coord.t));
		wind = mix(wind, -coord, 0.95);
    wind *= max(length(coord), 1e-4);
	}
	else { //default to circle / sink blend
		vec2 coord = uv.st - uCenter;
		wind += -mix(up, down, smoothstep(thres-smoothness, thres+smoothness, coord.s));
		wind += mix(left, right, smoothstep(thres-smoothness, thres+smoothness, coord.t));
	  wind = mix(wind, -coord, 0.95);
    wind *= 1.0 / max(length(coord), 1e-4);
	}

	return wind;
}

void main()
{
	//mix the two patterns
    vec2 uv = vUv.st;
    vec2 w = vec2(0.);
    w = wind(vUv, 0.5, uSmoothness, int(uWindPattern1));
    vec4 color = vec4(w * uGlobalWindScale, 0.0, 1.0);
    gl_FragColor = color;
}
`);

export const bdrfShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
// Copyright Lake Heckaman, 2025. All rights reserved. 
// www.lakeheckaman.com
// I am the sole copyright owner of this Work.
// You cannot host, display, distribute or share this Work neither
// as it is or altered, here on Shadertoy or anywhere else, in any
// form including physical and digital. You cannot use this Work in any
// commercial or non-commercial product, website or project. You cannot
// sell this Work and you cannot mint an NFTs of it or use it to train a neural
// network or any other type of model, generative or not, without permission.

#ifdef GL_ES
precision mediump sampler2D; 
precision mediump sampler3D;
precision mediump float;
#endif

out vec4 fragColor;

//adapted from https://github.com/dli/paint/blob/master/shaders/painting.frag

in vec2 vUv;
uniform sampler2D sTexture;
uniform sampler3D u_LUT;
uniform float u_LUTSize;
uniform float u_LUTMix;

uniform vec2 uRes;
uniform float uNormalScale;
uniform vec3 uLightDir;
uniform float uRough;
uniform float uF0;
uniform float uDiffuse;
uniform float uSpec;
uniform float uWetDry;
#define RGB

// Master post controls
uniform float uExposure;     // EV stops
uniform float uContrast;     // 1.0 = neutral
uniform float uGamma;        // 1.0 = neutral
uniform float uBrightness;   // 0.0 = neutral

float luminance(vec3 v){
    return dot(v, vec3(0.2126, 0.7152, 0.0722));
}

vec3 trilinearInterpolate(vec3 p, vec3 v000, vec3 v100, vec3 v010, vec3 v001, vec3 v101, vec3 v011, vec3 v110, vec3 v111) {
    return v000 * (1.0 - p.x) * (1.0 - p.y) * (1.0 - p.z) +
           v100 * p.x * (1.0 - p.y) * (1.0 - p.z) +
           v010 * (1.0 - p.x) * p.y * (1.0 - p.z) +
           v001 * (1.0 - p.x) * (1.0 - p.y) * p.z +
           v101 * p.x * (1.0 - p.y) * p.z +
           v011 * (1.0 - p.x) * p.y * p.z +
           v110 * p.x * p.y * (1.0 - p.z) +
           v111 * p.x * p.y * p.z;
}

vec3 rybToRgb(vec3 ryb) {
#ifdef RGB
    return 1.0 - ryb.yxz;
#endif

    return trilinearInterpolate(ryb, 
        vec3(1.0, 1.0, 1.0), 
        vec3(1.0, 0.0, 0.0), 
        vec3(0.163, 0.373, 0.6), 
        vec3(1.0, 1.0, 0.0), 
        vec3(1.0, 0.5, 0.0), 
        vec3(0.0, 0.66, 0.2),
        vec3(0.5, 0.0, 0.5),
        vec3(0.2, 0.094, 0.0));
}

//samples with feathering at the edges
vec4 samplePaintTexture (vec2 coordinates) {
    return texture(sTexture, coordinates);
}

float getHeight (vec2 coordinates) {
    return luminance(samplePaintTexture(coordinates).rgb);
}


vec2 computeGradient(vec2 coordinates) { //sobel operator
    vec2 delta = 1.0 / uRes;

    float topLeft = getHeight(coordinates + vec2(-delta.x, delta.y));
    float top = getHeight(coordinates + vec2(0.0, delta.y));
    float topRight = getHeight(coordinates + vec2(delta.x, delta.y));

    float left = getHeight(coordinates + vec2(-delta.x, 0.0));
    float right = getHeight(coordinates + vec2(delta.x, 0.0));

    float bottomLeft = getHeight(coordinates + vec2(-delta.x, -delta.y));
    float bottom = getHeight(coordinates + vec2(0.0, -delta.y));
    float bottomRight = getHeight(coordinates + vec2(delta.x, -delta.y));
    
    return vec2(
         1.0 * topLeft - 1.0 * topRight + 2.0 * left - 2.0 * right + 1.0 * bottomLeft - 1.0 * bottomRight,
        -1.0 * topLeft + 1.0 * bottomLeft - 2.0 * top + 2.0 * bottom - 1.0 * topRight + 1.0 * bottomRight);
}


const float PI = 3.14159265;

float square (float x) {
    return x * x;
}

float fresnel (float F0, float lDotH) {
    float f = pow(1.0 - lDotH, 5.0);

    return (1.0 - F0) * f + F0;
}

float GGX (float alpha, float nDotH) {
    float a2 = square(alpha);

    return a2 / (PI * square(square(nDotH) * (a2 - 1.0) + 1.0));
}

float GGGX (float alpha, float nDotL, float nDotV) {
    float a2 = square(alpha);

    float gl = nDotL + sqrt(a2 + (1.0 - a2) * square(nDotL));
    float gv = nDotV + sqrt(a2 + (1.0 - a2) * square(nDotV));

    return 1.0 / (gl * gv);
}

float saturate (float x) {
    return clamp(x, 0.0, 1.0);
}

vec3 change_luminance(vec3 c_in, float l_out){
    float l_in = luminance(c_in);
    return c_in * (l_out / l_in);
}
vec3 reinhard_extended_luminance(vec3 v, float max_white_l){
    float l_old = luminance(v);
    float numerator = l_old * (1.0f + (l_old / (max_white_l * max_white_l)));
    float l_new = numerator / (1.0f + l_old);
    return change_luminance(v, l_new);
}

float specularBRDF (vec3 lightDirection, vec3 eyeDirection, vec3 normal, float roughness, float F0) {
    vec3 halfVector = normalize(lightDirection + eyeDirection);

    float nDotH = saturate(dot(normal, halfVector));
    float nDotL = saturate(dot(normal, lightDirection));
    float nDotV = saturate(dot(normal, eyeDirection));
    float lDotH = saturate(dot(lightDirection, halfVector));

    float D = GGX(roughness, nDotH);
    float G = GGGX(roughness, nDotL, nDotV);
    float F = fresnel(F0, lDotH);

    return D * G * F;
}

void main () {

    vec2 coordinates = vUv;

    vec4 value = samplePaintTexture(coordinates); //r, g, b, height
    value.rgb = reinhard_extended_luminance(value.rgb, 2.0);

    vec2 gradient = computeGradient(coordinates);
    vec3 normal = normalize(vec3(
        gradient.x,
        gradient.y,
        uNormalScale
    ));

    vec3 lightDirection = normalize(uLightDir);
    vec3 eyeDirection = vec3(1.50, -1.0, 1.0);

    float diffuse = saturate(dot(lightDirection, normal));
    diffuse = diffuse * uDiffuse + (1.0 - uDiffuse);


    float specular = specularBRDF(lightDirection, eyeDirection, normal, length(value.rgb)*uRough, uF0);

    vec3 color = (value.rgb);

    vec3 surfaceColor = color * diffuse + specular * uSpec;
    
    surfaceColor = mix(color, surfaceColor, uWetDry);
    // Apply 3D LUT mix inside BRDF pass
    vec3 lutColor = surfaceColor;
    if (u_LUTSize > 0.0 && u_LUTMix > 0.001) {
        vec3 c = clamp(surfaceColor, 0.0, 1.0);
        float scale = (u_LUTSize - 1.0) / u_LUTSize;
        float offset = 0.5 / u_LUTSize;
        vec3 coord = c * scale + offset;
        lutColor = texture(u_LUT, coord).rgb;
    }

    // Mix LUT
    vec3 finalColor = mix(surfaceColor, lutColor, clamp(u_LUTMix, 0.0, 1.0));

    // Master post controls
    // Exposure: multiply energy by 2^EV
    finalColor *= exp2(uExposure);
    // Brightness: linear lift
    finalColor += uBrightness;
    // Contrast: pivot around mid-grey 0.5
    finalColor = (finalColor - 0.5) * uContrast + 0.5;
    // Gamma: standard correction, guard against <=0
    finalColor = pow(max(finalColor, vec3(0.0)), vec3(1.0 / max(uGamma, 1e-4)));
    finalColor = clamp(finalColor, 0.0, 1.0);

	fragColor = vec4(finalColor, 1.0);
}
`);
