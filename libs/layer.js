/*!
 * Copyright Layer, Inc. 2025.
 * All rights reserved.
 *
 * This software and its documentation are the confidential and proprietary information of
 * Layer, Inc ("Proprietary Information"). You shall not disclose such Proprietary
 * Information and shall use it only in accordance with the terms of the license agreement
 * you entered into with Layer, Inc.
 *
 * This software is the proprietary information of Layer, Inc. Use is subject to license terms.
 * License terms can be found at ./license.txt
 *
 * Authors: Sam Shull
 * Date: 2025-02-11
 * Version: 1.1.12
 */

(() => {
  const MATCH_UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  const HASH_VALIDATORS = {
    BASE64: /^[a-z0-9+/=_-]+$/i,
    HEX: /^[0-9a-f]+$/i,
    ALPHABETIC: /^[a-z ]+$/i,
    ALPHANUMERIC: /^[a-z0-9_ ]+$/i
  };
  const TIMEOUT_BLANK_CANVAS = 5000;
  const THUMB_SIZE = 240;

  const config = {};
  const url = new URL(location.href);

  const debug = async (...args) => {
    if (!DEBUG) return;
    const results = await Promise.all(args);
    console.log('DEBUG:', ...results);
  };

  const send = (message) => {
    debug('send', message);
    if (!message) {
      console.trace('No message to send');
      return;
    }
    if (typeof message === 'string') window.parent.postMessage(`layer:${message}`, '*');
    else window.parent.postMessage(message, '*');
  };

  const trigger = (name, message) => {
    const event = typeof name === 'string' ? new CustomEvent(`layer:${name}`) : name;
    debug('trigger', event);
    globalThis.dispatchEvent(event);
    if (message) send(message);
  };

  const decompressJSON = async (value, encoding) => {
    // Decode Base64 string to Uint8Array
    const byteArray = Uint8Array.from([...atob(value)].map((x) => x.charCodeAt(0)));
    // use Compression Streams API to decompress
    const stream = new Blob([byteArray]).stream().pipeThrough(new DecompressionStream(encoding || 'deflate'));
    // resolve as parsed JSON
    return await new Response(stream).json();
  };

  const sfc32 = (seed) => {
    const buf = new Uint32Array(4);
    buf.set(seed);
    return () => {
      const t = (((buf[0] + buf[1]) >>> 0) + buf[3]) >>> 0;
      buf[3] = (buf[3] + 1) >>> 0;
      buf[0] = buf[1] ^ (buf[1] >>> 9);
      buf[1] = (buf[2] + (buf[2] << 3)) >>> 0;
      buf[2] = (((buf[2] << 21) | (buf[2] >>> 11)) + t) >>> 0;
      return t / 0x1_0000_0000;
    };
  };

  const wait = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const generatePreview = (canvas) => {
    const clone = canvas.cloneNode(true);
    clone.width = THUMB_SIZE;
    clone.height = THUMB_SIZE;

    return async (event) => {
      let recording = false;
      const willPause = _paused;
      const controller = new AbortController();
      const signal = controller.signal;
      const aborting = () => {
        debug('Aborting preview');
        controller.abort();
      };

      globalThis.addEventListener('layer:cancelpreview', aborting, { once: true });

      const {
        frameRate = 5,
        lengthInMs = 10000,
        // check if browser supports mime type for recording (e.g. Firefox doesn't support video/mp4)
        mimeType = 'video/mp4',
        thumbnailMimeType = 'image/png',
        videoKeyFrameIntervalCount = 10,
        videoKeyFrameIntervalDuration
      } = event.data ?? {};

      if (!mimeType) {
        $layer.previewEnabled = false;
        sdkError('No supported mime type found for MediaRecorder.');
      }

      if (!MediaRecorder.isTypeSupported(mimeType)) {
        $layer.previewEnabled = false;
        sdkError('MediaRecorder does not support recording with mime type: ' + mimeType);
      }

      try {
        debug('generatePreview');
        if (willPause) COMMANDS.play();
        // detect if the clone is blank
        debug('Checking for blank canvas');
        const ctx = clone.getContext('2d');
        const start = Date.now();
        do {
          ctx.drawImage(canvas, 0, 0, clone.width, clone.height);
          // wrap as u32 array to reduce number of checks (4x less) for blank canvas
          const imageData = new Uint32Array(
            ctx.getImageData(0, 0, clone.width, clone.height).data.buffer
          );
          const first = imageData[0];
          const blank = imageData.every((value) => value === first);
          if (!blank) break;
          await wait(500);
          if ((Date.now() - start) > TIMEOUT_BLANK_CANVAS) throw new Error('blank canvas');
        } while (true);
        // the parent will detect blob.type and use the file accordingly
        clone.toBlob((blob) => {
          if (signal.aborted) return;
          if (!blob) console.error('Failed to create preview');
          debug('Preview created');
          send(blob);
        }, thumbnailMimeType);
        const stream = canvas.captureStream(frameRate);
        const mediaRecorderOptions = {
          mimeType
        };
        if (videoKeyFrameIntervalDuration) {
          mediaRecorderOptions.videoKeyFrameIntervalDuration = videoKeyFrameIntervalDuration;
        }
        if (videoKeyFrameIntervalCount && !mediaRecorderOptions.videoKeyFrameIntervalDuration) {
          mediaRecorderOptions.videoKeyFrameIntervalCount = videoKeyFrameIntervalCount;
        }
        const recorder = new MediaRecorder(stream, mediaRecorderOptions);
        const chunks = [];
        recorder.ondataavailable = (event) => {
          debug('ondataavailable', recorder.state);
          if (signal.aborted) {
            recorder.stop();
            return;
          }
          chunks.push(event.data);
        };
        const recorded = wait(lengthInMs).then(() => {
          debug('recorder.state:', recorder.state);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        });
        const stopped = new Promise((resolve, reject) => {
          recorder.onstop = resolve;
          recorder.onerror = (event) => reject(event.error);
          recording = true;
          recorder.start();
          send('preview-started');
          debug('recording started');
        }).then(() => {
          recording = false;
          send('preview-stopped');
          debug('recorder stopped');
          if (signal.aborted) return;
          if (!chunks.length) {
            console.error('No data available');
            return;
          }
          const video = new Blob(chunks, { type: mimeType });
          debug('Video created', video);
          send(video);
          debug('Video sent');
        }).catch((error) => {
          debug('recorder error:', error);
          throw error;
        });

        await Promise.all([stopped, recorded]);
        debug('Recording finished');
      } catch (error) {
        console.dir({
          mimeType,
          frameRate,
          lengthInMs,
          videoKeyFrameIntervalCount,
          videoKeyFrameIntervalDuration
        });
        if (error.message === 'blank canvas') {
          debug('Canvas is blank');
          $layer.previewEnabled = false;
          send('preview-blank');
          console.warn('The canvas is blank. If you are using WebGL, you may need to modify your code to preserve the drawing buffer between renders.\nSee https://docs.layer.com');
          return;
        }
        if (recording) send('preview-stopped');
        console.error(error);
      } finally {
        send('preview-finished');
        globalThis.removeEventListener('layer:cancelpreview', aborting);
        if (willPause) COMMANDS.pause();
      }
    };
  };

  const thumbnailFromVideo = async (video) => {
    // create a thumbnail from the video
    const url = URL.createObjectURL(video);
    const videoElement = document.createElement('video');
    videoElement.addEventListener('loadedmetadata', async () => {
      try {
        await videoElement.play();
        const canvas = document.createElement('canvas');
        Object.assign(canvas, {
          width: videoElement.videoWidth,
          height: videoElement.videoHeight
        });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) console.error('Failed to create thumbnail from video');
          // the parent will detect blob.type and use the file accordingly
          send(blob);
          document.body.removeChild(videoElement);
        }, 'image/png');
      } catch (error) {
        console.error(error);
      }
    }, { once: true });

    Object.assign(videoElement, {
      src: url,
      muted: true,
      autoplay: true,
      loop: true
    });

    Object.assign(videoElement.style, {
      position: 'absolute',
      bottom: '0',
      right: '0',
      zIndex: '-9999',
      opacity: '0',
      pointerEvents: 'none'
    });

    document.body.appendChild(videoElement);
  };

  const parse = (config, value) => {
    const impl = PARAM_TYPES[config.kind.toUpperCase()];
    if (!impl) sdkError(`Invalid param type: ${config.kind}`);
    if (!impl.validate(value, config)) sdkError(`Invalid value for param ${config.id}: ${value}`);
    return impl.coerce(value);
  };

  const sdkError = (message) => {
    throw new Error(message);
  };

  const isNumber = (x) => {
    return typeof x === 'number';
  };

  const isFunction = (x) => {
    return typeof x === 'function';
  };

  const isString = (x) => {
    return typeof x === 'string';
  };

  const isValidParam = (x) => {
    return typeof x === 'object' && isValidID(x.id) && x.kind && x.name;
  };

  const isValidID = (x) => {
    return isString(x) && !(x === '__proto__' || x === 'prototype' || x === 'constructor');
  };

  const clamp = (x, min, max) => {
    if (x < min) return min;
    return x > max ? max : x;
  };

  const round = (x, y) => {
    return Math.round(x / y) * y;
  };

  const deque = (samples, pred, index = []) => {
    return {
      head() {
        return samples[index[0]];
      },
      push(x) {
        while (index.length && pred(samples[index[index.length - 1]], x)) {
          index.pop();
        }
        index.push(samples.length - 1);
      },
      shift() {
        if (index[0] === 0) index.shift();
        for (let i = index.length; i-- > 0;) index[i]--;
      }
    };
  };

  class LayerSDK {

    constructor(url) {
      this.url = url;

      if (MATCH_UUID.test(url.pathname)) {
        _uuid = url.pathname.match(MATCH_UUID)[0];
      } else if (MATCH_UUID.test(url.search)) {
        _uuid = url.search.match(MATCH_UUID)[0];
      } else if (MATCH_UUID.test(url.href)) {
        _uuid = url.href.match(MATCH_UUID)[0];
      }

      if (url.searchParams.has('_layerdimensions')) {
        const dimensions = url.searchParams.get('_layerdimensions').split('x').map(Number);
        if (dimensions.length === 2 && dimensions.every(isFinite)) {
          Object.defineProperties(this, {
            width: { value: dimensions[0] },
            height: { value: dimensions[1] }
          });
        }
      }

      if (url.searchParams.has('_layerfps')) {
        const fps = parseInt(url.searchParams.get('_layerfps') || '1', 10);
        this.startFPSOverlay(fps > 1 && fps < 121 ? fps : 60);
      }
    }

    get width() {
      return window.innerWidth;
    }

    get height() {
      return window.innerHeight;
    }

    get uuid() {
      return _uuid;
    }

    get seed() {
      return this.uuid.replace(/-/g, '').match(/.{8}/g).map((x) => parseInt(x, 16));
    }

    get prng() {
      if (_prng) return _prng;
      _prng = sfc32(this.seed);
      return _prng;
    }

    set canvas(value) {
      this.registerCanvas(value);
    }

    get canvas() {
      return _canvas;
    }

    get controlled() {
      return this.url.searchParams.get('controlled') === '1' || this.url.searchParams.get('broadcasting') === '1';
    }

    get debug() {
      return DEBUG;
    }

    set debug(value) {
      DEBUG = value ? true : false;
    }

    get parameters() {
      return _parameterProxy;
    }

    set previewEnabled(value) {
      // skip if already enabled
      if (value === _previewEnabled) return;
      _previewEnabled = value;
      const action = value ? 'enabled' : 'disabled';
      send(`preview-${action}`);
    }

    get previewEnabled() {
      return _previewEnabled;
    }

    startFPSOverlay(targetFPS = 60, fill = true) {
      _overlay ??= new FPSOverlay(targetFPS, fill);
      _overlay.start();
      return this;
    }

    stopFPSOverlay() {
      if (_overlay?.running) _overlay.detach();
      return this;
    }

    registerCanvas(canvas) {
      if (!canvas || typeof canvas.toBlob !== 'function')
        throw new Error('Invalid canvas element');
      _canvas = canvas;
      globalThis.addEventListener('layer:preview', generatePreview(canvas));
      this.previewEnabled = true;
      return this;
    }

    async params(...entries) {
      for (const entry of entries) {
        if (!isValidParam(entry)) {
          console.error('Invalid parameter:', entry);
          throw new Error(
            'Invalid parameter. Must be an object with id, kind, and name properties. id must not be a reserved property name.'
          );
        }

        // create shallow copy to not modify original with cleaned up version
        const cleaned = { ...entry, kind: entry.kind.toUpperCase() };
        const impl = PARAM_TYPES[cleaned.kind];
        if (!impl) throw new Error(`Invalid param type: ${cleaned.kind}`);
        if (cleaned.default != null) {
          if (!impl.validate(cleaned.default, cleaned)) {
            throw new Error(`Invalid default value for param ${cleaned.id}: ${cleaned.default}`);
          }
          cleaned.default = impl.coerce(cleaned.default);
        }
        config[cleaned.id] = cleaned;
        _parameters[cleaned.id] = cleaned.default;

        const definition = {
          get: () => _parameters[cleaned.id] ?? cleaned.default,
          configurable: false,
          enumerable: true
        };
        Object.defineProperty(_parameterProxy, cleaned.id, definition);
        send(`parameter:${JSON.stringify(cleaned)}`);
      }

      if (this.url.searchParams.has('_layer')) {
        try {
          const compressed = this.url.searchParams.get('_layer');
          const input = await decompressJSON(compressed);
          if (input) {
            for (const [id, value] of Object.entries(input)) {
              if (!Object.hasOwn(config, id)) {
                console.warn('skipping override for unknown param:', id);
                continue;
              }
              try {
                _parameters[id] = parse(config[id], value);
              } catch (e) {
                console.warn('ignoring param override:', e.message);
              }
            }
          }
          return this.parameters;
        } catch (err) {
          console.error(err);
        }
      }

      if (this.controlled && !_parametersAvailable) {
        const promise = new Promise((resolve) => globalThis.addEventListener(
          'layer:parameters',
          () => void resolve(this.parameters),
          { once: true })
        );
        send('awaiting-parameters');
        return await promise;
      }

      return this.parameters;
    }

    screenshot(dataurl) {
      console.warn('DEPRECATED: Use $layer.preview instead of $layer.screenshot');
      if (!dataurl || typeof dataurl !== 'string' || !dataurl.startsWith('data:image/'))
        throw new Error('Invalid dataurl');
      send(`screenshot-taken:${dataurl}`);
      return this;
    }

    preview(video, thumbnail) {
      if (!video || !(video instanceof Blob))
        throw new Error('Invalid preview');
      if (thumbnail && thumbnail instanceof Blob) {
        send(thumbnail);
      } else {
        thumbnailFromVideo(video);
      }

      // the parent will detect blob.type and use the file accordingly
      send(video);
      return this;
    }
  }

  class ColorResult {
    constructor(value) {
      this.value = typeof value === 'string' ? value : null;
    }

    get hex() {
      return this.value;
    }

    get rgb() {
      if (this._rgb) return this._rgb;
      if (!this.value) return null;
      // parse value into rgb
      const rgb = parseInt(this.value.replace('#', ''), 16);
      this._rgb = Object.freeze([
        (rgb >> 16) & 255,
        (rgb >> 8) & 255,
        rgb & 255
      ]);
      return this._rgb;
    }

    get hsl() {
      if (this._hsl) return this._hsl;
      const rgb = this.rgb;
      if (!rgb) return null;
      let [r, g, b] = rgb;
      // Normalize the r, g, b values to the range [0, 1]
      r /= 255;
      g /= 255;
      b /= 255;

      // Find min and max values among r, g, b
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      let h = 0,
        s = 0,
        l = (max + min) / 2;

      if (delta !== 0) {
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

        switch (max) {
          case r:
            h = (g - b) / delta + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / delta + 2;
            break;
          case b:
            h = (r - g) / delta + 4;
            break;
        }

        h /= 6;
      }

      // Convert hue to degrees, and saturation/lightness to percentages
      this._hsl = [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
      return this._hsl;
    }

    valueOf() {
      return this.value;
    }

    toString() {
      return this.value;
    }

    toJSON() {
      return this.value;
    }
  }

  class FPSOverlay {
    constructor(targetFPS = 60, fill = true) {
      this._targetFPS = targetFPS;
      this.fill = fill;
      this.handleResize = this.handleResize.bind(this);
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('style', 'position:fixed;top:0;right:0;z-index:9999;');
      this.handleResize();
      this.canvas.title = 'Double-click to close.';
      this.canvas.ondblclick = () => {
        this.detach();
        _overlay = null;
      };
      window.addEventListener('resize', this.handleResize);
      this.ctx = this.canvas.getContext('2d');
      this.ctx.font = '2vh sans-serif';
      this.ctx.textBaseline = 'middle';
      this.ctx.strokeStyle = '#fff';
      this.ctx.setLineDash([1, 1]);
      this.samples = [];
      this.min = deque(this.samples, (a, b) => a >= b);
      this.max = deque(this.samples, (a, b) => a <= b);
      this.peak = this.targetFPS * 1.2;
      this.windowSum = 0;
      this.prevT = 0;
      this.update = this.update.bind(this);
      this.attach();
    }

    handleResize() {
      this.canvas.width = window.innerWidth / 2;
      this.canvas.height = window.innerHeight / 3;
      Object.assign(this.canvas.style, {
        width: `${this.canvas.width}px`,
        height: `${this.canvas.height}px`
      });
      this._period = this.canvas.width;
    }

    get twoVH() {
      return window.innerHeight * 0.02;
    }

    get targetFPS() {
      return this._targetFPS;
    }

    set targetFPS(value) {
      this._targetFPS = value;
      this.peak = value * 1.2;
    }

    get period() {
      return this._period;
    }

    set period(value) {
      this._period = value;
      this.samples.length = 0;
      this.windowSum = 0;
      this.prevT = 0;
      this.min = deque(this.samples, (a, b) => a >= b);
      this.max = deque(this.samples, (a, b) => a <= b);
    }

    get running() {
      return this._running;
    }

    attach() {
      this._running = true;
      document.body.appendChild(this.canvas);
      requestAnimationFrame(this.update);
    }

    detach() {
      this._running = false;
      window.removeEventListener('resize', this.handleResize);
      document.body.removeChild(this.canvas);
    }

    start() {
      const update = (t) => {
        this.update(t);
        if (this._running) requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    }

    update(t) {
      if (!this._running) return;
      let {
        canvas: { width, height },
        ctx,
        peak,
        min,
        max,
        period,
        samples,
        targetFPS,
        fill
      } = this;
      const delta = t - this.prevT;
      if (delta < 1) return;
      const fps = 1000 / delta;
      let num = this.samples.push(fps);
      this.prevT = t;
      // maintain min/max peaks
      min.push(fps);
      max.push(fps);
      // shift moving window & peak indices
      if (num > period) {
        num--;
        this.windowSum -= samples.shift();
        min.shift();
        max.shift();
      }
      // update window total
      this.windowSum += fps;
      // smoothly interpolate peak value
      this.peak = peak += (max.head() * 1.1 - peak) * 0.1;
      // define gradient (normalized to current peak value)
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(clamp(1 - targetFPS / peak, 0, 1), '#0f0');
      grad.addColorStop(clamp(1 - (targetFPS - 1) / peak, 0, 1), '#ff0');
      grad.addColorStop(clamp(1 - targetFPS / 2 / peak, 0, 1), '#f00');
      grad.addColorStop(1, '#306');

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      ctx[fill ? 'fillStyle' : 'strokeStyle'] = grad;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-1, height);
      for (let i = 0; i < num; i++) {
        ctx.lineTo(i, (1 - samples[i] / peak) * height);
      }
      if (fill) {
        ctx.lineTo(num - 1, height);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.stroke();
      }

      ctx.fillStyle = ctx.strokeStyle = '#fff';
      ctx.setLineDash([1, 1]);
      ctx.beginPath();
      const lower = peak > 30 ? 15 : 5;
      const step = peak > 90 ? 30 : lower;
      for (
        let fps = round(Math.min(targetFPS, peak + step / 2), step);
        fps > 0;
        fps -= step
      ) {
        const y = (1 - fps / peak) * height;
        ctx.moveTo(width - 80, y);
        if (width >= 120) {
          ctx.lineTo(width - 22, y);
          ctx.fillText(String(fps), width - 20, y + 1);
        } else {
          ctx.lineTo(width, y);
        }
      }
      ctx.stroke();
      const _2vh = this.twoVH;
      const margin = _2vh * 0.5;
      ctx.font = `${_2vh}px sans-serif`;

      const lineHeight = _2vh * 1.5;
      [
        `sma(${num}): ${(this.windowSum / num).toFixed(1)} fps`,
        `max: ${max.head().toFixed(1)} fps`,
        `min: ${min.head().toFixed(1)} fps`
      ].forEach((label, i) => {
        const y = height - margin - i * lineHeight;
        ctx.fillText(label, margin, y);
      });
      requestAnimationFrame(this.update);
    }
  }

  const COMMANDS = {
    cancelpreview() {
      trigger('cancelpreview');
    },
    debug() {
      DEBUG = !DEBUG;
    },
    screenshot() {
      trigger('screenshot');
    },
    preview(input) {
      try {
        const data = input ? JSON.parse(input) : {};
        trigger(new CustomEvent('layer:preview', { detail: data }));
      } catch (err) {
        console.error(err);
      }
    },
    play() {
      _paused = false;
      trigger('play', 'playing');
    },
    pause() {
      _paused = true;
      trigger('pause', 'paused');
    },
    reset() {
      trigger('reset');
    },
    paramchange(input) {
      try {
        if (!input) return;
        const data = JSON.parse(input);
        debug('parameter', data);
        if (!(data?.id && Object.hasOwn(config, data.id) && data.value != null))
          return;
        const { id, value } = data;
        if (_parameters[id] === value) return;
        _parameters[id] = parse(config[id], value);
        _uuid = generateUUID();
        _prng = null;
        // ensure that we use the accessor to get the value
        const detail = { id, value: _parameterProxy[id] };
        trigger(new CustomEvent('layer:paramchange', { detail }));
        trigger('parameters');
      } catch (err) {
        console.error(err);
      }
    },
    parameters(input) {
      try {
        if (!input) throw new Error('layer:parameters message must include a JSON string');
        const data = JSON.parse(input);
        debug('parameters', _parametersAvailable, data);
        if (!data) return;
        _prng = null;
        for (const [id, value] of Object.entries(data)) {
          if (_parameters[id] === value) continue;
          _uuid = generateUUID();
          _parameters[id] = parse(config[id], value);
          if (_parametersAvailable) {
            // ensure that we use the accessor to get the value
            const detail = { id, value: _parameterProxy[id] };
            trigger(new CustomEvent('layer:paramchange', { detail }));
          }
        }
        _parametersAvailable = true;
        trigger('parameters');
      } catch (err) {
        console.error(err);
      }
    },
    overlay(input) {
      try {
        const data = input ? JSON.parse(input) : {};
        if (data.show === false || data.hide) {
          if (_overlay?.running) _overlay.detach();
          return;
        }
        _overlay ??= new FPSOverlay(data.targetFPS, data.fill);
        if (Object.hasOwn(data, 'targetFPS')) _overlay.targetFPS = data.targetFPS;
        if (Object.hasOwn(data, 'fill')) _overlay.fill = data.fill;
        if (!_overlay.running) _overlay.attach();
      } catch (error) {
        console.error(error);
      }
    }
  };

  /**
   * Each param type provides its own validation and coercion function. Coercions
   * are only called iff validate() already accepted the value. These function are
   * applied to any non-null param default values as well as to any param change
   * request or overrides parsed from stored variations/presets.
   *
   * @remarks
   * Currently the validators all assume that a param's other constraints are all
   * valid (e.g. that a LIST param actually defines an `options` array, or that a
   * HASH providing a `maxLength` is actually a valid number etc.)
   */
  const PARAM_TYPES = {
    BOOLEAN: {
      validate(value) {
        return value === true ||
          value === false ||
          value === 'true' ||
          value === 'false' ||
          value === 1 ||
          value === 0 ||
          value === '1' ||
          value === '0';
      },
      coerce(value) {
        return value === true || value === 1 || value === 'true' || value === '1';
      }
    },

    COLOR: {
      validate(value) {
        return isString(value) && /^#[0-9a-f]{6}$/i.test(value);
      },
      coerce(value) {
        return new ColorResult(value);
      }
    },

    HASH: {
      validate(value, spec) {
        if (!isString(value)) return false;
        if (spec.minLength && value.length < spec.minLength) return false;
        if (spec.maxLength && value.length > spec.maxLength) return false;
        if (spec.pattern != null && !Object.hasOwn(HASH_VALIDATORS, spec.pattern)) return false;
        return HASH_VALIDATORS[spec.pattern || 'ALPHANUMERIC'].test(value);
      },
      coerce(value) {
        return value;
      }
    },

    LIST: {
      validate(value, spec) {
        if (!isString(value)) return false;
        return spec.options.some((opt) => (isString(opt) ? opt : opt.value) === value);
      },
      coerce(value) {
        return value;
      }
    },

    NUMBER: {
      validate(value, spec) {
        if (isString(value)) value = +value;
        if (!isNumber(value) || isNaN(value) || !isFinite(value)) return false;
        if (spec.min != null && value < spec.min) return false;
        if (spec.max != null && value > spec.max) return false;
        return true;
      },
      coerce(value) {
        return +value;
      }
    }
  };

  let _uuid = generateUUID();
  let _canvas = null;
  let _prng = null;
  let _paused = false;
  let _parameters = {};
  let _parameterProxy = {};
  let _previewEnabled = false;
  let _parametersAvailable = false;
  let _overlay = null;
  let DEBUG = url.searchParams.has('debug') ||
    url.hostname.endsWith('.art') ||
    url.hostname.endsWith('.local') ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    localStorage.getItem('layer:generative-debug') === 'true';

  if (localStorage.getItem('layer:generative-debug') === 'false') DEBUG = false;

  debug('location.href', url.href);

  addEventListener('message', (event) => {
    const { data } = event;
    debug('Message received generative.js:', data);
    if (typeof data !== 'string') return;
    if (!data.startsWith('layer:')) return;
    const [, command, , input] = data.match(/^layer:([^:]+)(:(.+))?$/);
    if (Object.hasOwn(COMMANDS, command) && typeof COMMANDS[command] === 'function') {
      return void COMMANDS[command](input);
    }
    debug('Unhandled message:', event.data);
  });

  addEventListener('load', () => {
    // send message to parent
    send('data-loaded');
  });

  addEventListener('beforeunload', () => {
    send('preview-disabled');
  });

  addEventListener('resize', () => {
    trigger(new CustomEvent('layer:dimensionschange', {
      detail: {
        width: $layer.width,
        height: $layer.height
      }
    }));
  });

  const $layer = new LayerSDK(url);
  globalThis.$layer = Object.freeze($layer);
  _paused = $layer.controlled;
})();
