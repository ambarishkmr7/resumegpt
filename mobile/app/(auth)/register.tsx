import { Link, router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import { isGuest, useAuth } from "../../src/auth/store";
import { Button, TextField } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

// Also serves as the "claim your guest account" form when a guest is signed in.
export default function Register() {
  const insets = useSafeAreaInsets();
  const setSession = useAuth((s) => s.setSession);
  const user = useAuth((s) => s.user);
  const claiming = isGuest(user);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      setError(
        !email.trim()
          ? "Enter your email."
          : "Password must be at least 6 characters.",
      );
      return;
    }
    setError("");
    setBusy(true);
    try {
      const auth = claiming
        ? await api.claimGuest(fullName.trim(), email.trim(), password)
        : await api.register({
            email: email.trim(),
            password,
            full_name: fullName.trim() || undefined,
          });
      await setSession(auth);
      if (claiming) router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>resumesGPT</Text>
        <Text style={styles.title}>
          {claiming ? "Save your work" : "Create your account"}
        </Text>
        <Text style={[text.caption, { textAlign: "center", fontSize: 14 }]}>
          {claiming
            ? "Add an email and password to keep your resumes forever."
            : "Free forever for building resumes. No card needed."}
        </Text>

        <View style={styles.form}>
          <TextField
            testID="register-name"
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Priya Sharma"
            autoComplete="name"
          />
          <TextField
            testID="register-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <TextField
            testID="register-password"
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 6 characters"
            error={error}
          />
          <Button
            testID="register-submit"
            label={claiming ? "Save my account" : "Create account"}
            variant="cta"
            size="lg"
            loading={busy}
            onPress={() => void submit()}
          />
        </View>

        {!claiming ? (
          <View style={styles.footer}>
            <Text style={text.body}>Already have an account? </Text>
            <Link href="/(auth)/login" style={styles.link}>
              Sign in
            </Link>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.xl, gap: space.md },
  brand: {
    fontFamily: fontFamily.displayBold,
    fontSize: 26,
    color: color.primary,
    textAlign: "center",
  },
  title: {
    fontFamily: fontFamily.displayBold,
    fontSize: 28,
    color: color.ink,
    textAlign: "center",
    marginTop: space.md,
  },
  form: { gap: space.md, marginTop: space.lg },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: space.lg,
  },
  link: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    color: color.primary,
  },
});
