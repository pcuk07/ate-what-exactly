import { Text, View } from "react-native";
import type { Goals, Macros } from "@awe/core";
import { radius, space, type } from "../theme";
import type { Palette } from "../theme";

/**
 * Progress toward each macro goal. One accent for all four: colour here means
 * "progress", not "category", so it stays free to mean state elsewhere
 * (design doc §7.10, rejected rainbow macros).
 */
export function MacroMeters({
  totals,
  goals,
  palette,
}: {
  totals: Macros;
  goals: Goals;
  palette: Palette;
}) {
  const rows: { label: string; value: number; goal: number }[] = [
    { label: "Protein", value: totals.proteinG, goal: goals.proteinG },
    { label: "Carbs", value: totals.carbsG, goal: goals.carbsG },
    { label: "Fat", value: totals.fatG, goal: goals.fatG },
    { label: "Fibre", value: totals.fibreG, goal: goals.fibreG },
  ];

  return (
    <View style={{ gap: space.md }}>
      {rows.map((row) => {
        const pct = row.goal > 0 ? Math.min(row.value / row.goal, 1) : 0;
        return (
          <View
            key={row.label}
            accessible
            accessibilityLabel={`${row.label}, ${Math.round(row.value)} of ${row.goal} grams`}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space.xs }}>
              <Text style={[type.footnote, { color: palette.label, fontWeight: "600" }]}>{row.label}</Text>
              <Text style={[type.footnote, { color: palette.label2, fontVariant: ["tabular-nums"] }]}>
                {Math.round(row.value)} / {row.goal} g
              </Text>
            </View>
            <View
              style={{
                height: 7,
                borderRadius: radius.pill,
                backgroundColor: palette.separator,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${pct * 100}%`,
                  height: "100%",
                  backgroundColor: palette.accent,
                  borderRadius: radius.pill,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
