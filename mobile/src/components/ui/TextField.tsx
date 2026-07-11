import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { color, fontFamily, radius, space, text } from "../../theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  testID?: string;
}

export function TextField({ label, error, style, testID, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={color.inkFaint}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          rest.multiline && styles.multiline,
          focused && { borderColor: color.primary, borderWidth: 1.5 },
          error ? { borderColor: color.crit } : null,
          style,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...text.label, fontSize: 13.5 },
  input: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    fontFamily: fontFamily.body,
    fontSize: 16,
    color: color.ink,
  },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  error: { ...text.caption, color: color.crit },
});
