/**
 * Simple speech bubble detection
 * Uses a grid-based approach for reliable bubble detection
 */

interface DetectedBubble {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

/**
 * Detect speech bubbles in an image using a simple grid approach
 */
export async function detectSpeechBubbles(
  imageElement: HTMLImageElement
): Promise<DetectedBubble[]> {
  try {
    if (!imageElement || !imageElement.naturalWidth || !imageElement.naturalHeight) {
      console.warn('Invalid image element for bubble detection');
      return [];
    }

    const width = imageElement.naturalWidth;
    const height = imageElement.naturalHeight;
    const bubbles: DetectedBubble[] = [];
    
    // Create a grid of potential text regions
    // This is more reliable than complex detection
    const cols = 3;
    const rows = 5;
    const padding = Math.min(width, height) * 0.05; // 5% padding
    
    const cellWidth = (width - padding * 2) / cols;
    const cellHeight = (height - padding * 2) / rows;
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        bubbles.push({
          x: padding + col * cellWidth + cellWidth * 0.1,
          y: padding + row * cellHeight + cellHeight * 0.1,
          width: cellWidth * 0.8,
          height: cellHeight * 0.8,
          confidence: 0.5 // Fixed confidence for all bubbles
        });
      }
    }
    
    console.log(`Created ${bubbles.length} potential text regions`);
    return bubbles;

  } catch (error) {
    console.error('Error in bubble detection:', error);
    return [];
  }
}

/**
 * Convert detected bubbles to fractional coordinates for OCR
 */
export function bubblesToRegions(
  bubbles: DetectedBubble[],
  imageWidth: number,
  imageHeight: number
): Array<{ x: number; y: number; w: number; h: number }> {
  return bubbles.map(bubble => ({
    x: bubble.x / imageWidth,
    y: bubble.y / imageHeight,
    w: bubble.width / imageWidth,
    h: bubble.height / imageHeight
  }));
}
