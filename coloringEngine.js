(function(global) {
  const DEFAULT_COLOR = '#555555';

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function lchToHex(lch) {
    if (typeof hsluv === 'undefined' || !hsluv.lchToRgb) {
      return DEFAULT_COLOR;
    }
    const rgb = hsluv.lchToRgb(lch).map(channel => {
      const clamped = Math.max(0, Math.min(1, channel));
      return Math.round(clamped * 255);
    });
    const [r, g, b] = rgb;
    return (
      '#' +
      [r, g, b]
        .map(v => {
          const hex = v.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')
    );
  }

  const schemes = {
    palette(tile, context) {
      if (!context || !context.paletteLookup) {
        return context?.defaultColor || DEFAULT_COLOR;
      }
      const key = context.orientationColoring ? tile.angles : tile.area;
      return context.paletteLookup[key] || context.defaultColor || DEFAULT_COLOR;
    },

    'substitution-banding'(tile, context) {
      if (!context || !context.lchRamp || !context.lchRamp.start || !context.lchRamp.end) {
        return context?.defaultColor || DEFAULT_COLOR;
      }

      const period = Math.max(1, context.bandPeriod || 6);
      const gridIndices = tile.gridIndices || [];

      if (gridIndices.length === 0) {
        return context.defaultColor || DEFAULT_COLOR;
      }

      // Ammann bars form parallel bands in ALL directions simultaneously
      // Use first 3 grid directions to control L, C, H independently
      const start = context.lchRamp.start;
      const end = context.lchRamp.end;

      // Direction 0 controls Lightness
      const idx0 = gridIndices[0] || 0;
      const mod0 = ((idx0 % period) + period) % period;
      const t0 = mod0 / period;
      const l = lerp(start[0], end[0], t0);

      // Direction 1 controls Chroma (if available)
      let c;
      if (gridIndices.length > 1) {
        const idx1 = gridIndices[1] || 0;
        const mod1 = ((idx1 % period) + period) % period;
        const t1 = mod1 / period;
        c = lerp(start[1], end[1], t1);
      } else {
        c = lerp(start[1], end[1], t0);
      }

      // Direction 2 controls Hue (if available)
      let h;
      if (gridIndices.length > 2) {
        const idx2 = gridIndices[2] || 0;
        const mod2 = ((idx2 % period) + period) % period;
        const t2 = mod2 / period;
        h = lerp(start[2], end[2], t2);
      } else {
        h = lerp(start[2], end[2], t0);
      }

      return lchToHex([l, c, h]);
    }
  };

  const ColoringEngine = {
    colorTile(tile, context) {
      if (!context || !context.scheme) {
        return DEFAULT_COLOR;
      }
      const resolver = schemes[context.scheme] || schemes.palette;
      return resolver(tile, context);
    },

    registerScheme(name, resolver) {
      if (name && typeof resolver === 'function') {
        schemes[name] = resolver;
      }
    }
  };

  global.ColoringEngine = ColoringEngine;
})(window);
