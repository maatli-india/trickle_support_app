import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

// The brand mark: a dark "start" dot, a green trickling path, and an amber
// "drop" at the end — matches the icon used for the app icon and the web
// header/footer logo. markColor is the start dot (navy on a light
// background, white when the mark sits on a dark/colored background);
// stroke and drop colors are the fixed brand green/amber from the design.
const TrickleMark = ({ size = 28, markColor = "#101828" }) => (
  <Svg width={size} height={size * 0.9} viewBox="0 0 100 90">
    <Path
      d="M 19 24 C 14 46 34 50 52 58 C 66 64 70 66 74 70"
      fill="none"
      stroke="#0F6E56"
      strokeWidth={9}
      strokeLinecap="round"
    />
    <Circle cx="18" cy="16" r="9" fill={markColor} />
    <Circle cx="78" cy="74" r="14" fill="#F5A623" />
  </Svg>
);

// Full horizontal lockup (mark + "trickle" wordmark) — the one to reach for
// in a header/nav bar. lightTheme matches ScreenHeader/SectionScreen's own
// prop: true = sitting on a light/white background (dark navy mark + text),
// false = sitting on the dark/green theme background (white mark + text).
const TrickleLogo = ({ size = 24, lightTheme = true, textSize, style }) => {
  const markColor = lightTheme ? "#101828" : "#FFFFFF";
  return (
    <View style={[styles.row, style]}>
      <TrickleMark size={size} markColor={markColor} />
      <Text
        style={[
          styles.wordmark,
          { color: markColor, fontSize: textSize || size * 0.9 },
        ]}
      >
        trickle
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  wordmark: {
    fontFamily: "Poppins-Regular",
    letterSpacing: 0.2,
  },
});

export default TrickleLogo;
export { TrickleMark };
