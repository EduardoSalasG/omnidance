"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

// Campo de partículas sobre una malla xz: tres ondas senoidales lentas la
// elevan; el color mezcla de slate apagado a lime en las crestas. Estética
// "aire y calma" — nada de visualizador saturado.
const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  varying float vWave;
  varying float vFade;

  void main() {
    vec3 p = position;
    float w =
      sin(p.x * 0.30 + uTime * 0.40) * 0.50 +
      sin(p.z * 0.42 - uTime * 0.30 + p.x * 0.10) * 0.35 +
      sin((p.x + p.z) * 0.17 + uTime * 0.20) * 0.50;
    w /= 1.35;
    p.y += w * 1.35;
    vWave = w;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize =
      uSize * uPixelRatio * (1.0 + max(w, 0.0) * 0.9) * (14.0 / -mv.z);
    vFade = smoothstep(30.0, 12.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uAccent;
  varying float vWave;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.08, d);
    float glow = smoothstep(0.15, 0.85, vWave);
    vec3 color = mix(uBase, uAccent, glow);
    float alpha = disc * vFade * mix(0.14, 0.50, glow);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

// Malla sesgada hacia el fondo para que ninguna partícula quede pegada a
// la cámara (blobs grandes).
const COLS = 120;
const ROWS = 64;
const SPAN_X = 40;
const Z_NEAR = 6;
const Z_FAR = -14;

function buildField(): BufferGeometry {
  const positions = new Float32Array(COLS * ROWS * 3);
  let i = 0;
  for (let gz = 0; gz < ROWS; gz++) {
    for (let gx = 0; gx < COLS; gx++) {
      positions[i++] = (gx / (COLS - 1) - 0.5) * SPAN_X;
      positions[i++] = 0;
      positions[i++] = Z_NEAR + (gz / (ROWS - 1)) * (Z_FAR - Z_NEAR);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

export default function SceneCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch {
      // Sin WebGL queda el gradiente CSS del hero — degradación elegante.
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new Scene();
    const camera = new PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 5, 13);

    const geometry = buildField();
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uSize: { value: 2.8 },
        uBase: { value: new Color("#8d8da8") },
        uAccent: { value: new Color("#a3e635") },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    scene.add(points);

    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);

    // Parallax sutil: la cámara deriva unos grados siguiendo al puntero.
    let targetX = 0;
    let targetY = 0;
    let camX = 0;
    let camY = 0;
    const onPointer = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 1.4;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.7;
    };
    if (!reduceMotion && finePointer) {
      window.addEventListener("pointermove", onPointer, { passive: true });
    }

    const render = () => {
      camera.position.x = camX;
      camera.position.y = 5 - camY;
      camera.lookAt(0, 0.8, 0);
      renderer.render(scene, camera);
    };

    let raf = 0;
    let firstFrame = true;
    const markReady = () => {
      if (firstFrame) {
        firstFrame = false;
        setReady(true);
      }
    };

    const tick = () => {
      material.uniforms.uTime.value = performance.now() / 1000;
      camX += (targetX - camX) * 0.04;
      camY += (targetY - camY) * 0.04;
      render();
      markReady();
      raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reduceMotion) render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Solo animar mientras el hero está en pantalla.
    const io = new IntersectionObserver(([entry]) => {
      if (reduceMotion) return;
      cancelAnimationFrame(raf);
      if (entry.isIntersecting) raf = requestAnimationFrame(tick);
    });
    io.observe(host);

    if (reduceMotion) {
      // Un único frame con una fase agradable: la escena existe pero no se mueve.
      material.uniforms.uTime.value = 4.2;
      render();
      markReady();
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`absolute inset-0 transition-opacity duration-1000 ease-out ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
