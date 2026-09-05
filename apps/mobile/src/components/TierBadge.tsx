import { Text, View } from "react-native";
import { describeTier, type Tier } from "@awe/core";
import { radius, type, cornerCurve } from "../theme";
import type { Palette } from "../theme";

/**
 * The confidence tier, carried with the entry everywhere it appears
 * (design doc §6.1). Colour is never the only signal: the letter is always
 * there, and VoiceOver hears the meaning, not the letter (§7.9).
 */
export function TierBadge({ tier, palette }: { tier: Tier; palette: Palette }) {
  return (
    <View
      accessible
      accessibilityLabel={describeTier(tier)}
      style={[
        {
          backgroundColor: palette.tier[tier],
          borderRadius: radius.pill,
          paddingHorizontal: 8,
          paddingVertical: 2,
          minWidth: 24,
          alignItems: "center",
        },
        cornerCurve,
      ]}
    >
      <Text style={[type.caption, { color: tier === "A" ? palette.accentInk : palette.label, fontWeight: "600" }]}>
        {tier}
      </Text>
    </View>
  );
}
