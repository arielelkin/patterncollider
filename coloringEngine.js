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
      if (!context || !context.paletteLookup) {
        return context?.defaultColor || DEFAULT_COLOR;
      }

      const period = Math.max(1, context.bandPeriod || 6);
      const gridIndices = tile.gridIndices || [];
      const palette = context.paletteColors || [];

      if (gridIndices.length === 0 || palette.length === 0) {
        return context.defaultColor || DEFAULT_COLOR;
      }

      // Ammann bars: create a composite index from ALL grid directions
      // This ensures bands are visible in every direction
      // Reduce grid indices mod period to get band numbers
      const bandIndices = gridIndices.map(idx => ((idx % period) + period) % period);

      // Create a hash from all band indices to pick a palette color
      // Use weighted sum with prime multipliers to avoid collisions
      const primes = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
      let hash = 0;
      for (let i = 0; i < bandIndices.length; i++) {
        hash += bandIndices[i] * primes[i % primes.length];
      }

      // Map hash to palette index
      const colorIndex = hash % palette.length;
      return palette[colorIndex];
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
