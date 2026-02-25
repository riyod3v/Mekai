import { useState, useRef, useCallback, type MouseEvent } from 'react';
import clsx from 'clsx';
import type { RegionBox } from '@/types';

export interface SelectionRect {
  /** Fractional coordinates (0–1) relative to image */
  region: RegionBox;
  /** Absolute pixel coordinates on the container element */
  absBox: { left: number; top: number; width: number; height: number };
}

interface Props {
  /** Whether the user is in selection mode */
  active: boolean;
  /** Called with the selected region when mouse is released */
  onSelect: (rect: SelectionRect) => void;
  /** The image element ref so we can compute fractional coords */
  imageRef: React.RefObject<HTMLImageElement | null>;
  children: React.ReactNode;
}

interface DragState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export function OCRSelectionLayer({ active, onSelect, imageRef, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const getEventPos = (e: MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      const pos = getEventPos(e);
      setDrag({ startX: pos.x, startY: pos.y, curX: pos.x, curY: pos.y });
    },
    [active]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!drag || !active) return;
      const pos = getEventPos(e);
      setDrag((d) => d ? { ...d, curX: pos.x, curY: pos.y } : null);
    },
    [drag, active]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!drag || !active || !imageRef.current || !containerRef.current) {
        setDrag(null);
        return;
      }
      const pos = getEventPos(e);

      const left = Math.min(drag.startX, pos.x);
      const top = Math.min(drag.startY, pos.y);
      const width = Math.abs(pos.x - drag.startX);
      const height = Math.abs(pos.y - drag.startY);

      // Minimum 10px selection
      if (width < 10 || height < 10) {
        setDrag(null);
        return;
      }

      // Compute fractional coords relative to image element (not container)
      const imgRect = imageRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      const imgOffsetLeft = imgRect.left - containerRect.left;
      const imgOffsetTop = imgRect.top - containerRect.top;

      const fx = (left - imgOffsetLeft) / imgRect.width;
      const fy = (top - imgOffsetTop) / imgRect.height;
      const fw = width / imgRect.width;
      const fh = height / imgRect.height;

      onSelect({
        region: {
          x: Math.max(0, Math.min(1, fx)),
          y: Math.max(0, Math.min(1, fy)),
          w: Math.min(fw, 1 - Math.max(0, fx)),
          h: Math.min(fh, 1 - Math.max(0, fy)),
        },
        absBox: { left, top, width, height },
      });

      setDrag(null);
    },
    [drag, active, imageRef, onSelect]
  );

  // Compute the selection box CSS
  const selectionStyle = drag
    ? {
        left: Math.min(drag.startX, drag.curX),
        top: Math.min(drag.startY, drag.curY),
        width: Math.abs(drag.curX - drag.startX),
        height: Math.abs(drag.curY - drag.startY),
      }
    : null;

  return (
    <div
      ref={containerRef}
      className={clsx('relative', active && 'page-select-cursor select-none')}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setDrag(null)}
    >
      {children}

      {/* Live selection box */}
      {selectionStyle && (
        <div
          className="ocr-selection-box"
          style={selectionStyle}
        />
      )}
    </div>
  );
}
