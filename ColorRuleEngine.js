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
                // Use ordinal index 'i' instead of Math.floor(index1) to ensure uniqueness
                // even when lines are close together (sub-integer spacing).
                const bandKey = `${angle}:${i}`;

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
 * Substitution Level Color Rule
 * Colors tiles based on their depth in the inflation hierarchy
 * 
 * For substitution tilings:
 * - Level 0: seed tiles
 * - Level 1: tiles after one inflation
 * - Level 2: tiles after two inflations, etc.
 */
class SubstitutionLevelColorRule extends ColorRule {
    applyRule(tile, context) {
        // Calculate substitution level from tile position
        // Distance from origin as a proxy for inflation level
        const distance = Math.sqrt(tile.x * tile.x + tile.y * tile.y);

        // Use context.inflationFactor if provided, otherwise estimate
        const inflationFactor = context.inflationFactor || 2.0;

        // Log scale to map distance to level
        const level = Math.floor(Math.log(distance + 1) / Math.log(inflationFactor));

        // Map level to color index
        const colorIndex = Math.abs(level) % this.palette.size();
        return this.palette.getColorByIndex(colorIndex);
    }
}

/**
 * Symmetry Group Membership Color Rule
 * Colors tiles based on their global symmetry operations
 * 
 * Classifies tiles by the symmetry operations that map them to equivalent tiles:
 * - Identity only (most tiles in aperiodic tilings)
 * - Rotation symmetry (tiles at rotation centers)
 * - Reflection symmetry (tiles on mirror axes)
 * - Higher-order symmetries
 */
class SymmetryGroupColorRule extends ColorRule {
    constructor(palette, options = {}) {
        super(palette);
        this.symmetryOrder = options.symmetryOrder || 5;
    }

    applyRule(tile, context) {
        const symmetry = context.symmetry || this.symmetryOrder;

        // Calculate distance from origin (potential rotation center)
        const distance = Math.sqrt(tile.x * tile.x + tile.y * tile.y);

        // Calculate angle from origin
        const angle = Math.atan2(tile.y, tile.x);

        // Normalize angle to [0, 2π/symmetry)
        const normalizedAngle = ((angle % (2 * Math.PI / symmetry)) + (2 * Math.PI / symmetry)) % (2 * Math.PI / symmetry);

        // Determine symmetry class based on position
        let symmetryClass = 0;

        // Tiles very close to origin have highest symmetry
        if (distance < 0.1) {
            symmetryClass = 0; // Center point - full rotational symmetry
        }
        // Tiles near rotation axes
        else if (Math.abs(normalizedAngle) < 0.1 || Math.abs(normalizedAngle - (2 * Math.PI / symmetry)) < 0.1) {
            symmetryClass = 1; // On symmetry axis
        }
        // Tiles with reflection symmetry (on mirror planes)
        else if (Math.abs(normalizedAngle - Math.PI / symmetry) < 0.1) {
            symmetryClass = 2; // On mirror plane
        }
        // General position - identity symmetry only
        else {
            // Hash based on angle to create distinct classes
            symmetryClass = 3 + (Math.floor(normalizedAngle * symmetry * 2) % (this.palette.size() - 3));
        }

        return this.palette.getColorByIndex(symmetryClass);
    }
}

/**
 * Adjacency Color Rule
 * Graph coloring: ensures adjacent tiles have different colors
 * Uses greedy coloring algorithm
 */
class AdjacencyColorRule extends ColorRule {
    constructor(palette, options = {}) {
        super(palette);
        this.colorAssignments = new Map(); // Cache tile colors
    }

    /**
     * Find neighboring tiles (tiles that share an edge)
     */
    findNeighbors(tile, allTiles, epsilon = 0.01) {
        const neighbors = [];

        // A neighbor shares at least 2 vertices (an edge)
        for (let otherTile of allTiles) {
            if (otherTile === tile) continue;

            let sharedVertices = 0;
            for (let v1 of tile.dualPts) {
                for (let v2 of otherTile.dualPts) {
                    const dist = Math.sqrt(
                        (v1.x - v2.x) * (v1.x - v2.x) +
                        (v1.y - v2.y) * (v1.y - v2.y)
                    );
                    if (dist < epsilon) {
                        sharedVertices++;
                        break;
                    }
                }
            }

            if (sharedVertices >= 2) {
                neighbors.push(otherTile);
            }
        }

        return neighbors;
    }

    applyRule(tile, context) {
        const tileKey = `${tile.x.toFixed(6)},${tile.y.toFixed(6)}`;

        // Return cached color if already assigned
        if (this.colorAssignments.has(tileKey)) {
            return this.colorAssignments.get(tileKey);
        }

        // Get all tiles from context
        const allTiles = context.tiles ? Object.values(context.tiles) : [];

        // Find neighbors
        const neighbors = this.findNeighbors(tile, allTiles);

        // Collect colors used by neighbors
        const usedColors = new Set();
        for (let neighbor of neighbors) {
            const neighborKey = `${neighbor.x.toFixed(6)},${neighbor.y.toFixed(6)}`;
            if (this.colorAssignments.has(neighborKey)) {
                usedColors.add(this.colorAssignments.get(neighborKey));
            }
        }

        // Find first available color not used by neighbors
        let selectedColor = null;
        for (let i = 0; i < this.palette.size(); i++) {
            const color = this.palette.getColorByIndex(i);
            if (!usedColors.has(color)) {
                selectedColor = color;
                break;
            }
        }

        // Fallback: use first color if all are used (shouldn't happen with enough colors)
        if (!selectedColor) {
            selectedColor = this.palette.getColorByIndex(0);
        }

        // Cache the assignment
        this.colorAssignments.set(tileKey, selectedColor);

        return selectedColor;
    }

    /**
     * Reset color assignments (call when palette or tiling changes)
     */
    reset() {
        this.colorAssignments.clear();
    }
}

/**
 * Adjacency Evolution Color Rule
 * Cellular automata-like color evolution based on neighbor colors
 * Colors evolve based on rules applied to neighboring tiles
 */
class AdjacencyEvolutionColorRule extends ColorRule {
    constructor(palette, options = {}) {
        super(palette);
        this.generation = 0;
        this.tileStates = new Map(); // Track state per tile
        this.adjacencyRule = new AdjacencyColorRule(palette); // Base coloring
    }

    applyRule(tile, context) {
        const tileKey = `${tile.x.toFixed(6)},${tile.y.toFixed(6)}`;

        // Initialize with adjacency-based color if first generation
        if (this.generation === 0 || !this.tileStates.has(tileKey)) {
            const baseColor = this.adjacencyRule.applyRule(tile, context);
            this.tileStates.set(tileKey, baseColor);
            return baseColor;
        }

        return this.tileStates.get(tileKey);
    }

    /**
     * Evolve colors to next generation based on neighbor rules
     */
    evolve(tiles) {
        const newStates = new Map();
        const allTiles = Object.values(tiles);

        for (let tile of allTiles) {
            const tileKey = `${tile.x.toFixed(6)},${tile.y.toFixed(6)}`;
            const neighbors = this.adjacencyRule.findNeighbors(tile, allTiles);

            // Count color frequencies among neighbors
            const colorCounts = new Map();
            for (let neighbor of neighbors) {
                const neighborKey = `${neighbor.x.toFixed(6)},${neighbor.y.toFixed(6)}`;
                const neighborColor = this.tileStates.get(neighborKey);
                if (neighborColor) {
                    colorCounts.set(neighborColor, (colorCounts.get(neighborColor) || 0) + 1);
                }
            }

            // Evolution rule: adopt most common neighbor color, or keep current
            let maxCount = 0;
            let dominantColor = this.tileStates.get(tileKey);

            for (let [color, count] of colorCounts.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    dominantColor = color;
                }
            }

            newStates.set(tileKey, dominantColor);
        }

        this.tileStates = newStates;
        this.generation++;
    }

    /**
     * Reset evolution
     */
    reset() {
        this.generation = 0;
        this.tileStates.clear();
        this.adjacencyRule.reset();
    }
}

/**
 * HSV Palette Map
 * Extends PaletteMap with HSV-based color variations
 * Allows hue shift, saturation, and value adjustments
 */
class HSVPaletteMap extends PaletteMap {
    constructor(colors, options = {}) {
        super(colors);
        this.hueShift = options.hueShift || 0; // -180 to 180
        this.saturationMultiplier = options.saturationMultiplier || 1.0; // 0 to 2
        this.valueMultiplier = options.valueMultiplier || 1.0; // 0 to 2
    }

    /**
     * Convert hex to HSV
     */
    hexToHSV(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        let s = max === 0 ? 0 : delta / max;
        let v = max;

        if (delta !== 0) {
            if (max === r) {
                h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
            } else if (max === g) {
                h = ((b - r) / delta + 2) / 6;
            } else {
                h = ((r - g) / delta + 4) / 6;
            }
        }

        return [h * 360, s * 100, v * 100];
    }

    /**
     * Convert HSV to hex
     */
    hsvToHex(h, s, v) {
        h = h / 360;
        s = s / 100;
        v = v / 100;

        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        let r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }

        const toHex = (n) => {
            const hex = Math.round(n * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    /**
     * Get color with HSV transformations applied
     */
    getColorByIndex(index) {
        const baseColor = super.getColorByIndex(index);
        let [h, s, v] = this.hexToHSV(baseColor);

        // Apply transformations
        h = (h + this.hueShift + 360) % 360;
        s = Math.max(0, Math.min(100, s * this.saturationMultiplier));
        v = Math.max(0, Math.min(100, v * this.valueMultiplier));

        return this.hsvToHex(h, s, v);
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
            case 'substitution-level':
                this.currentRule = new SubstitutionLevelColorRule(this.currentPalette);
                break;
            case 'symmetry-group':
                this.currentRule = new SymmetryGroupColorRule(this.currentPalette, options);
                break;
            case 'adjacency':
                this.currentRule = new AdjacencyColorRule(this.currentPalette, options);
                break;
            case 'adjacency-evolution':
                this.currentRule = new AdjacencyEvolutionColorRule(this.currentPalette, options);
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
    window.HSVPaletteMap = HSVPaletteMap;
    window.AmmannBandColorRule = AmmannBandColorRule;
    window.OrientationColorRule = OrientationColorRule;
    window.AreaColorRule = AreaColorRule;
    window.SubstitutionLevelColorRule = SubstitutionLevelColorRule;
    window.SymmetryGroupColorRule = SymmetryGroupColorRule;
    window.AdjacencyColorRule = AdjacencyColorRule;
    window.AdjacencyEvolutionColorRule = AdjacencyEvolutionColorRule;
    window.DEFAULT_PALETTE = DEFAULT_PALETTE;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ColorRuleEngine,
        PaletteMap,
        HSVPaletteMap,
        AmmannBandColorRule,
        OrientationColorRule,
        AreaColorRule,
        SubstitutionLevelColorRule,
        SymmetryGroupColorRule,
        AdjacencyColorRule,
        AdjacencyEvolutionColorRule,
        DEFAULT_PALETTE
    };
}
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
