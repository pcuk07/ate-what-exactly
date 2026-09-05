import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../src/auth";
import { isConfigured } from "../src/supabase";
import { cornerCurve, radius, space, type, usePalette } from "../src/theme";

/**
 * Email one-time code. No password to forget, reuse or leak, and no social
 * login — which also means Sign in with Apple isn't yet mandatory (design doc
 * §10.4, guideline 4.8). Two steps on one screen so the flow stays legible.
 */
export default function SignInScreen() {
  const palette = usePalette();
  const { sendCode, verifyCode } = useAuth();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (stage === "email") {
        await sendCode(email);
        setStage("code");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await verifyCode(email, code);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // The auth listener swaps the screen out; nothing to navigate.
      }
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy && (stage === "email" ? /.+@.+\..+/.test(email) : code.trim().length >= 6);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: palette.bg }}
    >
      <View style={{ flex: 1, justifyContent: "center", padding: space.lg, gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Text style={[type.largeTitle, { color: palette.label }]}>awe</Text>
          <Text style={[type.body, { color: palette.label2 }]}>
            {stage === "email"
              ? "Sign in with your email. We'll send a six-digit code — no password to remember."
              : `Enter the code we sent to ${email}.`}
          </Text>
        </View>

        {!isConfigured ? (
          <Text style={[type.footnote, { color: palette.over }]}>
            This build has no Supabase project configured, so signing in won't work yet. Set
            EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
          </Text>
        ) : null}

        {stage === "email" ? (
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={palette.label2}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Email address"
            style={[inputStyle(palette), cornerCurve]}
          />
        ) : (
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={palette.label2}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            accessibilityLabel="Six-digit code"
            style={[inputStyle(palette), { letterSpacing: 6, textAlign: "center" }, cornerCurve]}
          />
        )}

        {error ? <Text style={[type.footnote, { color: palette.over }]}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={[
            {
              backgroundColor: palette.accent,
              paddingVertical: space.md,
              borderRadius: radius.inner,
              alignItems: "center",
              opacity: canSubmit ? 1 : 0.4,
            },
            cornerCurve,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={palette.accentInk} />
          ) : (
            <Text style={[type.headline, { color: palette.accentInk }]}>
              {stage === "email" ? "Send code" : "Sign in"}
            </Text>
          )}
        </Pressable>

        {stage === "code" ? (
          <Pressable
            onPress={() => {
              setStage("email");
              setCode("");
              setError(null);
            }}
            accessibilityRole="button"
            style={{ alignItems: "center", padding: space.sm }}
          >
            <Text style={[type.body, { color: palette.label2 }]}>Use a different email</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function inputStyle(palette: ReturnType<typeof usePalette>) {
  return {
    ...type.body,
    color: palette.label,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.separator,
    borderRadius: radius.inner,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  };
}
