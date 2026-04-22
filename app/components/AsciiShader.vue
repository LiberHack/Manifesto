<template>
  <div class="w-full h-full bg-base-100 overflow-hidden">
    <div ref="container" class="w-full h-full"></div>
  </div>
</template>

<script setup>
import * as THREE from "three";

const props = defineProps({
  color: {
    type: Object,
    default: () => ({ r: 255, g: 86, b: 255 }),
  },
  waveIntensity: {
    type: Number,
    default: 0.4,
  },
  asciiDensity: {
    type: Number,
    default: 70,
  },
  animationSpeed: {
    type: Number,
    default: 0.7,
  },
});

const container = ref(null);
let renderer, scene, camera, mesh, animationId, uniforms;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float time;
  uniform vec2 resolution;
  uniform vec3 userColor;
  uniform float waveIntensity;
  uniform float density;
  varying vec2 vUv;

  float character(int n, vec2 p) {
    p = floor(p * vec2(4.0, -4.0) + 2.5);
    if (clamp(p.x, 0.0, 4.0) != p.x || clamp(p.y, 0.0, 4.0) != p.y) return 0.0;

    int ix = int(p.x);
    int iy = int(p.y);

    if (n == 0) return 0.0;
    if (n == 1) return step(1.5, distance(p, vec2(2.0, 2.0))) * step(distance(p, vec2(2.0, 2.0)), 0.5);
    if (n == 2) return step(1.5, p.x) * step(p.y, 2.5);
    if (n == 3) return step(0.5, mod(p.x + p.y, 2.0));
    if (n == 4) return step(1.0, p.x) * step(p.y, 1.5);
    if (n == 5) return mod(p.x, 2.0) * mod(p.y, 2.0);
    if (n == 6) return 1.0;
    if (n == 7) return step(0.5, abs(p.x - 2.0)) * step(0.5, abs(p.y - 2.0));
    if (n == 8) return step(0.2, abs(p.x - p.y));
    return 0.0;
  }

  void main() {
    vec2 gridSize = resolution.xy / (density * 2.0);
    vec2 grid = floor(vUv * (resolution.xy / gridSize)) / (resolution.xy / gridSize);
    vec2 subUv = fract(vUv * (resolution.xy / gridSize));

    float wave1 = sin(grid.x * 5.0 + time * 0.5) * cos(grid.y * 5.0 + time * 0.3);
    float wave2 = sin(grid.x * 3.0 - time * 0.4) * cos(grid.y * 3.0 + time * 0.2);
    float wave3 = sin((grid.x + grid.y) * 4.0 + time * 0.6);

    float wave = (wave1 + wave2 + wave3) * waveIntensity;
    float brightness = (wave + 1.5) * 0.4;
    brightness = clamp(brightness, 0.0, 1.0);

    int charIndex = int(brightness * 8.9);
    float col = character(charIndex, subUv);

    float glow = brightness * brightness;
    vec3 finalColor = userColor * col * (brightness + glow * 0.5);

    float scanline = sin(vUv.y * resolution.y * 2.0) * 0.15 + 0.85;
    finalColor *= scanline;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const handleResize = () => {
  if (!renderer) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  uniforms.resolution.value.set(width, height);
};

onMounted(() => {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.value.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(2, 2);
  uniforms = {
    time: { value: 0 },
    resolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    userColor: {
      value: new THREE.Vector3(
        props.color.r / 255,
        props.color.g / 255,
        props.color.b / 255,
      ),
    },
    waveIntensity: { value: props.waveIntensity },
    density: { value: props.asciiDensity },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  window.addEventListener("resize", handleResize);

  const animate = (t) => {
    uniforms.time.value = (t / 1000) * props.animationSpeed;
    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  };
  animate();
});

watch(
  () => props.color,
  (val) => {
    uniforms.userColor.value.set(val.r, val.g, val.b);
  },
  { deep: true },
);

watch(
  () => props.waveIntensity,
  (val) => {
    uniforms.waveIntensity.value = val;
  },
);

watch(
  () => props.asciiDensity,
  (val) => {
    uniforms.density.value = val;
  },
);

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener("resize", handleResize);
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
  }
});
</script>
