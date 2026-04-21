<template>
  <div ref="container" class="scanline-overlay" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import * as THREE from "three";

const container = ref(null);
let renderer, scene, camera, quad, renderTarget, animationId;

onMounted(() => {
  if (!container.value) return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.value.appendChild(renderer.domElement);

  renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });

  // towa ne e peak
  quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
        uSpeed: { value: 0.2 },
        uLineDarkness: { value: 0.9 },
        uGlowColor: { value: new THREE.Vector3(0.3, 0.3, 0.3) },
        uGlow: { value: 2 },
        uResolution: { value: new THREE.Vector2(width, height) },
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        
        uniform float uTime;
        uniform float uIntensity;
        uniform float uSpeed;
        uniform float uGlow;
        uniform float uLineDarkness;
        uniform vec3 uGlowColor;
        uniform vec2 uResolution;
        
        varying vec2 vUv;
        
        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }
        
        void main() {
          vec2 uv = vUv;
          
          float scanline = sin(uv.y * uResolution.y * 0.5 + uTime * uSpeed * 5.0) * 0.5 + 0.5;
          scanline = pow(scanline, 3.0);
          
          float lineIntensity = mix(1.0, 0.5 - scanline * uIntensity, uIntensity);
          
          vec4 color = vec4(0.0);
          
          color.rgb -= (1.0 - lineIntensity) * uLineDarkness * 0.7;
          
          float glow = sin(uv.y * uResolution.y * 0.5) * 0.5 + 0.5;
          glow = pow(glow, 2.0);
          color.rgb += uGlowColor * glow * uGlow * 0.3;
          
          float noise = random(uv + uTime * 0.01) * 0.01;
          color.rgb += noise * 0.3;
          
          color.a = max(max(color.r, color.g), color.b) * 0.8 + uIntensity * 0.3;
          
          gl_FragColor = color;
        }
      `,
      blending: THREE.MultiplyBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(quad);

  const animate = () => {
    animationId = requestAnimationFrame(animate);

    quad.material.uniforms.uTime.value += 0.016;
    renderer.render(scene, camera);
  };

  animate();

  const handleResize = () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    renderer.setSize(newWidth, newHeight);
    renderTarget.setSize(newWidth, newHeight);
    quad.material.uniforms.uResolution.value.set(newWidth, newHeight);
  };

  window.addEventListener("resize", handleResize);

  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
    cancelAnimationFrame(animationId);
    renderer.dispose();
    renderTarget.dispose();
    quad.geometry.dispose();
    quad.material.dispose();
    container.value?.removeChild(renderer.domElement);
  });
});
</script>

<style scoped>
.scanline-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
}

:deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
