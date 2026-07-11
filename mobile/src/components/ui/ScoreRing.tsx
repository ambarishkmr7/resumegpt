import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { color, fontFamily, scoreColor } from "../../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ScoreRingProps {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  testID?: string;
}

// Animated circular score gauge (ATS + interview scores).
export function ScoreRing({
  score,
  size = 120,
  strokeWidth = 10,
  label = "/ 100",
  testID,
}: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(clamped / 100, { duration: 900 });
  }, [clamped, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const tint = scoreColor(clamped);

  return (
    <View
      testID={testID}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color.line}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text
        style={{
          fontFamily: fontFamily.displayBold,
          fontSize: size * 0.28,
          color: tint,
        }}
      >
        {Math.round(clamped)}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.bodyMedium,
          fontSize: size * 0.1,
          color: color.inkFaint,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
