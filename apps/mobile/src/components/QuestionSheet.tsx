import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { ClarifyingQuestion, VisionResult } from "@awe/core";
import { estimateFromVision } from "@awe/core";
import { cornerCurve, radius, space, type } from "../theme";
import type { Palette } from "../theme";

/**
 * Tap 2 of the three-tap flow (design doc §7.2): chips with the likeliest
 * answer preselected, so "Looks right" is always one tap. Deliberately not a
 * chat — typing at a table is friction (§7.10).
 */
export function QuestionSheet({
  result,
  palette,
  onConfirm,
  onCancel,
}: {
  result: VisionResult;
  palette: Palette;
  onConfirm: (answers: Record<string, number>) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>(
    Object.fromEntries(result.questions.map((q) => [q.id, q.defaultOptionIndex])),
  );

  const estimate = estimateFromVision(result, answers);

  const select = (question: ClarifyingQuestion, index: number) => {
    void Haptics.selectionAsync();
    setAnswers((prev) => ({ ...prev, [question.id]: index }));
  };

  return (
    <View style={{ padding: space.md, gap: space.lg }}>
      <View>
        <Text style={[type.largeTitle, { color: palette.label }]}>{result.dishName}</Text>
        <Text style={[type.subheadline, { color: palette.label2, marginTop: space.xs }]}>
          About {Math.round(estimate.macros.kcal)} kcal · estimate, roughly ±30 %
        </Text>
      </View>

      {result.questions.map((question) => (
        <View key={question.id} style={{ gap: space.sm }}>
          <Text style={[type.headline, { color: palette.label }]}>{question.text}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {question.options.map((option, index) => {
              const selected = answers[question.id] === index;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => select(question, index)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  style={[
                    {
                      flex: 1,
                      paddingVertical: space.sm + 2,
                      paddingHorizontal: space.sm,
                      borderRadius: radius.inner,
                      borderWidth: 1,
                      borderColor: selected ? palette.accent : palette.separator,
                      backgroundColor: selected ? palette.accent : "transparent",
                      alignItems: "center",
                    },
                    cornerCurve,
                  ]}
                >
                  <Text
                    style={[
                      type.footnote,
                      { color: selected ? palette.accentInk : palette.label, fontWeight: selected ? "600" : "400" },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <View style={{ gap: space.sm }}>
        <Pressable
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onConfirm(answers);
          }}
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
          <Text style={[type.headline, { color: palette.accentInk }]}>Log it</Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ alignItems: "center", padding: space.sm }}>
          <Text style={[type.body, { color: palette.label2 }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
