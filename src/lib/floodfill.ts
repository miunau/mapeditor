// Represents a point in the grid
interface Point {
    x: number;
    y: number;
}

// Cache for recent flood fill results
const fillCache = new Map<string, Point[]>();
const MAX_CACHE_SIZE = 50; // Adjust based on memory constraints

function getCacheKey(x: number, y: number, targetValue: number, width: number, height: number): string {
    return `${x},${y},${targetValue},${width},${height}`;
}

/**
 * Optimized flood fill using scanline algorithm with tuple-based stack
 * @param layer The layer to flood fill
 * @param startX Starting X coordinate
 * @param startY Starting Y coordinate
 * @param targetValue The value to replace
 * @param fillValue The value to fill with
 * @returns Array of points that were filled
 */
export function floodFill(
    layer: number[][],
    startX: number,
    startY: number,
    targetValue: number,
    fillValue: number
): Point[] {
    const width = layer[0].length;
    const height = layer.length;

    // For preview operations, check cache first
    if (fillValue === -2) {
        const cacheKey = getCacheKey(startX, startY, targetValue, width, height);
        const cachedResult = fillCache.get(cacheKey);
        if (cachedResult) {
            // Quick validation by checking a few sample points
            const isValid = cachedResult.every((p, i) => 
                // Check first, last, and every 10th point
                (i === 0 || i === cachedResult.length - 1 || i % 10 === 0) &&
                layer[p.y][p.x] === targetValue
            );
            if (isValid) {
                return cachedResult;
            }
            fillCache.delete(cacheKey);
        }
    }

    // Check for invalid start conditions
    if (startX < 0 || startX >= width || startY < 0 || startY >= height ||
        layer[startY][startX] !== targetValue || targetValue === fillValue) {
        return [];
    }

    const filledPoints: Point[] = [];
    // Use tuple [x, y] to reduce allocation overhead
    const stack: [number, number][] = [[startX, startY]];

    while (stack.length) {
        const [x, y] = stack.pop()!;
        let xLeft = x;
        let xRight = x;

        // Move left to find the beginning of the span
        while (xLeft >= 0 && layer[y][xLeft] === targetValue) {
            xLeft--;
        }
        xLeft++;

        // Move right to find the end of the span
        while (xRight < width && layer[y][xRight] === targetValue) {
            xRight++;
        }
        xRight--;

        // Fill the span and record points
        for (let i = xLeft; i <= xRight; i++) {
            layer[y][i] = fillValue;
            filledPoints.push({ x: i, y });
        }

        // Check the rows above and below for new spans
        for (const newY of [y - 1, y + 1]) {
            if (newY < 0 || newY >= height) continue;
            let i = xLeft;
            while (i <= xRight) {
                if (layer[newY][i] === targetValue) {
                    // Push the start of a new span onto the stack
                    stack.push([i, newY]);
                    // Skip the contiguous segment
                    while (i <= xRight && layer[newY][i] === targetValue) {
                        i++;
                    }
                } else {
                    i++;
                }
            }
        }
    }

    // Cache the result for non-preview operations
    if (fillValue !== -2) {
        const cacheKey = getCacheKey(startX, startY, targetValue, width, height);
        // Maintain cache size
        if (fillCache.size >= MAX_CACHE_SIZE) {
            const firstKey = Array.from(fillCache.keys())[0];
            if (firstKey) {
                fillCache.delete(firstKey);
            }
        }
        fillCache.set(cacheKey, [...filledPoints]);
    }

    return filledPoints;
} 