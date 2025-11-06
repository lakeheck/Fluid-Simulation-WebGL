
// Schema describing UI/SDK metadata and defaults for selected params
export const CONFIG_SCHEMA = {

  // -------------------- Core Resolutions --------------------

  SIM_RESOLUTION:     { default: 512,  type: 'int',  label: 'Sim Resolution' },
  DYE_RESOLUTION:     { default: 2160, type: 'int',  label: 'Output Resolution' },
  PALETTE_RESOLUTION: { default: 128,  type: 'int',  label: 'Palette Resolution' },
  CAPTURE_RESOLUTION: { default: 1024, type: 'int',  label: 'Capture Resolution' },
  FORCE_ASPECT: {default: true, type: 'bool'},
  // -------------------- Fluid Dynamics --------------------
  ASPECT:             { default: 1.0,  min: 0.1, max: 5,  step: 0.01, label: 'Aspect' },
  FLOW:               { default: 3.44, min: 0,   max: 10, step: 0.01, label: 'Flow' , layerParam: true },
  SPLAT_FLOW:         { default: 0.15, min: 0,   max: 1,  step: 0.001, label: 'Splat Flow' },
  VELOCITYSCALE:      { default: 1.0,  min: 0,   max: 5,  step: 0.01, label: 'Velocity Scale', layerParam: true  },
  DENSITY_DISSIPATION:{ default: 0.25, min: 0,   max: 1,  step: 0.001, label: 'Density Dissipation', layerParam: true },
  VELOCITY_DISSIPATION:{ default: 0.2, min: 0,   max: 1,  step: 0.001, label: 'Velocity Dissipation' },
  PRESSURE:           { default: 0.8,  min: 0,   max: 2,  step: 0.01, label: 'Pressure' },
  PRESSURE_ITERATIONS:{ default: 50,   min: 1,   max: 200, type: 'int', label: 'Pressure Iterations' },
  CURL:               { default: 30,   min: 0,   max: 100, step: 0.1, label: 'Curl Strength', layerParam: true  },
  SPLAT_RADIUS:       { default: 0.15, min: 0,   max: 1,  step: 0.001, label: 'Splat Radius' },
  SPLAT_FORCE:        { default: 6000, min: 0,   max: 20000, step: 10, label: 'Splat Force' },
  // -------------------- Rendering / Visual --------------------
  BACK_COLOR:         { default: { r:0, g:0, b:0 }, type: 'color', label: 'Background Color' },
  TRANSPARENT:        { default: false, type: 'bool', label: 'Transparent BG' },
  DISPLAY_FLUID:      { default: true,  type: 'bool', label: 'Display Fluid' },
  // -------------------- Noise Params --------------------
  EXPONENT:           { default: 1.0, min: 0, max: 4, step: 0.01, label: 'Exponent' },
  PERIOD:             { default: 3.0, min: 0, max: 10, step: 0.01, label: 'Period' },
  RIDGE:              { default: 1.0, min: 0, max: 2, step: 0.01, label: 'Ridge' },
  AMP:                { default: 1.0, min: 0, max: 2, step: 0.01, label: 'Amplitude' },
  LACUNARITY:         { default: 2.0, min: 0, max: 6, step: 0.01, label: 'Lacunarity' },
  GAIN:               { default: 0.5, min: 0, max: 1, step: 0.01, label: 'Gain' },
  OCTAVES:            { default: 4,   min: 1, max: 12, type: 'int', label: 'Octaves' },
  MONO:               { default: false, type: 'bool', label: 'Monochrome' },
  NOISE_TRANSLATE_SPEED:{ default: 0.15, min: 0, max: 2, step: 0.001, label: 'Noise Translate Speed' },

  // -------------------- Control / Misc --------------------
  PAUSED:             { default: false, type: 'bool', label: 'Paused', id: 'paused', layerParam: true },
  RESET:              { default: false, type: 'bool', label: 'Reset' },
  RANDOM:             { default: false, type: 'bool', label: 'Randomize Input' },
  WIND_SCALE:         { default: 0.05, min: 0, max: 2, step: 0.001, label: 'Wind Scale', id: 'windScale', layerParam: true },
  WIND_TYPE:          { default: 8, min: 0, max: 10, step: 1, type: 'int', label: 'Wind Type', layerParam: true  },
  // -------------------- BDRF Material Params --------------------
  BDRF_DIFFUSE:       { default: 0.196,   min: 0, max: 1, step: 0.0001, label: 'BDRF Diffuse', layerParam: true  },
  BDRF_NORMALS:       { default: 0.081352,min: 0, max: 1, step: 0.0001, label: 'BDRF Normals' , layerParam: true },
  BDRF_FRESNAL:       { default: 0.105,   min: 0, max: 1, step: 0.0001, label: 'BDRF Fresnel' },
  BDRF_ROUGH:         { default: 0.57256, min: 0, max: 1, step: 0.0001, label: 'BDRF Roughness' },
  BDRF_SPECULAR:      { default: 0.345,   min: 0, max: 1, step: 0.0001, label: 'BDRF Specular' },
  LUT:                { default: 1.0, min: 0, max: 1, step: 0.01, label: 'LUT Mix', layerParam: true  },
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
