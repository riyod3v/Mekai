import { useState } from 'react';
import { Loader2, Play, Pause, CheckCircle, AlertCircle, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { ocrAndTranslate } from '@/lib/browserAPI';
import { detectSpeechBubbles, bubblesToRegions } from '@/lib/bubbleDetection';
import { BubbleOverlay } from './BubbleOverlay';
import type { SelectionRect } from './OCRSelectionLayer';

interface BubbleToTranslate {
  id: string;
  region: { x: number; y: number; w: number; h: number };
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  result?: {
    ocrText: string;
    translated: string;
    romaji: string | null;
  };
}

interface Props {
  imageRef: React.RefObject<HTMLImageElement | null>;
  pageIndex: number;
  onTranslationComplete: (bubble: BubbleToTranslate) => void;
  onAllComplete: () => void;
}

export function BatchTranslationPanel({
  imageRef,
  pageIndex,
  onTranslationComplete,
  onAllComplete,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [bubbles, setBubbles] = useState<BubbleToTranslate[]>([]);
  const [rawBubbles, setRawBubbles] = useState<Array<{ x: number; y: number; width: number; height: number; confidence: number }>>([]);
  const [currentProgress, setCurrentProgress] = useState(0);

  // Detect speech bubbles
  const handleDetectBubbles = async () => {
    if (!imageRef.current) return;

    setIsDetecting(true);
    try {
      const detectedBubbles = await detectSpeechBubbles(imageRef.current);
      
      // Store raw positions for visual overlay
      setRawBubbles(detectedBubbles);
      
      const regions = bubblesToRegions(
        detectedBubbles,
        imageRef.current.naturalWidth,
        imageRef.current.naturalHeight
      );

      const newBubbles: BubbleToTranslate[] = regions.map((region, index) => ({
        id: `bubble-${pageIndex}-${index}`,
        region,
        status: 'pending' as const,
      }));

      setBubbles(newBubbles);
      
      // Show message if no bubbles were detected
      if (newBubbles.length === 0) {
        console.warn('No speech bubbles detected on this page');
      }
    } catch (error) {
      console.error('Bubble detection failed:', error);
      // Show error message to user
      setBubbles([]);
    } finally {
      setIsDetecting(false);
    }
  };

  // Translate all bubbles
  const handleTranslateAll = async () => {
    if (!imageRef.current || bubbles.length === 0) return;

    setIsTranslating(true);
    setIsPaused(false);
    setCurrentProgress(0);

    for (let i = 0; i < bubbles.length; i++) {
      // Check if paused
      while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const bubble = bubbles[i];
      if (bubble.status !== 'pending') continue;

      // Update status to processing
      setBubbles(prev => prev.map((b, idx) => 
        idx === i ? { ...b, status: 'processing' } : b
      ));

      try {
        // Create selection rect for OCR
        const rect: SelectionRect = {
          region: bubble.region,
          absBox: {
            left: bubble.region.x * imageRef.current!.width,
            top: bubble.region.y * imageRef.current!.height,
            width: bubble.region.w * imageRef.current!.width,
            height: bubble.region.h * imageRef.current!.height,
          },
        };

        // Perform OCR and translation
        const result = await ocrAndTranslate(imageRef.current!, bubble.region);

        // Update bubble with result
        const updatedBubble = {
          ...bubble,
          status: 'completed' as const,
          result,
        };

        setBubbles(prev => prev.map((b, idx) => 
          idx === i ? updatedBubble : b
        ));

        onTranslationComplete(updatedBubble);
      } catch (error) {
        console.error(`Translation failed for bubble ${i}:`, error);
        const updatedBubble = {
          ...bubble,
          status: 'error' as const,
          error: (error as Error).message,
        };

        setBubbles(prev => prev.map((b, idx) => 
          idx === i ? updatedBubble : b
        ));
      }

      setCurrentProgress(i + 1);
    }

    setIsTranslating(false);
    onAllComplete();
  };

  // Toggle pause/resume
  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  // Clear all bubbles
  const handleClear = () => {
    setBubbles([]);
    setCurrentProgress(0);
  };

  const completedCount = bubbles.filter(b => b.status === 'completed').length;
  const errorCount = bubbles.filter(b => b.status === 'error').length;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-colors z-30"
        title="Auto-translate all speech bubbles"
      >
        <Wand2 className="w-6 h-6" />
      </button>
    );
  }

  return (
    <>
      {/* Visual overlay for detected bubbles */}
      {imageRef.current && rawBubbles.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-35">
          <BubbleOverlay
            imageUrl={imageRef.current.src}
            bubbles={rawBubbles}
            visible={isOpen}
          />
        </div>
      )}
      
      <div className="fixed inset-0 bg-black/50 flex items-end justify-end z-40">
        <div className="bg-white h-96 w-full max-w-md shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Batch Translation</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {bubbles.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">No speech bubbles detected yet</p>
              <button
                onClick={handleDetectBubbles}
                disabled={isDetecting}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  isDetecting
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Detecting...
                  </>
                ) : (
                  'Detect Speech Bubbles'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Progress */}
              {isTranslating && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progress</span>
                    <span>{currentProgress} / {bubbles.length}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${(currentProgress / bubbles.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Bubble list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {bubbles.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p className="text-sm">No speech bubbles detected on this page.</p>
                    <p className="text-xs mt-1">Try manual selection or a different page.</p>
                  </div>
                ) : (
                  bubbles.map((bubble, index) => (
                  <div
                    key={bubble.id}
                    className={clsx(
                      'flex items-center gap-2 p-2 rounded-lg text-sm',
                      bubble.status === 'pending' && 'bg-gray-50',
                      bubble.status === 'processing' && 'bg-blue-50',
                      bubble.status === 'completed' && 'bg-green-50',
                      bubble.status === 'error' && 'bg-red-50'
                    )}
                  >
                    {bubble.status === 'pending' && <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />}
                    {bubble.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                    {bubble.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-600" />}
                    {bubble.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}

                    <div className="flex-1">
                      <div className="font-medium">Bubble {index + 1}</div>
                      {bubble.result && (
                        <div className="text-gray-600 truncate">
                          {bubble.result.translated}
                        </div>
                      )}
                      {bubble.error && (
                        <div className="text-red-600 text-xs">
                          Error: {bubble.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))
                )}
              </div>

              {/* Stats */}
              <div className="pt-2 border-t text-sm text-gray-600">
                {completedCount > 0 && <span>✓ {completedCount} completed</span>}
                {errorCount > 0 && <span className="text-red-600 ml-3">✗ {errorCount} failed</span>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2">
          {bubbles.length > 0 && (
            <>
              {!isTranslating ? (
                <button
                  onClick={handleTranslateAll}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <Play className="w-4 h-4 inline mr-2" />
                  Translate All
                </button>
              ) : (
                <button
                  onClick={togglePause}
                  className="flex-1 bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors font-medium"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-4 h-4 inline mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 inline mr-2" />
                      Pause
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleClear}
                disabled={isTranslating}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
