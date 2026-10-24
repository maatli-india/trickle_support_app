import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import colors from "../constants/colors";
import { workhorse } from "../constants/colors";
import fonts from "../constants/fonts";
import TrickleLogo from "./TrickleLogo";

const ScreenHeader = ({
  subtitle,
  navigation,
  showBack = false,
  onBack,
  onNotifications,
  notificationCount = 0,
  lightTheme = false,
  rightContent,
}) => {
  return (
    <View style={[styles.header, lightTheme && styles.lightHeader]}>
      {showBack ? (
        <Pressable
          onPress={onBack || (() => navigation.goBack())}
          style={styles.leftButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[styles.backArrow, lightTheme && styles.lightBackArrow]}>
            ‹
          </Text>
        </Pressable>
      ) : (
        <View style={styles.leftButton} />
      )}
      <View style={styles.titleWrap}>
        <TrickleLogo lightTheme={lightTheme} size={19} />
        {!!subtitle && (
          <Text style={[styles.subtitle, lightTheme && styles.lightSubtitle]}>
            {subtitle.toUpperCase()}
          </Text>
        )}
      </View>
      {rightContent ||
        (onNotifications ? (
          <Pressable
            onPress={onNotifications}
            style={styles.notificationButton}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
          >
            <Svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              accessibilityLabel="Notifications"
            >
              <Path
                fill={colors.orangeLight}
                d="M12 22c1.1 0 1.99-.9 1.99-2h-3.98c0 1.1.89 2 1.99 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
              />
            </Svg>
            {!!notificationCount && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationCount > 9 ? "9+" : notificationCount}
                </Text>
              </View>
            )}
          </Pressable>
        ) : (
          <View style={styles.rightSpacer} />
        ))}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    position: "relative",
  },
  leftButton: {
    width: 42,
    height: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backArrow: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 42,
    color: colors.orangeLight,
  },
  lightHeader: { backgroundColor: workhorse.surface },
  lightBackArrow: { color: workhorse.ink },
  // Absolutely centered over the full header width, independent of how wide
  // the left/right content is — two unequal-width icon buttons (e.g. a bell
  // plus another icon) no longer push the logo off-center.
  titleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  subtitle: {
    fontFamily: fonts.mansfield,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.coralDark,
    marginTop: 2,
  },
  lightSubtitle: { color: workhorse.muted },
  rightSpacer: { width: 42 },
  notificationButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: 3,
    right: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.coral,
  },
  notificationBadgeText: {
    fontFamily: fonts.mansfield,
    fontSize: 9,
    color: colors.surface,
  },
});

export default ScreenHeader;
