export interface RenderSettings {
    // LOD settings
    useLOD: boolean;
    lodThreshold: number;  // Zoom level at which LOD kicks in (0.0 - 1.0)
    lodQuality: number;    // Quality level for LOD (1-5, higher is better quality)
    
    // Performance settings
    batchSize: number;     // Base batch size for tile rendering (8, 16, 32, 64)
    useDirectAtlas: boolean; // Whether to use direct atlas rendering
    
    // Debug settings
    showFPS: boolean;
    debugMode: boolean;
}