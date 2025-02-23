// Represents a point in the grid
interface Point {
    x: number;
    y: number;
}

/**
 * Get all neighboring points that could be part of the fill area
 * Uses a more sophisticated algorithm to determine connectivity
 */
function getNeighbors(point: Point, layer: number[][], targetValue: number): Point[] {
    const neighbors: Point[] = [];
    const width = layer[0].length;
    const height = layer.length;
    
    // Check all 8 surrounding positions
    const directions = [
        [-1, -1], [0, -1], [1, -1],  // Top row
        [-1,  0],          [1,  0],   // Middle row
        [-1,  1], [0,  1], [1,  1]    // Bottom row
    ];
    
    for (const [dx, dy] of directions) {
        const newX = point.x + dx;
        const newY = point.y + dy;
        
        // Skip if out of bounds
        if (newX < 0 || newX >= width || newY < 0 || newY >= height) {
            continue;
        }

        // For diagonal neighbors, we need to check if there's a valid path
        if (dx !== 0 && dy !== 0) {
            // Check if either adjacent tile matches the target value
            const hasHorizontalPath = layer[point.y][newX] === targetValue;
            const hasVerticalPath = layer[newY][point.x] === targetValue;
            
            // Add the diagonal neighbor if:
            // 1. It matches the target value AND
            // 2. Either there's a horizontal or vertical path to it
            if (layer[newY][newX] === targetValue && (hasHorizontalPath || hasVerticalPath)) {
                neighbors.push({ x: newX, y: newY });
            }
        } else {
            // For orthogonal neighbors (up, down, left, right), just check if they match
            if (layer[newY][newX] === targetValue) {
                neighbors.push({ x: newX, y: newY });
            }
        }
    }
    
    return neighbors;
}

/**
 * Flood fills a contiguous area starting from a point
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
    
    // If start point is out of bounds or already the fill value
    if (startX < 0 || startX >= width || startY < 0 || startY >= height ||
        layer[startY][startX] !== targetValue || targetValue === fillValue) {
        return [];
    }
    
    const filledPoints: Point[] = [];
    const queue: Point[] = [{ x: startX, y: startY }];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
        const current = queue.shift()!;
        const key = `${current.x},${current.y}`;
        
        // Skip if already visited
        if (visited.has(key)) continue;
        
        // Mark as visited and fill
        visited.add(key);
        layer[current.y][current.x] = fillValue;
        filledPoints.push(current);
        
        // Get neighbors using the improved neighbor detection
        const neighbors = getNeighbors(current, layer, targetValue);
        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;
            if (!visited.has(neighborKey)) {
                queue.push(neighbor);
            }
        }
    }
    
    return filledPoints;
} 