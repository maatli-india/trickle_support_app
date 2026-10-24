import React, {useState} from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ImageOff, X} from 'lucide-react-native';
import {adminFileImageSource} from '../../api/files';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';

const Thumb = ({fileId, onPress}) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.thumb, styles.thumbFailed]}>
        <ImageOff size={18} color={workhorse.muted} />
        <Text style={styles.failedText}>Unavailable</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.thumb, pressed && styles.pressed]}
      accessibilityRole="imagebutton"
      accessibilityLabel="Open attachment">
      <Image
        source={adminFileImageSource(fileId)}
        style={styles.thumbImage}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </Pressable>
  );
};

/**
 * Horizontal strip of report attachments (file IDs, resolved through the
 * admin file-download redirect). Tap → full-screen viewer.
 */
const PhotoStrip = ({fileIds}) => {
  const [openId, setOpenId] = useState(null);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {fileIds.map(fileId => (
          <Thumb key={fileId} fileId={fileId} onPress={() => setOpenId(fileId)} />
        ))}
      </ScrollView>

      <Modal
        visible={!!openId}
        animationType="fade"
        onRequestClose={() => setOpenId(null)}
        statusBarTranslucent>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <SafeAreaView style={styles.viewer}>
          <Pressable
            onPress={() => setOpenId(null)}
            style={({pressed}) => [styles.close, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close photo">
            <X size={22} color="#FFFFFF" />
          </Pressable>
          {!!openId && (
            <Image
              source={adminFileImageSource(openId)}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
};

const THUMB = 92;

const styles = StyleSheet.create({
  strip: {gap: spacing.sm},
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surfaceMuted,
  },
  thumbImage: {width: '100%', height: '100%'},
  thumbFailed: {alignItems: 'center', justifyContent: 'center', gap: 4},
  failedText: {fontFamily: fonts.body, fontSize: 10, color: workhorse.muted},
  viewer: {flex: 1, backgroundColor: '#000000'},
  close: {
    position: 'absolute',
    top: spacing.xxl + spacing.lg,
    right: spacing.lg,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  fullImage: {flex: 1, width: '100%'},
  pressed: {opacity: 0.7},
});

export default PhotoStrip;
