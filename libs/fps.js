document.addEventListener('DOMContentLoaded', () => {

    var overlay = new FPSOverlay();
    overlay.visible = true;
  });
  
  function clamp(x, min, max) {
    return x < min ? min : x > max ? max : x;
  }
  
  function round(x, y) {
    return Math.round(x / y) * y;
  }
  
  function deque(samples, pred, index = []) {
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
        for (let i = index.length; i-- > 0; ) index[i]--;
      }
    };
  }
  
  class FPSOverlay {
    #visible;
  
    constructor(targetFPS = 60, period = 400, fill = true) {
      this.targetFPS = targetFPS;
      this.period = period;
      this.fill = fill;
      this.canvas = document.createElement('canvas');
      this.canvas.width = period;
      this.canvas.height = 200;
      this.canvas.setAttribute('style', 'image-rendering:auto;margin:0;height:200px;width:' + period + 'px;position:fixed;top:0;left:0;z-index:9999;');
      this.ctx = this.canvas.getContext('2d');
      this.ctx.font = '12px sans-serif';
      this.ctx.textBaseline = 'middle';
      this.ctx.strokeStyle = '#fff';
      this.ctx.setLineDash([1, 1]);
    }
  
    set visible(state) {
      if (state) {
        if (this.#visible) return;
        document.body.appendChild(this.canvas);
        this.start();
      } else document.body.removeChild(this.canvas);
      this.#visible = state;
    }
  
    start() {
      this.samples = [];
      this.min = deque(this.samples, (a, b) => a >= b);
      this.max = deque(this.samples, (a, b) => a <= b);
      this.peak = this.targetFPS * 1.2;
      this.windowSum = 0;
      this.prevT = 0;
      const update = (t) => {
        this.update(t);
        if (this.#visible) requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    }
  
    update(t) {
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
      for (
        let step = peak > 90 ? 30 : peak > 30 ? 15 : 5, fps = round(Math.min(targetFPS, peak + step / 2), step);
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
  
      if (num >= period) {
        [
          [`sma(${period}):`, this.windowSum / period],
          ['max:', max.head()],
          ['min:', min.head()]
        ].forEach(([label, value], i) => {
          const y = height - 8 - i * 12;
          ctx.fillText(label, 4, y);
          ctx.fillText(value.toFixed(1) + ' fps', 64, y);
        });
      }
    }
  }