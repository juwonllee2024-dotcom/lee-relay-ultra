from pathlib import Path

root = Path(r"C:\Users\juwon\OneDrive\문서\Default Project\iphone-15-pro-3d")
experience = root / "components" / "CinematicExperience.tsx"
canvas = root / "components" / "CinematicCanvas.tsx"
overlay = root / "components" / "CinematicOverlay.tsx"
css = root / "app" / "globals.css"

def replace_between(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
start = text.index(start_marker)
end = text.index(end_marker, start)
return text[:start] + replacement + text[end:]

Runtime: add drag state for the final 360-degree scene.

text = experience.read_text(encoding="utf-8")
text = text.replace(
"""pointerY: number;
};""",
"""pointerY: number;
dragX: number;
dragY: number;
dragging: boolean;
};"""
)
text = text.replace(
"""pointerX: 0,
pointerY: 0
});""",
"""pointerX: 0,
pointerY: 0,
dragX: 0,
dragY: 0,
dragging: false
});"""
)
text = text.replace(
"""let lastUi = -1;
let lastTime = performance.now();""",
"""let lastUi = -1;
let lastTime = performance.now();
let previousPointerX = 0;
let previousPointerY = 0;"""
)

pointer_start = text.index("const onPointerMove")
pointer_end = text.index('addEventListener("pointermove"', pointer_start)
pointer_block = """const onPointerMove = (event: PointerEvent) => {
const targetX = (event.clientX / innerWidth - 0.5) * 2;
const targetY = (event.clientY / innerHeight - 0.5) * 2;
runtime.current.pointerX += (targetX - runtime.current.pointerX) * 0.16;
runtime.current.pointerY += (targetY - runtime.current.pointerY) * 0.16;

if (runtime.current.dragging) {
runtime.current.dragX += (event.clientX - previousPointerX) * 0.009;
runtime.current.dragY = Math.max(
-0.62,
Math.min(0.62, runtime.current.dragY + (event.clientY - previousPointerY) * 0.006)
);
}

previousPointerX = event.clientX;
previousPointerY = event.clientY;
};

const onPointerDown = (event: PointerEvent) => {
if (runtime.current.progress < 0.91) return;
if ((event.target as HTMLElement | null)?.closest("button, a")) return;
runtime.current.dragging = true;
previousPointerX = event.clientX;
previousPointerY = event.clientY;
document.body.classList.add("is-orbiting");
};

const onPointerUp = () => {
runtime.current.dragging = false;
document.body.classList.remove("is-orbiting");
};

"""
text = text[:pointer_start] + pointer_block + text[pointer_end:]
text = text.replace(
"""addEventListener("pointermove", onPointerMove, { passive: true });
rafId = requestAnimationFrame(tick);""",
"""addEventListener("pointermove", onPointerMove, { passive: true });
addEventListener("pointerdown", onPointerDown, { passive: true });
addEventListener("pointerup", onPointerUp, { passive: true });
addEventListener("pointercancel", onPointerUp, { passive: true });
rafId = requestAnimationFrame(tick);"""
)
text = text.replace(
"""removeEventListener("pointermove", onPointerMove);
lenis.destroy();""",
"""removeEventListener("pointermove", onPointerMove);
removeEventListener("pointerdown", onPointerDown);
removeEventListener("pointerup", onPointerUp);
removeEventListener("pointercancel", onPointerUp);
document.body.classList.remove("is-orbiting");
lenis.destroy();"""
)
experience.write_text(text, encoding="utf-8")

Canvas: replace camera choreography.

text = canvas.read_text(encoding="utf-8")
camera = r'''function CameraRig({ runtime }: { runtime: RuntimeRef }) {
const { camera } = useThree();
const desired = useMemo(() => new THREE.Vector3(), []);
const target = useMemo(() => new THREE.Vector3(), []);
const smoothTarget = useMemo(() => new THREE.Vector3(), []);

useFrame(({ clock }, delta) => {
const p = runtime.current.progress;
const lensDive = smoothstep(range(p, 0.34, 0.5));
const insideWorld = smoothstep(range(p, 0.5, 0.62));
const returnFlight = smoothstep(range(p, 0.68, 0.79));
const finale = smoothstep(range(p, 0.9, 1));

if (p < 0.34) {
desired.set(
runtime.current.pointerX * 0.08,
0.2 - runtime.current.pointerY * 0.05,
THREE.MathUtils.lerp(12.8, 9.4, smoothstep(range(p, 0, 0.16)))
);
target.set(0, -0.45, 0);
} else if (p < 0.5) {
const suction = lensDive * lensDive;
desired.set(
THREE.MathUtils.lerp(0, 0.72, suction),
THREE.MathUtils.lerp(0.1, 2.1, suction),
THREE.MathUtils.lerp(9.4, 0.52, suction)
);
target.set(
THREE.MathUtils.lerp(0, 0.72, suction),
THREE.MathUtils.lerp(-0.2, 2.1, suction),
THREE.MathUtils.lerp(0, -0.6, suction)
);
} else if (p < 0.68) {
const orbit = clock.elapsedTime * 0.18 + runtime.current.pointerX * 0.5;
desired.set(
Math.sin(orbit) * (2.4 + insideWorld * 1.2),
runtime.current.pointerY * -1.15 + Math.cos(clock.elapsedTime * 0.22) * 0.25,
4.4 - insideWorld * 1.3
);
target.set(0, 0, -3.2);
} else if (p < 0.9) {
desired.set(
THREE.MathUtils.lerp(0, -0.4, returnFlight),
THREE.MathUtils.lerp(0, 0.15, returnFlight),
THREE.MathUtils.lerp(5.8, 10.2, returnFlight)
);
target.set(0, 0, 0);
} else {
desired.set(
THREE.MathUtils.lerp(0, 0.55, finale),
THREE.MathUtils.lerp(0.15, 0.05, finale),
THREE.MathUtils.lerp(10.4, 13.4, finale)
);
target.set(0.75, 0, 0);
}

const speedBurst = Math.max(
pulse(p, 0.31, 0.35, 0.39),
pulse(p, 0.44, 0.475, 0.515),
pulse(p, 0.66, 0.7, 0.75)
);
desired.x += Math.sin(clock.elapsedTime * 81) * speedBurst * 0.035;
desired.y += Math.cos(clock.elapsedTime * 73) * speedBurst * 0.035;

const damping = 1 - Math.pow(0.00006, delta);
camera.position.lerp(desired, damping);
smoothTarget.lerp(target, damping);
camera.lookAt(smoothTarget);
});

return null;
}

'''
text = replace_between(text, "function CameraRig", "function LightRig", camera)

Add blue orbs and realistic lens sequence.

portal = r'''function BlueOrbSequence({ runtime }: { runtime: RuntimeRef }) {
const root = useRef<THREE.Group>(null);
const orbMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
const trailMaterial = useRef<THREE.PointsMaterial>(null);

const trails = useMemo(() => {
const count = 520;
const data = new Float32Array(count * 3);
for (let i = 0; i < count; i += 1) {
const lane = i % 9;
data[i * 3] = (lane - 4) * 0.18 + (Math.random() - 0.5) * 0.12;
data[i * 3 + 1] = -3.8 + Math.random() * 8;
data[i * 3 + 2] = 0.6 + (Math.random() - 0.5) * 1.4;
}
return data;
}, []);

useFrame(({ clock }) => {
const p = runtime.current.progress;
const launch = pulse(p, 0.24, 0.31, 0.39);
const suction = pulse(p, 0.34, 0.45, 0.52);
if (!root.current) return;

root.current.visible = launch > 0.001 || suction > 0.001;

root.current.children.forEach((child, index) => {
if (!(child instanceof THREE.Mesh)) return;
const phase = index / Math.max(1, root.current!.children.length - 1);
child.position.y = -2.9 + phase * 5.2 + launch * (2.5 + phase * 5.5);
child.position.x = Math.sin(clock.elapsedTime * 1.25 + index * 1.7) * (0.22 + phase * 0.3);
child.position.z = 0.7 + Math.cos(clock.elapsedTime * 0.9 + index) * 0.25;
child.scale.setScalar(0.13 + phase * 0.09 + suction * phase * 0.55);

const material = orbMaterials.current[index];
if (material) material.opacity = Math.max(launch * 0.88, suction * (0.65 - phase * 0.25));

});

if (trailMaterial.current) {
trailMaterial.current.opacity = Math.max(launch * 0.6, suction * 0.82);
trailMaterial.current.size = 0.02 + suction * 0.055;
}
});

return (
<group ref={root} visible={false}>
{Array.from({ length: 11 }).map((_, index) => (
<mesh key={index}>
<sphereGeometry args={[0.3, 24, 24]} />
<meshBasicMaterial
ref={(node) => { orbMaterials.current[index] = node; }}
color={index % 3 === 0 ? "#d8f4ff" : "#459cff"}
transparent
opacity={0}
blending={THREE.AdditiveBlending}
depthWrite={false}
/>
</mesh>
))}
<points>
<bufferGeometry>
<bufferAttribute attach="attributes-position" args={[trails, 3]} />
</bufferGeometry>
<pointsMaterial ref={trailMaterial} color="#65b9ff" size={0.025} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
</points>
</group>
);
}

function PortalSequence({ runtime }: { runtime: RuntimeRef }) {
const root = useRef<THREE.Group>(null);
const iris = useRef<THREE.Group>(null);
const glass = useRef<Array<THREE.MeshPhysicalMaterial | null>>([]);
const highlights = useRef<Array<THREE.MeshBasicMaterial | null>>([]);

const layers = useMemo(() => [
{ z: 0.12, radius: 0.33, color: "#13294a", transmission: 0.38 },
{ z: 0.15, radius: 0.285, color: "#201b45", transmission: 0.46 },
{ z: 0.182, radius: 0.23, color: "#103444", transmission: 0.55 },
{ z: 0.215, radius: 0.17, color: "#11182d", transmission: 0.62 }
], []);

useFrame(({ clock }) => {
const amount = pulse(runtime.current.progress, 0.34, 0.455, 0.54);
if (!root.current || !iris.current) return;

root.current.scale.setScalar(0.92 + amount * 0.2);
iris.current.rotation.z = -0.22 - amount * 0.65;
iris.current.scale.setScalar(1 - amount * 0.21);
root.current.rotation.z = Math.sin(clock.elapsedTime * 0.3) * 0.01;

glass.current.forEach((material, index) => {
if (!material) return;
material.opacity = 0.24 + amount * (0.1 + index * 0.025);
material.transmission = layers[index].transmission + amount * 0.08;
material.emissiveIntensity = amount * (0.025 + index * 0.012);
});

highlights.current.forEach((material, index) => {
if (material) material.opacity = amount * (0.08 - index * 0.012);
});
});

return (
<group ref={root} position={[0.72, 2.1, 0.5]}>
<mesh rotation={[Math.PI / 2, 0, 0]}>
<cylinderGeometry args={[0.53, 0.5, 0.25, 64]} />
<meshPhysicalMaterial color="#11151b" metalness={0.97} roughness={0.13} clearcoat={1} clearcoatRoughness={0.04} envMapIntensity={3.4} />
</mesh>

{[0.49, 0.405, 0.34].map((radius, index) => (
<mesh key={radius} position={[0, 0, 0.13 + index * 0.024]}>
<ringGeometry args={[radius - 0.025, radius, 64]} />
<meshPhysicalMaterial color={index === 0 ? "#414751" : "#151a22"} metalness={0.94} roughness={0.1 + index * 0.03} clearcoat={1} />
</mesh>
))}

<group ref={iris} position={[0, 0, 0.17]}>
{Array.from({ length: 9 }).map((_, index) => (
<mesh key={index} rotation={[0, 0, (index / 9) * Math.PI * 2]}>
<circleGeometry args={[0.255, 3, -0.15, Math.PI * 0.78]} />
<meshPhysicalMaterial color="#030508" metalness={0.76} roughness={0.25} side={THREE.DoubleSide} />
</mesh>
))}
</group>

{layers.map((layer, index) => (
<group key={layer.z}>
<mesh position={[0, 0, layer.z]}>
<circleGeometry args={[layer.radius, 64]} />
<meshPhysicalMaterial
ref={(node) => { glass.current[index] = node; }}
transparent
opacity={0.24}
color={layer.color}
emissive={index % 2 === 0 ? "#173f5e" : "#30255c"}
emissiveIntensity={0}
metalness={0.04}
roughness={0.014 + index * 0.006}
transmission={layer.transmission}
thickness={0.28 + index * 0.09}
ior={1.47 + index * 0.02}
clearcoat={1}
clearcoatRoughness={0.006}
iridescence={0.18 + index * 0.04}
/>
</mesh>
<mesh position={[-layer.radius * 0.2, layer.radius * 0.22, layer.z + 0.004]}>
<circleGeometry args={[layer.radius * 0.16, 24]} />
<meshBasicMaterial
ref={(node) => { highlights.current[index] = node; }}
color={index % 2 ? "#a184ff" : "#90dcff"}
transparent
opacity={0}
blending={THREE.AdditiveBlending}
depthWrite={false}
/>
</mesh>
</group>
))}
</group>
);
}

'''
text = replace_between(text, "function PortalSequence", "function DreamWorld", portal)

Make the inner world larger and interactive.

dream_start = text.index("function DreamWorld")
dream_end = text.index("function EnergyFlow", dream_start)
dream = r'''function DreamWorld({ runtime }: { runtime: RuntimeRef }) {
const root = useRef<THREE.Group>(null);
const starMat = useRef<THREE.PointsMaterial>(null);
const city = useRef<THREE.Group>(null);

const stars = useMemo(() => {
const count = 2200;
const data = new Float32Array(count * 3);
for (let i = 0; i < count; i += 1) {
const radius = 3 + Math.random() * 22;
const angle = Math.random() * Math.PI * 2;
const height = (Math.random() - 0.5) * 13;
data[i * 3] = Math.cos(angle) * radius;
data[i * 3 + 1] = height;
data[i * 3 + 2] = -4 + Math.sin(angle) * radius;
}
return data;
}, []);

useFrame(({ clock }, delta) => {
const amount = pulse(runtime.current.progress, 0.47, 0.58, 0.72);
if (!root.current || !starMat.current || !city.current) return;

root.current.visible = amount > 0.001;
root.current.rotation.y += delta * (0.035 + runtime.current.pointerX * 0.018);
root.current.rotation.x = runtime.current.pointerY * 0.08;
starMat.current.opacity = amount * 0.9;

city.current.rotation.y = clock.elapsedTime * 0.075 + runtime.current.pointerX * 0.55;
city.current.position.y = Math.sin(clock.elapsedTime * 0.42) * 0.16;
city.current.scale.setScalar(0.42 + amount * 0.72);
});

return (
<group ref={root} visible={false}>
<points>
<bufferGeometry>
<bufferAttribute attach="attributes-position" args={[stars, 3]} />
</bufferGeometry>
<pointsMaterial ref={starMat} color="#dff5ff" size={0.026} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
</points>

<group ref={city} position={[0, 0, -3.3]}>
<mesh rotation={[Math.PI / 2, 0, 0]}>
<torusGeometry args={[2.5, 0.07, 16, 128]} />
<meshStandardMaterial color="#142745" emissive="#3c8cff" emissiveIntensity={1.8} metalness={0.75} roughness={0.18} />
</mesh>

{Array.from({ length: 24 }).map((_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  const radius = 1.15 + (index % 4) * 0.34;
  const height = 0.55 + (index % 7) * 0.16;
  return (
    <group key={index} position={[Math.cos(angle) * radius, Math.sin(angle * 1.4) * 0.45, Math.sin(angle) * radius]}>
      <RoundedBox args={[0.18, height, 0.18]} radius={0.035} smoothness={4}>
        <meshPhysicalMaterial color={index % 3 === 0 ? "#16385d" : "#171b35"} metalness={0.72} roughness={0.2} emissive={index % 3 === 0 ? "#238dff" : "#6f4dff"} emissiveIntensity={0.75} clearcoat={0.8} />
      </RoundedBox>
      <pointLight color={index % 2 ? "#4db8ff" : "#9d75ff"} intensity={3.5} distance={1.2} />
    </group>
  );
})}

<RoundedBox args={[1.7, 1.7, 0.22]} radius={0.16} smoothness={6}>
  <meshPhysicalMaterial color="#0b0e17" metalness={0.9} roughness={0.14} clearcoat={1} envMapIntensity={3.2} />
</RoundedBox>
<mesh position={[0, 0, 0.13]}>
  <planeGeometry args={[1.15, 1.15]} />
  <meshBasicMaterial color="#7b83ff" transparent opacity={0.26} blending={THREE.AdditiveBlending} />
</mesh>
</group> </group> ); }

'''
text = text[:dream_start] + dream + text[dream_end:]

Final phone framing and 360 rotation.

text = text.replace(
"const landing = smoothstep(range(p, 0.955, 1));",
"const landing = smoothstep(range(p, 0.9, 1));\nconst finalOrbit = smoothstep(range(p, 0.9, 0.98));"
)
old_transform = """root.current.scale.setScalar(0.12 + reveal * 0.9 + landing * 0.03);
root.current.position.z = -4.8 + reveal * 4.8;
root.current.position.y = landing * -0.32;
root.current.rotation.x = -0.12 + Math.sin(p * Math.PI * 2.6) * 0.055;
root.current.rotation.y = THREE.MathUtils.lerp(-0.72, 0.62, beauty) + explode * 0.28 + smoothstep(range(p, 0.33, 0.405)) * 2.15 + landing * 0.42;
root.current.rotation.z = runtime.current.pointerY * -0.02;"""
new_transform = """root.current.scale.setScalar(0.12 + reveal * 0.86);
root.current.position.z = -4.8 + reveal * 4.8;
root.current.position.x = landing * 1.35;
root.current.position.y = -0.55 + landing * 0.55;
const idleOrbit = runtime.current.dragging ? 0 : Math.sin(clock.elapsedTime * 0.32) * 0.22;
root.current.rotation.x = -0.12 + Math.sin(p * Math.PI * 2.6) * 0.055 + finalOrbit * (runtime.current.dragY + Math.sin(clock.elapsedTime * 0.25) * 0.025);
root.current.rotation.y = THREE.MathUtils.lerp(-0.72, 0.62, beauty) + explode * 0.28 + smoothstep(range(p, 0.33, 0.405)) * 2.15 + landing * 0.2 + finalOrbit * (runtime.current.dragX + idleOrbit);
root.current.rotation.z = runtime.current.pointerY * -0.02 * (1 - finalOrbit);"""
if old_transform not in text:
raise RuntimeError("Phone transform block not found")
text = text.replace(old_transform, new_transform)

text = text.replace(
"""<PhoneSystem runtime={runtime} />
<PortalSequence runtime={runtime} />""",
"""<PhoneSystem runtime={runtime} />
<BlueOrbSequence runtime={runtime} />
<PortalSequence runtime={runtime} />"""
)
canvas.write_text(text, encoding="utf-8")

Overlay copy for the new sequence and 360 finale.

text = overlay.read_text(encoding="utf-8")
text = text.replace(
'{ id: "portal", index: "04", label: "OPTICS", title: "Beyond the glass.", body: "The lens expands from an object into a passage, carrying the same light into another world." },',
'{ id: "portal", index: "04", label: "OPTICAL DIVE", title: "Fall through the lens.", body: "Blue energy rises, gravity reverses, and the camera is pulled into the optical system at impossible speed." },'
)
text = text.replace(
'{ id: "intelligence", index: "05", label: "A19 PRO", title: "A universe within.", body: "Silicon becomes stars. Neural pathways become constellations. Intelligence becomes space." },',
'{ id: "intelligence", index: "05", label: "INNER WORLD", title: "A world inside.", body: "Beyond the lens, an explorable three-dimensional city of light unfolds around the A19 Pro." },'
)
text = text.replace(
"""<h1>Power.<br />Refined.</h1>
<button type="button">""",
"""<h1>Power.<br />Refined.</h1>
<small className="final-card__orbit">DRAG ANYWHERE · EXPLORE THE PHONE IN 360°</small>
<button type="button">"""
)
overlay.write_text(text, encoding="utf-8")

CSS for final interactive view.

styles = css.read_text(encoding="utf-8")
if "final-card__orbit" not in styles:
styles += r'''

/* Dramatic interactive finale */
.chapter--final {
justify-content: flex-start;
align-items: center;
padding-left: clamp(30px, 7vw, 130px);
text-align: left;
cursor: grab;
user-select: none;
}

body.is-orbiting .chapter--final {
cursor: grabbing;
}

.final-card {
width: min(44vw, 650px);
}

.final-card h1 {
font-size: clamp(62px, 8.5vw, 142px);
}

.final-card__orbit {
display: block;
margin-top: 26px;
color: rgba(185, 222, 255, 0.72);
font-size: 9px;
font-weight: 700;
letter-spacing: 0.25em;
text-shadow: 0 0 20px rgba(70, 150, 255, 0.35);
}

@media (max-width: 760px) {
.chapter--final {
justify-content: flex-end;
align-items: flex-start;
padding: 0 24px 14vh;
text-align: center;
}

.final-card {
width: 100%;
}

.final-card h1 {
font-size: clamp(58px, 19vw, 104px);
}

.final-card__orbit {
margin-top: 18px;
font-size: 8px;
letter-spacing: 0.16em;
}
}
'''
css.write_text(styles, encoding="utf-8")

print("Applied dramatic blue-orb launch, optical dive, inner 3D world, full-phone finale, and 360 drag.")
