
// Schema describing UI/SDK metadata and defaults for selected params
export const CONFIG_SCHEMA = {

  // -------------------- Core Resolutions --------------------

  SIM_RESOLUTION:     { default: 512,  type: 'int',  label: 'Sim Resolution' },
  DYE_RESOLUTION:     { default: 2160, type: 'int',  label: 'Output Resolution' },
  PALETTE_RESOLUTION: { default: 512,  type: 'int',  label: 'Palette Resolution' },
  CAPTURE_RESOLUTION: { default: 1024, type: 'int',  label: 'Capture Resolution' },
  PALETTE_A: { default: 0, min: 0, max: 4, type: 'int', label: 'Palette A', layerParam: true },
  PALETTE_B: { default: 5, min: 4, max: 10, type: 'int', label: 'Mask Palette', layerParam: true },
  PALETTE_MIX: { default: 0.0, min: 0, max: 1, step: 0.01, label: 'Palette Mix', layerParam: true },
  PALETTE_PERIOD: { default: 3.0, min: 1, max: 5, step: 0.01, label: 'Palette Period', layerParam: true },
  PALETTE_REMAP: { default: 0.0, min: 0, max: 1, step: 0.01, label: 'Palette Remap', layerParam: true },
  PALETTE_MULTIPLY: { default: 0.0, min: 0, max: 1, step: 0.01, label: 'Palette Multiply', layerParam: true },
  FORCE_ASPECT: {default: false, type: 'bool'},
  // -------------------- Fluid Dynamics --------------------
  ASPECT:             { default: 1.0,  min: 0.1, max: 5,  step: 0.01, label: 'Aspect' },
  FLOW:               { default: 3.44, min: 0,   max: 10, step: 0.01, label: 'Flow' , layerParam: true },
  SPLAT_FLOW:         { default: 0.0215, min: 0,   max: .15,  step: 0.001, label: 'Splat Flow' },
  VELOCITYSCALE:      { default: 0.0,  min: 0,   max: 5,  step: 0.01, label: 'Velocity Scale', layerParam: true  },
  DENSITY_DISSIPATION:{ default: 0.25, min: 0,   max: 1,  step: 0.001, label: 'Density Dissipation', layerParam: true },
  VELOCITY_DISSIPATION:{ default: 0.2, min: 0,   max: 1,  step: 0.001, label: 'Velocity Dissipation', layerParam: true },
  PRESSURE:           { default: 0.8,  min: 0,   max: 1,  step: 0.01, label: 'Pressure', layerParam: true },
  PRESSURE_ITERATIONS:{ default: 50,   min: 1,   max: 100, type: 'int', label: 'Pressure Iterations' },
  CURL:               { default: 30,   min: 0,   max: 100, step: 0.1, label: 'Curl Strength', layerParam: true  },
  SPLAT_RADIUS:       { default: 0.15, min: 0,   max: 1,  step: 0.001, label: 'Splat Radius' },
  SPLAT_FORCE:        { default: 6000, min: 0,   max: 10000, step: 10, label: 'Splat Force' },
  // -------------------- Rendering / Visual --------------------
  BACK_COLOR:         { default: { r:0, g:0, b:0 }, type: 'color', label: 'Background Color' },
  TRANSPARENT:        { default: false, type: 'bool', label: 'Transparent BG' },
  DISPLAY_FLUID:      { default: true,  type: 'bool', label: 'Display Fluid' },
  // -------------------- Noise Params --------------------
  EXPONENT:           { default: 1.0, min: 0, max: 4, step: 0.01, label: 'Exponent' },
  PERIOD:             { default: 10.0, min: 0, max: 10, step: 0.01, label: 'Period' },
  RIDGE:              { default: 1.0, min: 0, max: 2, step: 0.01, label: 'Ridge' },
  AMP:                { default: 1.0, min: 0, max: 2, step: 0.01, label: 'Amplitude' },
  LACUNARITY:         { default: 2.0, min: 0, max: 6, step: 0.01, label: 'Lacunarity' },
  GAIN:               { default: 0.5, min: 0, max: 1, step: 0.01, label: 'Gain' },
  OCTAVES:            { default: 4,   min: 1, max: 12, type: 'int', label: 'Octaves' },
  MONO:               { default: false, type: 'bool', label: 'Monochrome' },
  NOISE_TRANSLATE_SPEED:{ default: 0.0015, min: 0, max: .025, step: 0.001, label: 'Noise Translate Speed' },

  // -------------------- Control / Misc --------------------
  RESET:              { default: false, type: 'bool', label: 'Reset' },
  RANDOM:             { default: false, type: 'bool', label: 'Randomize Input' },
  WIND_SCALE:         { default: 0.5, min: 0, max: 2, step: 0.001, label: 'Wind Scale', id: 'windScale', layerParam: true },
  WIND_TYPE:          { default: 10, min: 0, max: 11, step: 1, type: 'int', label: 'Wind Type', layerParam: true  },

  // -------------------- Simulated Pointer --------------------
  SIM_ENABLE:         { default: false, type: 'bool', label: 'Sim Input' },
  SIM_SPEED:          { default: 0.25, min: 0, max: 5, step: 0.001, label: 'Sim Speed' },
  SIM_TRAVEL:         { default: 0.42, min: 0.05, max: 0.49, step: 0.001, label: 'Sim Travel' },
  SIM_FORCE:          { default: 2000, min: 0, max: 10000, step: 10, label: 'Sim Force' },
  SIM_COLOR_SPEED:    { default: 0.2, min: 0, max: 2, step: 0.001, label: 'Sim Color Speed' },
  // -------------------- BDRF Material Params --------------------
  BDRF_DIFFUSE:       { default: 0.196,   min: 0, max: 1, step: 0.0001, label: 'BDRF Diffuse', layerParam: true  },
  BDRF_NORMALS:       { default: 0.081352,min: 0, max: 1, step: 0.0001, label: 'BDRF Normals' , layerParam: true },
  BDRF_FRESNAL:       { default: 0.105,   min: 0, max: 1, step: 0.0001, label: 'BDRF Fresnel' },
  BDRF_ROUGH:         { default: 0.57256, min: 0, max: 1, step: 0.0001, label: 'BDRF Roughness' },
  BDRF_SPECULAR:      { default: 0.345,   min: 0, max: 1, step: 0.0001, label: 'BDRF Specular' },
  LUT:                { default: 1.0, min: 0, max: 1, step: 0.01, label: 'LUT Mix', layerParam: true  },

  // -------------------- Master Post Controls --------------------
  EXPOSURE:           { default: 0.0,  min: -5, max: 5, step: 0.01, label: 'Exposure', layerParam: true },
  CONTRAST:           { default: 1.0,  min: 0,  max: 3, step: 0.01, label: 'Contrast', layerParam: true },
  GAMMA:              { default: 1.0,  min: 0.1,max: 3, step: 0.01, label: 'Gamma', layerParam: true },
  BRIGHTNESS:         { default: 0.0,  min: -1, max: 1, step: 0.01, label: 'Brightness', layerParam: true },
  // -------------------- Feature Toggles --------------------
  FORCE_MAP_ENABLE:   { default: true,  type: 'bool', label: 'Force Map Enable' },
  DENSITY_MAP_ENABLE: { default: true,  type: 'bool', label: 'Density Map Enable' },
  COLOR_MAP_ENABLE:   { default: true,  type: 'bool', label: 'Color Map Enable' }
};

// Build runtime config values from schema defaults
export const config = Object.keys(CONFIG_SCHEMA).reduce((acc, key) => {
    acc[key] = CONFIG_SCHEMA[key].default;
    return acc;
}, {});
