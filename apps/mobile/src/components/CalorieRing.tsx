import { useEffect } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { space, springs, type } from "../theme";
import type { Palette } from "../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 180;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

interface Props {
  consumed: number;
  goal: number;
  palette: Palette;
}

/**
 * The daily calorie ring (design doc §6.1, §7.6). Going over is amber and
 * worded plainly — never red, because red means error and eating more than
 * planned is not one.
 */
export function CalorieRing({ consumed, goal, palette }: Props) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const fraction = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const over = consumed > goal;
  const remaining = Math.round(goal - consumed);

  useEffect(() => {
    progress.value = reduceMotion
      ? withTiming(fraction, { duration: 200 })
      : withSpring(fraction, springs.standard);
  }, [fraction, reduceMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const caption = over ? `${Math.abs(remaining)} kcal over` : `${remaining} kcal left today`;
  // VoiceOver reads the whole thing as one sentence (§7.9) rather than
  // announcing an unlabelled number.
  const label = `${Math.round(consumed)} of ${goal} calories, ${
    over ? `${Math.abs(remaining)} over` : `${remaining} remaining`
  }`;

  useEffect(() => {
    if (over) AccessibilityInfo.announceForAccessibility(caption);
  }, [over, caption]);

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: "center" }}>
      <View style={{ width: SIZE, height: SIZE, justifyContent: "center", alignItems: "center" }}>
        <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={palette.separator}
            strokeWidth={STROKE}
            fill="none"
            opacity={0.4}
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={over ? palette.over : palette.accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={animatedProps}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <Text style={[type.hero, { color: palette.label }]} accessibilityElementsHidden>
          {Math.round(consumed).toLocaleString()}
        </Text>
        <Text
          style={[type.footnote, { color: palette.label2, marginTop: space.xs }]}
          accessibilityElementsHidden
        >
          of {goal.toLocaleString()} kcal
        </Text>
      </View>
      <Text
        style={[type.subheadline, { color: over ? palette.over : palette.label2, marginTop: space.sm }]}
        accessibilityElementsHidden
      >
        {caption}
      </Text>
    </View>
  );
}
