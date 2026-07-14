import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CitySnapshot, VisualOperation, VisualTimeline } from "./ir";

interface CitySceneProps {
  timeline: VisualTimeline | null;
  playheadMs: number;
  city: CitySnapshot | null;
  hoveredOpId: string | null;
}

export function CityScene({ timeline, playheadMs, city, hoveredOpId }: CitySceneProps) {
  const activeOp = useMemo(() => {
    if (!timeline) return null;
    return (
      timeline.operations.find(
        (op) => playheadMs >= op.startTime && playheadMs < op.startTime + op.duration
      ) || null
    );
  }, [timeline, playheadMs]);

  // If the user hovers/selects an op in the Plan Tree, that op's district
  // is highlighted even outside of active playback.
  const highlightedOp =
    (hoveredOpId && timeline?.operations.find((o) => o.id === hoveredOpId)) || activeOp;

  // Calculate district positions procedurally
  const districtPositions = useMemo(() => {
    if (!city?.districts.length) return new Map();
    const positions = new Map<string, { x: number; z: number }>();
    const count = city.districts.length;
    
    // Arrange districts in a grid layout
    const cols = Math.ceil(Math.sqrt(count));
    const spacing = 40;
    
    city.districts.forEach((district, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = (col - (cols - 1) / 2) * spacing;
      const z = (row - (Math.ceil(count / cols) - 1) / 2) * spacing;
      positions.set(district.tableName, { x, z });
    });
    
    return positions;
  }, [city]);

  return (
    <group>
      <ambientLight intensity={0.35} />
      <directionalLight position={[20, 40, 10]} intensity={0.6} color="#88aaff" />
      <fog attach="fog" args={["#05070d", 30, 120]} />
      
      {city?.districts.map((district) => {
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
              allDistricts={city.districts}
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
  district: import("./ir").District;
  activeOp: VisualOperation | null;
  playheadMs: number;
  isPlaybackActive: boolean;
}) {
  const rowCount = district.estimatedRowCount;
  const gridSize = district.gridSize;

  // Procedural generation: village (8x8) / town (20x20) / megacity (40x40),
  // driven entirely by the district's real row count from the backend.
  const buildings = useMemo(() => {
    const arr: { x: number; z: number; height: number; rowId: number }[] = [];
    let seed = 1337 + district.tableName.length; // Seed based on table name for consistency
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const spacing = gridSize > 24 ? 1.1 : gridSize > 10 ? 1.4 : 1.9;
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const rowId = Math.floor(rand() * rowCount);
        arr.push({
          x: (x - gridSize / 2) * spacing,
          z: (z - gridSize / 2) * spacing,
          height: 0.5 + rand() * 3.5,
          rowId,
        });
      }
    }
    return arr;
  }, [rowCount, gridSize, district.tableName]);

  // The single "needle" building the demo query is looking for (row id 42 = alice@example.com)
  const needleIndex = useMemo(
    () => buildings.findIndex((b) => b.rowId % 1000 === 42),
    [buildings]
  );

  const scanProgress = useMemo(() => {
    if (!activeOp || !isPlaybackActive) return isPlaybackActive ? 0 : 1;
    const t = (playheadMs - activeOp.startTime) / activeOp.duration;
    return Math.max(0, Math.min(1, t));
  }, [activeOp, playheadMs, isPlaybackActive]);

  const isScan = activeOp?.type === "scan";
  const isBeam = activeOp?.type === "beam" || activeOp?.type === "bitmap";
  const scanFrontIndex = Math.floor(scanProgress * buildings.length);

  return (
    <group>
      {isBeam && needleIndex >= 0 && (
        <Beam target={buildings[needleIndex]} progress={scanProgress} />
      )}
      {buildings.map((b, i) => {
        const isTarget = i === needleIndex;
        let lit = false;
        let color = "#2a3556";

        if (isScan) {
          lit = i <= scanFrontIndex;
          color = isTarget && lit ? "#ff3d5e" : lit ? "#4d7cff" : "#1a2340";
        } else if (isBeam) {
          lit = isTarget && scanProgress > 0.3;
          color = isTarget ? "#ff3d5e" : "#1a2340";
        } else if (activeOp) {
          // A plan-tree selection with no live playback: softly highlight the whole district.
          lit = true;
          color = isTarget ? "#ff3d5e" : "#3a4a7a";
        } else {
          color = isTarget ? "#ff3d5e" : "#2a3556";
        }

        return (
          <mesh key={i} position={[b.x, b.height / 2, b.z]} castShadow>
            <boxGeometry args={[0.8, b.height, 0.8]} />
            <meshStandardMaterial
              color={color}
              emissive={lit ? color : "#000000"}
              emissiveIntensity={lit ? (isTarget ? 1.2 : 0.3) : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function ForeignKeyBridges({
  district,
  allDistricts,
  districtPositions,
}: {
  district: import("./ir").District;
  allDistricts: import("./ir").District[];
  districtPositions: Map<string, { x: number; z: number }>;
}) {
  const bridges = useMemo(() => {
    return district.foreignKeys.map((fk) => {
      const targetDistrict = allDistricts.find((d) => d.tableName === fk.foreignTable);
      if (!targetDistrict) return null;
      
      const fromPos = districtPositions.get(district.tableName) || { x: 0, z: 0 };
      const toPos = districtPositions.get(fk.foreignTable) || { x: 0, z: 0 };
      
      return {
        from: fromPos,
        to: toPos,
        constraintName: fk.constraintName,
      };
    }).filter(Boolean);
  }, [district.foreignKeys, allDistricts, districtPositions, district.tableName]);

  return (
    <>
      {bridges.map((bridge, i) => {
        if (!bridge) return null;
        const midX = (bridge.from.x + bridge.to.x) / 2;
        const midZ = (bridge.from.z + bridge.to.z) / 2;
        const length = Math.sqrt(
          Math.pow(bridge.to.x - bridge.from.x, 2) + Math.pow(bridge.to.z - bridge.from.z, 2)
        );
        const angle = Math.atan2(bridge.to.z - bridge.from.z, bridge.to.x - bridge.from.x);

        return (
          <group key={i} position={[midX, 2, midZ]} rotation={[0, -angle, 0]}>
            <mesh>
              <boxGeometry args={[length, 0.3, 1.5]} />
              <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={0.3} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Beam({
  target,
  progress,
}: {
  target: { x: number; z: number; height: number };
  progress: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.scale.y = Math.min(1, progress * 2.5);
  });

  return (
    <mesh ref={ref} position={[target.x, 6, target.z]}>
      <cylinderGeometry args={[0.15, 0.4, 12, 8]} />
      <meshBasicMaterial color="#ffe14d" transparent opacity={0.7} />
    </mesh>
  );
}
