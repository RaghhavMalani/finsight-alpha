import { useEffect, useRef, useState } from "react";

function useAnimatedNumber(target: number, duration = 500) {
  const [val, setVal] = useState(target);
  const raf = useRef<number | null>(null);
  const startVal = useRef(target);
  const startTime = useRef(0);

  useEffect(() => {
    startVal.current = val;
    startTime.current = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - startTime.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(startVal.current + (target - startVal.current) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
     
  }, [target, duration]);

  return val;
}

export function Odometer({
  value,
  digits = 2,
  className = "",
  prefix = "",
}: {
  value: number;
  digits?: number;
  className?: string;
  prefix?: string;
}) {
  const animated = useAnimatedNumber(value, 500);
  const str = animated.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {prefix}
      {str.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span
            key={i}
            className="inline-block transition-transform"
            style={{ transformOrigin: "center" }}
          >
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </span>
  );
}

