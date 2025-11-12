/**
 * ColorRuleEngine.js
 * 
 * A robust, modular color rule engine for Pattern Collider.
 * Provides rule-based color assignment for tiles in de Bruijn multigrid tilings.
 * 
 * Features:
 * - Ammann band coloring (color by de Bruijn grid lines)
 * - Named color palettes with HSV variations
 * - Extensible architecture for additional coloring rules
 * - Deterministic color assignment for reproducibility
 * 
 * @author Pattern Collider Team
 * @version 1.0.0
 */

/**
 * Default color palette - high quality curated colors
 * Each color has a name for semantic reference
 */
const DEFAULT_PALETTE = {
    'crimson': '#DC143C',
    'deep-orange': '#FF5722',
    'amber': '#FFC107',
    'lime': '#CDDC39',
    'teal': '#009688',
    'cyan': '#00BCD4',
    'blue': '#2196F3',
    'indigo': '#3F51B5',
    'deep-purple': '#673AB7',
    'purple': '#9C27B0',
    'pink': '#E91E63',
    'rose': '#F06292'
};

/**
 * IPaletteMap Interface
 * Defines structure for color palettes
 */
class PaletteMap {
    constructor(colors) {
        this.colors = colors || DEFAULT_PALETTE;
        this.colorNames = Object.keys(this.colors);
        this.colorValues = Object.values(this.colors);
    }

    /**
     * Get color by index (wraps around if index exceeds palette size)
     */
    getColorByIndex(index) {
        const wrappedIndex = index % this.colorValues.length;
        return this.colorValues[wrappedIndex];
    }

    /**
     * Get color by name
     */
    getColorByName(name) {
        return this.colors[name] || this.colorValues[0];
    }

    /**
     * Get total number of colors in palette
     */
    size() {
        return this.colorValues.length;
    }
}

/**
 * IColorRule Interface
 * Base class for color assignment rules
 */
class ColorRule {
    constructor(palette) {
        this.palette = palette || new PaletteMap();
    }

    /**
     * Apply color rule to a tile
     * @param {Object} tile - Tile object with geometry and metadata
     * @param {Object} context - Additional context (grid, symmetry, etc.)
     * @returns {string} Hex color string
     */
    applyRule(tile, context) {
        throw new Error('applyRule must be implemented by subclass');
    }
}

/**
 * Ammann Band Color Rule
 * 
 * Colors Ammann bands (strips between parallel lines) in the de Bruijn grid.
 * Each band is a region between two consecutive parallel lines.
 * 
 * Implementation:
 * 1. Extract all grid lines grouped by angle direction
 * 2. For each angle, create bands between consecutive line pairs
 * 3. Assign colors from palette to each band
 * 4. Generate band geometries for rendering
 */
class AmmannBandColorRule extends ColorRule {
    constructor(palette, options = {}) {
        super(palette);
        this.mode = options.mode || 'all-angles'; // 'all-angles' or 'single-direction'
        this.primaryAngle = options.primaryAngle || 0;
        this.bandColorMap = new Map(); // Cache for deterministic color assignment
    }

    /**
     * Generate Ammann bands from the grid lines
     * 
     * @param {Array} gridLines - Array of {angle, index} line objects
     * @param {Object} context - Contains spacing, canvas dimensions, etc.
     * @returns {Array} Array of band objects with color and geometry
     */
    generateBands(gridLines, context) {
        // Group lines by angle
        const linesByAngle = {};

        for (let line of gridLines) {
            if (!linesByAngle[line.angle]) {
                linesByAngle[line.angle] = [];
            }
            linesByAngle[line.angle].push(line.index);
        }

        // Sort indices within each angle group
        for (let angle in linesByAngle) {
            linesByAngle[angle].sort((a, b) => a - b);
        }

        const bands = [];
        let bandColorIndex = 0;

        // Determine which angles to process
        const anglesToProcess = this.mode === 'single-direction'
            ? [this.primaryAngle]
            : Object.keys(linesByAngle).map(k => parseInt(k)).sort((a, b) => a - b);

        // For each angle direction, create bands between consecutive lines
        for (let angle of anglesToProcess) {
            if (!linesByAngle[angle]) continue;

            const indices = linesByAngle[angle];

            // Create bands between consecutive line pairs
            for (let i = 0; i < indices.length - 1; i++) {
                const index1 = indices[i];
                const index2 = indices[i + 1];

                // Create unique band identifier
                const bandKey = `${angle}:${Math.floor(index1)}`;

                // Assign color if not already assigned
                if (!this.bandColorMap.has(bandKey)) {
                    this.bandColorMap.set(bandKey, bandColorIndex % this.palette.size());
                    bandColorIndex++;
                }

                const colorIndex = this.bandColorMap.get(bandKey);
                const color = this.palette.getColorByIndex(colorIndex);

                bands.push({
                    angle: angle,
                    index1: index1,
                    index2: index2,
                    color: color,
                    bandKey: bandKey
                });
            }
        }

        return bands;
    }

    /**
     * Apply Ammann band coloring (legacy method for compatibility)
     * This is kept for tile-based coloring if needed
     */
    applyRule(tile, context) {
        if (!tile.lines || tile.lines.length === 0) {
            return this.palette.getColorByIndex(0);
        }

        // Group lines by angle and find minimum index
        const linesByAngle = {};
        for (let line of tile.lines) {
            if (!linesByAngle[line.angle]) {
                linesByAngle[line.angle] = [];
            }
            linesByAngle[line.angle].push(line.index);
        }

        const bands = [];
        for (let angle in linesByAngle) {
            const indices = linesByAngle[angle].sort((a, b) => a - b);
            const bandIndex = Math.floor(Math.min(...indices));
            bands.push({ angle: parseInt(angle), bandIndex: bandIndex });
        }

        bands.sort((a, b) => a.angle - b.angle);

        if (bands.length === 0) {
            return this.palette.getColorByIndex(0);
        }

        // Use first band's color
        const bandKey = `${bands[0].angle}:${bands[0].bandIndex}`;

        if (!this.bandColorMap.has(bandKey)) {
            const colorIndex = this.bandColorMap.size % this.palette.size();
            this.bandColorMap.set(bandKey, colorIndex);
        }

        const colorIndex = this.bandColorMap.get(bandKey);
        return this.palette.getColorByIndex(colorIndex);
    }

    /**
     * Get statistics about band coloring
     */
    getStatistics() {
        return {
            uniqueBands: this.bandColorMap.size,
            mode: this.mode,
            paletteSize: this.palette.size()
        };
    }
}

/**
 * Orientation Color Rule
 * Colors tiles based on their orientation (angle configuration)
 * This is the existing behavior in the system
 */
class OrientationColorRule extends ColorRule {
    applyRule(tile, context) {
        // Use the existing angles property
        const angles = tile.angles || '[]';
        const anglesHash = this.hashCode(angles);
        const colorIndex = Math.abs(anglesHash) % this.palette.size();
        return this.palette.getColorByIndex(colorIndex);
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }
}

/**
 * Area Color Rule
 * Colors tiles based on their area
 */
class AreaColorRule extends ColorRule {
    applyRule(tile, context) {
        // Use the existing area property
        const area = parseFloat(tile.area || '0');
        // Map area to color index deterministically
        const areaInt = Math.round(area * 1000);
        const colorIndex = Math.abs(areaInt) % this.palette.size();
        return this.palette.getColorByIndex(colorIndex);
    }
}

/**
 * Main ColorRuleEngine
 * Manages color palettes and applies color rules to tiles and bands
 */
class ColorRuleEngine {
    constructor() {
        this.palettes = new Map();
        this.currentPalette = null;
        this.currentRule = null;

        // Register default palette
        this.registerPalette('default', new PaletteMap(DEFAULT_PALETTE));
        this.setActivePalette('default');

        // Set default rule to Ammann bands
        this.setColorRule('ammann-bands');
    }

    /**
     * Register a new color palette
     */
    registerPalette(name, paletteMap) {
        this.palettes.set(name, paletteMap);
    }

    /**
     * Set the active color palette
     */
    setActivePalette(name) {
        if (!this.palettes.has(name)) {
            throw new Error(`Palette "${name}" not found`);
        }
        this.currentPalette = this.palettes.get(name);

        // Update current rule to use new palette
        if (this.currentRule) {
            this.currentRule.palette = this.currentPalette;
        }
    }

    /**
     * Set the active color rule
     */
    setColorRule(ruleType, options = {}) {
        switch (ruleType) {
            case 'ammann-bands':
                this.currentRule = new AmmannBandColorRule(this.currentPalette, options);
                break;
            case 'orientation':
                this.currentRule = new OrientationColorRule(this.currentPalette);
                break;
            case 'area':
                this.currentRule = new AreaColorRule(this.currentPalette);
                break;
            default:
                throw new Error(`Unknown color rule: ${ruleType}`);
        }
    }

    /**
     * Generate Ammann bands with colors (for rendering)
     */
    generateAmmannBands(gridLines, context) {
        if (!(this.currentRule instanceof AmmannBandColorRule)) {
            throw new Error('Current rule is not AmmannBandColorRule');
        }
        return this.currentRule.generateBands(gridLines, context);
    }

    /**
     * Apply current color rule to a single tile
     */
    colorTile(tile, context = {}) {
        if (!this.currentRule) {
            throw new Error('No color rule set');
        }
        return this.currentRule.applyRule(tile, context);
    }

    /**
     * Apply current color rule to all tiles
     */
    colorAllTiles(tiles, context = {}) {
        const coloredTiles = [];

        for (let tile of Object.values(tiles)) {
            const color = this.colorTile(tile, context);
            coloredTiles.push({
                ...tile,
                color: color
            });
        }

        return coloredTiles;
    }

    /**
     * Get statistics about current coloring
     */
    getStatistics() {
        if (!this.currentRule) {
            return null;
        }

        const stats = {
            paletteName: this.getCurrentPaletteName(),
            paletteSize: this.currentPalette.size(),
            ruleType: this.currentRule.constructor.name
        };

        // Add rule-specific statistics if available
        if (typeof this.currentRule.getStatistics === 'function') {
            Object.assign(stats, this.currentRule.getStatistics());
        }

        return stats;
    }

    /**
     * Get current palette name
     */
    getCurrentPaletteName() {
        for (let [name, palette] of this.palettes.entries()) {
            if (palette === this.currentPalette) {
                return name;
            }
        }
        return 'unknown';
    }
}

// Export for use in browser (global namespace)
if (typeof window !== 'undefined') {
    window.ColorRuleEngine = ColorRuleEngine;
    window.PaletteMap = PaletteMap;
    window.AmmannBandColorRule = AmmannBandColorRule;
    window.OrientationColorRule = OrientationColorRule;
    window.AreaColorRule = AreaColorRule;
    window.DEFAULT_PALETTE = DEFAULT_PALETTE;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ColorRuleEngine,
        PaletteMap,
        AmmannBandColorRule,
        OrientationColorRule,
        AreaColorRule,
        DEFAULT_PALETTE
    };
}
