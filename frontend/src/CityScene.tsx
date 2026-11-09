import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CitySnapshot, VisualOperation, VisualTimeline, District as DistrictType } from "./ir";

interface CitySceneProps {
  timeline: VisualTimeline | null;
  playheadMs: number;
  city: CitySnapshot | null;
  hoveredOpId: string | null;
}

const DEFAULT_DEMO_DISTRICTS: DistrictType[] = [
  {
    tableName: "users",
    estimatedRowCount: 100000,
    columns: ["id", "email", "name", "salary", "department", "created_at"],
    indexes: [
      { indexName: "users_pkey", columns: ["id"], isUnique: true, isPrimary: true },
      { indexName: "idx_users_email", columns: ["email"], isUnique: false, isPrimary: false },
    ],
    foreignKeys: [],
    scale: "megacity",
    gridSize: 40,
  },
];

export function CityScene({ timeline, playheadMs, city, hoveredOpId }: CitySceneProps) {
  const activeOp = useMemo(() => {
    if (!timeline) return null;
    return (
      timeline.operations.find(
        (op) => playheadMs >= op.startTime && playheadMs < op.startTime + op.duration
      ) || null
    );
  }, [timeline, playheadMs]);

  const highlightedOp =
    (hoveredOpId && timeline?.operations.find((o) => o.id === hoveredOpId)) || activeOp;

  const effectiveDistricts = useMemo(() => {
    if (city?.districts && city.districts.length > 0) {
      return city.districts;
    }
    return DEFAULT_DEMO_DISTRICTS;
  }, [city]);

  // Calculate district positions procedurally
  const districtPositions = useMemo(() => {
    const positions = new Map<string, { x: number; z: number }>();
    const count = effectiveDistricts.length;

    // Arrange districts in a grid layout
    const cols = Math.ceil(Math.sqrt(count));
    const spacing = 40;

    effectiveDistricts.forEach((district, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = (col - (cols - 1) / 2) * spacing;
      const z = (row - (Math.ceil(count / cols) - 1) / 2) * spacing;
      positions.set(district.tableName, { x, z });
    });

    return positions;
  }, [effectiveDistricts]);

  return (
    <group>
      <ambientLight intensity={0.35} />
      <directionalLight position={[20, 40, 10]} intensity={0.6} color="#88aaff" />
      <fog attach="fog" args={["#05070d", 30, 120]} />

      {effectiveDistricts.map((district) => {
        const position = districtPositions.get(district.tableName) || { x: 0, z: 0 };
        const isHighlighted = highlightedOp?.district === district.tableName;

        return (
          <group key={district.tableName} position={[position.x, 0, position.z]}>
            <District
              district={district}
              activeOp={isHighlighted ? highlightedOp : null}
              playheadMs={playheadMs}
              isPlaybackActive={!hoveredOpId}
            />
            <ForeignKeyBridges
              district={district}
              allDistricts={effectiveDistricts}
              districtPositions={districtPositions}
            />
          </group>
        );
      })}

      <gridHelper args={[120, 60, "#1a2440", "#111a30"]} position={[0, -0.01, 0]} />
    </group>
  );
}

function District({
  district,
  activeOp,
  playheadMs,
  isPlaybackActive,
}: {
  district: DistrictType;
  activeOp: VisualOperation | null;
  playheadMs: number;
  isPlaybackActive: boolean;
}) {
  const rowCount = district.estimatedRowCount;
  const gridSize = district.gridSize;

  const buildings = useMemo(() => {
    const arr: { x: number; z: number; height: number; rowId: number }[] = [];
    let seed = 1337 + district.tableName.length;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const half = gridSize / 2;
    for (let x = -half; x < half; x += 2) {
      for (let z = -half; z < half; z += 2) {
        if (arr.length >= rowCount && rowCount < 1000) break;
        const h = 0.5 + rand() * (district.scale === "megacity" ? 6 : 2.5);
        arr.push({ x, z, height: h, rowId: arr.length });
      }
    }
    return arr;
  }, [district, rowCount, gridSize]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (!meshRef.current) return;

    const opType = activeOp?.type;
    const progress =
      activeOp && isPlaybackActive
        ? Math.min(1, Math.max(0, (playheadMs - activeOp.startTime) / activeOp.duration))
        : activeOp
        ? 1
        : 0;

    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.height / 2, b.z);
      dummy.scale.set(1.4, b.height, 1.4);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      if (!activeOp) {
        color.set("#152238");
      } else if (opType === "scan") {
        const threshold = progress * buildings.length;
        if (i < threshold) {
          color.set("#ff5a6e");
        } else if (i < threshold + 4) {
          color.set("#ffe14d");
        } else {
          color.set("#1a2b48");
        }
      } else if (opType === "beam") {
        if (b.rowId === 42 || i % 17 === 0) {
          color.set("#4aff8a");
        } else {
          color.set("#152238");
        }
      } else if (opType === "fold" || opType === "traffic") {
        color.set("#9b51e0");
      } else {
        color.set("#ffe14d");
      }

      meshRef.current!.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, buildings.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} metalness={0.6} />
      </instancedMesh>

      {/* District Ground Base */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[gridSize + 4, 0.2, gridSize + 4]} />
        <meshStandardMaterial
          color={activeOp ? "#1c2b4a" : "#0d1424"}
          roughness={0.8}
        />
      </mesh>

      {/* District Roads / Indexes */}
      {district.indexes.map((idx, i) => (
        <Road key={idx.indexName} index={i} gridSize={gridSize} isPrimary={idx.isPrimary} />
      ))}
    </group>
  );
}

function Road({ index, gridSize, isPrimary }: { index: number; gridSize: number; isPrimary: boolean }) {
  const offset = (index + 1) * 3 - gridSize / 2;
  return (
    <mesh position={[offset, 0.02, 0]}>
      <planeGeometry args={[1, gridSize]} />
      <meshBasicMaterial
        color={isPrimary ? "#ffe14d" : "#4d7cff"}
        wireframe={false}
        opacity={0.3}
        transparent
      />
    </mesh>
  );
}

function ForeignKeyBridges({
  district,
  allDistricts,
  districtPositions,
}: {
  district: DistrictType;
  allDistricts: DistrictType[];
  districtPositions: Map<string, { x: number; z: number }>;
}) {
  const currentPos = districtPositions.get(district.tableName) || { x: 0, z: 0 };

  return (
    <group>
      {district.foreignKeys.map((fk) => {
        const targetPos = districtPositions.get(fk.foreignTable);
        if (!targetPos) return null;

        const start = new THREE.Vector3(0, 0.5, 0);
        const end = new THREE.Vector3(
          targetPos.x - currentPos.x,
          0.5,
          targetPos.z - currentPos.z
        );

        const mid = start.clone().lerp(end, 0.5);
        mid.y += 4;

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const points = curve.getPoints(20);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        return (
          <line key={fk.constraintName} geometry={geometry}>
            <lineBasicMaterial color="#ffe14d" opacity={0.4} transparent />
          </line>
        );
      })}
    </group>
  );
}
