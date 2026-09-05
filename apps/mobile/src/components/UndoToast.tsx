import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { cornerCurve, radius, space, type } from "../theme";
import type { Palette } from "../theme";

/**
 * Undo instead of "are you sure?" (design doc §7.1, §7.10). The destructive
 * action hasn't happened yet while this is on screen — it commits when the
 * toast expires — so undo is genuinely free rather than a second write.
 */
export function UndoToast({
  message,
  palette,
  durationMs = 5000,
  onUndo,
  onExpire,
}: {
  message: string;
  palette: Palette;
  durationMs?: number;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onExpire, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onExpire]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(200)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(150)}
      style={{ position: "absolute", left: space.md, right: space.md, bottom: space.xl }}
    >
      <View
        style={[
          {
            backgroundColor: palette.label,
            borderRadius: radius.inner,
            paddingVertical: space.sm + 4,
            paddingHorizontal: space.md,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.md,
          },
          cornerCurve,
        ]}
      >
        <Text style={[type.footnote, { color: palette.bg, flex: 1 }]} numberOfLines={1}>
          {message}
        </Text>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onUndo();
          }}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          hitSlop={12}
        >
          <Text style={[type.footnote, { color: palette.accent, fontWeight: "600" }]}>Undo</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
