import React, {useEffect} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';



export default function SplashScreen({navigation}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigation]);


return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Background image */}
      <Image
        source={require('../assets/images/trickleSplash.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
        accessible={false}
      />

      {/* Content above background */}
      <View style={styles.overlay}>
        <Image
          source={require('../assets/images/trickleLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>
          Welcome to our support app
        </Text>

        <ActivityIndicator
          size="small"
          color="#140a2f"
          style={styles.loader}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 100,
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 20,
    color: '#140a2f',
    marginTop: 10,
  },
  loader: {
    marginTop: 24,
  },
});