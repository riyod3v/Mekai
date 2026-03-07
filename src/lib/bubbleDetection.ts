/**
 * Speech bubble detection using Roboflow API
 * This provides accurate speech bubble detection for manga pages
 */

import { detectSpeechBubblesWithRoboflow } from './roboflowDetection';

interface DetectedBubble {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

/**
 * Detect speech bubbles in an image using Roboflow API
 */
export async function detectSpeechBubbles(
  imageElement: HTMLImageElement
): Promise<DetectedBubble[]> {
  try {
    if (!imageElement || !imageElement.naturalWidth || !imageElement.naturalHeight) {
      console.warn('Invalid image element for bubble detection');
      return [];
    }

    // Use Roboflow API for detection
    const bubbles = await detectSpeechBubblesWithRoboflow(imageElement);
    
    console.log(`Detected ${bubbles.length} speech bubbles using Roboflow`);
    
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
