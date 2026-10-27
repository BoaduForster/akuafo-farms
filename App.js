import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Import your screens
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('splash');

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      {currentScreen === 'splash' ? (
        <SplashScreen onFinish={() => setCurrentScreen('home')} />
      ) : (
        <HomeScreen />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});