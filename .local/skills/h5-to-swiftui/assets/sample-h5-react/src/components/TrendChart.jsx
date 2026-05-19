import React, { useRef, useEffect } from 'react';
import styles from './TrendChart.module.css';

/**
 * TrendChart — WebGL sparkline chart rendered on a <canvas> element.
 *
 * {/* TIER3: WebGL canvas — uses WebGLRenderingContext to draw a sparkline.
 *    The rendering pipeline is entirely GPU-driven via custom GLSL shaders.
 *    There is NO SwiftUI equivalent for arbitrary WebGL content.
 *    SwiftUI port options:
 *      (a) Replace with a native Swift Charts (iOS 16+) line mark — preferred
 *          if data semantics are equivalent.
 *      (b) Wrap in WKWebView if exact visual must be preserved (accepts
 *          partial fidelity loss: no ProMotion, extra process, no Dynamic Type).
 *    Risk triage MUST flag this surface and NOT silently generate wrong code.
 * */
export default function TrendChart({ data, label, color = '#0071e3' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Attempt WebGL; fall back to 2D canvas if unavailable (e.g. jsdom in tests)
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
      // Graceful 2D fallback (no WebGL in test env)
      const ctx = canvas.getContext('2d');
      if (!ctx || !data?.length) return;
      drawFallback2D(ctx, canvas, data, color);
      return;
    }

    // WebGL sparkline — minimal shader pair
    const vsSource = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      void main() {
        vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `;

    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    gl.useProgram(program);

    // Map data to canvas coordinates
    const w = canvas.width;
    const h = canvas.height;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 8;

    const vertices = new Float32Array(data.length * 2);
    data.forEach((v, i) => {
      vertices[i * 2] = pad + (i / (data.length - 1)) * (w - pad * 2);
      vertices[i * 2 + 1] = h - pad - ((v - min) / range) * (h - pad * 2);
    });

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    gl.uniform2f(resLoc, w, h);

    const colLoc = gl.getUniformLocation(program, 'u_color');
    const [r, g, b] = hexToRgb(color);
    gl.uniform4f(colLoc, r, g, b, 1.0);

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.lineWidth(2);
    gl.drawArrays(gl.LINE_STRIP, 0, data.length);

    return () => {
      gl.deleteProgram(program);
      gl.deleteBuffer(buf);
    };
  }, [data, color]);

  return (
    <div className={styles.chartWrapper}>
      {label && <span className={styles.chartLabel}>{label}</span>}
      <canvas
        ref={canvasRef}
        width={280}
        height={80}
        className={styles.canvas}
        aria-label={`Trend chart: ${label}`}
        role="img"
      />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255]
    : [0, 0.44, 0.89];
}

function drawFallback2D(ctx, canvas, data, color) {
  const w = canvas.width;
  const h = canvas.height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 8;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  data.forEach((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}
