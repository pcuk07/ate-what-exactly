import { Pressable, Text, View } from "react-native";
import { cornerCurve, radius, space, type } from "../theme";
import type { Palette } from "../theme";

/**
 * App Store guideline 5.1.2(i), in force since November 2025: name the
 * third-party AI provider, say what is shared, and get explicit permission
 * before the first transmission (design doc §10.3).
 *
 * Shown the first time the shutter is pressed on a plate — not buried in
 * onboarding — and declining leaves barcode and manual logging fully usable.
 */
export function ConsentSheet({
  palette,
  onAccept,
  onDecline,
}: {
  palette: Palette;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={{ padding: space.lg, gap: space.md }}>
      <Text style={[type.largeTitle, { color: palette.label }]}>Send this photo to Claude?</Text>
      <Text style={[type.body, { color: palette.label, lineHeight: 24 }]}>
        To estimate this meal, the photo is sent to Anthropic's Claude. It is resized first, has its
        location data removed, and Anthropic does not use it to train their models.
      </Text>
      <Text style={[type.footnote, { color: palette.label2, lineHeight: 20 }]}>
        Your name, email and goals are never sent with it. You can scan barcodes and log meals by hand
        without this.
      </Text>

      <View style={{ gap: space.sm, marginTop: space.sm }}>
        <Pressable
          onPress={onAccept}
          accessibilityRole="button"
          style={[
            {
              backgroundColor: palette.accent,
              paddingVertical: space.md,
              borderRadius: radius.inner,
              alignItems: "center",
            },
            cornerCurve,
          ]}
        >
          <Text style={[type.headline, { color: palette.accentInk }]}>Send photo</Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          accessibilityRole="button"
          style={{ alignItems: "center", padding: space.md }}
        >
          <Text style={[type.body, { color: palette.label2 }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}
