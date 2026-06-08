// IDEA-009: Units of Measure hook.
//
// NOTE (deviation from master prompt sample): RoastLogs stores temperatures in
// Fahrenheit (the Session Header / brew inputs are labelled °F, placeholder 205)
// and weights in grams. The prompt's sample assumed Celsius-stored values; that
// would be wrong for this codebase. Stored values are NEVER changed — these
// helpers only convert at the display layer. The canonical stored temp unit is °F.
import { useState, useCallback } from "react";

export function useUnits() {
  const [tempUnit, setTempUnitState] = useState(
    () => localStorage.getItem("roastlogs_temp_unit") || "F"
  );
  const [weightUnit, setWeightUnitState] = useState(
    () => localStorage.getItem("roastlogs_weight_unit") || "g"
  );

  const setTempUnit = useCallback((unit) => {
    const next = unit === "C" ? "C" : "F";
    localStorage.setItem("roastlogs_temp_unit", next);
    setTempUnitState(next);
  }, []);

  const setWeightUnit = useCallback((unit) => {
    const next = unit === "oz" ? "oz" : "g";
    localStorage.setItem("roastlogs_weight_unit", next);
    setWeightUnitState(next);
  }, []);

  // Stored value is Fahrenheit. Display in the user's chosen unit.
  const toDisplayTemp = useCallback(
    (fahrenheit) => {
      if (fahrenheit === null || fahrenheit === undefined || fahrenheit === "") return "—";
      const f = Number(fahrenheit);
      if (Number.isNaN(f)) return "—";
      if (tempUnit === "C") return Math.round(((f - 32) * 5) / 9) + "°C";
      return Math.round(f) + "°F";
    },
    [tempUnit]
  );

  // Stored value is grams. Display in the user's chosen unit.
  const toDisplayWeight = useCallback(
    (grams) => {
      if (grams === null || grams === undefined || grams === "") return "—";
      const g = Number(grams);
      if (Number.isNaN(g)) return "—";
      if (weightUnit === "oz") return (g / 28.3495).toFixed(1) + " oz";
      return g + "g";
    },
    [weightUnit]
  );

  return { tempUnit, weightUnit, setTempUnit, setWeightUnit, toDisplayTemp, toDisplayWeight };
}
