/*
import { useEffect, useRef } from 'react';
// import { drawBubbleOverlay } from '@/lib/roboflowDetection';

interface BubbleOverlayProps {
  imageUrl: string;
  bubbles: Array<{ x: number; y: number; width: number; height: number; confidence: number }>;
  visible?: boolean;
}

export function BubbleOverlay({ imageUrl, bubbles, visible = true }: BubbleOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!visible || !canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const image = imageRef.current;
    
    // Set canvas size to match image
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw bubbles
    // drawBubbleOverlay(canvas, bubbles);
  }, [bubbles, visible]);

  if (!visible) return null;

  return (
    <div className="relative">
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Bubble detection overlay"
        className="hidden"
        onLoad={() => {
          // Redraw when image loads
          if (canvasRef.current && bubbles.length > 0) {
            const canvas = canvasRef.current;
            canvas.width = imageRef.current!.naturalWidth;
            canvas.height = imageRef.current!.naturalHeight;
            // drawBubbleOverlay(canvas, bubbles);
          }
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ mixBlendMode: 'normal' }}
      />
    </div>
  );
}
*/
