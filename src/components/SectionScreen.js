import React from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from './ScreenHeader';
import colors from '../constants/colors';
import fonts from '../constants/fonts';

const earthBg = require('../assets/images/packageDelivery/earth-04.jpg');

/**
 * Themed tab screen shell: menu header, editorial title, and content slot.
 */
const SectionScreen = ({ title, caption, children, navigation, showBack = false, showTitle = true, lightTheme = false }) => (
  <View style={[styles.background, lightTheme && styles.lightBackground]}>
    {!lightTheme && <ImageBackground source={earthBg} style={[styles.background, styles.backgroundImage]} resizeMode="cover" />}
    {!lightTheme && <View pointerEvents="none" style={styles.overlay} />}
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader subtitle={title} navigation={navigation} showBack={showBack} lightTheme={lightTheme} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {showTitle && <Text style={[styles.title, lightTheme && styles.lightTitle]}>{title}</Text>}
        {!!caption && <Text style={[styles.caption, lightTheme && styles.lightCaption]}>{caption}</Text>}
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
    </View>
);

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: colors.surface },
  backgroundImage: { ...StyleSheet.absoluteFillObject },
  lightBackground: { backgroundColor: '#F5F7FA' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13, 13, 13, 0.62)' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.white, marginTop: 8 },
  lightTitle: { color: '#1B2230' },
  caption: { fontFamily: fonts.mansfield, fontSize: 14, color: colors.coralDark, marginTop: 6 },
  lightCaption: { color: '#8991A3' },
  body: { marginTop: 26 },
});

export default SectionScreen;
