import { useState, useEffect } from "react";
import type { CitySnapshot } from "./ir";

interface SchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: CitySnapshot | null;
  onSelectQuery?: (sql: string) => void;
}

export function SchemaModal({ isOpen, onClose, city, onSelectQuery }: SchemaModalProps) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  useEffect(() => {
    if (city?.districts.length && !selectedTable) {
      setSelectedTable(city.districts[0].tableName);
    }
  }, [city, selectedTable]);

  if (!isOpen) return null;

  const currentDistrict = city?.districts.find((d) => d.tableName === selectedTable);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 5, 12, 0.8)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          background: "#080c18",
          border: "1px solid #1a2340",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          color: "#e8ecff",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #1a2340",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, color: "#ffe14d", fontWeight: 700 }}>
              Database Schema & Table Explorer
            </h2>
            <div style={{ fontSize: 11, color: "#5a6a8f", marginTop: 2 }}>
              Inspect physical tables, columns, indexes, and relationships.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#5a6a8f",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Table List Sidebar */}
          <div
            style={{
              width: 200,
              borderRight: "1px solid #1a2340",
              background: "#05070d",
              overflowY: "auto",
              padding: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#5a6a8f",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
                padding: "4px 8px",
              }}
            >
              Tables ({city?.districts.length || 0})
            </div>
            {city?.districts.map((d) => (
              <button
                key={d.tableName}
                onClick={() => setSelectedTable(d.tableName)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: selectedTable === d.tableName ? "#1a2340" : "transparent",
                  color: selectedTable === d.tableName ? "#ffe14d" : "#8fa0cc",
                  fontSize: 12,
                  fontWeight: selectedTable === d.tableName ? 600 : 400,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 2,
                }}
              >
                <span>{d.tableName}</span>
                <span style={{ fontSize: 9, color: "#3d4a70" }}>
                  {d.estimatedRowCount.toLocaleString()} rows
                </span>
              </button>
            ))}
            {(!city || city.districts.length === 0) && (
              <div style={{ padding: "12px 8px", fontSize: 11, color: "#5a6a8f" }}>
                No tables detected. Ensure PostgreSQL is connected.
              </div>
            )}
          </div>

          {/* Details Pane */}
          <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
            {currentDistrict ? (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: "#e8ecff" }}>
                      {currentDistrict.tableName}
                    </h3>
                    <div style={{ fontSize: 11, color: "#4aff8a", marginTop: 2 }}>
                      Scale: {currentDistrict.scale} · ~{currentDistrict.estimatedRowCount.toLocaleString()} rows
                    </div>
                  </div>
                  {onSelectQuery && (
                    <button
                      onClick={() => {
                        onSelectQuery(`SELECT * FROM ${currentDistrict.tableName} LIMIT 50;`);
                        onClose();
                      }}
                      style={{
                        background: "#1a2340",
                        color: "#8fb0ff",
                        border: "1px solid #2a3a60",
                        borderRadius: 6,
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Query Table
                    </button>
                  )}
                </div>

                {/* Columns */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: "#5a6a8f", fontWeight: 600, marginBottom: 6 }}>
                    COLUMNS ({currentDistrict.columns.length})
                  </div>
                  <div
                    style={{
                      background: "#05070d",
                      border: "1px solid #1a2340",
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    {currentDistrict.columns.map((col, idx) => (
                      <div
                        key={col}
                        style={{
                          padding: "6px 12px",
                          borderBottom: idx < currentDistrict.columns.length - 1 ? "1px solid #0e162b" : "none",
                          fontSize: 12,
                          color: "#8fa0cc",
                          fontFamily: "monospace",
                        }}
                      >
                        {col}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Indexes */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: "#5a6a8f", fontWeight: 600, marginBottom: 6 }}>
                    INDEXES ({currentDistrict.indexes.length})
                  </div>
                  {currentDistrict.indexes.length > 0 ? (
                    <div
                      style={{
                        background: "#05070d",
                        border: "1px solid #1a2340",
                        borderRadius: 6,
                        overflow: "hidden",
                      }}
                    >
                      {currentDistrict.indexes.map((idx, i) => (
                        <div
                          key={idx.indexName}
                          style={{
                            padding: "8px 12px",
                            borderBottom: i < currentDistrict.indexes.length - 1 ? "1px solid #0e162b" : "none",
                            fontSize: 11,
                          }}
                        >
                          <div style={{ color: "#ffe14d", fontWeight: 600, fontFamily: "monospace" }}>
                            {idx.indexName} {idx.isPrimary && <span style={{ color: "#4aff8a" }}>(PRIMARY)</span>}{" "}
                            {idx.isUnique && !idx.isPrimary && <span style={{ color: "#8fb0ff" }}>(UNIQUE)</span>}
                          </div>
                          <div style={{ color: "#5a6a8f", fontSize: 10, marginTop: 2 }}>
                            Columns: {idx.columns.join(", ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#5a6a8f" }}>
                      No secondary indexes on this table.
                    </div>
                  )}
                </div>

                {/* Foreign Keys */}
                <div>
                  <div style={{ fontSize: 11, color: "#5a6a8f", fontWeight: 600, marginBottom: 6 }}>
                    FOREIGN KEYS / BRIDGES ({currentDistrict.foreignKeys.length})
                  </div>
                  {currentDistrict.foreignKeys.length > 0 ? (
                    <div
                      style={{
                        background: "#05070d",
                        border: "1px solid #1a2340",
                        borderRadius: 6,
                        overflow: "hidden",
                      }}
                    >
                      {currentDistrict.foreignKeys.map((fk, i) => (
                        <div
                          key={fk.constraintName}
                          style={{
                            padding: "8px 12px",
                            borderBottom: i < currentDistrict.foreignKeys.length - 1 ? "1px solid #0e162b" : "none",
                            fontSize: 11,
                          }}
                        >
                          <div style={{ color: "#8fb0ff" }}>
                            {fk.columns.join(", ")} → {fk.foreignTable} ({fk.foreignColumns.join(", ")})
                          </div>
                          <div style={{ color: "#3d4a70", fontSize: 10, marginTop: 2 }}>
                            Constraint: {fk.constraintName}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#5a6a8f" }}>
                      No foreign keys defined.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: "#5a6a8f", fontSize: 12 }}>
                Select a table to view details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
