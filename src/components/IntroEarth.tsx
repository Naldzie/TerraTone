/* Lazy WebGL layer for the cinematic intro.
 * Textures are local NASA Blue Marble / cloud maps, so the scene works offline
 * after the service worker has cached the intro assets.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface IntroEarthProps {
  quality: 'high' | 'low';
  reduceMotion?: boolean;
  onReady?: () => void;
  onError?: () => void;
}

const EARTH_URL = '/intro/earth-day.jpg';
const CLOUDS_URL = '/intro/earth-clouds.png';

export function IntroEarth({ quality, reduceMotion = false, onReady, onError }: IntroEarthProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Hold the callbacks in refs: the scene must survive parent re-renders.
  // Rebuilding it would recreate the WebGL context and reload both textures,
  // which is both expensive and a good way to exhaust browser GL contexts.
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let planet: THREE.Group | null = null;
    let earth: THREE.Mesh | null = null;
    let clouds: THREE.Mesh | null = null;
    let starField: THREE.Points | null = null;
    let dust: THREE.Points | null = null;
    const textures: THREE.Texture[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let pointerMove: ((event: PointerEvent) => void) | null = null;
    let visibility: (() => void) | null = null;
    let lastTime = performance.now();
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;

    const disposeAll = () => {
      cancelAnimationFrame(raf);
      if (pointerMove) window.removeEventListener('pointermove', pointerMove);
      if (visibility) document.removeEventListener('visibilitychange', visibility);
      resizeObserver?.disconnect();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
      host.replaceChildren();
      renderer = null;
      scene = null;
      camera = null;
      planet = null;
      earth = null;
      clouds = null;
      starField = null;
      dust = null;
    };

    const fail = () => {
      if (disposed) return;
      disposed = true;
      onErrorRef.current?.();
      disposeAll();
    };

    const startScene = (earthTexture: THREE.Texture, cloudTexture: THREE.Texture) => {
      if (disposed) return;

      try {
        renderer = new THREE.WebGLRenderer({
          antialias: quality === 'high',
          alpha: true,
          powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.35));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.06;
        const canvas = renderer.domElement;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.addEventListener('webglcontextlost', fail);
        host.appendChild(canvas);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        camera.position.set(0, 0.06, 4.6);

        earthTexture.colorSpace = THREE.SRGBColorSpace;
        earthTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        cloudTexture.colorSpace = THREE.SRGBColorSpace;
        cloudTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        textures.push(earthTexture, cloudTexture);

        const earthGeometry = new THREE.SphereGeometry(1.28, quality === 'high' ? 96 : 64, quality === 'high' ? 96 : 64);
        const earthMaterial = new THREE.MeshPhongMaterial({
          map: earthTexture,
          specular: new THREE.Color(0x2c5f9e),
          shininess: 11,
          emissive: new THREE.Color(0x041226),
          emissiveIntensity: 0.35,
        });
        geometries.push(earthGeometry);
        materials.push(earthMaterial);
        earth = new THREE.Mesh(earthGeometry, earthMaterial);

        const cloudGeometry = new THREE.SphereGeometry(1.291, quality === 'high' ? 80 : 56, quality === 'high' ? 80 : 56);
        const cloudMaterial = new THREE.MeshLambertMaterial({
          map: cloudTexture,
          color: 0xe8f9ff,
          transparent: true,
          opacity: quality === 'high' ? 0.55 : 0.48,
          depthWrite: false,
        });
        geometries.push(cloudGeometry);
        materials.push(cloudMaterial);
        clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);

        const glowGeometry = new THREE.SphereGeometry(1.34, 64, 64);
        const glowMaterial = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(0x4fd7ff) } },
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vWorld;
            void main() {
              vNormal = normalize(mat3(modelMatrix) * normal);
              vec4 world = modelMatrix * vec4(position, 1.0);
              vWorld = world.xyz;
              gl_Position = projectionMatrix * viewMatrix * world;
            }
          `,
          fragmentShader: `
            uniform vec3 uColor;
            varying vec3 vNormal;
            varying vec3 vWorld;
            void main() {
              vec3 viewDir = normalize(cameraPosition - vWorld);
              float rim = pow(1.0 - abs(dot(vNormal, viewDir)), 2.6);
              gl_FragColor = vec4(uColor, rim * 0.85);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
        });
        geometries.push(glowGeometry);
        materials.push(glowMaterial);
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);

        planet = new THREE.Group();
        planet.rotation.z = THREE.MathUtils.degToRad(-23.4);
        planet.rotation.x = 0.06;
        planet.add(earth, clouds, glow);
        scene.add(planet);

        const ambient = new THREE.AmbientLight(0x9fc8ff, 1.35);
        const sun = new THREE.DirectionalLight(0xfff4e0, 3.1);
        sun.position.set(-2.8, 2.2, 3.6);
        const rim = new THREE.DirectionalLight(0x32e6ff, 1.5);
        rim.position.set(3.2, -1.2, 1.2);
        const green = new THREE.DirectionalLight(0x4bf0bb, 0.75);
        green.position.set(-2.2, -2.4, -2.6);
        scene.add(ambient, sun, rim, green);

        const starCount = quality === 'high' ? 680 : 280;
        const starPositions = new Float32Array(starCount * 3);
        const starColors = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          const radius = 10 + Math.random() * 16;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
          starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
          starPositions[i * 3 + 2] = radius * Math.cos(phi) - 7;
          const tint = Math.random();
          starColors[i * 3] = 0.65 + tint * 0.35;
          starColors[i * 3 + 1] = 0.82 + tint * 0.16;
          starColors[i * 3 + 2] = 1;
        }
        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
        const starMaterial = new THREE.PointsMaterial({
          size: quality === 'high' ? 0.045 : 0.055,
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        geometries.push(starGeometry);
        materials.push(starMaterial);
        starField = new THREE.Points(starGeometry, starMaterial);
        scene.add(starField);

        const dustCount = quality === 'high' ? 130 : 55;
        const dustPositions = new Float32Array(dustCount * 3);
        for (let i = 0; i < dustCount; i++) {
          const radius = 1.7 + Math.random() * 1.8;
          const angle = Math.random() * Math.PI * 2;
          dustPositions[i * 3] = Math.cos(angle) * radius * (0.7 + Math.random() * 0.5);
          dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 2.8;
          dustPositions[i * 3 + 2] = Math.sin(angle) * radius * 0.75;
        }
        const dustGeometry = new THREE.BufferGeometry();
        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
        const dustMaterial = new THREE.PointsMaterial({
          color: 0x5ff5d2,
          size: 0.022,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        geometries.push(dustGeometry);
        materials.push(dustMaterial);
        dust = new THREE.Points(dustGeometry, dustMaterial);
        scene.add(dust);

        const resize = () => {
          if (!renderer || !camera) return;
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        pointerMove = (event: PointerEvent) => {
          if (event.pointerType !== 'mouse' || reduceMotion) return;
          pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
          pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
        };
        window.addEventListener('pointermove', pointerMove, { passive: true });

        const render = (now: number) => {
          if (disposed || !renderer || !scene || !camera) return;
          const delta = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
          lastTime = now;
          targetX += (pointerX * 0.16 - targetX) * Math.min(1, delta * 2.6);
          targetY += (pointerY * 0.1 - targetY) * Math.min(1, delta * 2.6);
          if (!reduceMotion) {
            if (earth) earth.rotation.y += delta * 0.075;
            if (clouds) clouds.rotation.y += delta * 0.089;
            if (dust) {
              dust.rotation.y -= delta * 0.04;
              dust.rotation.x = Math.sin(now / 9000) * 0.08;
            }
            if (starField) starField.rotation.y += delta * 0.004;
          }
          if (planet) {
            planet.rotation.y = targetX;
            planet.rotation.x = 0.06 + targetY * 0.5;
          }
          renderer.render(scene, camera);
          raf = requestAnimationFrame(render);
        };
        raf = requestAnimationFrame(render);

        visibility = () => {
          if (!renderer) return;
          if (document.hidden) {
            cancelAnimationFrame(raf);
            raf = 0;
          } else if (!raf) {
            lastTime = performance.now();
            raf = requestAnimationFrame(render);
          }
        };
        document.addEventListener('visibilitychange', visibility);

        setReady(true);
        onReadyRef.current?.();
      } catch {
        fail();
      }
    };

    try {
      const loader = new THREE.TextureLoader();
      const load = (url: string) => new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(url, (texture) => resolve(texture), undefined, () => reject(new Error(`Could not load ${url}`)));
      });
      Promise.all([load(EARTH_URL), load(CLOUDS_URL)])
        .then(([earthTexture, cloudTexture]) => {
          if (disposed) {
            earthTexture.dispose();
            cloudTexture.dispose();
            return;
          }
          startScene(earthTexture, cloudTexture);
        })
        .catch(fail);
    } catch {
      fail();
    }

    return () => {
      disposed = true;
      disposeAll();
    };
  }, [quality, reduceMotion]);

  return <div ref={hostRef} className="intro-three" data-ready={ready ? 'true' : 'false'} />;
}

export default IntroEarth;
