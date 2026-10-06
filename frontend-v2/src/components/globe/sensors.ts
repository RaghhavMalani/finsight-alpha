/**
 * Sensor looks for the God's Eye globe, ported from God's Eye View
 * (https://github.com/bilawalsidhu/gods-eye-view, commit 9542a5e, src/styles/{thermal,retro,surveillance}.js).
 * The GLSL is the original Cesium post-process code, run here as three.js GLSL3 passes:
 * `colorTexture`, `colorTextureDimensions`, `intensity`, `time`, `v_textureCoordinates` and
 * `out_FragColor` keep their names. The FLIR port
 * drops the source's luminance-derived temperature digits and frame counter.
 *
 * MIT License
 *
 * Copyright (c) 2026 Bilawal Sidhu
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type SensorKind = "flir" | "crt" | "nvg";
export type SensorShader = {
  label: string;
  hint: string;
  source: string;
  uniforms: Record<string, number>;
  fragmentShader: string;
};

export const SENSORS: Record<SensorKind, SensorShader> = {
  flir: {
    label: "FLIR",
    hint: "Forward-looking infrared: white-hot thermal optics",
    source: "src/styles/thermal.js",
    uniforms: { sensitivity: 0.75, bloom: 0.65, mode: 0.0, pixelation: 1.5, palette: 0.0 },
    fragmentShader: /* glsl */ `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    uniform float intensity;
    uniform float time;
    uniform float sensitivity;
    uniform float bloom;
    uniform float mode;
    uniform float pixelation;
    uniform float palette;
    in vec2 v_textureCoordinates;

    // ── Ironbow "Predator" thermal palette ────────────────
    // Maps a 0-1 temperature to the classic FLIR ironbow ramp:
    // black -> deep purple -> magenta -> red -> orange -> yellow -> white.
    vec3 ironbow(float t) {
      t = clamp(t, 0.0, 1.0);
      const vec3 c0 = vec3(0.0, 0.0, 0.0);     // cold
      const vec3 c1 = vec3(0.13, 0.0, 0.30);   // deep purple
      const vec3 c2 = vec3(0.49, 0.0, 0.45);   // magenta
      const vec3 c3 = vec3(0.86, 0.10, 0.18);  // red
      const vec3 c4 = vec3(1.0, 0.55, 0.0);    // orange
      const vec3 c5 = vec3(1.0, 0.91, 0.32);   // yellow
      const vec3 c6 = vec3(1.0, 1.0, 1.0);     // hot (white)
      float s = t * 6.0;
      if (s < 1.0) return mix(c0, c1, s);
      if (s < 2.0) return mix(c1, c2, s - 1.0);
      if (s < 3.0) return mix(c2, c3, s - 2.0);
      if (s < 4.0) return mix(c3, c4, s - 3.0);
      if (s < 5.0) return mix(c4, c5, s - 4.0);
      return mix(c5, c6, s - 5.0);
    }

    // ── Value noise (coherent, smooth, drifting) ──────────
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f); // smoothstep interpolation
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Fractal Brownian motion for layered coherent noise
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      vec2 shift = vec2(100.0);
      for (int i = 0; i < 4; i++) {
        v += a * valueNoise(p);
        p = p * 2.0 + shift;
        a *= 0.5;
      }
      return v;
    }

    // ── 7-segment digit renderer ──────────────────────────
    float segment(vec2 p, int seg) {
      float s = 0.0;
      if (seg == 0) s = step(0.2, p.x) * step(p.x, 0.8) * step(0.85, p.y) * step(p.y, 1.0);
      if (seg == 1) s = step(0.7, p.x) * step(p.x, 0.9) * step(0.5, p.y) * step(p.y, 0.95);
      if (seg == 2) s = step(0.7, p.x) * step(p.x, 0.9) * step(0.05, p.y) * step(p.y, 0.5);
      if (seg == 3) s = step(0.2, p.x) * step(p.x, 0.8) * step(0.0, p.y) * step(p.y, 0.15);
      if (seg == 4) s = step(0.1, p.x) * step(p.x, 0.3) * step(0.05, p.y) * step(p.y, 0.5);
      if (seg == 5) s = step(0.1, p.x) * step(p.x, 0.3) * step(0.5, p.y) * step(p.y, 0.95);
      if (seg == 6) s = step(0.2, p.x) * step(p.x, 0.8) * step(0.42, p.y) * step(p.y, 0.58);
      return s;
    }

    float digit(vec2 p, int d) {
      int masks[10] = int[10](0x7E, 0x30, 0x6D, 0x79, 0x33, 0x5B, 0x5F, 0x70, 0x7F, 0x7B);
      int m = masks[d];
      float s = 0.0;
      for (int i = 0; i < 7; i++) {
        if ((m >> (6 - i) & 1) == 1) s += segment(p, i);
      }
      return clamp(s, 0.0, 1.0);
    }

    // Render a character (digit, '.', or '°') at position
    float renderChar(vec2 p, int ch) {
      if (ch == 10) { // '.' decimal point
        return smoothstep(0.15, 0.0, length(p - vec2(0.5, 0.08)));
      }
      if (ch == 11) { // '°' degree symbol
        float ring = abs(length(p - vec2(0.5, 0.82)) - 0.08);
        return smoothstep(0.04, 0.02, ring);
      }
      if (ch >= 0 && ch <= 9) return digit(p, ch);
      return 0.0;
    }

    // ── Crosshair ─────────────────────────────────────────
    float crosshair(vec2 uv) {
      vec2 c = uv - 0.5;
      float h = smoothstep(0.0015, 0.0005, abs(c.y)) *
                step(0.015, abs(c.x)) * step(abs(c.x), 0.04);
      float v = smoothstep(0.0015, 0.0005, abs(c.x)) *
                step(0.015, abs(c.y)) * step(abs(c.y), 0.04);
      return clamp(h + v, 0.0, 1.0);
    }

    // ── Scale bar (right edge) ────────────────────────────
    float scaleBar(vec2 uv) {
      // Vertical bar on right edge
      float barX = step(0.94, uv.x) * step(uv.x, 0.955);
      float barY = step(0.15, uv.y) * step(uv.y, 0.85);
      return barX * barY;
    }

    void main() {
      vec2 uv = v_textureCoordinates;
      vec2 dims = colorTextureDimensions;
      vec2 texel = 1.0 / dims;
      vec2 hudUV = uv; // preserve original UV for HUD overlay

      // ── Circular vignette mask (FLIR optics field of view) ──
      vec2 centered = uv * 2.0 - 1.0;
      float aspect = dims.x / dims.y;
      centered.x *= aspect;
      float radius = length(centered);
      float lensMask = pow(1.0 - smoothstep(0.6, 1.05, radius), 0.7);
      // Tube brightness falloff (center brightest)
      float lensShading = 1.0 - radius * radius * 0.25;
      lensShading = max(lensShading, 0.0);

      // If outside lens, render black
      if (lensMask < 0.001) {
        out_FragColor = vec4(vec3(0.0), 1.0);
        return;
      }

      // ── Sensor resolution pixelation (authentic FLIR resolution limits) ──
      float pixSize = mix(1.0, pixelation, intensity);
      vec2 snappedUV = floor(uv * dims / pixSize) * pixSize / dims;
      uv = mix(uv, snappedUV, intensity);

      // ── Soft IR blur (thermal cameras have lower resolution / diffraction) ──
      vec3 blurred = vec3(0.0);
      float totalWeight = 0.0;
      for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
          float w = exp(-0.5 * float(x * x + y * y) / 2.0);
          blurred += texture(colorTexture, uv + vec2(float(x), float(y)) * texel * 1.5).rgb * w;
          totalWeight += w;
        }
      }
      blurred /= totalWeight;
      vec4 original = texture(colorTexture, uv);

      // Mix between sharp and blurred based on intensity
      vec3 src = mix(original.rgb, blurred, 0.6 * intensity);

      // ── Luminance → temperature mapping ─────────────────
      float luma = dot(src, vec3(0.299, 0.587, 0.114));

      // Sensitivity remaps the luminance range
      float sens = mix(0.25, 1.0, sensitivity);
      float temp = clamp((luma - (0.5 - sens * 0.5)) / sens, 0.0, 1.0);

      // ── Temperature banding (contour lines) ─────────────
      float bands = 12.0;
      float bandLine = abs(fract(temp * bands) - 0.5);
      float contour = smoothstep(0.04, 0.06, bandLine);
      temp *= mix(1.0, contour * 0.85 + 0.15, 0.3 * intensity);

      // ── White-Hot / Black-Hot mode ──────────────────────
      float isBlackHot = step(0.5, mode);
      float thermal = mix(temp, 1.0 - temp, isBlackHot);

      // Monochrome FLIR (white/black-hot) vs Ironbow "Predator" color ramp.
      // Ironbow maps TRUE temperature (cold->dark, hot->white) so the colors
      // read correctly regardless of the WHOT/BHOT toggle.
      vec3 mono = vec3(thermal);
      vec3 iron = ironbow(temp);
      vec3 thermalColor = mix(mono, iron, palette);

      // ── Hot-spot bloom/bleed ────────────────────────────
      // Sample a wider area for bloom on bright spots
      float bloomSample = 0.0;
      float bloomWeight = 0.0;
      for (int y = -4; y <= 4; y++) {
        for (int x = -4; x <= 4; x++) {
          vec2 offset = vec2(float(x), float(y)) * texel * 3.0;
          float sLuma = dot(texture(colorTexture, uv + offset).rgb, vec3(0.299, 0.587, 0.114));
          float sMapped = clamp((sLuma - (0.5 - sens * 0.5)) / sens, 0.0, 1.0);
          float sFinal = mix(sMapped, 1.0 - sMapped, isBlackHot);
          float w = exp(-0.5 * float(x * x + y * y) / 8.0);
          // Only bloom the "hot" pixels (bright in WHOT, dark values in BHOT...
          // but since we already inverted, just bloom high values)
          float hotness = smoothstep(0.6, 1.0, sFinal);
          bloomSample += hotness * w;
          bloomWeight += w;
        }
      }
      bloomSample /= bloomWeight;
      thermalColor += bloomSample * bloom * 0.8;

      // ── Coherent temporal noise (slowly drifting, cloud-like) ──
      vec2 noiseCoord = uv * 80.0 + vec2(time * 0.3, time * 0.2);
      float noise = fbm(noiseCoord);
      noise = (noise - 0.5) * 0.08 * intensity;
      thermalColor += noise;

      // ── Subtle motion blur feel (slight blur) ───────────
      // Already handled by the initial IR blur above

      // ── HUD Overlay ─────────────────────────────────────
      float hud = 0.0;

      // Top-left: "FLIR" label + mode indicator
      // Rendered as simple box presence markers (not full text rendering)
      // We'll use a simplified approach: render mode text near top-left
      vec2 labelArea = (hudUV - vec2(0.02, 0.92)) / vec2(0.08, 0.04);
      if (labelArea.x >= 0.0 && labelArea.x <= 1.0 && labelArea.y >= 0.0 && labelArea.y <= 1.0) {
        // Simple horizontal bar as "FLIR" label marker
        hud += step(0.1, labelArea.x) * step(labelArea.x, 0.9) *
               step(0.3, labelArea.y) * step(labelArea.y, 0.7) * 0.6;
      }

      // Mode indicator below label
      vec2 modeArea = (hudUV - vec2(0.02, 0.88)) / vec2(0.06, 0.03);
      if (modeArea.x >= 0.0 && modeArea.x <= 1.0 && modeArea.y >= 0.0 && modeArea.y <= 1.0) {
        hud += step(0.1, modeArea.x) * step(modeArea.x, 0.9) *
               step(0.2, modeArea.y) * step(modeArea.y, 0.8) * 0.4;
      }

      // Center crosshair
      hud += crosshair(hudUV) * 0.7;

      // (The source's luminance-derived temperature digits and frame counter are
      //  omitted: a globe has no temperature to read.)


      // Scale bar (right edge gradient)
      float bar = scaleBar(hudUV);
      if (bar > 0.0) {
        float barGrad = (hudUV.y - 0.15) / 0.7; // 0 at bottom, 1 at top
        float barVal = mix(barGrad, 1.0 - barGrad, isBlackHot);
        thermalColor = mix(thermalColor, vec3(barVal), bar * 0.9);
      }

      // Composite HUD (rendered in white, slightly transparent)
      float hudBright = mix(1.0, 0.0, isBlackHot); // HUD is white in WHOT, dark in BHOT inverted
      // Actually, HUD should always be visible — use contrast
      thermalColor += hud * 0.6 * intensity;

      // ── Lens shading + vignette ───────────────────
      thermalColor *= lensShading;
      thermalColor *= lensMask;

      // Clamp final
      thermalColor = clamp(thermalColor, 0.0, 1.0);

      // Blend with original based on intensity, then fade to black at lens edges
      vec3 finalColor = mix(original.rgb, thermalColor, intensity);
      finalColor *= mix(1.0, lensMask, intensity);

      out_FragColor = vec4(finalColor, 1.0);
    }
  `,
  },
  crt: {
    label: "CRT",
    hint: "Phosphor CRT: dithering, scanlines, shadow mask",
    source: "src/styles/retro.js",
    uniforms: { pixelation: 5.0, distortion: 0.0, instability: 0.4 },
    fragmentShader: /* glsl */ `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    uniform float intensity;
    uniform float pixelation;
    uniform float distortion;
    uniform float instability;
    uniform float time;
    in vec2 v_textureCoordinates;

    // ── Hash for noise/randomness ─────────────────────────
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    // 8x8 Bayer dithering matrix (normalized 0-1)
    float bayer8(vec2 pos) {
      ivec2 p = ivec2(mod(pos, 8.0));
      int index = p.x + p.y * 8;
      int bayer[64] = int[64](
         0, 32,  8, 40,  2, 34, 10, 42,
        48, 16, 56, 24, 50, 18, 58, 26,
        12, 44,  4, 36, 14, 46,  6, 38,
        60, 28, 52, 20, 62, 30, 54, 22,
         3, 35, 11, 43,  1, 33,  9, 41,
        51, 19, 59, 27, 49, 17, 57, 25,
        15, 47,  7, 39, 13, 45,  5, 37,
        63, 31, 55, 23, 61, 29, 53, 21
      );
      return float(bayer[index]) / 64.0;
    }

    // CRT barrel distortion
    vec2 barrelDistort(vec2 uv, float strength) {
      vec2 centered = uv * 2.0 - 1.0;
      float r2 = dot(centered, centered);
      float distort = 1.0 + r2 * strength * 0.4;
      centered *= distort;
      return centered * 0.5 + 0.5;
    }

    void main() {
      vec2 uv = v_textureCoordinates;
      vec2 dims = colorTextureDimensions;
      vec2 texel = 1.0 / dims;

      // ── Barrel distortion (CRT monitor bulge) ───────────
      float dist = distortion * intensity;
      vec2 distUV = barrelDistort(uv, dist);

      // Black outside the distorted area
      if (distUV.x < 0.0 || distUV.x > 1.0 || distUV.y < 0.0 || distUV.y > 1.0) {
        out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // ── Horizontal jitter (random scanline displacement) ──
      float lineY = floor(distUV.y * dims.y);
      float jitterSeed = hash(vec2(lineY, floor(time * 8.0)));
      // Only jitter a few lines at a time (sparse)
      float jitterActive = step(0.97 - instability * 0.04, jitterSeed);
      float jitterAmount = (hash(vec2(lineY * 7.0, floor(time * 12.0))) - 0.5) *
                           0.008 * instability * jitterActive * intensity;
      vec2 jitteredUV = distUV + vec2(jitterAmount, 0.0);

      // ── Chromatic aberration — slight RGB channel offset ──
      vec2 centered = jitteredUV - 0.5;
      float caStrength = length(centered) * 0.008 * intensity;
      float r = texture(colorTexture, jitteredUV + centered * caStrength).r;
      float g = texture(colorTexture, jitteredUV).g;
      float b = texture(colorTexture, jitteredUV - centered * caStrength).b;
      vec4 color = vec4(r, g, b, 1.0);

      // ── Pixelation: snap UV to grid ─────────────────────
      float pixSize = mix(1.0, pixelation, intensity);
      vec2 pixelUV = floor(jitteredUV * dims / pixSize) * pixSize / dims;
      vec4 pixelColor = texture(colorTexture, mix(jitteredUV, pixelUV, intensity));

      // Blend chromatic aberration with pixelated sample
      color = mix(color, pixelColor, 0.7 * intensity);

      // ── Bayer dithering before posterization ────────────
      vec2 ditherCoord = jitteredUV * dims / pixSize;
      float dither = bayer8(ditherCoord) - 0.5;
      float ditherAmount = 0.12 * intensity;
      vec3 dithered = color.rgb + dither * ditherAmount;

      // ── Posterize: reduce color levels ──────────────────
      float levels = mix(256.0, 10.0, intensity);
      vec3 posterized = floor(dithered * levels + 0.5) / levels;

      // ── Slight saturation boost ─────────────────────────
      float gray = dot(posterized, vec3(0.299, 0.587, 0.114));
      vec3 saturated = mix(vec3(gray), posterized, 1.0 + 0.3 * intensity);

      // ── RGB shadow mask subpixel pattern ────────────────
      // Each pixel shows faint R/G/B vertical stripes
      float subpixelX = mod(distUV.x * dims.x, 3.0);
      vec3 subpixelMask = vec3(
        smoothstep(0.0, 0.8, 1.0 - abs(subpixelX - 0.5)),   // R stripe
        smoothstep(0.0, 0.8, 1.0 - abs(subpixelX - 1.5)),   // G stripe
        smoothstep(0.0, 0.8, 1.0 - abs(subpixelX - 2.5))    // B stripe
      );
      // Only apply at higher pixelation (visible "pixels")
      float subpixelStrength = smoothstep(2.0, 6.0, pixSize) * 0.3 * intensity;
      vec3 withSubpixels = mix(saturated, saturated * (subpixelMask * 0.7 + 0.3), subpixelStrength);

      // ── Block edge darkening ────────────────────────────
      vec2 pixelCenter = fract(distUV * dims / pixSize);
      float blockEdge = smoothstep(0.0, 0.08, min(min(pixelCenter.x, 1.0 - pixelCenter.x),
                                                    min(pixelCenter.y, 1.0 - pixelCenter.y)));
      float edgeFactor = mix(1.0, blockEdge * 0.15 + 0.85, intensity);

      vec3 result = withSubpixels * edgeFactor;

      // ── Horizontal scanlines — rolling CRT refresh ──────
      float scanY = distUV.y * dims.y;
      float scanline = sin(scanY * 1.0 + time * 2.5) * 0.5 + 0.5;
      scanline = pow(scanline, 1.5);
      float scanFade = 0.35 * intensity;
      result *= mix(1.0, scanline * scanFade + (1.0 - scanFade), intensity);

      // ── Phosphor persistence / ghosting ─────────────────
      // Approximate by blurring in a direction (simulates previous frame lingering)
      vec3 ghost = texture(colorTexture, jitteredUV - vec2(texel.x * 2.0, 0.0)).rgb;
      float ghostGray = dot(ghost, vec3(0.299, 0.587, 0.114));
      // Blend a dim ghost of the offset sample
      result = mix(result, result + vec3(ghostGray) * 0.08, instability * intensity);

      // ── Flicker (overall brightness fluctuation ~50-60Hz) ──
      float flicker = sin(time * 188.5) * 0.5 + 0.5; // ~60Hz equivalent
      flicker = 1.0 - flicker * 0.03 * instability * intensity; // very subtle
      result *= flicker;

      // ── Glitch lines (rare horizontal bright bars) ──────
      float glitchSeed = hash(vec2(floor(time * 2.0), 0.0));
      float glitchLine = step(0.92 - instability * 0.08, glitchSeed);
      if (glitchLine > 0.0) {
        float glitchY = hash(vec2(floor(time * 2.0), 1.0));
        float glitchHit = smoothstep(0.0, 0.003, abs(distUV.y - glitchY));
        glitchHit = 1.0 - glitchHit;
        result += glitchHit * 0.3 * instability * intensity;
      }

      // ── Warm phosphor tint (P1 green-amber) ─────────────
      vec3 warmTint = result * vec3(1.02, 1.0, 0.94);
      result = mix(result, warmTint, 0.4 * intensity);

      // ── Edge vignette (darker corners — CRT curvature) ──
      vec2 vigUV = distUV * (1.0 - distUV);
      float vig = vigUV.x * vigUV.y * 20.0;
      vig = clamp(pow(vig, 0.25 + 0.15 * intensity), 0.0, 1.0);
      result *= mix(1.0, vig, 0.6 * intensity);

      out_FragColor = vec4(mix(texture(colorTexture, uv).rgb, result, intensity), 1.0);
    }
  `,
  },
  nvg: {
    label: "NVG",
    hint: "Image-intensifier night vision, P43 green",
    source: "src/styles/surveillance.js",
    uniforms: { gain: 0.55, bloom: 0.3, scanlineStr: 1.0, pixelation: 2.5 },
    fragmentShader: /* glsl */ `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    uniform float intensity;
    uniform float time;
    uniform float gain;
    uniform float bloom;
    uniform float scanlineStr;
    uniform float pixelation;
    in vec2 v_textureCoordinates;

    // ── Noise functions ───────────────────────────────────
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // ── Barrel distortion (NVG lens) ──────────────────────
    vec2 barrelDistort(vec2 uv, float strength) {
      vec2 c = uv * 2.0 - 1.0;
      float r2 = dot(c, c);
      float distort = 1.0 + r2 * strength * 0.5 + r2 * r2 * strength * 0.15;
      c *= distort;
      return c * 0.5 + 0.5;
    }

    // ── Honeycomb pattern (fiber optic plate texture) ─────
    float honeycomb(vec2 uv) {
      vec2 dims = colorTextureDimensions;
      float scale = min(dims.x, dims.y) * 0.008;
      vec2 p = uv * dims * scale;
      // Hex grid
      vec2 r = vec2(1.0, 1.732);
      vec2 h = r * 0.5;
      vec2 a = mod(p, r) - h;
      vec2 b = mod(p - h, r) - h;
      vec2 gv = dot(a, a) < dot(b, b) ? a : b;
      float d = max(abs(gv.x), abs(gv.y * 0.577 + abs(gv.x) * 0.5));
      return smoothstep(0.4, 0.45, d);
    }

    // ── 7-segment digit renderer ──────────────────────────
    float segment(vec2 p, int seg) {
      float s = 0.0;
      if (seg == 0) s = step(0.2, p.x) * step(p.x, 0.8) * step(0.85, p.y) * step(p.y, 1.0);
      if (seg == 1) s = step(0.7, p.x) * step(p.x, 0.9) * step(0.5, p.y) * step(p.y, 0.95);
      if (seg == 2) s = step(0.7, p.x) * step(p.x, 0.9) * step(0.05, p.y) * step(p.y, 0.5);
      if (seg == 3) s = step(0.2, p.x) * step(p.x, 0.8) * step(0.0, p.y) * step(p.y, 0.15);
      if (seg == 4) s = step(0.1, p.x) * step(p.x, 0.3) * step(0.05, p.y) * step(p.y, 0.5);
      if (seg == 5) s = step(0.1, p.x) * step(p.x, 0.3) * step(0.5, p.y) * step(p.y, 0.95);
      if (seg == 6) s = step(0.2, p.x) * step(p.x, 0.8) * step(0.42, p.y) * step(p.y, 0.58);
      return s;
    }

    float digit(vec2 p, int d) {
      int masks[10] = int[10](0x7E, 0x30, 0x6D, 0x79, 0x33, 0x5B, 0x5F, 0x70, 0x7F, 0x7B);
      int m = masks[d];
      float s = 0.0;
      for (int i = 0; i < 7; i++) {
        if ((m >> (6 - i) & 1) == 1) s += segment(p, i);
      }
      return clamp(s, 0.0, 1.0);
    }

    // Render HH:MM:SS timestamp
    float renderTimestamp(vec2 uv) {
      vec2 tsOrigin = vec2(0.02, 0.03);
      vec2 tsSize = vec2(0.22, 0.035);
      vec2 p = (uv - tsOrigin) / tsSize;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;

      int totalSec = int(mod(time, 86400.0));
      int hours = totalSec / 3600;
      int minutes = (totalSec % 3600) / 60;
      int seconds = totalSec % 60;

      float charWidth = 1.0 / 8.5;
      int charIdx = int(p.x / charWidth);
      float localX = mod(p.x, charWidth) / charWidth;
      vec2 localP = vec2(localX, p.y);

      int dv = -1;
      if (charIdx == 0) dv = hours / 10;
      else if (charIdx == 1) dv = hours % 10;
      else if (charIdx == 2) return (step(0.3, localP.x) * step(localP.x, 0.7)) *
                                    (step(0.2, localP.y) * step(localP.y, 0.4) + step(0.6, localP.y) * step(localP.y, 0.8));
      else if (charIdx == 3) dv = minutes / 10;
      else if (charIdx == 4) dv = minutes % 10;
      else if (charIdx == 5) return (step(0.3, localP.x) * step(localP.x, 0.7)) *
                                    (step(0.2, localP.y) * step(localP.y, 0.4) + step(0.6, localP.y) * step(localP.y, 0.8));
      else if (charIdx == 6) dv = seconds / 10;
      else if (charIdx == 7) dv = seconds % 10;

      if (dv < 0 || dv > 9) return 0.0;
      return digit(localP, dv);
    }

    // ── Crosshair (thin, subtle NVG reticle) ──────────────
    float crosshair(vec2 uv) {
      vec2 c = uv - 0.5;
      float h = smoothstep(0.001, 0.0004, abs(c.y)) *
                step(0.01, abs(c.x)) * step(abs(c.x), 0.025);
      float v = smoothstep(0.001, 0.0004, abs(c.x)) *
                step(0.01, abs(c.y)) * step(abs(c.y), 0.025);
      return clamp(h + v, 0.0, 1.0);
    }

    void main() {
      vec2 uv = v_textureCoordinates;
      vec2 dims = colorTextureDimensions;
      vec2 texel = 1.0 / dims;

      // ── Barrel distortion (NVG lens distortion) ─────────
      float dist = 0.5 * intensity;
      vec2 distUV = barrelDistort(uv, dist);

      // ── Circular vignette mask (NVG tube field of view) ──
      vec2 centered = uv * 2.0 - 1.0;
      float aspect = dims.x / dims.y;
      centered.x *= aspect;
      float radius = length(centered);
      float tubeMask = pow(1.0 - smoothstep(0.6, 1.05, radius), 0.7);
      // Tube brightness falloff (center brightest)
      float tubeShading = 1.0 - radius * radius * 0.3;
      tubeShading = max(tubeShading, 0.0);

      // If outside tube, render black
      if (tubeMask < 0.001) {
        out_FragColor = vec4(vec3(0.0), 1.0);
        return;
      }

      // Black outside distorted area
      if (distUV.x < 0.0 || distUV.x > 1.0 || distUV.y < 0.0 || distUV.y > 1.0) {
        out_FragColor = vec4(vec3(0.0), 1.0);
        return;
      }

      // ── Intensifier tube resolution pixelation ────────────
      float pixSize = mix(1.0, pixelation, intensity);
      vec2 snappedUV = floor(distUV * dims / pixSize) * pixSize / dims;
      distUV = mix(distUV, snappedUV, intensity);

      vec4 original = texture(colorTexture, distUV);

      // ── Luminance ───────────────────────────────────────
      float luma = dot(original.rgb, vec3(0.299, 0.587, 0.114));

      // ── Auto-gain response ──────────────────────────────
      // Higher gain = more amplification, more noise, more bloom
      float gainLevel = mix(0.8, 2.5, gain);
      float amplified = clamp(luma * gainLevel, 0.0, 1.0);

      // Slight contrast curve for gain response
      amplified = pow(amplified, mix(1.2, 0.7, gain));

      // ── Intensifier tube bloom (THE key NVG visual) ─────
      // Bloom around bright sources — wider kernel for realistic halos
      float bloomAccum = 0.0;
      float bloomW = 0.0;
      for (int y = -5; y <= 5; y++) {
        for (int x = -5; x <= 5; x++) {
          vec2 offset = vec2(float(x), float(y)) * texel * 4.0;
          float sLuma = dot(texture(colorTexture, distUV + offset).rgb, vec3(0.299, 0.587, 0.114));
          float bright = smoothstep(0.4, 0.9, sLuma * gainLevel);
          float w = exp(-float(x * x + y * y) / 18.0);
          bloomAccum += bright * w;
          bloomW += w;
        }
      }
      bloomAccum /= bloomW;

      // Edge glow / corona on bright objects
      float corona = bloomAccum * bloom * 1.5;

      // ── P43 phosphor green (530nm) ──────────────────────
      vec3 phosphor = vec3(0.16, 1.0, 0.22);
      vec3 nvgColor = phosphor * (amplified + corona);

      // ── Scintillation (image intensifier sparkle noise) ──
      // Base tube grain (slow, coherent)
      vec2 grainCoord = uv * 120.0 + vec2(time * 0.5, time * 0.3);
      float tubeGrain = valueNoise(grainCoord);
      tubeGrain = (tubeGrain - 0.5) * mix(0.06, 0.2, gain) * intensity;
      nvgColor += phosphor * tubeGrain;

      // More noise in dark areas (real gain response)
      float darkNoise = (1.0 - amplified) * hash(uv * dims + vec2(time * 200.0, time * 300.0));
      nvgColor += phosphor * darkNoise * 0.08 * gain * intensity;

      // ── Honeycomb fiber optic plate ─────────────────────
      float hc = honeycomb(distUV);
      nvgColor *= 1.0 - hc * 0.04 * intensity; // very subtle

      // ── Scanlines (subtle, from the display) ────────────
      float scanline = sin(distUV.y * dims.y * 1.2 + time * 2.0) * 0.5 + 0.5;
      scanline = pow(scanline, 2.5);
      nvgColor *= 1.0 - scanline * scanlineStr * 0.15 * intensity;

      // ── Tube shading (brightness falloff from center) ───
      nvgColor *= tubeShading;

      // ── Circular vignette (dark edges, NVG tube shape) ──
      nvgColor *= tubeMask;

      // ── HUD Overlay ─────────────────────────────────────

      // Top-left: "NVG" / "I²" label marker
      vec2 labelArea = (uv - vec2(0.03, 0.92)) / vec2(0.06, 0.03);
      if (labelArea.x >= 0.0 && labelArea.x <= 1.0 && labelArea.y >= 0.0 && labelArea.y <= 1.0) {
        float lbl = step(0.1, labelArea.x) * step(labelArea.x, 0.9) *
                    step(0.2, labelArea.y) * step(labelArea.y, 0.8);
        nvgColor += phosphor * lbl * 0.3 * intensity;
      }

      // Gain indicator below label: "AUTO" marker
      vec2 gainArea = (uv - vec2(0.03, 0.88)) / vec2(0.05, 0.025);
      if (gainArea.x >= 0.0 && gainArea.x <= 1.0 && gainArea.y >= 0.0 && gainArea.y <= 1.0) {
        float gLbl = step(0.1, gainArea.x) * step(gainArea.x, 0.9) *
                     step(0.2, gainArea.y) * step(gainArea.y, 0.8);
        nvgColor += phosphor * gLbl * 0.2 * intensity;
      }

      // Center crosshair (thin, subtle)
      float ch = crosshair(uv);
      nvgColor += phosphor * ch * 0.4 * intensity;

      // Bottom-left: Timestamp (7-segment)
      float ts = renderTimestamp(uv);
      nvgColor += phosphor * ts * 0.6 * intensity;

      // REC indicator — top-right (blinking)
      vec2 recPos = uv - vec2(0.95, 0.94);
      float recDot = smoothstep(0.008, 0.004, length(recPos));
      float blink = step(0.5, fract(time * 0.8));
      // REC dot in slightly warmer green
      nvgColor += vec3(0.3, 1.0, 0.2) * recDot * blink * intensity;

      // ── Final composite ─────────────────────────────────
      nvgColor = clamp(nvgColor, 0.0, 1.0);

      // Keep NVG output fully tube-masked at full intensity to avoid color bleed at the lens edge.
      vec3 finalColor = mix(original.rgb, nvgColor * tubeMask, intensity);

      out_FragColor = vec4(finalColor, 1.0);
    }
  `,
  },
};

/** Full-screen pass vertex stage that hands the Cesium-style varying to the ported code. */
export const SENSOR_VERTEX = /* glsl */ `
  out vec2 v_textureCoordinates;
  void main() {
    v_textureCoordinates = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
/** Declares the Cesium output name; three leaves the output to GLSL3 shaders. */
export const SENSOR_PRELUDE = "layout(location = 0) out highp vec4 out_FragColor;\n";
