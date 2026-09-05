import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { scaleMacros, type Food } from "@awe/core";
import { cornerCurve, radius, space, type } from "../theme";
import type { Palette } from "../theme";

/**
 * Confirming a scanned product (design doc §5.1). The label serving is
 * prefilled so the common case is one tap, but the weight is always visible
 * and editable — silently assuming a serving would quietly turn Tier A label
 * data into a guess about how much you ate.
 */
export function BarcodeSheet({
  food,
  palette,
  busy,
  onConfirm,
  onCancel,
}: {
  food: Food;
  palette: Palette;
  busy: boolean;
  onConfirm: (grams: number) => void;
  onCancel: () => void;
}) {
  const [grams, setGrams] = useState(String(Math.round(food.servingG ?? 100)));

  const parsed = Number(grams);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 3000;
  const preview = valid ? scaleMacros(food.per100g, parsed) : null;

  return (
    <View style={{ padding: space.lg, gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text style={[type.largeTitle, { color: palette.label }]}>{food.name}</Text>
        {food.brand ? (
          <Text style={[type.body, { color: palette.label2 }]}>{food.brand}</Text>
        ) : null}
        <Text style={[type.footnote, { color: palette.label2 }]}>
          {Math.round(food.per100g.kcal)} kcal per 100 g
          {food.servingG ? ` · label serving ${Math.round(food.servingG)} g` : ""}
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[type.headline, { color: palette.label }]}>How much did you have?</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <TextInput
            value={grams}
            onChangeText={setGrams}
            keyboardType="number-pad"
            selectTextOnFocus
            accessibilityLabel="Weight in grams"
            style={[
              type.hero,
              { color: palette.label, fontSize: 34, minWidth: 110, paddingVertical: space.sm },
            ]}
          />
          <Text style={[type.body, { color: palette.label2 }]}>grams</Text>
        </View>
        <Text style={[type.subheadline, { color: palette.label2 }]}>
          {preview
            ? `${Math.round(preview.kcal)} kcal · P ${Math.round(preview.proteinG)} · C ${Math.round(
                preview.carbsG,
              )} · F ${Math.round(preview.fatG)}`
            : "Enter a weight between 1 and 3000 g."}
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Pressable
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onConfirm(parsed);
          }}
          disabled={!valid || busy}
          accessibilityRole="button"
          style={[
            {
              backgroundColor: palette.accent,
              paddingVertical: space.md,
              borderRadius: radius.inner,
              alignItems: "center",
              opacity: !valid || busy ? 0.5 : 1,
            },
            cornerCurve,
          ]}
        >
          <Text style={[type.headline, { color: palette.accentInk }]}>
            {busy ? "Logging…" : "Log it"}
          </Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ alignItems: "center", padding: space.sm }}>
          <Text style={[type.body, { color: palette.label2 }]}>Scan something else</Text>
        </Pressable>
      </View>
    </View>
  );
}
