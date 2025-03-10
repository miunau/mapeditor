export interface RenderSettings {
    // LOD settings
    useLOD: boolean;
    lodThreshold: number;  // Zoom level at which LOD kicks in (0.0 - 1.0)
    lodQuality: number;    // Quality level for LOD (1-5, higher is better quality)
    
    // Performance settings
    batchSize: number;     // Base batch size for tile rendering (8, 16, 32, 64)
    useDirectAtlas: boolean; // Whether to use direct atlas rendering
    
    // Display settings
    showGrid: boolean;     // Whether to show the grid
    
    // Debug settings
    showFPS: boolean;
    debugMode: boolean;
}

// Default settings
export const defaultRenderSettings: RenderSettings = {
    useLOD: true,
    lodThreshold: 0.4,
    lodQuality: 3,
    batchSize: 16,
    useDirectAtlas: true,
    showGrid: true,
    showFPS: true,
    debugMode: false
};

export interface TilemapSettings {
    imageUrl: string;
    tileWidth: number;
    tileHeight: number;
    spacing: number;
}
