import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ReanimatedPlayer } from "./ReanimatedPlayer";

export default function App() {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <StatusBar hidden />
      <View style={styles.container}>
        <ReanimatedPlayer />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
