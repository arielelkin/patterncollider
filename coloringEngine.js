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

      // Use first grid index instead of sum for proper Ammann banding
      // Ammann bars form parallel bands in each direction independently
      const gridIndices = tile.gridIndices || [];
      const bandDirection = context.bandDirection || 0;
      const index = gridIndices[bandDirection % gridIndices.length] || 0;

      const mod = ((index % period) + period) % period;
      const normalized = mod / period;

      const start = context.lchRamp.start;
      const end = context.lchRamp.end;

      const l = lerp(start[0], end[0], normalized);
      const c = lerp(start[1], end[1], normalized);
      const h = lerp(start[2], end[2], normalized);

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
