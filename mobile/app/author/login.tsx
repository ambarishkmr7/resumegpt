import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { authorApi } from "../../src/api/authorClient";
import { errorMessage } from "../../src/api/errors";
import { useAuthorAuth } from "../../src/auth/authorStore";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Chip, TextField, toast } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

type Mode = "login" | "register";

export default function AuthorLogin() {
  const setSession = useAuthorAuth((s) => s.setSession);
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const auth =
        mode === "login"
          ? await authorApi.login(email.trim(), password)
          : await authorApi.register({
              name: name.trim(),
              email: email.trim(),
              password,
              signup_code: signupCode.trim() || undefined,
            });
      await setSession(auth);
      router.replace("/author");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Author login" />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }}>
        <Text style={{ fontSize: 44, textAlign: "center" }}>✍️</Text>
        <Text style={[text.title, { textAlign: "center", fontFamily: fontFamily.displayBold }]}>
          Editorial team access
        </Text>
        <Text style={[text.caption, { textAlign: "center", marginBottom: space.md }]}>
          Separate from your resumesGPT account — this signs into the blog CMS.
        </Text>

        <View style={{ flexDirection: "row", gap: space.sm, justifyContent: "center", marginBottom: space.md }}>
          <Chip label="Sign in" selected={mode === "login"} onPress={() => setMode("login")} />
          <Chip label="Register" selected={mode === "register"} onPress={() => setMode("register")} />
        </View>

        {mode === "register" ? (
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Ananya Iyer" />
        ) : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        {mode === "register" ? (
          <TextField
            label="Signup code (if required)"
            value={signupCode}
            onChangeText={setSignupCode}
            autoCapitalize="none"
          />
        ) : null}

        <Button
          label={mode === "login" ? "Sign in" : "Create author account"}
          variant="cta"
          size="lg"
          loading={loading}
          disabled={!email.trim() || !password || (mode === "register" && !name.trim())}
          onPress={() => void submit()}
        />
      </ScrollView>
    </View>
  );
}
