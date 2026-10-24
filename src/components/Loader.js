import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { workhorse } from '../constants/colors';

// Single shared loading animation for the whole app — replaces every
// ad-hoc ActivityIndicator/ThemeLoader used for a prominent "this whole
// screen/section is loading" state (list loading, post-submit "processing"
// screens, etc). Small inline spinners inside buttons/rows are left as
// ActivityIndicator on purpose — this animation is too large to sit inline.
const Loader = ({ label, size = 80, style, fullscreen = false }) => (
  <View
    style={[fullscreen ? styles.fullscreen : styles.inline, style]}
    accessibilityRole="progressbar"
  >
    <LottieView
      source={require('../assets/animations/trickle_loader_02.json')}
      autoPlay
      loop
      style={{ width: size, height: size }}
    />
    {!!label && <Text style={styles.label}>{label}</Text>}
  </View>
);

const styles = StyleSheet.create({
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 12.5,
    color: workhorse.muted,
  },
});

export default Loader;
