"use client";

import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(value: number, duration = 400) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);
  const start = useRef({ value: display, time: 0 });

  useEffect(() => {
    const from = display;
    const to = value;
    if (from === to) return;

    start.current = { value: from, time: performance.now() };

    const tick = (now: number) => {
      const elapsed = now - start.current.time;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return display;
}
