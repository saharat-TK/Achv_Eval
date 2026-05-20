'use client';

import { useEffect, useRef } from 'react';

/** Starbucks-green dash palette + warm gold sparkle accents. */
const PALETTE = [
  '#00704A',
  '#1E3932',
  '#006241',
  '#7FB39C',
  '#A7D7C5',
  '#D4E9E2',
  '#D4A03E',
  '#C9B27C',
];

interface Particle {
  baseX: number;
  baseY: number;
  length: number;
  thickness: number;
  angle: number;
  color: string;
  depth: number; // 0.02–0.10 — drives cursor parallax
  driftSeed: number;
}

function makeParticles(width: number, height: number, count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    particles.push({
      baseX: Math.random() * width,
      baseY: Math.random() * height,
      length: 6 + Math.random() * 12,
      thickness: 2 + Math.random() * 1.5,
      angle: Math.random() * Math.PI * 2,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      depth: 0.015 + Math.random() * 0.085,
      driftSeed: Math.random() * Math.PI * 2,
    });
  }
  return particles;
}

/**
 * A canvas-based field of small coloured dashes that drifts with the cursor
 * via per-particle parallax depth. Mounted inside a `relative overflow-hidden`
 * section; the canvas sizes to its container. Honours `prefers-reduced-motion`
 * by disabling the ambient drift (cursor parallax stays — it's an interaction).
 */
export default function ConfettiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let mouseX = 0;
    let mouseY = 0;
    let width = 0;
    let height = 0;
    let rafId = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(500, Math.round((width * height) / 4500));
      particles = makeParticles(width, height, count);
      mouseX = width / 2;
      mouseY = height / 2;
    }

    function onMouseMove(event: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseX = event.clientX - rect.left;
      mouseY = event.clientY - rect.top;
    }

    function draw(timestamp: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const t = timestamp * 0.0005;
      for (const p of particles) {
        const parallaxX = (mouseX - cx) * p.depth;
        const parallaxY = (mouseY - cy) * p.depth;
        const driftX = reduced ? 0 : Math.sin(t + p.driftSeed) * 0.6;
        const driftY = reduced ? 0 : Math.cos(t + p.driftSeed) * 0.6;
        ctx.save();
        ctx.translate(p.baseX + parallaxX + driftX, p.baseY + parallaxY + driftY);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.length / 2, -p.thickness / 2, p.length, p.thickness);
        ctx.restore();
      }
      rafId = requestAnimationFrame(draw);
    }

    resize();
    rafId = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
