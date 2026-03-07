/**
 * Roboflow API integration for speech bubble detection
 * This provides accurate speech bubble detection using trained models
 */

interface RoboflowDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  class_id: number;
}

interface RoboflowResponse {
  predictions: RoboflowDetection[];
  image: {
    width: number;
    height: number;
  };
}

/**
 * Detect speech bubbles using Roboflow API
 * Requires a Roboflow API key and trained model
 */
export async function detectSpeechBubblesWithRoboflow(
  imageElement: HTMLImageElement,
  apiKey?: string,
  modelId?: string
): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
  try {
    // Get API key from environment or parameter
    const ROBOFLOW_API_KEY = apiKey || import.meta.env.VITE_ROBOFLOW_API_KEY;
    const ROBOFLOW_MODEL_ID = modelId || import.meta.env.VITE_ROBOFLOW_MODEL_ID || 'manga-ocr/4';
    
    if (!ROBOFLOW_API_KEY) {
      console.warn('Roboflow API key not found, using fallback detection');
      return fallbackDetection(imageElement);
    }

    // Create canvas to get image data
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    // Set canvas size
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;

    // Draw image
    ctx.drawImage(imageElement, 0, 0);

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Remove data URL prefix
    const base64Image = imageData.split(',')[1];

    // Call Roboflow API
    const response = await fetch(
      `https://api.roboflow.com/${ROBOFLOW_MODEL_ID}?api_key=${ROBOFLOW_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: base64Image
      }
    );

    if (!response.ok) {
      console.error('Roboflow API error:', response.statusText);
      return fallbackDetection(imageElement);
    }

    const result: RoboflowResponse = await response.json();
    
    // Convert Roboflow predictions to our format
    return result.predictions.map(prediction => ({
      x: prediction.x,
      y: prediction.y,
      width: prediction.width,
      height: prediction.height,
      confidence: prediction.confidence
    }));

  } catch (error) {
    console.error('Error using Roboflow API:', error);
    return fallbackDetection(imageElement);
  }
}

/**
 * Fallback detection when Roboflow is not available
 * Creates a grid of potential regions
 */
function fallbackDetection(imageElement: HTMLImageElement): Array<{ x: number; y: number; width: number; height: number; confidence: number }> {
  const bubbles: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
  const width = imageElement.naturalWidth;
  const height = imageElement.naturalHeight;
  
  // Create a more intelligent grid for manga pages
  // Manga typically has text in specific regions
  const regions = [
    // Top third (title/captions)
    { cols: 2, rows: 1, y: 0.05, h: 0.15 },
    // Middle thirds (dialogue)
    { cols: 3, rows: 2, y: 0.25, h: 0.25 },
    { cols: 3, rows: 2, y: 0.55, h: 0.25 },
    // Bottom third (footnotes/sound effects)
    { cols: 2, rows: 1, y: 0.85, h: 0.10 },
  ];
  
  regions.forEach(region => {
    const cellWidth = width / region.cols;
    const cellHeight = (height * region.h) / region.rows;
    const startX = 0;
    const startY = height * region.y;
    
    for (let row = 0; row < region.rows; row++) {
      for (let col = 0; col < region.cols; col++) {
        bubbles.push({
          x: startX + col * cellWidth + cellWidth * 0.1,
          y: startY + row * cellHeight + cellHeight * 0.1,
          width: cellWidth * 0.8,
          height: cellHeight * 0.8,
          confidence: 0.3
        });
      }
    }
  });
  
  return bubbles;
}

/**
 * Visual overlay for detected bubbles on canvas
 */
export function drawBubbleOverlay(
  canvas: HTMLCanvasElement,
  bubbles: Array<{ x: number; y: number; width: number; height: number; confidence: number }>
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  bubbles.forEach(bubble => {
    // Set style based on confidence
    if (bubble.confidence > 0.7) {
      ctx.strokeStyle = '#10b981'; // green
      ctx.lineWidth = 2;
    } else if (bubble.confidence > 0.4) {
      ctx.strokeStyle = '#f59e0b'; // yellow
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = '#ef4444'; // red
      ctx.lineWidth = 1;
    }
    
    // Draw rectangle
    ctx.strokeRect(bubble.x, bubble.y, bubble.width, bubble.height);
    
    // Draw confidence label
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '12px sans-serif';
    ctx.fillText(
      `${Math.round(bubble.confidence * 100)}%`,
      bubble.x,
      bubble.y - 5
    );
  });
}
