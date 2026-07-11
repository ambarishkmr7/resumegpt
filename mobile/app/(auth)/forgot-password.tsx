import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import { Button, TextField, toast } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + space.xxxl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Reset your password</Text>
      {sent ? (
        <>
          <Text style={[text.body, { textAlign: "center" }]}>
            📬 If an account exists for {email.trim()}, a reset link is on its
            way. Check your inbox.
          </Text>
          <Button label="Back to sign in" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Text style={[text.caption, { textAlign: "center", fontSize: 14 }]}>
            Enter your account email and we&apos;ll send you a reset link.
          </Text>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Button
            label="Send reset link"
            variant="cta"
            loading={busy}
            onPress={() => void submit()}
          />
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, gap: space.lg },
  title: {
    fontFamily: fontFamily.displayBold,
    fontSize: 28,
    color: color.ink,
    textAlign: "center",
  },
});
