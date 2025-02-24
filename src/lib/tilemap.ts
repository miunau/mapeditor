export class Tilemap {
    imageUrl: string;
    // The number of pixels between each tile
    spacing: number;
    // The width and height of the tilemap in tiles
    width: number = 0;  // Will be calculated when image loads
    height: number = 0; // Will be calculated when image loads
    // The width and height of each individual tile
    tileWidth: number;
    tileHeight: number;
    // The loaded image
    protected image: HTMLImageElement | null = null;
    // The array of tile canvases
    private tiles: HTMLCanvasElement[] = [];
    // Loading promise
    private loadingPromise: Promise<void> | null = null;

    constructor(imageUrl: string, tileWidth: number, tileHeight: number, spacing: number = 1) {
        this.imageUrl = imageUrl;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.spacing = spacing;
    }

    async load(): Promise<void> {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = new Promise((resolve, reject) => {
            this.image = new Image();
            this.image.onload = () => {
                // Calculate dimensions based on image size and tile dimensions
                if (this.image) {
                    // Calculate how many tiles fit in the width and height
                    this.width = Math.floor((this.image.width + this.spacing) / (this.tileWidth + this.spacing));
                    this.height = Math.floor((this.image.height + this.spacing) / (this.tileHeight + this.spacing));
                    console.log(`Tilemap dimensions: ${this.width}x${this.height} tiles`);
                }
                this.sliceTiles();
                resolve();
            };
            this.image.onerror = () => {
                reject(new Error(`Failed to load tilemap image: ${this.imageUrl}`));
            };
            this.image.src = this.imageUrl;
        });

        return this.loadingPromise;
    }

    private sliceTiles(): void {
        if (!this.image) {
            throw new Error('Image not loaded');
        }

        this.tiles = [];
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                // Create a canvas for this tile
                const canvas = document.createElement('canvas');
                canvas.width = this.tileWidth;
                canvas.height = this.tileHeight;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    throw new Error('Failed to get 2D context');
                }

                // Disable image smoothing for crisp pixels
                ctx.imageSmoothingEnabled = false;

                // Calculate the source position in the tilemap
                const sourceX = x * (this.tileWidth + this.spacing);
                const sourceY = y * (this.tileHeight + this.spacing);

                // Draw the tile to its own canvas
                ctx.drawImage(
                    this.image,
                    sourceX,
                    sourceY,
                    this.tileWidth,
                    this.tileHeight,
                    0,
                    0,
                    this.tileWidth,
                    this.tileHeight
                );

                this.tiles.push(canvas);
            }
        }
    }

    // Get a specific tile by its index
    getTile(index: number): HTMLCanvasElement | null {
        if (index < 0 || index >= this.tiles.length) {
            return null;
        }
        return this.tiles[index];
    }

    // Get a specific tile by its x,y coordinates in the tilemap
    getTileAt(x: number, y: number): HTMLCanvasElement | null {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }
        const index = y * this.width + x;
        return this.getTile(index);
    }

    // Returns true if the tilemap is loaded and ready to use
    isLoaded(): boolean {
        return this.tiles.length > 0;
    }

    getImage(): HTMLImageElement | null {
        return this.image;
    }

    // Get the tilemap image data as base64
    getImageData(): string {
        if (!this.image) {
            return '';
        }
        // Create a canvas to draw the image
        const canvas = document.createElement('canvas');
        canvas.width = this.image.width;
        canvas.height = this.image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return '';
        }
        // Draw the image and get its data URL
        ctx.drawImage(this.image, 0, 0);
        return canvas.toDataURL('image/png');
    }
}
